import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PortefeuilleService } from './portefeuille.service.js';

describe('PortefeuilleService', () => {
  let service: PortefeuilleService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Portefeuille: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Entreprise: {
            where: vi.fn(),
          },
          TransactionPortefeuille: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (callback) => callback(mockPrisma)),
    };

    service = new PortefeuilleService(mockPrisma);
  });

  describe('obtenirPortefeuillePourProprietaire', () => {
    it('devrait récupérer le portefeuille existant d’un particulier', async () => {
      const portefeuilleMock = {
        id: 1n,
        utilisateur_id: 10n,
        entreprise_id: null,
        solde: '5000',
        devise: 'XAF',
        statut: 'ACTIF',
      };

      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(portefeuilleMock),
      });

      const resultat = await service.obtenirPortefeuillePourProprietaire({
        id: 10n,
        role: 'PARTICULIER',
      });

      expect(resultat).toEqual(portefeuilleMock);
      expect(mockPrisma.orm.public.Portefeuille.create).not.toHaveBeenCalled();
    });

    it('devrait initialiser atomiquement un portefeuille à solde 0 si inexistant', async () => {
      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      const portefeuilleCree = {
        id: 2n,
        utilisateur_id: 11n,
        entreprise_id: null,
        solde: '0',
        devise: 'XAF',
        statut: 'ACTIF',
      };

      mockPrisma.orm.public.Portefeuille.create.mockResolvedValue(portefeuilleCree);

      const resultat = await service.obtenirPortefeuillePourProprietaire({
        id: 11n,
        role: 'PARTICULIER',
      });

      expect(resultat).toEqual(portefeuilleCree);
      expect(mockPrisma.orm.public.Portefeuille.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 11n,
          entreprise_id: null,
          solde: '0',
          devise: 'XAF',
        }),
      );
    });

    it('devrait rattacher le portefeuille à entreprise_id pour une ENTREPRISE', async () => {
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n, utilisateur_id: 20n }),
      });

      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      const portefeuilleEntreprise = {
        id: 3n,
        utilisateur_id: null,
        entreprise_id: 50n,
        solde: '0',
        devise: 'XAF',
        statut: 'ACTIF',
      };

      mockPrisma.orm.public.Portefeuille.create.mockResolvedValue(portefeuilleEntreprise);

      const resultat = await service.obtenirPortefeuillePourProprietaire({
        id: 20n,
        role: 'ENTREPRISE',
      });

      expect(resultat).toEqual(portefeuilleEntreprise);
      expect(mockPrisma.orm.public.Portefeuille.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entreprise_id: 50n,
          utilisateur_id: null,
        }),
      );
    });
  });

  describe('crediter', () => {
    it('devrait refuser un montant négatif ou nul', async () => {
      await expect(
        service.crediter(1n, 0, 'Test'),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.crediter(1n, -500, 'Test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait créditer le solde et enregistrer une TransactionPortefeuille CREDIT', async () => {
      const portefeuilleInitial = {
        id: 1n,
        solde: '1000',
        statut: 'ACTIF',
      };

      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(portefeuilleInitial),
        update: vi.fn().mockResolvedValue({ ...portefeuilleInitial, solde: '3500' }),
      });

      mockPrisma.orm.public.TransactionPortefeuille.create.mockResolvedValue({
        id: 101n,
        portefeuille_id: 1n,
        montant: '2500',
        sens: 'CREDIT',
        solde_apres: '3500',
      });

      const res = await service.crediter(1n, 2500, 'Recharge MoMo', 'REF-TEST');

      expect(res.solde).toBe(3500);
      expect(mockPrisma.orm.public.TransactionPortefeuille.create).toHaveBeenCalledWith(
        expect.objectContaining({
          portefeuille_id: 1n,
          montant: '2500',
          sens: 'CREDIT',
          solde_apres: '3500',
        }),
      );
    });
  });

  describe('debiter', () => {
    it('devrait refuser un montant négatif ou nul', async () => {
      await expect(
        service.debiter(1n, 0, 'Test'),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait lever FONDS_INSUFFISANTS sans débit partiel si le solde est insuffisant', async () => {
      const portefeuilleInitial = {
        id: 1n,
        solde: '1500',
        statut: 'ACTIF',
      };

      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(portefeuilleInitial),
      });

      try {
        await service.debiter(1n, 2000, 'Achat sac');
        expect.fail('Aurait dû lever une exception');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        const reponse = err.getResponse();
        expect(reponse.code).toBe('FONDS_INSUFFISANTS');
        expect(reponse.solde_disponible).toBe(1500);
        expect(reponse.montant_requis).toBe(2000);
      }

      expect(mockPrisma.orm.public.TransactionPortefeuille.create).not.toHaveBeenCalled();
    });

    it('devrait débiter avec succès si le solde est suffisant', async () => {
      const portefeuilleInitial = {
        id: 1n,
        solde: '5000',
        statut: 'ACTIF',
      };

      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(portefeuilleInitial),
        update: vi.fn().mockResolvedValue({ ...portefeuilleInitial, solde: '3000' }),
      });

      mockPrisma.orm.public.TransactionPortefeuille.create.mockResolvedValue({
        id: 102n,
        portefeuille_id: 1n,
        montant: '2000',
        sens: 'DEBIT',
        solde_apres: '3000',
      });

      const res = await service.debiter(1n, 2000, 'Collecte #10');

      expect(res.solde).toBe(3000);
      expect(mockPrisma.orm.public.TransactionPortefeuille.create).toHaveBeenCalledWith(
        expect.objectContaining({
          portefeuille_id: 1n,
          montant: '2000',
          sens: 'DEBIT',
          solde_apres: '3000',
        }),
      );
    });

    it('devrait refuser toute opération si le portefeuille est suspendu ou inactif', async () => {
      mockPrisma.orm.public.Portefeuille.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          solde: '5000',
          statut: 'SUSPENDU',
        }),
      });

      await expect(
        service.debiter(1n, 1000, 'Tentative'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

