import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TarifsService } from './tarifs.service.js';
import { CalculTarifService } from './calcul-tarif.service.js';

describe('TarifsService', () => {
  let service: TarifsService;
  let mockPrisma: any;
  let calculService: CalculTarifService;

  beforeEach(() => {
    calculService = new CalculTarifService();

    mockPrisma = {
      orm: {
        public: {
          Tarif: {
            where: vi.fn(),
            create: vi.fn(),
          },
          TypeDechet: {
            where: vi.fn(),
          },
          Zone: {
            where: vi.fn(),
          },
        },
      },
    };

    service = new TarifsService(mockPrisma, calculService);
  });

  describe('obtenirTarifApplicable', () => {
    it('devrait retourner le tarif actif valide pour la date demandée', async () => {
      const dateCible = new Date('2026-06-15T10:00:00Z');
      const mockTarifs = [
        {
          id: 1n,
          nom: 'Tarif Ancien 2025',
          type_dechet_id: 1n,
          zone_id: 1n,
          statut: 'ACTIF',
          date_debut: new Date('2025-01-01'),
          date_fin: new Date('2025-12-31'),
        },
        {
          id: 2n,
          nom: 'Tarif Courant 2026',
          type_dechet_id: 1n,
          zone_id: 1n,
          statut: 'ACTIF',
          date_debut: new Date('2026-01-01'),
          date_fin: new Date('2026-12-31'),
        },
      ];

      const chain = {
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockTarifs),
      };
      mockPrisma.orm.public.Tarif.where.mockReturnValue(chain);

      const resultat = await service.obtenirTarifApplicable({
        type_dechet_id: 1,
        zone_id: 1,
        date: dateCible,
      });

      expect(resultat.id).toBe(2n);
      expect(resultat.nom).toBe('Tarif Courant 2026');
    });

    it('devrait lever une NotFoundException si aucun tarif actif ne couvre la date', async () => {
      const dateCible = new Date('2027-05-01T10:00:00Z');
      const mockTarifs = [
        {
          id: 1n,
          nom: 'Tarif 2026',
          type_dechet_id: 1n,
          zone_id: 1n,
          statut: 'ACTIF',
          date_debut: new Date('2026-01-01'),
          date_fin: new Date('2026-12-31'),
        },
      ];

      const chain = {
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue(mockTarifs),
      };
      mockPrisma.orm.public.Tarif.where.mockReturnValue(chain);

      await expect(
        service.obtenirTarifApplicable({
          type_dechet_id: 1,
          zone_id: 1,
          date: dateCible,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('creerTarif', () => {
    it('devrait refuser une date de fin antérieure ou égale à la date de début', async () => {
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n }),
      });
      mockPrisma.orm.public.Zone.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n }),
      });

      await expect(
        service.creerTarif({
          nom: 'Tarif Incohérent',
          type_dechet_id: 1,
          zone_id: 1,
          prix_base: 1000,
          prix_par_kg: 50,
          date_debut: new Date('2026-06-01'),
          date_fin: new Date('2026-05-01'), // Fin avant début !
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait refuser la création si un tarif actif chevauche la même période pour le même couple (type_dechet, zone)', async () => {
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n }),
      });
      mockPrisma.orm.public.Zone.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n }),
      });

      // Tarif existant du 01-01-2026 au 31-12-2026
      const tarifExistant = {
        id: 10n,
        nom: 'Tarif Annuel 2026',
        type_dechet_id: 1n,
        zone_id: 1n,
        statut: 'ACTIF',
        date_debut: new Date('2026-01-01'),
        date_fin: new Date('2026-12-31'),
      };

      const chain = {
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([tarifExistant]),
      };
      mockPrisma.orm.public.Tarif.where.mockReturnValue(chain);

      // Nouveau tarif du 01-06-2026 au 30-06-2026 (chevauchement !)
      await expect(
        service.creerTarif({
          nom: 'Tarif Juin 2026',
          type_dechet_id: 1,
          zone_id: 1,
          prix_base: 1200,
          prix_par_kg: 60,
          date_debut: new Date('2026-06-01'),
          date_fin: new Date('2026-06-30'),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait autoriser la création si les périodes sont disjointes', async () => {
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n }),
      });
      mockPrisma.orm.public.Zone.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n }),
      });

      // Tarif existant sur 2025
      const tarifExistant = {
        id: 10n,
        nom: 'Tarif 2025',
        type_dechet_id: 1n,
        zone_id: 1n,
        statut: 'ACTIF',
        date_debut: new Date('2025-01-01'),
        date_fin: new Date('2025-12-31'),
      };

      const chain = {
        where: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue([tarifExistant]),
      };
      mockPrisma.orm.public.Tarif.where.mockReturnValue(chain);

      mockPrisma.orm.public.Tarif.create.mockResolvedValue({
        id: 11n,
        nom: 'Tarif 2026',
        statut: 'ACTIF',
      });

      const nouveau = await service.creerTarif({
        nom: 'Tarif 2026',
        type_dechet_id: 1,
        zone_id: 1,
        prix_base: 1200,
        prix_par_kg: 60,
        date_debut: new Date('2026-01-01'),
        date_fin: new Date('2026-12-31'),
      });

      expect(nouveau.id).toBe(11n);
    });
  });

  describe('desactiverTarif', () => {
    it('devrait désactiver logiquement le tarif en passant son statut à INACTIF', async () => {
      mockPrisma.orm.public.Tarif.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, statut: 'ACTIF' }),
        update: vi.fn().mockResolvedValue({ id: 1n, statut: 'INACTIF' }),
      });

      const resultat = await service.desactiverTarif(1n);
      expect(resultat.statut).toBe('INACTIF');
    });
  });
});

