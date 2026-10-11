import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { QuotaService } from './quota.service.js';

describe('QuotaService', () => {
  let service: QuotaService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Abonnement: {
            where: vi.fn(),
          },
          UtilisationAbonnement: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    };

    service = new QuotaService(mockPrisma);
  });

  describe('calculerDisponibilite', () => {
    it('devrait calculer exactement quota_disponible = quota_inclus - quota_utilise - quota_reserve', () => {
      const abonnement = {
        nombre_collectes_incluses: 10,
        nombre_collectes_utilisees: 3,
        nombre_collectes_reservees: 2,
      };

      const dispo = service.calculerDisponibilite(abonnement);

      expect(dispo.quota_inclus).toBe(10);
      expect(dispo.quota_utilise).toBe(3);
      expect(dispo.quota_reserve).toBe(2);
      expect(dispo.quota_disponible).toBe(5);
    });

    it('devrait retourner 0 si le quota est épuisé ou négatif', () => {
      const abonnement = {
        nombre_collectes_incluses: 4,
        nombre_collectes_utilisees: 3,
        nombre_collectes_reservees: 1,
      };

      const dispo = service.calculerDisponibilite(abonnement);
      expect(dispo.quota_disponible).toBe(0);
    });
  });

  describe('reserverQuota', () => {
    it('devrait permettre de réserver le tout dernier quota disponible', async () => {
      const abonnement = {
        id: 1n,
        statut: 'ACTIF',
        nombre_collectes_incluses: 4,
        nombre_collectes_utilisees: 3,
        nombre_collectes_reservees: 0, // dispo = 1
      };

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnement),
        update: vi.fn().mockResolvedValue({ ...abonnement, nombre_collectes_reservees: 1 }),
      });

      // Pas de réservation déjà existante pour cette demande
      const chainUtilisation = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue(chainUtilisation);

      await service.reserverQuota(1n, 100n);

      expect(mockPrisma.orm.public.UtilisationAbonnement.create).toHaveBeenCalledWith({
        abonnement_id: 1n,
        demande_collecte_id: 100n,
        type: 'RESERVATION',
        quantite: 1,
        statut: 'ACTIF',
      });
    });

    it('devrait rejeter la réservation si le quota est épuisé', async () => {
      const abonnement = {
        id: 1n,
        statut: 'ACTIF',
        nombre_collectes_incluses: 4,
        nombre_collectes_utilisees: 4,
        nombre_collectes_reservees: 0, // dispo = 0
      };

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnement),
      });

      await expect(service.reserverQuota(1n, 101n)).rejects.toThrow(ConflictException);
    });

    it('devrait être idempotent et ne pas réserver deux fois le quota pour la même demande', async () => {
      const abonnement = {
        id: 1n,
        statut: 'ACTIF',
        nombre_collectes_incluses: 10,
        nombre_collectes_utilisees: 0,
        nombre_collectes_reservees: 1,
      };

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnement),
      });

      // Réservation déjà trouvée
      const chainUtilisation = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 50n, statut: 'ACTIF' }),
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue(chainUtilisation);

      await service.reserverQuota(1n, 100n);

      // Ne doit pas réinsérer de nouvelle réservation
      expect(mockPrisma.orm.public.UtilisationAbonnement.create).not.toHaveBeenCalled();
    });
  });

  describe('consommerQuota', () => {
    it('devrait consommer la réservation active et incrémenter les utilisations', async () => {
      const reservation = {
        id: 10n,
        abonnement_id: 1n,
        demande_collecte_id: 200n,
        statut: 'ACTIF',
      };

      const chainUtilisation = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(reservation),
        update: vi.fn().mockResolvedValue({ ...reservation, statut: 'CONSOMME' }),
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue(chainUtilisation);

      const abonnement = {
        id: 1n,
        nombre_collectes_incluses: 5,
        nombre_collectes_utilisees: 2,
        nombre_collectes_reservees: 1,
      };
      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnement),
        update: vi.fn().mockResolvedValue({}),
      });

      await service.consommerQuota(200n);

      expect(mockPrisma.orm.public.UtilisationAbonnement.create).toHaveBeenCalledWith({
        abonnement_id: 1n,
        demande_collecte_id: 200n,
        type: 'CONSOMMATION',
        quantite: 1,
        statut: 'VALIDE',
      });
    });

    it('devrait être idempotent si la demande est déjà consommée', async () => {
      // Pas de réservation active
      const chainReservation = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn()
          .mockResolvedValueOnce(null) // Pas de réservation active
          .mockResolvedValueOnce({ id: 99n, type: 'CONSOMMATION' }), // Déjà consommé
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue(chainReservation);

      await service.consommerQuota(200n);

      expect(mockPrisma.orm.public.UtilisationAbonnement.create).not.toHaveBeenCalled();
    });
  });

  describe('libererQuota', () => {
    it('devrait libérer une réservation de quota lors d’une annulation', async () => {
      const reservation = {
        id: 10n,
        abonnement_id: 1n,
        demande_collecte_id: 300n,
        statut: 'ACTIF',
      };

      const chainUtilisation = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(reservation),
        update: vi.fn().mockResolvedValue({ ...reservation, statut: 'LIBERE' }),
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue(chainUtilisation);

      const abonnement = {
        id: 1n,
        nombre_collectes_reservees: 2,
      };
      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnement),
        update: vi.fn().mockResolvedValue({}),
      });

      await service.libererQuota(300n);

      expect(mockPrisma.orm.public.UtilisationAbonnement.create).toHaveBeenCalledWith({
        abonnement_id: 1n,
        demande_collecte_id: 300n,
        type: 'LIBERATION',
        quantite: 1,
        statut: 'VALIDE',
      });
    });

    it('devrait être idempotent s’il n’y a aucune réservation active à libérer', async () => {
      const chainUtilisation = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue(chainUtilisation);

      await service.libererQuota(300n);

      expect(mockPrisma.orm.public.UtilisationAbonnement.create).not.toHaveBeenCalled();
    });
  });
});

