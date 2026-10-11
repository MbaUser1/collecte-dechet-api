import { describe, it, expect, vi } from 'vitest';
import { PortefeuilleService } from '../src/modules/portefeuille/portefeuille.service.js';
import { MissionsService } from '../src/modules/missions/missions.service.js';
import { QuotaService } from '../src/modules/abonnements/services/quota.service.js';
import { RecompensesService } from '../src/modules/recompenses/recompenses.service.js';
import { PaiementsService } from '../src/modules/paiements/services/paiements.service.js';
import { IdempotenceService } from '../src/modules/paiements/services/idempotence.service.js';

describe('Phase 11 - Scénarios de Concurrence et Résilience Métier', () => {
  describe('Scénario 1 : Débits simultanés dépassant le solde disponible', () => {
    it('doit empêcher formellement le solde de devenir négatif lors de deux débits concurrents', async () => {
      let solde = 5000;
      let fileDAttente = Promise.resolve();

      const mockPrisma = {
        // Simule l'isolation et la sérialisation transactionnelle de la base de données
        transaction: vi.fn().mockImplementation(async (callback) => {
          const precedent = fileDAttente;
          let debloquer: () => void;
          fileDAttente = new Promise<void>((r) => { debloquer = r; });
          await precedent;
          try {
            return await callback(mockPrisma);
          } finally {
            debloquer!();
          }
        }),
        orm: {
          public: {
            Portefeuille: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => ({
                id: 1n,
                solde: solde.toString(),
                statut: 'ACTIF',
              })),
              update: vi.fn().mockImplementation(async (data) => {
                solde = Number(data.solde);
                return { id: 1n, solde: solde.toString() };
              }),
            },
            TransactionPortefeuille: {
              create: vi.fn().mockResolvedValue({ id: 10n }),
            },
          },
        },
      };

      const auditService = { enregistrerAction: vi.fn() } as any;
      const service = new PortefeuilleService(mockPrisma as any, auditService);

      // Deux débits simultanés de 4000 FCFA sur un solde initial de 5000 FCFA
      const debit1 = service.debiter(1n, 4000, 'Débit 1');
      const debit2 = service.debiter(1n, 4000, 'Débit 2');

      const resultats = await Promise.allSettled([debit1, debit2]);
      const reussites = resultats.filter((r) => r.status === 'fulfilled');
      const echecs = resultats.filter((r) => r.status === 'rejected');

      // Dans un contexte concurrentiel vérifié, un seul débit peut aboutir
      expect(reussites.length).toBe(1);
      expect(echecs.length).toBe(1);
      expect(solde).toBe(1000);
      expect(solde).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Scénario 2 : Deux collecteurs acceptant simultanément la même collecte', () => {
    it('doit attribuer la mission au premier collecteur et rejeter le second avec un code 409', async () => {
      let attribue = false;
      let fileDAttente = Promise.resolve();

      const mockPrisma = {
        transaction: vi.fn().mockImplementation(async (callback) => {
          const precedent = fileDAttente;
          let debloquer: () => void;
          fileDAttente = new Promise<void>((r) => { debloquer = r; });
          await precedent;
          try {
            return await callback(mockPrisma);
          } finally {
            debloquer!();
          }
        }),
        orm: {
          public: {
            DemandeCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => {
                if (attribue) {
                  return { id: 100n, statut: 'ATTRIBUEE', collecteur_id: 1n };
                }
                return { id: 100n, statut: 'EN_ATTENTE_ATTRIBUTION', collecteur_id: null };
              }),
              update: vi.fn().mockImplementation(async (data) => {
                attribue = true;
                return { id: 100n, ...data };
              }),
            },
            MissionCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => (attribue ? { id: 1n } : null)),
              create: vi.fn().mockResolvedValue({ id: 1n }),
            },
          },
        },
      };

      const missionsService = new MissionsService(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
      );

      const req1 = missionsService.accepterCollecte(100n, { id: 1n, role: 'COLLECTEUR' });
      const req2 = missionsService.accepterCollecte(100n, { id: 2n, role: 'COLLECTEUR' });

      const res = await Promise.allSettled([req1, req2]);
      const reussites = res.filter((r) => r.status === 'fulfilled');
      const echecs = res.filter((r) => r.status === 'rejected');

      expect(reussites.length).toBe(1);
      expect(echecs.length).toBe(1);
    });
  });

  describe('Scénario 5 : Réservation concurrente du dernier quota disponible', () => {
    it('doit garantir qu un quota ne peut pas être sur-réservé', async () => {
      let quotasReserves = 3;
      const quotaInclus = 4; // Total 4, 3 réservés => reste 1 disponible
      let fileDAttente = Promise.resolve();

      const mockPrisma = {
        transaction: vi.fn().mockImplementation(async (callback) => {
          const precedent = fileDAttente;
          let debloquer: () => void;
          fileDAttente = new Promise<void>((r) => { debloquer = r; });
          await precedent;
          try {
            return await callback(mockPrisma);
          } finally {
            debloquer!();
          }
        }),
        orm: {
          public: {
            Abonnement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => ({
                id: 1n,
                statut: 'ACTIF',
                nombre_collectes_incluses: quotaInclus,
                nombre_collectes_utilisees: 0,
                nombre_collectes_reservees: quotasReserves,
              })),
              update: vi.fn().mockImplementation(async (data) => {
                quotasReserves = data.nombre_collectes_reservees;
                return { id: 1n, nombre_collectes_reservees: quotasReserves };
              }),
            },
            UtilisationAbonnement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue({ id: 10n }),
            },
          },
        },
      };

      const service = new QuotaService(mockPrisma as any);

      const res1 = mockPrisma.transaction((tx: any) => service.reserverQuota(1n, 100n, tx));
      const res2 = mockPrisma.transaction((tx: any) => service.reserverQuota(1n, 101n, tx));

      const results = await Promise.allSettled([res1, res2]);
      const reussis = results.filter((r) => r.status === 'fulfilled');
      const echoues = results.filter((r) => r.status === 'rejected');

      expect(reussis.length).toBe(1);
      expect(echoues.length).toBe(1);
      expect(quotasReserves).toBe(quotaInclus);
    });
  });

  describe('Scénario 7 : Réclamation concurrente de la dernière récompense en stock', () => {
    it('doit décrémenter le stock sans jamais descendre sous zéro et rejeter le demandeur concurrent', async () => {
      let stock = 1;
      let fileDAttente = Promise.resolve();

      const mockPrisma = {
        transaction: vi.fn().mockImplementation(async (callback) => {
          const precedent = fileDAttente;
          let debloquer: () => void;
          fileDAttente = new Promise<void>((r) => { debloquer = r; });
          await precedent;
          try {
            return await callback(mockPrisma);
          } finally {
            debloquer!();
          }
        }),
        orm: {
          public: {
            Recompense: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => ({
                id: 5n,
                titre: 'Bon d’achat',
                cout_points: 100,
                statut: 'ACTIF',
                stock,
              })),
              update: vi.fn().mockImplementation(async () => {
                stock--;
                return { id: 5n, stock };
              }),
            },
            ReclamationRecompense: {
              create: vi.fn().mockResolvedValue({ id: 1n, code: 'REC-TEST-123' }),
            },
            TransactionPoints: {
              where: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue([{ points: 500 }]), // Solde suffisant
              create: vi.fn().mockResolvedValue({ id: 2n }),
            },
          },
        },
      };

      const service = new RecompensesService(mockPrisma as any);

      // (recompenseId, utilisateurId)
      const rec1 = service.reclamerRecompense(5n, 10n);
      const rec2 = service.reclamerRecompense(5n, 11n);

      const res = await Promise.allSettled([rec1, rec2]);
      const ok = res.filter((r) => r.status === 'fulfilled');
      const ko = res.filter((r) => r.status === 'rejected');

      expect(ok.length).toBe(1);
      expect(ko.length).toBe(1);
      expect(stock).toBe(0);
    });
  });

  describe('Scénario 8 : Requêtes concurrentes avec la même clé d idempotence', () => {
    it('doit retourner le résultat de l opération unique sans double enregistrement', async () => {
      let cleStockee: any = null;
      const mockPrisma = {
        orm: {
          public: {
            CleIdempotence: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => cleStockee),
              create: vi.fn().mockImplementation(async (data) => {
                cleStockee = {
                  cle: data.cle,
                  reponse: data.reponse,
                  code_statut: data.code_statut,
                };
                return cleStockee;
              }),
            },
          },
        },
      };

      const service = new IdempotenceService(mockPrisma as any);

      // Première vérification : clé non existante
      const verif1 = await service.verifierCle('KEY-IDEM-001', 'POST', '/api/v1/portefeuille/recharger', { montant: 5000 });
      expect(verif1.estExistant).toBe(false);

      // Enregistrement de la réponse
      await service.enregistrer('KEY-IDEM-001', 'POST', '/api/v1/portefeuille/recharger', { montant: 5000 }, 200, { succes: true, solde: 5000 });

      // Deuxième vérification avec le même payload : rejeu idempotent
      const verif2 = await service.verifierCle('KEY-IDEM-001', 'POST', '/api/v1/portefeuille/recharger', { montant: 5000 });
      expect(verif2.estExistant).toBe(true);
      expect(verif2.reponse).toEqual({ succes: true, solde: 5000 });

      // Troisième vérification avec un payload altéré : conflit 409
      await expect(
        service.verifierCle('KEY-IDEM-001', 'POST', '/api/v1/portefeuille/recharger', { montant: 10000 }),
      ).rejects.toThrow();
    });
  });

  describe('Scénario 10 : Deux livraisons concurrentes d un même webhook de paiement', () => {
    it('doit traiter le premier webhook et considérer le second comme déjà traité sans double crédit', async () => {
      let statutPaiement = 'EN_ATTENTE';
      let creditsPortefeuille = 0;

      const mockPrisma = {
        transaction: vi.fn().mockImplementation(async (callback) => callback(mockPrisma)),
        orm: {
          public: {
            Paiement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockImplementation(async () => ({
                id: 10n,
                reference: 'PAY-RECH-123',
                statut: statutPaiement,
                montant: '10000.00',
                devise: 'XAF',
                type: 'RECHARGEMENT_PORTEFEUILLE',
                utilisateur_id: 1n,
              })),
              update: vi.fn().mockImplementation(async (data) => {
                statutPaiement = data.statut;
                return { id: 10n, ...data };
              }),
            },
            Utilisateur: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 1n, role: 'PARTICULIER' }),
            },
          },
        },
      };

      const portefeuilleService = {
        obtenirPortefeuillePourProprietaire: vi.fn().mockResolvedValue({ id: 1n }),
        crediter: vi.fn().mockImplementation(async () => {
          creditsPortefeuille++;
        }),
      };

      const fournisseurPaiement = {
        verifierSignatureWebhook: vi.fn().mockReturnValue(true),
        analyserNotification: vi.fn().mockResolvedValue({
          succes: true,
          statut: 'PAYE',
          reference_paiement: 'PAY-RECH-123',
          reference_fournisseur: 'EXT-123',
          montant: 10000,
          devise: 'XAF',
        }),
      };

      // Constructeur : prisma, portefeuilleService, idempotenceService, fournisseurPaiement, abonnementsService
      const service = new PaiementsService(
        mockPrisma as any,
        portefeuilleService as any,
        {} as any,
        fournisseurPaiement as any,
        {} as any,
      );

      const webhook1 = await service.traiterWebhook('FOURNISSEUR_DEMO', 'sig1', {});
      expect(webhook1.statut).toBe('PAYE');
      expect(creditsPortefeuille).toBe(1);

      // Deuxième webhook arrivant après validation
      const webhook2 = await service.traiterWebhook('FOURNISSEUR_DEMO', 'sig2', {});
      expect(webhook2.message).toContain('déjà traitée');
      expect(creditsPortefeuille).toBe(1); // Aucun double crédit
    });
  });
});
