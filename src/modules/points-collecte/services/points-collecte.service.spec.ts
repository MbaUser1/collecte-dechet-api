import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { PointsCollecteService } from './points-collecte.service.js';

describe('PointsCollecteService', () => {
  let service: PointsCollecteService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          PointCollecte: {
            where: vi.fn(),
            create: vi.fn(),
          },
          Entreprise: {
            where: vi.fn(),
          },
          DemandeCollecte: {
            where: vi.fn(),
          },
        },
      },
    };

    service = new PointsCollecteService(mockPrisma);
  });

  describe('Unicité du point actif pour les particuliers (V1)', () => {
    it('devrait refuser la création d’un deuxième point actif pour un particulier', async () => {
      const utilisateur = { id: 100n, role: 'PARTICULIER' };

      // Simule un point actif déjà existant pour ce particulier
      const chain = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Domicile', statut: 'ACTIF' }),
      };
      mockPrisma.orm.public.PointCollecte.where.mockReturnValue(chain);

      await expect(
        service.creerPoint(
          {
            nom: 'Résidence secondaire',
            adresse: 'Rue 12',
            ville: 'Douala',
            quartier: 'Bonanjo',
            statut: 'ACTIF',
          },
          utilisateur,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait autoriser la création de plusieurs points actifs pour une entreprise', async () => {
      const utilisateur = { id: 200n, role: 'ENTREPRISE' };

      // Entreprise trouvée
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n, utilisateur_id: 200n }),
      });

      mockPrisma.orm.public.PointCollecte.create.mockResolvedValue({
        id: 5n,
        nom: 'Entrepôt 2',
        entreprise_id: 50n,
        statut: 'ACTIF',
      });

      const point = await service.creerPoint(
        {
          nom: 'Entrepôt 2',
          adresse: 'Zone Industrielle',
          ville: 'Douala',
          quartier: 'Bassa',
          statut: 'ACTIF',
        },
        utilisateur,
      );

      expect(point.id).toBe(5n);
    });
  });

  describe('Isolation stricte par propriétaire', () => {
    it('devrait interdire à un utilisateur de consulter le point d’un autre utilisateur', async () => {
      const utilisateurConnecte = { id: 100n, role: 'PARTICULIER' };
      const pointAutrui = {
        id: 99n,
        utilisateur_id: 999n, // Appartient à un autre
        nom: 'Point privé',
      };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(pointAutrui),
      });

      await expect(
        service.obtenirPointParId(99n, utilisateurConnecte),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devrait interdire à une entreprise de consulter le point d’une autre entreprise', async () => {
      const utilisateurEntreprise = { id: 200n, role: 'ENTREPRISE' };

      // Notre entreprise id = 50
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n, utilisateur_id: 200n }),
      });

      // Point d'une entreprise concurrente id = 60
      const pointAutreEntreprise = {
        id: 88n,
        entreprise_id: 60n,
        nom: 'Agence concurrente',
      };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(pointAutreEntreprise),
      });

      await expect(
        service.obtenirPointParId(88n, utilisateurEntreprise),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Désactivation et préservation de l’historique des demandes', () => {
    it('ne doit pas supprimer physiquement un point si des demandes de collecte y sont rattachées', async () => {
      const utilisateur = { id: 100n, role: 'PARTICULIER' };
      const monPoint = { id: 1n, utilisateur_id: 100n, statut: 'ACTIF' };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(monPoint),
        update: vi.fn().mockResolvedValue({ ...monPoint, statut: 'INACTIF' }),
      });

      // Simule 3 demandes historiques rattachées à ce point
      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        count: vi.fn().mockResolvedValue(3),
      });

      const resultat = await service.supprimerPoint(1n, utilisateur);

      expect(resultat.desactive).toBe(true);
      expect(resultat.message).toContain('conserv');
    });
  });
});

