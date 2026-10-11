import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ZonesService } from './zones.service.js';

describe('ZonesService', () => {
  let service: ZonesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Zone: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    };

    service = new ZonesService(mockPrisma);
  });

  it('devrait lister les zones actives d’une ville avec pagination', async () => {
    const mockZones = [
      { id: 1n, nom: 'Akwa', ville: 'Douala', statut: 'ACTIF' },
      { id: 2n, nom: 'Bonapriso', ville: 'Douala', statut: 'ACTIF' },
    ];

    const chain = {
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue(mockZones),
      count: vi.fn().mockResolvedValue(2),
    };
    mockPrisma.orm.public.Zone.where.mockReturnValue(chain);

    const resultat = await service.listerZones({
      ville: 'Douala',
      page: 1,
      limite: 10,
      statut: 'ACTIF',
      offset: 0,
    });

    expect(resultat.elements.length).toBe(2);
    expect(resultat.pagination.total).toBe(2);
  });

  it('devrait refuser la création d’une zone avec le même nom dans la même ville', async () => {
    const chain = {
      where: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Akwa', ville: 'Douala', statut: 'ACTIF' }),
    };
    mockPrisma.orm.public.Zone.where.mockReturnValue(chain);

    await expect(
      service.creerZone({
        nom: 'Akwa',
        ville: 'Douala',
        latitude: 4.05,
        longitude: 9.7,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('devrait désactiver logiquement une zone', async () => {
    mockPrisma.orm.public.Zone.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Akwa', statut: 'ACTIF' }),
      update: vi.fn().mockResolvedValue({ id: 1n, nom: 'Akwa', statut: 'INACTIF' }),
    });

    const zone = await service.desactiverZone(1n);
    expect(zone.statut).toBe('INACTIF');
  });

  it('devrait lever NotFoundException pour une zone inexistante', async () => {
    mockPrisma.orm.public.Zone.where.mockReturnValue({
      first: vi.fn().mockResolvedValue(null),
    });

    await expect(service.obtenirZoneParId(999n)).rejects.toThrow(NotFoundException);
  });
});

