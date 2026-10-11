import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AjustementsService } from '../src/modules/ajustements/ajustements.service.js';
import { PortefeuilleService } from '../src/modules/portefeuille/portefeuille.service.js';
import { PaiementsService } from '../src/modules/paiements/services/paiements.service.js';
import { MissionsService } from '../src/modules/missions/missions.service.js';
import { QuotaService } from '../src/modules/abonnements/services/quota.service.js';
import { RecompensesService } from '../src/modules/recompenses/recompenses.service.js';
import { SignalementsService } from '../src/modules/signalements/signalements.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('PRIORITÉS 1, 2 ET 3 — SÉCURITÉ FINANCIÈRE ET PERSISTANCE COMMUNAUTAIRE', () => {
  // ==========================================================================
  // SCÉNARIO 1 & 2 : Remboursements partiels successifs et concurrence
  // ==========================================================================
  describe('Finance 1 & 2 : Remboursements partiels et protection concurrence', () => {
    let service: AjustementsService;
    let mockPrisma: any;
    let mockPortefeuilleService: any;

    beforeEach(() => {
      mockPortefeuilleService = {
        crediter: vi.fn().mockResolvedValue({ id: 1n, solde: '5000' }),
      };

      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            DemandeCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 10n,
                numero: 'COL-10',
                utilisateur_id: 1n,
                entreprise_id: null,
              }),
            },
            Paiement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 100n,
                montant: '2000',
                statut: 'PAYE',
              }),
              update: vi.fn().mockResolvedValue({ id: 100n }),
            },
            Portefeuille: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 50n, solde: '1000' }),
            },
            AjustementPrix: {
              where: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue([]),
              create: vi.fn().mockResolvedValue({ id: 1n, montant: '500', sens: 'CREDIT', statut: 'REGLE' }),
            },
          },
        },
      };

      service = new AjustementsService(mockPrisma as any, mockPortefeuilleService as any);
    });

    it('devrait calculer le cumul exact lors de remboursements successifs', async () => {
      // 1er remboursement : 800 FCFA sur 2000 FCFA -> statut REMBOURSE_PARTIELLEMENT
      mockPrisma.orm.public.AjustementPrix.all
        .mockResolvedValueOnce([]) // Aucun remboursement antérieur
        .mockResolvedValueOnce([{ id: 1n, montant: '800', sens: 'CREDIT', statut: 'REGLE' }]);

      await service.creerAjustementCreditEtRembourser(10n, 800, 'Remboursement 1', 100n);

      expect(mockPrisma.orm.public.Paiement.update).toHaveBeenCalledWith(
        expect.objectContaining({ statut: 'REMBOURSE_PARTIELLEMENT' }),
      );

      // 2e remboursement : 1200 FCFA -> total 2000 FCFA -> statut REMBOURSE
      mockPrisma.orm.public.AjustementPrix.all
        .mockResolvedValueOnce([{ id: 1n, montant: '800', sens: 'CREDIT', statut: 'REGLE' }])
        .mockResolvedValueOnce([
          { id: 1n, montant: '800', sens: 'CREDIT', statut: 'REGLE' },
          { id: 2n, montant: '1200', sens: 'CREDIT', statut: 'REGLE' },
        ]);

      await service.creerAjustementCreditEtRembourser(10n, 1200, 'Remboursement solde', 100n);

      expect(mockPrisma.orm.public.Paiement.update).toHaveBeenCalledWith(
        expect.objectContaining({ statut: 'REMBOURSE' }),
      );
    });

    it('devrait rejeter un remboursement si le cumul dépasse le montant du paiement', async () => {
      // Déjà 1500 FCFA remboursés sur 2000 FCFA
      mockPrisma.orm.public.AjustementPrix.all.mockResolvedValueOnce([
        { id: 1n, montant: '1500', sens: 'CREDIT', statut: 'REGLE' },
      ]);

      // Tentative de rembourser 600 FCFA (dépassement de 100 FCFA)
      await expect(
        service.creerAjustementCreditEtRembourser(10n, 600, 'Trop perçu', 100n),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait échouer avec ConflictException en cas de modification concurrente du paiement', async () => {
      mockPrisma.orm.public.AjustementPrix.all.mockResolvedValueOnce([]);

      // Simule que la mise à jour conditionnelle échoue car une autre tx a déjà modifié le paiement
      mockPrisma.orm.public.Paiement.update.mockResolvedValueOnce(null);

      await expect(
        service.creerAjustementCreditEtRembourser(10n, 2000, 'Remboursement complet', 100n),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait empêcher le double remboursement partiel concurrent (600 FCFA + 600 FCFA sur 1000 FCFA)', async () => {
      // Configuration : Paiement initial de 1 000 FCFA
      const dateV1 = new Date('2026-10-10T10:00:00Z');
      mockPrisma.orm.public.Paiement.first.mockResolvedValue({
        id: 100n,
        montant: '1000',
        statut: 'PAYE',
        date_modification: dateV1,
      });

      // Les deux opérations lisent initialement dejaRembourse = 0
      mockPrisma.orm.public.AjustementPrix.all.mockResolvedValue([]);

      // Tx 1 : premier remboursement de 600 FCFA -> OCC réussit
      mockPrisma.orm.public.Paiement.update.mockResolvedValueOnce({
        id: 100n,
        montant: '1000',
        statut: 'REMBOURSE_PARTIELLEMENT',
        date_modification: new Date('2026-10-10T10:00:01Z'),
      });

      const res1 = await service.creerAjustementCreditEtRembourser(10n, 600, 'Remboursement partiel 1', 100n);
      expect(res1.statut).toBe('REGLE');
      expect(mockPortefeuilleService.crediter).toHaveBeenCalledTimes(1);

      // Tx 2 (concurrente) : deuxième remboursement de 600 FCFA qui avait lu le même snapshot V1
      // Dans PostgreSQL, la réévaluation du WHERE sur date_modification échoue -> update retourne null / 0 ligne
      mockPrisma.orm.public.Paiement.update.mockResolvedValueOnce(null);

      await expect(
        service.creerAjustementCreditEtRembourser(10n, 600, 'Remboursement partiel 2 (concurrent)', 100n),
      ).rejects.toThrow(ConflictException);

      // Le portefeuille NE DOIT PAS avoir été crédité une seconde fois
      expect(mockPortefeuilleService.crediter).toHaveBeenCalledTimes(1);

      // Rejeu séquentiel après échec : Tx 2 relit l'état à jour
      mockPrisma.orm.public.Paiement.first.mockResolvedValueOnce({
        id: 100n,
        montant: '1000',
        statut: 'REMBOURSE_PARTIELLEMENT',
        date_modification: new Date('2026-10-10T10:00:01Z'),
      });
      // Le premier remboursement de 600 FCFA est maintenant visible
      mockPrisma.orm.public.AjustementPrix.all.mockResolvedValueOnce([
        { id: 1n, montant: '600', sens: 'CREDIT', statut: 'REGLE' },
      ]);

      // La demande de 600 FCFA est rejetée car restant = 400 FCFA (< 600 FCFA)
      await expect(
        service.creerAjustementCreditEtRembourser(10n, 600, 'Remboursement partiel 2 (retry)', 100n),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ==========================================================================
  // SCÉNARIO 3 : Double webhook et événements hors séquence
  // ==========================================================================
  describe('Finance 3 : Idempotence stricte des webhooks de paiement', () => {
    let service: PaiementsService;
    let mockPrisma: any;
    let mockPortefeuilleService: any;
    let mockIdempotenceService: any;
    let mockFournisseur: any;
    let mockAbonnementsService: any;

    beforeEach(() => {
      mockPortefeuilleService = { crediter: vi.fn() };
      mockIdempotenceService = {};
      mockAbonnementsService = {};
      mockFournisseur = {
        verifierSignatureWebhook: vi.fn().mockReturnValue(true),
        analyserNotification: vi.fn().mockResolvedValue({
          succes: true,
          reference_paiement: 'PAY-HOOK',
          reference_fournisseur: 'EXT-HOOK',
          montant: 10000,
          devise: 'XAF',
          statut: 'PAYE',
        }),
      };

      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            Paiement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn(),
              update: vi.fn(),
            },
            Utilisateur: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 1n }),
            },
          },
        },
      };

      service = new PaiementsService(
        mockPrisma as any,
        mockPortefeuilleService as any,
        mockIdempotenceService as any,
        mockFournisseur as any,
        mockAbonnementsService as any,
      );
    });

    it('devrait ignorer de manière idempotente un double webhook sans créditer deux fois', async () => {
      mockPrisma.orm.public.Paiement.first.mockResolvedValueOnce({
        id: 1n,
        reference: 'PAY-HOOK',
        statut: 'PAYE', // Déjà payé
        montant: '10000',
        devise: 'XAF',
        type: 'RECHARGEMENT_PORTEFEUILLE',
      });

      const res = await service.traiterWebhook('FOURNISSEUR_DEMO', 'sig-ok', {});
      expect(res.recu).toBe(true);
      expect(mockPortefeuilleService.crediter).not.toHaveBeenCalled();
    });

    it('devrait bloquer un webhook de succès si le paiement a été annulé', async () => {
      mockPrisma.orm.public.Paiement.first.mockResolvedValueOnce({
        id: 1n,
        reference: 'PAY-HOOK',
        statut: 'ANNULE',
        montant: '10000',
        devise: 'XAF',
      });

      await expect(
        service.traiterWebhook('FOURNISSEUR_DEMO', 'sig-ok', {}),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================================================
  // SCÉNARIO 4 : Débits concurrents et prévention des découverts
  // ==========================================================================
  describe('Finance 4 : Débits du portefeuille et verrouillage optimiste', () => {
    let service: PortefeuilleService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            Portefeuille: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 10n,
                solde: '500',
                statut: 'ACTIF',
                devise: 'XAF',
              }),
              update: vi.fn().mockResolvedValue({ id: 10n, solde: '200' }),
            },
            TransactionPortefeuille: {
              create: vi.fn().mockResolvedValue({ id: 1n }),
            },
          },
        },
      };

      service = new PortefeuilleService(mockPrisma as any);
    });

    it('devrait rejeter immédiatement un débit supérieur au solde disponible (anti-découvert)', async () => {
      await expect(
        service.debiter(10n, 600, 'Achat supérieur au solde'),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lever ConflictException si une écriture concurrente a modifié le solde', async () => {
      // Simule que la clause conditionnelle .and(p.solde.eq(500)) échoue (modifié par une autre tx)
      mockPrisma.orm.public.Portefeuille.update.mockResolvedValueOnce(null);

      await expect(
        service.debiter(10n, 300, 'Débit concurrent'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================================================
  // SCÉNARIO 5 : Attributions concurrentes de missions
  // ==========================================================================
  describe('Finance 5 : Attribution concurrente exclusive de mission', () => {
    let service: MissionsService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            DemandeCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 20n,
                statut: 'EN_ATTENTE_ATTRIBUTION',
                collecteur_id: null,
              }),
              update: vi.fn().mockResolvedValue({ id: 20n, statut: 'ATTRIBUEE' }),
            },
            MissionCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue({ id: 99n }),
            },
          },
        },
      };

      service = new MissionsService(
        mockPrisma as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('devrait rejeter la deuxième acceptation concurrente si la demande a déjà été attribuée', async () => {
      // Simule que la mise à jour conditionnelle atomique renvoie null (déjà acceptée)
      mockPrisma.orm.public.DemandeCollecte.update.mockResolvedValueOnce(null);

      await expect(
        service.accepterCollecte(20n, { id: 2n, role: 'COLLECTEUR' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================================================
  // SCÉNARIO 6 : Transitions de quota d'abonnement
  // ==========================================================================
  describe('Finance 6 : Atomicité et respect des bornes de quota', () => {
    let service: QuotaService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            Abonnement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 5n,
                nombre_collectes_incluses: 10,
                nombre_collectes_utilisees: 8,
                nombre_collectes_reservees: 2, // 8 + 2 = 10 (quota épuisé)
                statut: 'ACTIF',
              }),
              update: vi.fn(),
            },
            UtilisationAbonnement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue(null),
              create: vi.fn().mockResolvedValue({ id: 1n }),
            },
          },
        },
      };

      service = new QuotaService(mockPrisma as any);
    });

    it('devrait refuser une nouvelle réservation lorsque le quota disponible est nul', async () => {
      await expect(service.reserverQuota(5n, 100n)).rejects.toThrow(ConflictException);
    });
  });

  // ==========================================================================
  // SCÉNARIO 7 : Annulation concurrente d'un bon de récompense
  // ==========================================================================
  describe('Finance 7 : Atomicité de l’annulation d’un bon de récompense', () => {
    let service: RecompensesService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            ReclamationRecompense: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 1n,
                code_reclamation: 'REC-CODE-UNIQUE',
                statut: 'RESERVEE',
                recompense_id: 10n,
                utilisateur_id: 2n,
                points_utilises: 100,
              }),
              update: vi.fn().mockResolvedValue(null), // Simule conflit de course
            },
            Recompense: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn(),
              update: vi.fn(),
            },
            TransactionPoints: { create: vi.fn() },
          },
        },
      };

      service = new RecompensesService(mockPrisma as any);
    });

    it('devrait rejeter avec ConflictException la tentative concurrente et ne pas créditer les points deux fois', async () => {
      await expect(
        service.annulerReclamation('REC-CODE-UNIQUE'),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.orm.public.TransactionPoints.create).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SCÉNARIO 8 : Paiements partiels de facture
  // ==========================================================================
  describe('Finance 8 : Paiements partiels cumulatifs de facture', () => {
    let service: PaiementsService;
    let mockPrisma: any;
    let mockPortefeuilleService: any;
    let mockFournisseur: any;

    beforeEach(() => {
      mockPortefeuilleService = {
        obtenirPortefeuillePourProprietaire: vi.fn().mockResolvedValue({ id: 50n }),
        debiter: vi.fn().mockResolvedValue({}),
      };
      mockFournisseur = {};

      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            Facture: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 10n,
                numero: 'FACT-10',
                entreprise_id: 100n,
                montant_ttc: '50000',
                statut: 'EMISE',
              }),
              update: vi.fn().mockResolvedValue({ id: 10n }),
            },
            Entreprise: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 100n, utilisateur_id: 1n }),
            },
            Paiement: {
              where: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue([]),
              create: vi.fn().mockResolvedValue({ id: 1n }),
            },
          },
        },
      };

      service = new PaiementsService(
        mockPrisma as any,
        mockPortefeuilleService as any,
        { verifierCle: vi.fn().mockResolvedValue({ estExistant: false }), enregistrer: vi.fn() } as any,
        mockFournisseur as any,
        {} as any,
      );
    });

    it('devrait passer la facture en PARTIELLEMENT_PAYEE lors d’un paiement partiel', async () => {
      // Acompte de 20000 sur 50000
      const res = await service.payerFacture(
        { facture_id: '10', methode: 'PORTEFEUILLE', montant: 20000 },
        { id: 1n, role: 'ENTREPRISE' },
      );

      expect(res.succes).toBe(true);
      expect(mockPrisma.orm.public.Facture.update).toHaveBeenCalledWith(
        expect.objectContaining({
          statut: 'PARTIELLEMENT_PAYEE',
        }),
      );
    });
  });

  // ==========================================================================
  // PRIORITÉ 3 : Persistance de la participation communautaire
  // ==========================================================================
  describe('Priorité 3 : Persistance réelle des participations citoyennes', () => {
    let service: SignalementsService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            Signalement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 100n,
                description: 'Dépôt sauvage plage',
                statut: 'VALIDE',
              }),
            },
            ParticipationCollecteCommunautaire: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn(),
              create: vi.fn().mockResolvedValue({
                id: 1n,
                signalement_id: 100n,
                utilisateur_id: 5n,
                statut: 'INSCRIT',
              }),
              update: vi.fn().mockResolvedValue({
                id: 1n,
                statut: 'ANNULE',
              }),
            },
          },
        },
      };

      service = new SignalementsService(mockPrisma as any);
    });

    it('devrait persister réellement l’inscription en base de données', async () => {
      mockPrisma.orm.public.ParticipationCollecteCommunautaire.first.mockResolvedValueOnce(null);

      const res = await service.participerCollecteCommunautaire(100n, {
        id: 5n,
        role: 'PARTICULIER',
      });

      expect(res.succes).toBe(true);
      expect(res.participation).toBeDefined();
      expect(mockPrisma.orm.public.ParticipationCollecteCommunautaire.create).toHaveBeenCalledWith(
        expect.objectContaining({
          signalement_id: 100n,
          utilisateur_id: 5n,
          statut: 'INSCRIT',
        }),
      );
    });

    it('devrait refuser une double inscription au même chantier avec 409 Conflict', async () => {
      mockPrisma.orm.public.ParticipationCollecteCommunautaire.first.mockResolvedValueOnce({
        id: 1n,
        signalement_id: 100n,
        utilisateur_id: 5n,
        statut: 'INSCRIT',
      });

      await expect(
        service.participerCollecteCommunautaire(100n, {
          id: 5n,
          role: 'PARTICULIER',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait interdire la participation à un utilisateur qui n’est ni particulier ni entreprise', async () => {
      await expect(
        service.participerCollecteCommunautaire(100n, {
          id: 99n,
          role: 'COLLECTEUR',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devrait permettre à un citoyen d’annuler sa participation', async () => {
      mockPrisma.orm.public.ParticipationCollecteCommunautaire.first.mockResolvedValueOnce({
        id: 1n,
        signalement_id: 100n,
        utilisateur_id: 5n,
        statut: 'INSCRIT',
      });

      const res = await service.annulerParticipation(100n, {
        id: 5n,
        role: 'PARTICULIER',
      });

      expect(res.succes).toBe(true);
      expect(mockPrisma.orm.public.ParticipationCollecteCommunautaire.update).toHaveBeenCalledWith(
        expect.objectContaining({
          statut: 'ANNULE',
        }),
      );
    });
  });
});
