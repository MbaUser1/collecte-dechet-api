import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AjustementsService } from './ajustements.service.js';

describe('AjustementsService', () => {
  let service: AjustementsService;
  let mockPrisma: any;
  let mockPortefeuilleService: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          DemandeCollecte: {
            where: vi.fn(),
          },
          AjustementPrix: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Portefeuille: {
            where: vi.fn(),
          },
          Paiement: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Entreprise: {
            where: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (callback) => callback(mockPrisma)),
    };

    mockPortefeuilleService = {
      obtenirPortefeuillePourProprietaire: vi.fn(),
      crediter: vi.fn(),
      debiter: vi.fn(),
    };

    service = new AjustementsService(mockPrisma, mockPortefeuilleService);
  });

  describe('creerAjustementDebit', () => {
    it('devrait créer un ajustement débiteur en statut EN_ATTENTE', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 10n, numero: 'COL-001' }),
      });

      mockPrisma.orm.public.AjustementPrix.create.mockResolvedValue({
        id: 1n,
        demande_collecte_id: 10n,
        montant: '1500',
        sens: 'DEBIT',
        motif: 'Poids réel supérieur de 5kg',
        statut: 'EN_ATTENTE',
      });

      const res = await service.creerAjustementDebit(10n, 1500, 'Poids réel supérieur de 5kg');

      expect(res.statut).toBe('EN_ATTENTE');
      expect(res.sens).toBe('DEBIT');
      expect(mockPrisma.orm.public.AjustementPrix.create).toHaveBeenCalledWith(
        expect.objectContaining({
          demande_collecte_id: 10n,
          montant: '1500',
          sens: 'DEBIT',
          statut: 'EN_ATTENTE',
        }),
      );
    });

    it('devrait refuser un montant négatif ou nul', async () => {
      await expect(
        service.creerAjustementDebit(10n, -100, 'Écart'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('creerAjustementCreditEtRembourser', () => {
    it('devrait créditer immédiatement le portefeuille et enregistrer l’ajustement réglé', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          numero: 'COL-001',
          utilisateur_id: 5n,
          entreprise_id: null,
        }),
      });

      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 20n, solde: '3000' }),
      });

      mockPrisma.orm.public.AjustementPrix.create.mockResolvedValue({
        id: 2n,
        demande_collecte_id: 10n,
        montant: '1000',
        sens: 'CREDIT',
        statut: 'REGLE',
      });

      const res = await service.creerAjustementCreditEtRembourser(
        10n,
        1000,
        'Poids réel inférieur de 3kg',
      );

      expect(mockPortefeuilleService.crediter).toHaveBeenCalledWith(
        20n,
        1000,
        expect.stringContaining('Remboursement'),
        expect.any(String),
        mockPrisma,
      );
      expect(res.statut).toBe('REGLE');
    });
  });

  describe('aDesAjustementsDebiteursEnAttente', () => {
    it('devrait retourner true si au moins une demande a un débit EN_ATTENTE', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([{ id: 10n }, { id: 11n }]),
      });

      mockPrisma.orm.public.AjustementPrix.where.mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ id: 1n, sens: 'DEBIT', statut: 'EN_ATTENTE' }),
          }),
        }),
      });

      const res = await service.aDesAjustementsDebiteursEnAttente(5n);
      expect(res).toBe(true);
    });

    it('devrait retourner false si aucun débit n’est en attente', async () => {
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([{ id: 10n }]),
      });

      mockPrisma.orm.public.AjustementPrix.where.mockReturnValue({
        where: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      });

      const res = await service.aDesAjustementsDebiteursEnAttente(5n);
      expect(res).toBe(false);
    });
  });

  describe('reglerAjustementParPortefeuille', () => {
    it('devrait débiter le portefeuille et passer l’ajustement à REGLE', async () => {
      mockPrisma.orm.public.AjustementPrix.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          demande_collecte_id: 10n,
          montant: '1500',
          sens: 'DEBIT',
          statut: 'EN_ATTENTE',
        }),
        update: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'REGLE',
          paiement_id: 99n,
        }),
      });

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          numero: 'COL-001',
          utilisateur_id: 5n,
        }),
      });

      mockPortefeuilleService.obtenirPortefeuillePourProprietaire.mockResolvedValue({
        id: 20n,
        solde: '5000',
      });

      mockPrisma.orm.public.Paiement.create.mockResolvedValue({
        id: 99n,
        montant: '1500',
        statut: 'PAYE',
      });

      const resultat = await service.reglerAjustementParPortefeuille(1n, {
        id: 5n,
        role: 'PARTICULIER',
      });

      expect(mockPortefeuilleService.debiter).toHaveBeenCalledWith(
        20n,
        1500,
        expect.stringContaining('Règlement ajustement'),
        expect.any(String),
        mockPrisma,
      );
      expect(resultat.ajustement.statut).toBe('REGLE');
    });
  });
});

