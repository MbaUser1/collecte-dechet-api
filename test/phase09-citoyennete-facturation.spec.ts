/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from 'vitest';
import { SignalementsController } from '../src/modules/signalements/signalements.controller.js';
import { AdminSignalementsController } from '../src/modules/signalements/admin-signalements.controller.js';
import { PointsController } from '../src/modules/recompenses/points.controller.js';
import { RecompensesController } from '../src/modules/recompenses/recompenses.controller.js';
import { EntreprisesFacturationController } from '../src/modules/facturation/entreprises-facturation.controller.js';

describe('Phase 09 - Contrôleurs Citoyenneté, Récompenses et Facturation', () => {
  describe('SignalementsController', () => {
    it('délègue la création d’un signalement avec l’utilisateur connecté', async () => {
      const mockService = {
        creerSignalement: vi.fn().mockResolvedValue({
          message: 'Signalement créé.',
          signalement: { id: 1n, statut: 'SOUMIS' },
        }),
      };

      const controller = new SignalementsController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const dto = {
        description: 'Dépôt de ferraille gênant le passage',
        adresse: 'Rue 12',
        ville: 'Douala',
        quartier: 'Akwa',
      };

      const res = await controller.creerSignalement(dto, utilisateur);

      expect(res.success).toBe(true);
      expect(mockService.creerSignalement).toHaveBeenCalledWith(dto, {
        id: 10n,
        role: 'PARTICULIER',
      });
    });
  });

  describe('AdminSignalementsController', () => {
    it('délègue la validation d’un signalement par un administrateur', async () => {
      const mockService = {
        validerSignalement: vi.fn().mockResolvedValue({
          message: 'Signalement validé.',
          signalement: { id: 1n, statut: 'VALIDE' },
        }),
      };

      const controller = new AdminSignalementsController(mockService as any);
      const admin = { id: '99', role: 'ADMINISTRATEUR' };

      const res = await controller.valider(1, { points_a_attribuer: 25 }, admin);

      expect(res.success).toBe(true);
      expect(mockService.validerSignalement).toHaveBeenCalledWith(
        1n,
        { points_a_attribuer: 25 },
        99n,
      );
    });
  });

  describe('PointsController et RecompensesController', () => {
    it('délègue la consultation du solde de points', async () => {
      const mockService = {
        obtenirSoldeEtHistoriquePoints: vi.fn().mockResolvedValue({
          solde_points: 150,
          transactions: { elements: [], pagination: {} },
        }),
      };

      const controller = new PointsController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const res = await controller.obtenirMesPoints({ page: 1, limite: 10, offset: 0 }, utilisateur);

      expect(res.success).toBe(true);
      expect(res.data.solde_points).toBe(150);
      expect(mockService.obtenirSoldeEtHistoriquePoints).toHaveBeenCalledWith(
        10n,
        { page: 1, limite: 10, offset: 0 },
      );
    });

    it('délègue la réclamation d’une récompense', async () => {
      const mockService = {
        reclamerRecompense: vi.fn().mockResolvedValue({
          message: 'Récompense réclamée.',
          solde_restant: 50,
        }),
      };

      const controller = new RecompensesController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const res = await controller.reclamer(5, utilisateur);

      expect(res.success).toBe(true);
      expect(mockService.reclamerRecompense).toHaveBeenCalledWith(5n, 10n);
    });
  });

  describe('EntreprisesFacturationController', () => {
    it('délègue l’acceptation d’un devis par l’entreprise', async () => {
      const mockService = {
        accepterDevis: vi.fn().mockResolvedValue({
          message: 'Devis accepté.',
          devis: { id: 1n, statut: 'VALIDE' },
          facture: { id: 10n, statut: 'EMISE' },
        }),
      };

      const controller = new EntreprisesFacturationController(mockService as any);
      const utilisateur = { id: '20', role: 'ENTREPRISE' };

      const res = await controller.accepterDevis(1, utilisateur);

      expect(res.success).toBe(true);
      expect(mockService.accepterDevis).toHaveBeenCalledWith(1n, 20n);
    });
  });
});

