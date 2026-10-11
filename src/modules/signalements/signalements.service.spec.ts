import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SignalementsService } from './signalements.service.js';

describe('SignalementsService', () => {
  let service: SignalementsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Signalement: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          TransactionPoints: {
            create: vi.fn(),
          },
        },
      },
      transaction: vi.fn(async (cb) => cb(mockPrisma)),
    };

    service = new SignalementsService(mockPrisma);
  });

  describe('creerSignalement', () => {
    it('devrait créer un signalement citoyen au statut SOUMIS', async () => {
      mockPrisma.orm.public.Signalement.create.mockResolvedValue({
        id: 1n,
        utilisateur_id: 10n,
        description: 'Dépôt sauvage de pneus',
        adresse: 'Carrefour Ndokoti',
        ville: 'Douala',
        quartier: 'Ndokoti',
        statut: 'SOUMIS',
      });

      const res = await service.creerSignalement(
        {
          description: 'Dépôt sauvage de pneus',
          adresse: 'Carrefour Ndokoti',
          ville: 'Douala',
          quartier: 'Ndokoti',
          latitude: 4.05,
          longitude: 9.7,
        },
        { id: 10n, role: 'PARTICULIER' },
      );

      expect(res.succes).toBe(true);
      expect(res.signalement.statut).toBe('SOUMIS');
      expect(mockPrisma.orm.public.Signalement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 10n,
          statut: 'SOUMIS',
          points_attribues: 0,
        }),
      );
    });

    it('devrait refuser si la latitude est invalide', async () => {
      await expect(
        service.creerSignalement(
          {
            description: 'Dépôt sauvage de gravats',
            adresse: 'Rue 12',
            ville: 'Douala',
            quartier: 'Akwa',
            latitude: 100, // Invalide
          },
          { id: 10n, role: 'PARTICULIER' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('validerSignalement', () => {
    it('devrait passer le signalement à VALIDE et attribuer des points civiques si spécifiés', async () => {
      mockPrisma.orm.public.Signalement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          utilisateur_id: 10n,
          statut: 'SOUMIS',
          points_attribues: 0,
        }),
        update: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'VALIDE',
          points_attribues: 20,
        }),
      });

      const res = await service.validerSignalement(1n, { points_a_attribuer: 20 }, 99n);

      expect(res.succes).toBe(true);
      expect(res.signalement.statut).toBe('VALIDE');
      expect(mockPrisma.orm.public.TransactionPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 10n,
          points: 20,
          sens: 'CREDIT',
          signalement_id: 1n,
        }),
      );
    });
  });

  describe('resoudreSignalement', () => {
    it('devrait passer le signalement à NETTOYE et créditer les points de nettoyage', async () => {
      mockPrisma.orm.public.Signalement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          utilisateur_id: 10n,
          statut: 'VALIDE',
          points_attribues: 20,
        }),
        update: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'NETTOYE',
          points_attribues: 70,
        }),
      });

      const res = await service.resoudreSignalement(1n, { points_a_attribuer: 50 }, 99n);

      expect(res.succes).toBe(true);
      expect(res.signalement.statut).toBe('NETTOYE');
      expect(mockPrisma.orm.public.TransactionPoints.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 10n,
          points: 50,
          sens: 'CREDIT',
          signalement_id: 1n,
        }),
      );
    });

    it('devrait refuser de résoudre un signalement non préalablement validé', async () => {
      mockPrisma.orm.public.Signalement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'SOUMIS', // Non encore validé
        }),
      });

      await expect(
        service.resoudreSignalement(1n, { points_a_attribuer: 50 }, 99n),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('collectes communautaires', () => {
    it('devrait lister uniquement les chantiers citoyens ouverts (statut VALIDE)', async () => {
      const mockQuery = {
        where: vi.fn().mockReturnThis(),
        count: vi.fn().mockResolvedValue(1),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([
          { id: 1n, description: 'Nettoyage berges Wouri', statut: 'VALIDE' },
        ]),
      };

      mockPrisma.orm.public.Signalement.where.mockReturnValue(mockQuery);

      const res = await service.listerCollectesCommunautaires({ page: 1, limite: 10, offset: 0 });

      expect(res.elements.length).toBe(1);
      expect(res.elements[0].statut).toBe('VALIDE');
    });
  });
});

