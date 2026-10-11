import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { IdempotenceService } from '../src/modules/paiements/services/idempotence.service.js';
import { PaiementsService } from '../src/modules/paiements/services/paiements.service.js';
import { FournisseurDemoService } from '../src/modules/paiements/fournisseurs/fournisseur-demo.service.js';

describe('Audit - Corrections Ciblées Idempotence et Paiements (Phase 11)', () => {
  let idempotenceService: IdempotenceService;
  let paiementsService: PaiementsService;
  let fournisseurDemo: FournisseurDemoService;
  let baseCles: Map<string, any>;
  let mockPrisma: any;
  let mockPortefeuilleService: any;
  let mockAbonnementsService: any;

  beforeEach(() => {
    baseCles = new Map<string, any>();

    mockPrisma = {
      orm: {
        public: {
          CleIdempotence: {
            where: (fn: any) => {
              let cibleCle = '';
              const mockCol = {
                eq: (val: string) => {
                  cibleCle = val;
                  return true;
                },
              };
              fn({ cle: mockCol });

              return {
                first: vi.fn(async () => baseCles.get(cibleCle) || null),
                update: vi.fn(async (data: any) => {
                  const existant = baseCles.get(cibleCle);
                  if (existant) {
                    Object.assign(existant, data);
                    return existant;
                  }
                  return null;
                }),
              };
            },
            create: vi.fn(async (data: any) => {
              if (baseCles.has(data.cle)) {
                const err: any = new Error('Unique constraint failed on the fields: (`cle`)');
                err.code = 'P2002';
                throw err;
              }
              const nouvelleCle = { ...data };
              baseCles.set(data.cle, nouvelleCle);
              return nouvelleCle;
            }),
          },
          Paiement: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Portefeuille: {
            where: vi.fn(),
            create: vi.fn(),
          },
          TransactionPortefeuille: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Facture: {
            where: vi.fn(),
          },
          DemandeCollecte: {
            where: vi.fn(),
          },
          Utilisateur: {
            where: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (callback: any) => callback(mockPrisma)),
    };

    mockPortefeuilleService = {
      obtenirPortefeuillePourProprietaire: vi.fn(),
      crediter: vi.fn(),
      debiter: vi.fn(),
    };

    mockAbonnementsService = {
      activerAbonnementApresPaiement: vi.fn(),
    };

    idempotenceService = new IdempotenceService(mockPrisma);
    fournisseurDemo = new FournisseurDemoService();

    paiementsService = new PaiementsService(
      mockPrisma,
      mockPortefeuilleService,
      idempotenceService,
      fournisseurDemo,
      mockAbonnementsService,
    );
  });

  describe('1. Idempotence : Deux requêtes simultanées avec la même clé', () => {
    it('doit permettre à la première de réserver et bloquer la seconde avec OPERATION_EN_COURS', async () => {
      const cle = 'IDEM-CONCURRENTE-001';
      const methode = 'POST';
      const chemin = '/api/v1/paiements/collecte';
      const corps = { demande_id: '123' };

      // Première requête : réserve la clé avec succès
      const res1 = await idempotenceService.verifierCle(cle, methode, chemin, corps);
      expect(res1.estExistant).toBe(false);

      // Deuxième requête simultanée : la première est toujours EN_COURS
      await expect(
        idempotenceService.verifierCle(cle, methode, chemin, corps),
      ).rejects.toThrow(ConflictException);

      try {
        await idempotenceService.verifierCle(cle, methode, chemin, corps);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('OPERATION_EN_COURS');
      }

      // La première requête finalise son travail
      await idempotenceService.enregistrer(cle, methode, chemin, corps, 200, {
        succes: true,
        reference: 'PAY-123',
      });

      // Troisième requête ultérieure : reçoit la réponse mise en cache
      const res3 = await idempotenceService.verifierCle(cle, methode, chemin, corps);
      expect(res3.estExistant).toBe(true);
      expect(res3.reponse).toEqual({ succes: true, reference: 'PAY-123' });
    });
  });

  describe('2. Idempotence : Deux clés différentes pour deux opérations distinctes', () => {
    it('doit traiter indépendamment deux clés distinctes sans interférence', async () => {
      const resA = await idempotenceService.verifierCle('CLE-ALPHA', 'POST', '/chemin', { op: 'A' });
      const resB = await idempotenceService.verifierCle('CLE-BETA', 'POST', '/chemin', { op: 'B' });

      expect(resA.estExistant).toBe(false);
      expect(resB.estExistant).toBe(false);

      await idempotenceService.enregistrer('CLE-ALPHA', 'POST', '/chemin', { op: 'A' }, 200, { res: 'A' });
      await idempotenceService.enregistrer('CLE-BETA', 'POST', '/chemin', { op: 'B' }, 200, { res: 'B' });

      const checkA = await idempotenceService.verifierCle('CLE-ALPHA', 'POST', '/chemin', { op: 'A' });
      const checkB = await idempotenceService.verifierCle('CLE-BETA', 'POST', '/chemin', { op: 'B' });

      expect(checkA.reponse).toEqual({ res: 'A' });
      expect(checkB.reponse).toEqual({ res: 'B' });
    });
  });

  describe('3. Idempotence : Réutilisation d une clé avec des paramètres incompatibles', () => {
    it('doit rejeter la requête avec IDEMPOTENCY_KEY_REUTILISEE si le payload change', async () => {
      const cle = 'CLE-PARAM-001';
      await idempotenceService.verifierCle(cle, 'POST', '/paiements', { montant: 5000 });
      await idempotenceService.enregistrer(cle, 'POST', '/paiements', { montant: 5000 }, 200, { ok: true });

      await expect(
        idempotenceService.verifierCle(cle, 'POST', '/paiements', { montant: 10000 }),
      ).rejects.toThrow(ConflictException);

      try {
        await idempotenceService.verifierCle(cle, 'POST', '/paiements', { montant: 10000 });
      } catch (err: any) {
        expect(err.getResponse().code).toBe('IDEMPOTENCY_KEY_REUTILISEE');
      }
    });

    it('doit rejeter si la clé est tentée par un autre utilisateur (portée utilisateur)', async () => {
      const cle = 'CLE-USER-001';
      await idempotenceService.verifierCle(cle, 'POST', '/paiements', { test: 1 }, 10n);
      await idempotenceService.enregistrer(cle, 'POST', '/paiements', { test: 1 }, 200, { ok: true }, 10n);

      await expect(
        idempotenceService.verifierCle(cle, 'POST', '/paiements', { test: 1 }, 99n),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('4. Webhook : Répétition d un webhook déjà traité', () => {
    it('ne doit pas modifier les données ni re-créditer en cas de webhook répété', async () => {
      const payload = {
        reference_paiement: 'PAY-RECH-DUP',
        montant: 5000,
        statut: 'PAYE',
        reference_fournisseur: 'EXT-DUP-1',
      };
      const signature = fournisseurDemo.calculerSignature(payload);

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 50n,
          reference: 'PAY-RECH-DUP',
          montant: '5000.00',
          devise: 'XAF',
          statut: 'PAYE', // Déjà payé antérieurement
        }),
      });

      const res = await paiementsService.traiterWebhook('demo', signature, payload);

      expect(res.recu).toBe(true);
      expect(res.message).toContain('déjà traitée');
      expect(mockPortefeuilleService.crediter).not.toHaveBeenCalled();
    });
  });

  describe('5. Webhook : Webhook invalide ou corrompu', () => {
    it('doit rejeter un webhook avec signature invalide sans modifier aucune donnée', async () => {
      await expect(
        paiementsService.traiterWebhook('demo', 'signature-fausse', {
          reference_paiement: 'PAY-1',
          montant: 2000,
          statut: 'PAYE',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPortefeuilleService.crediter).not.toHaveBeenCalled();
    });

    it('doit rejeter un webhook avec devise divergente', async () => {
      const payload = {
        reference_paiement: 'PAY-DEVISE',
        montant: 5000,
        devise: 'EUR', // Discordant avec XAF
        statut: 'PAYE',
      };
      const signature = fournisseurDemo.calculerSignature(payload);

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 51n,
          reference: 'PAY-DEVISE',
          montant: '5000.00',
          devise: 'XAF',
          statut: 'EN_COURS',
        }),
      });

      await expect(
        paiementsService.traiterWebhook('demo', signature, payload),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('6. Facturation : Paiement partiel puis paiement du solde', () => {
    it('scénario complet : 10 000 FCFA, 1er paiement 4 000 FCFA (partiel), 2nd paiement 6 000 FCFA (solde)', async () => {
      let statutFacture = 'EMISE';
      let datePaiementFacture: any = null;

      const factureMock = {
        id: 1n,
        numero: 'FACT-001',
        montant_ttc: '10000.00',
        statut: statutFacture,
      };

      const paiementsEnregistres: any[] = [];

      mockPrisma.orm.public.Facture.where.mockReturnValue({
        first: vi.fn(async () => ({ ...factureMock, statut: statutFacture })),
        update: vi.fn(async (data: any) => {
          statutFacture = data.statut;
          datePaiementFacture = data.date_paiement;
          return { ...factureMock, statut: statutFacture, date_paiement: datePaiementFacture };
        }),
      });

      // Étape 1 : Premier paiement de 4 000 FCFA via webhook
      const p1 = {
        id: 101n,
        reference: 'PAY-FACT-4000',
        facture_id: 1n,
        montant: '4000.00',
        devise: 'XAF',
        type: 'FACTURE',
        statut: 'EN_ATTENTE',
      };

      mockPrisma.orm.public.Paiement.where.mockImplementation(() => ({
        first: vi.fn(async () => p1),
        update: vi.fn(async (data: any) => {
          p1.statut = data.statut;
          paiementsEnregistres.push({ ...p1, statut: 'PAYE' });
          return p1;
        }),
        all: vi.fn(async () => paiementsEnregistres.filter((p) => p.statut === 'PAYE')),
      }));

      const payload1 = {
        reference_paiement: 'PAY-FACT-4000',
        montant: 4000,
        statut: 'PAYE',
        reference_fournisseur: 'EXT-1',
      };
      const sig1 = fournisseurDemo.calculerSignature(payload1);

      await paiementsService.traiterWebhook('demo', sig1, payload1);

      // Vérification après paiement partiel : statut = PARTIELLEMENT_PAYEE, date_paiement = null
      expect(statutFacture).toBe('PARTIELLEMENT_PAYEE');
      expect(datePaiementFacture).toBeNull();

      // Étape 2 : Deuxième paiement de 6 000 FCFA via webhook
      const p2 = {
        id: 102n,
        reference: 'PAY-FACT-6000',
        facture_id: 1n,
        montant: '6000.00',
        devise: 'XAF',
        type: 'FACTURE',
        statut: 'EN_ATTENTE',
      };

      mockPrisma.orm.public.Paiement.where.mockImplementation(() => ({
        first: vi.fn(async () => p2),
        update: vi.fn(async (data: any) => {
          p2.statut = data.statut;
          paiementsEnregistres.push({ ...p2, statut: 'PAYE' });
          return p2;
        }),
        all: vi.fn(async () => paiementsEnregistres.filter((p) => p.statut === 'PAYE')),
      }));

      const payload2 = {
        reference_paiement: 'PAY-FACT-6000',
        montant: 6000,
        statut: 'PAYE',
        reference_fournisseur: 'EXT-2',
      };
      const sig2 = fournisseurDemo.calculerSignature(payload2);

      await paiementsService.traiterWebhook('demo', sig2, payload2);

      // Vérification après paiement du solde : statut = PAYEE, date_paiement renseignée
      expect(statutFacture).toBe('PAYEE');
      expect(datePaiementFacture).toBeDefined();

      // Étape 3 : Répétition du premier webhook de 4 000 FCFA
      mockPrisma.orm.public.Paiement.where.mockImplementation(() => ({
        first: vi.fn(async () => ({ ...p1, statut: 'PAYE' })),
      }));

      const rejeu = await paiementsService.traiterWebhook('demo', sig1, payload1);
      expect(rejeu.recu).toBe(true);
      expect(rejeu.message).toContain('déjà traitée');
      expect(statutFacture).toBe('PAYEE');
    });
  });

  describe('7. Idempotence : Échec intermédiaire après réservation de la clé', () => {
    it('doit marquer la clé comme ECHOUEE et refuser son rejeu ultérieur', async () => {
      const cle = 'CLE-FAIL-001';
      const res = await idempotenceService.verifierCle(cle, 'POST', '/test', { x: 1 });
      expect(res.estExistant).toBe(false);

      // Simulation d'une erreur en cours d'opération
      await idempotenceService.marquerEchec(cle, 400, 'Solde insuffisant');

      // Tentative ultérieure avec la même clé
      await expect(
        idempotenceService.verifierCle(cle, 'POST', '/test', { x: 1 }),
      ).rejects.toThrow(ConflictException);

      try {
        await idempotenceService.verifierCle(cle, 'POST', '/test', { x: 1 });
      } catch (err: any) {
        expect(err.getResponse().code).toBe('OPERATION_PRECEDENTE_ECHOUEE');
      }
    });
  });

  describe('8. Prévention du double débit et intégrité financière', () => {
    it('doit refuser un débit excédant le solde restant d une facture', async () => {
      mockPrisma.orm.public.Facture.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 5n,
          entreprise_id: 10n,
          montant_ttc: '5000.00',
          statut: 'EMISE',
        }),
      });

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([
          { montant: '3000.00', statut: 'PAYE' },
        ]),
      });

      // Tentative de payer 3000 FCFA alors qu'il ne reste que 2000 FCFA
      await expect(
        paiementsService.payerFacture(
          { facture_id: '5', methode: 'PORTEFEUILLE', montant: 3000 },
          { id: 10n, role: 'ADMINISTRATEUR' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('9. Idempotence : État incertain après dépassement du délai de 2 minutes', () => {
    it('doit refuser la réexécution ou le rejeu direct et lever OPERATION_NON_RESOLUE', async () => {
      const cle = 'CLE-TIMEOUT-001';
      // Simuler une clé créée il y a 3 minutes (180 000 ms) toujours EN_COURS
      const tsPasse = new Date(Date.now() - 180_000).toISOString();
      const hashAttendu = (idempotenceService as any).calculerHash({
        methode: 'POST',
        chemin: '/paiements/test',
        corps: {},
      });
      baseCles.set(cle, {
        cle,
        methode_http: 'POST',
        chemin_uri: '/paiements/test',
        code_statut: null,
        reponse: JSON.stringify({
          hash: hashAttendu,
          statut: 'EN_COURS',
          date_creation: tsPasse,
        }),
      });

      await expect(
        idempotenceService.verifierCle(cle, 'POST', '/paiements/test', {}),
      ).rejects.toThrow(ConflictException);

      try {
        await idempotenceService.verifierCle(cle, 'POST', '/paiements/test', {});
      } catch (err: any) {
        expect(err.getResponse().code).toBe('OPERATION_NON_RESOLUE');
      }
    });
  });

  describe('10. Portefeuille : Concurrence optimiste et détection de collision de solde', () => {
    it('doit rejeter un débit avec CONCURRENCE_PORTEFEUILLE si le solde a changé entre la lecture et l écriture', async () => {
      const portefeuilleMock = {
        id: 1n,
        solde: '5000',
        statut: 'ACTIF',
      };

      // Simule un échec de la mise à jour optimiste conditionnelle (retourne null car solde modifié)
      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(portefeuilleMock),
        update: vi.fn().mockResolvedValue(null),
      });

      const portService = new (await import('../src/modules/portefeuille/portefeuille.service.js')).PortefeuilleService(
        mockPrisma,
      );

      await expect(
        portService.debiter(1n, 1000, 'Débit concurrent'),
      ).rejects.toThrow(ConflictException);

      try {
        await portService.debiter(1n, 1000, 'Débit concurrent');
      } catch (err: any) {
        expect(err.getResponse().code).toBe('CONCURRENCE_PORTEFEUILLE');
      }
    });
  });

  describe('11. Ajustements : Prévention du double remboursement d un paiement', () => {
    it('doit refuser le remboursement d un paiement déjà marqué REMBOURSE', async () => {
      const ajustementsService = new (await import('../src/modules/ajustements/ajustements.service.js')).AjustementsService(
        mockPrisma,
        mockPortefeuilleService,
      );

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          numero: 'DEM-123',
          utilisateur_id: 1n,
        }),
      });

      mockPrisma.orm.public.Paiement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 20n,
          statut: 'REMBOURSE',
          montant: '5000.00',
        }),
      });

      await expect(
        ajustementsService.creerAjustementCreditEtRembourser(10n, 5000, 'Remboursement en double', 20n),
      ).rejects.toThrow(ConflictException);

      try {
        await ajustementsService.creerAjustementCreditEtRembourser(10n, 5000, 'Remboursement en double', 20n);
      } catch (err: any) {
        expect(err.getResponse().code).toBe('PAIEMENT_DEJA_REMBOURSE');
      }
    });
  });
});

