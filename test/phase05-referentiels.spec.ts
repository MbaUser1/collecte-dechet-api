/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { CategoriesController } from '../src/modules/catalogue/categories.controller.js';
import { TypesDechetsController } from '../src/modules/catalogue/types-dechets.controller.js';
import { ZonesController } from '../src/modules/zones/zones.controller.js';
import { TarifsController } from '../src/modules/tarifs/tarifs.controller.js';
import { PlansAbonnementController } from '../src/modules/plans-abonnement/plans-abonnement.controller.js';
import { PointsCollecteController } from '../src/modules/points-collecte/points-collecte.controller.js';
import { EntreprisesController } from '../src/modules/points-collecte/entreprises.controller.js';
import { ROLES_KEY } from '../src/modules/auth/decorators/roles.decorator.js';

describe('Phase 05 - Contrôleurs et Sécurité RBAC', () => {
  const reflector = new Reflector();

  describe('Catalogue & Référentiels publics en lecture', () => {
    it('les endpoints GET du catalogue ne doivent pas exiger de rôle administrateur', () => {
      const getCategoriesRoles = reflector.get(ROLES_KEY, CategoriesController.prototype.lister);
      const getTypesRoles = reflector.get(ROLES_KEY, TypesDechetsController.prototype.lister);
      const getZonesRoles = reflector.get(ROLES_KEY, ZonesController.prototype.lister);
      const getPlansRoles = reflector.get(ROLES_KEY, PlansAbonnementController.prototype.lister);

      expect(getCategoriesRoles).toBeUndefined();
      expect(getTypesRoles).toBeUndefined();
      expect(getZonesRoles).toBeUndefined();
      expect(getPlansRoles).toBeUndefined();
    });

    it('les opérations d’écriture sur les référentiels doivent exiger le rôle ADMINISTRATEUR', () => {
      // Catégories
      expect(reflector.get(ROLES_KEY, CategoriesController.prototype.creer)).toEqual([
        'ADMINISTRATEUR',
      ]);
      expect(reflector.get(ROLES_KEY, CategoriesController.prototype.modifier)).toEqual([
        'ADMINISTRATEUR',
      ]);
      expect(reflector.get(ROLES_KEY, CategoriesController.prototype.desactiver)).toEqual([
        'ADMINISTRATEUR',
      ]);

      // Types de déchets
      expect(reflector.get(ROLES_KEY, TypesDechetsController.prototype.creer)).toEqual([
        'ADMINISTRATEUR',
      ]);
      expect(reflector.get(ROLES_KEY, TypesDechetsController.prototype.modifier)).toEqual([
        'ADMINISTRATEUR',
      ]);

      // Zones
      expect(reflector.get(ROLES_KEY, ZonesController.prototype.creer)).toEqual([
        'ADMINISTRATEUR',
      ]);

      // Tarifs
      expect(reflector.get(ROLES_KEY, TarifsController.prototype.creer)).toEqual([
        'ADMINISTRATEUR',
      ]);
      expect(reflector.get(ROLES_KEY, TarifsController.prototype.modifier)).toEqual([
        'ADMINISTRATEUR',
      ]);

      // Plans
      expect(reflector.get(ROLES_KEY, PlansAbonnementController.prototype.creer)).toEqual([
        'ADMINISTRATEUR',
      ]);
    });
  });

  describe('Points de collecte et Entreprises', () => {
    it('PointsCollecteController délègue au service avec l’utilisateur authentifié', async () => {
      const mockService = {
        listerPoints: vi.fn().mockResolvedValue([{ id: 1n, nom: 'Point A' }]),
        creerPoint: vi.fn().mockResolvedValue({ id: 2n, nom: 'Nouveau Point' }),
      };

      const controller = new PointsCollecteController(mockService as any);
      const utilisateur = { id: '10', role: 'PARTICULIER' };

      const liste = await controller.lister(utilisateur);
      expect(liste.success).toBe(true);
      expect(mockService.listerPoints).toHaveBeenCalledWith({ id: 10n, role: 'PARTICULIER' });

      const dto = {
        nom: 'Nouveau Point',
        adresse: 'Rue A',
        ville: 'Douala',
        quartier: 'Akwa',
      };
      const creation = await controller.creer(dto as any, utilisateur);
      expect(creation.success).toBe(true);
      expect(mockService.creerPoint).toHaveBeenCalledWith(dto, {
        id: 10n,
        role: 'PARTICULIER',
      });
    });

    it('EntreprisesController restreint l’accès à la modification de profil', async () => {
      const roleEntreprise = reflector.get(ROLES_KEY, EntreprisesController);
      expect(roleEntreprise).toEqual(['ENTREPRISE']);

      const mockEntrepriseService = {
        obtenirProfilEntreprise: vi.fn().mockResolvedValue({ id: 5n, nom: 'Ma Société' }),
        modifierProfilEntreprise: vi.fn().mockResolvedValue({ id: 5n, nom: 'Nouveau Nom' }),
      };

      const controller = new EntreprisesController(mockEntrepriseService as any);
      const utilisateur = { id: '20', role: 'ENTREPRISE' };

      const profil = await controller.obtenirProfil(utilisateur);
      expect(profil.data.nom).toBe('Ma Société');
      expect(mockEntrepriseService.obtenirProfilEntreprise).toHaveBeenCalledWith(20n);
    });
  });
});
