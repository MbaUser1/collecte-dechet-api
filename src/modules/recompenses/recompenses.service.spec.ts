import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { RecompensesService } from './recompenses.service.js';

describe('RecompensesService', () => {
  let service: RecompensesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Recompense: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          ReclamationRecompense: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          TransactionPoints: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Partenaire: {
            where: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new RecompensesService(mockPrisma);
  });

  describe('obtenirSoldeEtHistoriquePoints', () => {
    it('devrait calculer le solde cumulé à partir des transactions de crédit et débit', async () => {
      mockPrisma.orm.public.TransactionPoints.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([
          { points: 50, sens: 'CREDIT' },
          { points: 30, sens: 'CREDIT' },
          { points: 20, sens: 'DEBIT' },
        ]),
        count: vi.fn().mockResolvedValue(3),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
      });

      const res = await service.obtenirSoldeEtHistoriquePoints(10n, { page: 1, limite: 10, offset: 0 });

      // 50 + 30 - 20 = 60 points
      expect(res.solde_points).toBe(60);
    });
  });

  describe('reclamerRecompense', () => {
    it('devrait décrémenter le stock, débiter les points et générer un bon unique si le solde est suffisant', async () => {
      mockPrisma.orm.public.Recompense.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          titre: 'Bon d’achat 5000 FCFA',
          points_requis: 100,
          stock: 5,
          statut: 'ACTIF',
        }),
        update: vi.fn().mockResolvedValue({ id: 1n, stock: 4 }),
      });

      mockPrisma.orm.public.TransactionPoints.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([
          { points: 150, sens: 'CREDIT' }, // Solde = 150 >= 100
        ]),
      });

      mockPrisma.orm.public.ReclamationRecompense.create.mockResolvedValue({
        id: 10n,
        code_reclamation: 'REC-TEST-1234',
        statut: 'RESERVEE',
        points_utilises: 100,
      });

      const res = await service.reclamerRecompense(1n, 10n);

      expect(res.succes).toBe(true);
      expect(res.solde_restant).toBe(50);
      expect(mockPrisma.orm.public.Recompense.where().update).toHaveBeenCalledWith(
        expect.objectContaining({ stock: 4 }),
      );
      expect(mockPrisma.orm.public.TransactionPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 10n,
          points: 100,
          sens: 'DEBIT',
        }),
      );
    });

    it('devrait refuser avec POINTS_INSUFFISANTS si les points sont insuffisants', async () => {
      mockPrisma.orm.public.Recompense.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          points_requis: 200,
          stock: 5,
          statut: 'ACTIF',
        }),
      });

      mockPrisma.orm.public.TransactionPoints.where.mockReturnValue({
        all: vi.fn().mockResolvedValue([
          { points: 50, sens: 'CREDIT' }, // Solde = 50 < 200
        ]),
      });

      try {
        await service.reclamerRecompense(1n, 10n);
        expect.fail('Aurait dû lever BadRequestException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadRequestException);
        expect(err.getResponse().code).toBe('POINTS_INSUFFISANTS');
      }
    });

    it('devrait refuser avec STOCK_EPUISE si le stock est nul', async () => {
      mockPrisma.orm.public.Recompense.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          points_requis: 50,
          stock: 0, // Rupture !
          statut: 'ACTIF',
        }),
      });

      try {
        await service.reclamerRecompense(1n, 10n);
        expect.fail('Aurait dû lever ConflictException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConflictException);
        expect(err.getResponse().code).toBe('STOCK_EPUISE');
      }
    });
  });

  describe('validerUtilisationReclamation et annulerReclamation', () => {
    it('devrait valider l’utilisation d’un bon réservé non expiré', async () => {
      mockPrisma.orm.public.ReclamationRecompense.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          code_reclamation: 'REC-VALIDE',
          statut: 'RESERVEE',
          date_expiration: new Date(Date.now() + 86400000), // Demain
        }),
        update: vi.fn().mockResolvedValue({
          id: 10n,
          statut: 'UTILISEE',
        }),
      });

      const res = await service.validerUtilisationReclamation('REC-VALIDE');
      expect(res.succes).toBe(true);
      expect(res.reclamation.statut).toBe('UTILISEE');
    });

    it('devrait annuler une réclamation, restaurer le stock et restituer les points', async () => {
      mockPrisma.orm.public.ReclamationRecompense.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          code_reclamation: 'REC-ANNUL',
          utilisateur_id: 10n,
          recompense_id: 1n,
          points_utilises: 100,
          statut: 'RESERVEE',
        }),
        update: vi.fn().mockResolvedValue({ id: 10n, statut: 'ANNULEE' }),
      });

      mockPrisma.orm.public.Recompense.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, stock: 4 }),
        update: vi.fn().mockResolvedValue({ id: 1n, stock: 5 }),
      });

      const res = await service.annulerReclamation('REC-ANNUL', 'Erreur de saisie client');

      expect(res.succes).toBe(true);
      expect(mockPrisma.orm.public.TransactionPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 10n,
          points: 100,
          sens: 'CREDIT',
        }),
      );
      expect(mockPrisma.orm.public.Recompense.where().update).toHaveBeenCalledWith(
        expect.objectContaining({ stock: 5 }),
      );
    });
  });
});

