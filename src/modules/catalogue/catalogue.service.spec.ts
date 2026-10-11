import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CatalogueService } from './catalogue.service.js';

describe('CatalogueService', () => {
  let service: CatalogueService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          CategorieDechet: {
            where: vi.fn(),
            create: vi.fn(),
          },
          TypeDechet: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    };

    service = new CatalogueService(mockPrisma);
  });

  describe('Catégories', () => {
    it('devrait lister les catégories actives avec pagination', async () => {
      const mockCategories = [
        { id: 1n, nom: 'Plastiques', statut: 'ACTIF' },
        { id: 2n, nom: 'Métaux', statut: 'ACTIF' },
      ];

      const chain = {
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockCategories),
        count: vi.fn().mockResolvedValue(2),
      };
      mockPrisma.orm.public.CategorieDechet.where.mockReturnValue(chain);

      const resultat = await service.listerCategories({
        page: 1,
        limite: 10,
        statut: 'ACTIF',
        offset: 0,
      });

      expect(resultat.elements.length).toBe(2);
      expect(resultat.pagination.total).toBe(2);
    });

    it('devrait refuser la création d’une catégorie si le nom est déjà utilisé par une active', async () => {
      mockPrisma.orm.public.CategorieDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Plastiques', statut: 'ACTIF' }),
      });

      await expect(
        service.creerCategorie({ nom: 'Plastiques' }),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait désactiver logiquement une catégorie', async () => {
      mockPrisma.orm.public.CategorieDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, statut: 'ACTIF' }),
        update: vi.fn().mockResolvedValue({ id: 1n, statut: 'INACTIF' }),
      });

      const cat = await service.desactiverCategorie(1n);
      expect(cat.statut).toBe('INACTIF');
    });
  });

  describe('Types de déchets', () => {
    it('devrait refuser la création d’un type si la catégorie parente n’existe pas', async () => {
      mockPrisma.orm.public.CategorieDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.creerTypeDechet({
          categorie_dechet_id: 999,
          nom: 'Bouteilles PET',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait désactiver logiquement un type de déchet', async () => {
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 5n, statut: 'ACTIF' }),
        update: vi.fn().mockResolvedValue({ id: 5n, statut: 'INACTIF' }),
      });

      const typeDechet = await service.desactiverTypeDechet(5n);
      expect(typeDechet.statut).toBe('INACTIF');
    });
  });
});

