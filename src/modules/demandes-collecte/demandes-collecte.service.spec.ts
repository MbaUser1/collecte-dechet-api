import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DemandesCollecteService } from './demandes-collecte.service.js';
import { CalculTarifService } from '../tarifs/services/calcul-tarif.service.js';
import { DistanceService } from '../zones/services/distance.service.js';
import { QuotaService } from '../abonnements/services/quota.service.js';

describe('DemandesCollecteService', () => {
  let service: DemandesCollecteService;
  let mockPrisma: any;
  let calculTarifService: CalculTarifService;
  let mockTarifsService: any;
  let distanceService: DistanceService;
  let quotaService: QuotaService;

  beforeEach(() => {
    calculTarifService = new CalculTarifService();
    distanceService = new DistanceService();

    mockTarifsService = {
      obtenirTarifApplicable: vi.fn(),
    };

    mockPrisma = {
      orm: {
        public: {
          PointCollecte: {
            where: vi.fn(),
          },
          TypeDechet: {
            where: vi.fn(),
          },
          Zone: {
            where: vi.fn(),
          },
          Abonnement: {
            where: vi.fn(),
          },
          Entreprise: {
            where: vi.fn(),
          },
          DemandeCollecte: {
            where: vi.fn(),
            create: vi.fn(),
          },
          UtilisationAbonnement: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
      transaction: vi.fn((cb) => cb(mockPrisma)),
    };

    quotaService = new QuotaService(mockPrisma);
    const mockAjustementsService: any = {
      aDesAjustementsDebiteursEnAttente: vi.fn().mockResolvedValue(false),
      peutFermerDemande: vi.fn().mockResolvedValue(true),
    };
    service = new DemandesCollecteService(
      mockPrisma,
      calculTarifService,
      mockTarifsService,
      distanceService,
      quotaService,
      mockAjustementsService,
    );
  });

  const basePoint = {
    id: 1n,
    utilisateur_id: 10n,
    statut: 'ACTIF',
    ville: 'Douala',
    quartier: 'Akwa',
    adresse: 'Rue des Palmiers',
    latitude: 4.05,
    longitude: 9.7,
  };

  const baseTypeDechet = {
    id: 2n,
    nom: 'Plastiques',
    statut: 'ACTIF',
  };

  const baseZone = {
    id: 3n,
    nom: 'Zone Douala Centre',
    ville: 'Douala',
    statut: 'ACTIF',
    latitude: 4.05,
    longitude: 9.7,
  };

  const baseTarif = {
    id: 4n,
    prix_base: '1000',
    prix_par_kg: '50',
    prix_par_km: '100',
    prix_minimum: '2000',
  };

  describe('creerDemande', () => {
    it('devrait créer la demande en EN_ATTENTE_ATTRIBUTION et réserver le quota pour un particulier ayant un abonnement actif disponible', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(basePoint),
      });
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(baseTypeDechet),
      });

      const chainZone = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(baseZone),
      };
      mockPrisma.orm.public.Zone.where.mockReturnValue(chainZone);

      mockTarifsService.obtenirTarifApplicable.mockResolvedValue(baseTarif);

      // Abonnement actif avec 4 collectes disponibles
      const abonnementActif = {
        id: 50n,
        utilisateur_id: 10n,
        statut: 'ACTIF',
        nombre_collectes_incluses: 4,
        nombre_collectes_utilisees: 0,
        nombre_collectes_reservees: 0,
      };
      const chainAbonnement = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(abonnementActif),
        update: vi.fn().mockResolvedValue({}),
      };
      mockPrisma.orm.public.Abonnement.where.mockReturnValue(chainAbonnement);

      // Pas encore de réservation
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      });

      mockPrisma.orm.public.DemandeCollecte.create.mockResolvedValue({
        id: 100n,
        numero: 'COL-20261011-ABCDE',
        statut: 'EN_ATTENTE_ATTRIBUTION',
        prix_estime: '2000',
      });

      const resultat = await service.creerDemande(
        {
          point_collecte_id: 1,
          type_dechet_id: 2,
          poids_estime: 15,
        },
        utilisateur,
      );

      expect(resultat.couvert_par_abonnement).toBe(true);
      expect(resultat.statut).toBe('EN_ATTENTE_ATTRIBUTION');
      expect(mockPrisma.orm.public.UtilisationAbonnement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          abonnement_id: 50n,
          type: 'RESERVATION',
        }),
      );
    });

    it('devrait créer la demande en EN_ATTENTE_PAIEMENT pour un particulier sans abonnement actif', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(basePoint),
      });
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(baseTypeDechet),
      });
      mockPrisma.orm.public.Zone.where.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(baseZone),
      });
      mockTarifsService.obtenirTarifApplicable.mockResolvedValue(baseTarif);

      // Aucun abonnement actif
      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
      });

      mockPrisma.orm.public.DemandeCollecte.create.mockResolvedValue({
        id: 101n,
        numero: 'COL-20261011-FGHIJ',
        statut: 'EN_ATTENTE_PAIEMENT',
        prix_estime: '2000',
      });

      const resultat = await service.creerDemande(
        {
          point_collecte_id: 1,
          type_dechet_id: 2,
          poids_estime: 15,
        },
        utilisateur,
      );

      expect(resultat.couvert_par_abonnement).toBe(false);
      expect(resultat.statut).toBe('EN_ATTENTE_PAIEMENT');
      expect(mockPrisma.orm.public.UtilisationAbonnement.create).not.toHaveBeenCalled();
    });

    it('devrait créer la demande en EN_ATTENTE_PAIEMENT sans abonnement pour une entreprise', async () => {
      const utilisateur = { id: 20n, role: 'ENTREPRISE' };

      const pointEntreprise = {
        ...basePoint,
        utilisateur_id: null,
        entreprise_id: 5n,
      };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(pointEntreprise),
      });
      mockPrisma.orm.public.Entreprise.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 5n, utilisateur_id: 20n }),
      });
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(baseTypeDechet),
      });
      mockPrisma.orm.public.Zone.where.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(baseZone),
      });
      mockTarifsService.obtenirTarifApplicable.mockResolvedValue(baseTarif);

      mockPrisma.orm.public.DemandeCollecte.create.mockResolvedValue({
        id: 102n,
        statut: 'EN_ATTENTE_PAIEMENT',
        entreprise_id: 5n,
        abonnement_id: null,
      });

      const resultat = await service.creerDemande(
        {
          point_collecte_id: 1,
          type_dechet_id: 2,
          poids_estime: 50,
        },
        utilisateur,
      );

      expect(resultat.couvert_par_abonnement).toBe(false);
      expect(resultat.statut).toBe('EN_ATTENTE_PAIEMENT');
    });

    it('devrait refuser si le point de collecte appartient à un tiers', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };
      const pointTiers = { ...basePoint, utilisateur_id: 999n };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(pointTiers),
      });

      await expect(
        service.creerDemande(
          {
            point_collecte_id: 1,
            type_dechet_id: 2,
            poids_estime: 10,
          },
          utilisateur,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devrait refuser si le point de collecte est inactif', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };
      const pointInactif = { ...basePoint, statut: 'INACTIF' };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(pointInactif),
      });

      await expect(
        service.creerDemande(
          {
            point_collecte_id: 1,
            type_dechet_id: 2,
            poids_estime: 10,
          },
          utilisateur,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait refuser si le type de déchet est inactif', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      mockPrisma.orm.public.PointCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(basePoint),
      });
      mockPrisma.orm.public.TypeDechet.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 2n, statut: 'INACTIF' }),
      });

      await expect(
        service.creerDemande(
          {
            point_collecte_id: 1,
            type_dechet_id: 2,
            poids_estime: 10,
          },
          utilisateur,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('annulerDemande', () => {
    it('devrait annuler une demande en attente et libérer le quota réservé', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };
      const demande = {
        id: 100n,
        utilisateur_id: 10n,
        abonnement_id: 50n,
        statut: 'EN_ATTENTE_ATTRIBUTION',
      };

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(demande),
        update: vi.fn().mockResolvedValue({ ...demande, statut: 'ANNULEE' }),
      });

      // Réservation active trouvée pour libération
      const reservation = {
        id: 99n,
        abonnement_id: 50n,
        demande_collecte_id: 100n,
        statut: 'ACTIF',
      };
      mockPrisma.orm.public.UtilisationAbonnement.where.mockReturnValue({
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(reservation),
        update: vi.fn().mockResolvedValue({}),
      });

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 50n, nombre_collectes_reservees: 1 }),
        update: vi.fn().mockResolvedValue({}),
      });

      const resultat = await service.annulerDemande(100n, utilisateur);

      expect(resultat.demande.statut).toBe('ANNULEE');
      expect(mockPrisma.orm.public.UtilisationAbonnement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LIBERATION',
        }),
      );
    });

    it('devrait interdire l’annulation d’une demande déjà attribuée, en cours ou terminée', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };
      const demandeEnCours = {
        id: 100n,
        utilisateur_id: 10n,
        statut: 'EN_COURS',
      };

      mockPrisma.orm.public.DemandeCollecte.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(demandeEnCours),
      });

      await expect(service.annulerDemande(100n, utilisateur)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});

