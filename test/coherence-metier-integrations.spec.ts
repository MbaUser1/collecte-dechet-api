import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AjustementsService } from '../src/modules/ajustements/ajustements.service.js';
import { RecompensesService } from '../src/modules/recompenses/recompenses.service.js';
import { PaiementsService } from '../src/modules/paiements/services/paiements.service.js';
import { FacturationService } from '../src/modules/facturation/facturation.service.js';
import { DemandesCollecteService } from '../src/modules/demandes-collecte/demandes-collecte.service.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('Audit 4/5 — Cohérence Métier, Transitions et Intégrations', () => {
  describe('AjustementsService — Remboursements cumulés et transitions', () => {
    let service: AjustementsService;
    let mockPrisma: any;
    let mockPortefeuilleService: any;

    beforeEach(() => {
      mockPortefeuilleService = {
        crediter: vi.fn().mockResolvedValue({ id: 1n, solde: '1500' }),
      };

      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            DemandeCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 10n,
                numero: 'COL-TEST',
                utilisateur_id: 1n,
                entreprise_id: null,
              }),
            },
            Paiement: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({
                id: 100n,
                montant: '1000',
                statut: 'PAYE',
              }),
              update: vi.fn().mockResolvedValue({ id: 100n }),
            },
            Portefeuille: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 50n, solde: '500' }),
            },
            AjustementPrix: {
              where: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue([]),
              create: vi.fn().mockResolvedValue({ id: 500n, montant: '400', sens: 'CREDIT' }),
            },
          },
        },
      };

      service = new AjustementsService(mockPrisma as any, mockPortefeuilleService as any);
    });

    it('devrait refuser un remboursement qui dépasse le montant restant dû sur le paiement d’origine', async () => {
      // Un premier remboursement de 800 a déjà été effectué
      mockPrisma.orm.public.AjustementPrix.all.mockResolvedValueOnce([
        { id: 1n, montant: '800', sens: 'CREDIT', statut: 'REGLE' },
      ]);

      // Tentative de rembourser 300 supplémentaires (total 1100 > 1000)
      await expect(
        service.creerAjustementCreditEtRembourser(10n, 300, 'Surplus', 100n),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait passer le statut à REMBOURSE_PARTIELLEMENT si le remboursement ne couvre pas tout le paiement', async () => {
      mockPrisma.orm.public.AjustementPrix.all
        .mockResolvedValueOnce([]) // Pas de remboursement précédent
        .mockResolvedValueOnce([{ id: 1n, montant: '400', sens: 'CREDIT', statut: 'REGLE' }]); // Remboursement après

      await service.creerAjustementCreditEtRembourser(10n, 400, 'Écart pesée partielle', 100n);

      expect(mockPrisma.orm.public.Paiement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          statut: 'REMBOURSE_PARTIELLEMENT',
        }),
      );
    });

    it('devrait passer le statut à REMBOURSE lorsque les remboursements cumulés atteignent 100% du paiement', async () => {
      // Déjà 600 remboursés
      mockPrisma.orm.public.AjustementPrix.all
        .mockResolvedValueOnce([{ id: 1n, montant: '600', sens: 'CREDIT', statut: 'REGLE' }])
        .mockResolvedValueOnce([
          { id: 1n, montant: '600', sens: 'CREDIT', statut: 'REGLE' },
          { id: 2n, montant: '400', sens: 'CREDIT', statut: 'REGLE' },
        ]);

      await service.creerAjustementCreditEtRembourser(10n, 400, 'Solde remboursement', 100n);

      expect(mockPrisma.orm.public.Paiement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          statut: 'REMBOURSE',
        }),
      );
    });
  });

  describe('RecompensesService — Atomicité de l’annulation de bon', () => {
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
                code_reclamation: 'REC-CODE',
                statut: 'RESERVEE',
                recompense_id: 10n,
                utilisateur_id: 2n,
                points_utilises: 50,
              }),
              update: vi.fn().mockResolvedValue({ id: 1n, statut: 'ANNULEE' }),
            },
            Recompense: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn().mockResolvedValue({ id: 10n, stock: 5 }),
              update: vi.fn().mockResolvedValue({ id: 10n, stock: 6 }),
            },
            TransactionPoints: {
              create: vi.fn().mockResolvedValue({ id: 99n }),
            },
          },
        },
      };

      service = new RecompensesService(mockPrisma as any);
    });

    it('devrait rejeter une annulation concurrente si la condition atomique échoue', async () => {
      // Simule que la mise à jour conditionnelle ne trouve aucune ligne (déjà modifiée par une autre tx)
      mockPrisma.orm.public.ReclamationRecompense.update.mockResolvedValueOnce(null);

      await expect(
        service.annulerReclamation('REC-CODE'),
      ).rejects.toThrow(ConflictException);

      // Le stock ne doit pas être incrémenté et les points ne doivent pas être crédités
      expect(mockPrisma.orm.public.TransactionPoints.create).not.toHaveBeenCalled();
    });
  });

  describe('FacturationService — Prévention des régressions de statut sur devis', () => {
    let service: FacturationService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            Devis: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn(),
              update: vi.fn().mockResolvedValue({ id: 1n, statut: 'EN_ATTENTE_VALIDATION' }),
            },
          },
        },
      };

      service = new FacturationService(mockPrisma as any);
    });

    it('devrait refuser d’émettre un devis qui n’est pas en statut BROUILLON (ex: déjà VALIDE)', async () => {
      mockPrisma.orm.public.Devis.first.mockResolvedValueOnce({
        id: 1n,
        statut: 'VALIDE',
      });

      await expect(service.emettreDevis(1n)).rejects.toThrow(BadRequestException);
    });

    it('devrait accepter d’émettre un devis qui est au statut BROUILLON', async () => {
      mockPrisma.orm.public.Devis.first.mockResolvedValueOnce({
        id: 1n,
        statut: 'BROUILLON',
      });

      const res = await service.emettreDevis(1n);
      expect(res.succes).toBe(true);
      expect(mockPrisma.orm.public.Devis.update).toHaveBeenCalled();
    });
  });

  describe('PaiementsService — Idempotence avancée webhook', () => {
    let service: PaiementsService;
    let mockPrisma: any;
    let mockPortefeuilleService: any;
    let mockIdempotenceService: any;
    let mockFournisseur: any;
    let mockAbonnementsService: any;

    beforeEach(() => {
      mockPortefeuilleService = {};
      mockIdempotenceService = {};
      mockAbonnementsService = {};
      mockFournisseur = {
        verifierSignatureWebhook: vi.fn().mockReturnValue(true),
        analyserNotification: vi.fn().mockResolvedValue({
          succes: true,
          reference_paiement: 'PAY-123',
          reference_fournisseur: 'EXT-123',
          montant: 5000,
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

    it('devrait retourner immédiatement si le paiement est REMBOURSE_PARTIELLEMENT sans réexécuter le crédit', async () => {
      mockPrisma.orm.public.Paiement.first.mockResolvedValueOnce({
        id: 1n,
        reference: 'PAY-123',
        statut: 'REMBOURSE_PARTIELLEMENT',
        montant: '5000',
        devise: 'XAF',
      });

      const res = await service.traiterWebhook('FOURNISSEUR_DEMO', 'sig-ok', {});
      expect(res.recu).toBe(true);
      expect(res.message).toContain('déjà traitée antérieurement');
    });

    it('devrait rejeter avec ConflictException si le paiement à confirmer via webhook a été ANNULE', async () => {
      mockPrisma.orm.public.Paiement.first.mockResolvedValueOnce({
        id: 1n,
        reference: 'PAY-123',
        statut: 'ANNULE',
        montant: '5000',
        devise: 'XAF',
      });

      await expect(service.traiterWebhook('FOURNISSEUR_DEMO', 'sig-ok', {})).rejects.toThrow(ConflictException);
    });
  });

  describe('DemandesCollecteService — Protection concurrence annulation', () => {
    let service: DemandesCollecteService;
    let mockPrisma: any;
    let mockTarifsService: any;
    let mockCalculTarifService: any;
    let mockQuotaService: any;

    beforeEach(() => {
      mockTarifsService = {};
      mockCalculTarifService = {};
      mockQuotaService = {
        libererQuota: vi.fn(),
      };

      mockPrisma = {
        transaction: vi.fn((cb) => cb(mockPrisma)),
        orm: {
          public: {
            DemandeCollecte: {
              where: vi.fn().mockReturnThis(),
              first: vi.fn(),
              update: vi.fn().mockResolvedValue({ id: 10n, statut: 'ANNULEE' }),
            },
          },
        },
      };

      service = new DemandesCollecteService(
        mockPrisma as any,
        mockTarifsService as any,
        mockCalculTarifService as any,
        mockQuotaService as any,
      );
    });

    it('devrait rejeter l’annulation si la demande est passée à ATTRIBUEE dans la transaction', async () => {
      // Premier appel dans obtenirDemandeParId : statut EN_ATTENTE_ATTRIBUTION
      mockPrisma.orm.public.DemandeCollecte.first
        .mockResolvedValueOnce({
          id: 10n,
          utilisateur_id: 1n,
          statut: 'EN_ATTENTE_ATTRIBUTION',
        })
        // Deuxième lecture dans la transaction : la demande a été acceptée entre-temps par un collecteur !
        .mockResolvedValueOnce({
          id: 10n,
          utilisateur_id: 1n,
          statut: 'ATTRIBUEE',
        });

      await expect(
        service.annulerDemande(10n, { id: 1n, role: 'PARTICULIER' }),
      ).rejects.toThrow(ConflictException);

      expect(mockQuotaService.libererQuota).not.toHaveBeenCalled();
    });
  });
});

