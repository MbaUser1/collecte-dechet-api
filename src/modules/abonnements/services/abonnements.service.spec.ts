import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AbonnementsService } from './abonnements.service.js';
import { QuotaService } from './quota.service.js';

describe('AbonnementsService', () => {
  let service: AbonnementsService;
  let mockPrisma: any;
  let quotaService: QuotaService;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          PlanAbonnement: {
            where: vi.fn(),
          },
          Abonnement: {
            where: vi.fn(),
            create: vi.fn(),
          },
          UtilisationAbonnement: {
            where: vi.fn(),
            create: vi.fn(),
          },
        },
      },
    };

    quotaService = new QuotaService(mockPrisma);
    service = new AbonnementsService(mockPrisma, quotaService);

    mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Pack Eco', duree_jours: 30, statut: 'ACTIF' }),
    });
  });

  describe('souscrire', () => {
    it('devrait refuser la souscription pour un rôle autre que PARTICULIER (ex: ENTREPRISE)', async () => {
      const utilisateurEntreprise = { id: 10n, role: 'ENTREPRISE' };

      await expect(
        service.souscrire({ plan_abonnement_id: 1 }, utilisateurEntreprise),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devrait refuser la souscription pour un plan inexistant', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        service.souscrire({ plan_abonnement_id: 99 }, utilisateur),
      ).rejects.toThrow(NotFoundException);
    });

    it('devrait refuser la souscription pour un plan inactif', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Pack Eco', statut: 'INACTIF' }),
      });

      await expect(
        service.souscrire({ plan_abonnement_id: 1 }, utilisateur),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait refuser la souscription si l’utilisateur possède déjà un abonnement actif', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, nom: 'Pack Eco', statut: 'ACTIF' }),
      });

      const chainAbonnement = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 50n, statut: 'ACTIF' }),
      };
      mockPrisma.orm.public.Abonnement.where.mockReturnValue(chainAbonnement);

      await expect(
        service.souscrire({ plan_abonnement_id: 1 }, utilisateur),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait créer l’abonnement avec le statut EN_ATTENTE_PAIEMENT sans l’activer immédiatement', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };

      const plan = {
        id: 1n,
        nom: 'Pack Eco',
        prix: '15000',
        nombre_collectes_incluses: 4,
        poids_max_par_collecte: '25',
        duree_jours: 30,
        statut: 'ACTIF',
      };
      mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(plan),
      });

      const chainAbonnement = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null), // Aucun abonnement actif
      };
      mockPrisma.orm.public.Abonnement.where.mockReturnValue(chainAbonnement);

      mockPrisma.orm.public.Abonnement.create.mockResolvedValue({
        id: 100n,
        utilisateur_id: 10n,
        plan_abonnement_id: 1n,
        prix: '15000',
        nombre_collectes_incluses: 4,
        nombre_collectes_utilisees: 0,
        nombre_collectes_reservees: 0,
        statut: 'EN_ATTENTE_PAIEMENT',
      });

      const resultat = await service.souscrire({ plan_abonnement_id: 1 }, utilisateur);

      expect(resultat.abonnement.statut).toBe('EN_ATTENTE_PAIEMENT');
      expect(resultat.abonnement.quota.quota_disponible).toBe(4);
      expect(resultat.message).toContain('paiement');
    });
  });

  describe('activerAbonnementApresPaiement', () => {
    it('devrait activer l’abonnement après confirmation de paiement et configurer la période', async () => {
      const abonnementAttente = {
        id: 100n,
        plan_abonnement_id: 1n,
        statut: 'EN_ATTENTE_PAIEMENT',
      };
      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnementAttente),
        update: vi.fn().mockResolvedValue({ ...abonnementAttente, statut: 'ACTIF' }),
      });

      mockPrisma.orm.public.PlanAbonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, duree_jours: 30 }),
      });

      const active = await service.activerAbonnementApresPaiement(100n);
      expect(active.statut).toBe('ACTIF');
    });
  });

  describe('Isolation et Annulation', () => {
    it('devrait refuser à un utilisateur de consulter l’abonnement d’un autre utilisateur', async () => {
      const utilisateurConnecte = { id: 10n, role: 'PARTICULIER' };
      const abonnementAutre = {
        id: 200n,
        utilisateur_id: 99n, // Autre utilisateur
      };

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnementAutre),
      });

      await expect(
        service.obtenirAbonnementParId(200n, utilisateurConnecte),
      ).rejects.toThrow(ForbiddenException);
    });

    it('devrait refuser l’annulation d’un abonnement ayant des collectes en cours de réservation', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };
      const abonnementAvecReservations = {
        id: 100n,
        utilisateur_id: 10n,
        statut: 'ACTIF',
        nombre_collectes_reservees: 1, // Une réservation en cours !
      };

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnementAvecReservations),
      });

      await expect(
        service.annulerAbonnement(100n, utilisateur),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait autoriser l’annulation d’un abonnement en attente de paiement', async () => {
      const utilisateur = { id: 10n, role: 'PARTICULIER' };
      const abonnementAttente = {
        id: 100n,
        utilisateur_id: 10n,
        statut: 'EN_ATTENTE_PAIEMENT',
        nombre_collectes_reservees: 0,
      };

      mockPrisma.orm.public.Abonnement.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(abonnementAttente),
        update: vi.fn().mockResolvedValue({ ...abonnementAttente, statut: 'ANNULE' }),
      });

      const res = await service.annulerAbonnement(100n, utilisateur);
      expect(res.message).toContain('annulé');
    });
  });
});
