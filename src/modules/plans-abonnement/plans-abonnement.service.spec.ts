import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PlansAbonnementService } from './plans-abonnement.service.js';

describe('PlansAbonnementService', () => {
  let service: PlansAbonnementService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          PlanAbonnement: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    };

    service = new PlansAbonnementService(mockPrisma);
  });

  it('devrait lister les plans actifs avec pagination', async () => {
    const mockPlans = [
      { id: 1n, nom: 'Pack Eco Particulier', prix: '15000', statut: 'ACTIF' },
    ];

    const chain = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue(mockPlans),
      count: vi.fn().mockResolvedValue(1),
    };
    mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue(chain);

    const resultat = await service.listerPlans({
      page: 1,
      limite: 10,
      statut: 'ACTIF',
      offset: 0,
    });

    expect(resultat.elements.length).toBe(1);
    expect(resultat.pagination.total).toBe(1);
  });

  it('devrait refuser la création d’un plan avec un nom déjà existant pour un plan actif', async () => {
    mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Pack Eco', statut: 'ACTIF' }),
    });

    await expect(
      service.creerPlan({
        nom: 'Pack Eco',
        prix: 15000,
        duree_jours: 30,
        nombre_collectes_incluses: 4,
        poids_max_par_collecte: 25,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('devrait désactiver logiquement un plan d’abonnement', async () => {
    mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Pack Eco', statut: 'ACTIF' }),
      update: vi.fn().mockResolvedValue({ id: 1n, nom: 'Pack Eco', statut: 'INACTIF' }),
    });

    const plan = await service.desactiverPlan(1n);
    expect(plan.statut).toBe('INACTIF');
  });

  it('devrait lever NotFoundException pour un plan inexistant', async () => {
    mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
      first: vi.fn().mockResolvedValue(null),
    });

    await expect(service.obtenirPlanParId(999n)).rejects.toThrow(NotFoundException);
  });
});

