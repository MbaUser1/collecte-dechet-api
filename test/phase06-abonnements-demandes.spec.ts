/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from 'vitest';
import { AbonnementsController } from '../src/modules/abonnements/abonnements.controller.js';
import { DemandesCollecteController } from '../src/modules/demandes-collecte/demandes-collecte.controller.js';

describe('Phase 06 - Contrôleurs Abonnements et Demandes', () => {
  describe('AbonnementsController', () => {
    it('délègue la souscription au service avec l’utilisateur connecté', async () => {
      const mockService = {
        souscrire: vi.fn().mockResolvedValue({
          abonnement: { id: 1n, statut: 'EN_ATTENTE_PAIEMENT' },
          message: 'Souscription initiée.',
        }),
      };

      const controller = new AbonnementsController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const res = await controller.souscrire({ plan_abonnement_id: 1 }, utilisateur);

      expect(res.success).toBe(true);
      expect(mockService.souscrire).toHaveBeenCalledWith(
        { plan_abonnement_id: 1 },
        { id: 10n, role: 'PARTICULIER' },
      );
    });

    it('délègue la consultation courante et l’annulation', async () => {
      const mockService = {
        obtenirAbonnementCourant: vi.fn().mockResolvedValue({ id: 1n, statut: 'ACTIF' }),
        annulerAbonnement: vi.fn().mockResolvedValue({
          abonnement: { id: 1n, statut: 'ANNULE' },
          message: 'Abonnement annulé.',
        }),
      };

      const controller = new AbonnementsController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const monAbo = await controller.obtenirMonAbonnement(utilisateur);
      expect(monAbo.data.statut).toBe('ACTIF');
      expect(mockService.obtenirAbonnementCourant).toHaveBeenCalledWith(10n);

      const annule = await controller.annuler(1, utilisateur);
      expect(annule.success).toBe(true);
      expect(mockService.annulerAbonnement).toHaveBeenCalledWith(1n, {
        id: 10n,
        role: 'PARTICULIER',
      });
    });
  });

  describe('DemandesCollecteController', () => {
    it('délègue la création et l’annulation d’une demande', async () => {
      const mockService = {
        creerDemande: vi.fn().mockResolvedValue({
          demande: { id: 100n, numero: 'COL-12345', statut: 'EN_ATTENTE_ATTRIBUTION' },
          couvert_par_abonnement: true,
        }),
        annulerDemande: vi.fn().mockResolvedValue({
          demande: { id: 100n, statut: 'ANNULEE' },
          message: 'Demande annulée.',
        }),
      };

      const controller = new DemandesCollecteController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const creation = await controller.creer(
        {
          point_collecte_id: 1,
          type_dechet_id: 2,
          poids_estime: 20,
        },
        utilisateur,
      );

      expect(creation.success).toBe(true);
      expect(creation.message).toContain('abonnement');
      expect(mockService.creerDemande).toHaveBeenCalledWith(
        {
          point_collecte_id: 1,
          type_dechet_id: 2,
          poids_estime: 20,
        },
        { id: 10n, role: 'PARTICULIER' },
      );

      const annulation = await controller.annuler(100, utilisateur);
      expect(annulation.success).toBe(true);
      expect(mockService.annulerDemande).toHaveBeenCalledWith(100n, {
        id: 10n,
        role: 'PARTICULIER',
      });
    });
  });
});

