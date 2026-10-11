/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from 'vitest';
import { PortefeuilleController } from '../src/modules/portefeuille/portefeuille.controller.js';
import { PaiementsController } from '../src/modules/paiements/paiements.controller.js';

describe('Phase 07 - Contrôleurs Portefeuille et Paiements', () => {
  describe('PortefeuilleController', () => {
    it('délègue la consultation du portefeuille', async () => {
      const mockPortefeuilleService = {
        consulterPortefeuille: vi.fn().mockResolvedValue({
          id: 1n,
          solde: 15000,
          devise: 'XAF',
          statut: 'ACTIF',
        }),
      };
      const mockPaiementsService = {};
      const mockAjustementsService = {};

      const controller = new PortefeuilleController(
        mockPortefeuilleService as any,
        mockPaiementsService as any,
        mockAjustementsService as any,
      );

      const utilisateur = { id: '5', role: 'PARTICULIER' };
      const res = await controller.consulterPortefeuille(utilisateur);

      expect(res.success).toBe(true);
      expect(res.data.solde).toBe(15000);
      expect(mockPortefeuilleService.consulterPortefeuille).toHaveBeenCalledWith({
        id: 5n,
        role: 'PARTICULIER',
      });
    });

    it('délègue le règlement d’un ajustement par portefeuille', async () => {
      const mockPortefeuilleService = {};
      const mockPaiementsService = {};
      const mockAjustementsService = {
        reglerAjustementParPortefeuille: vi.fn().mockResolvedValue({
          message: 'Ajustement réglé.',
          ajustement: { id: 2n, statut: 'REGLE' },
        }),
      };

      const controller = new PortefeuilleController(
        mockPortefeuilleService as any,
        mockPaiementsService as any,
        mockAjustementsService as any,
      );

      const utilisateur = { id: '5', role: 'PARTICULIER' };
      const res = await controller.payerAjustement({ ajustement_id: 2 }, utilisateur);

      expect(res.success).toBe(true);
      expect(mockAjustementsService.reglerAjustementParPortefeuille).toHaveBeenCalledWith(
        2n,
        { id: 5n, role: 'PARTICULIER' },
      );
    });
  });

  describe('PaiementsController', () => {
    it('délègue le paiement de collecte avec clé d’idempotence', async () => {
      const mockPaiementsService = {
        payerCollecte: vi.fn().mockResolvedValue({
          succes: true,
          message: 'Collecte réglée.',
        }),
      };

      const controller = new PaiementsController(mockPaiementsService as any);
      const utilisateur = { id: '5', role: 'PARTICULIER' };

      const res = await controller.payerCollecte(
        { demande_id: '10', methode: 'PORTEFEUILLE' },
        utilisateur,
        'CLE-IDEM-001',
      );

      expect(res.success).toBe(true);
      expect(mockPaiementsService.payerCollecte).toHaveBeenCalledWith(
        { demande_id: '10', methode: 'PORTEFEUILLE' },
        { id: 5n, role: 'PARTICULIER' },
        'CLE-IDEM-001',
      );
    });

    it('délègue la réception du webhook externe', async () => {
      const mockPaiementsService = {
        traiterWebhook: vi.fn().mockResolvedValue({
          recu: true,
          statut: 'PAYE',
        }),
      };

      const controller = new PaiementsController(mockPaiementsService as any);
      const payload = { reference_paiement: 'PAY-1', montant: 5000, statut: 'PAYE' };

      const res = await controller.traiterWebhook(
        'demo',
        'sig-123',
        undefined as any,
        payload,
      );

      expect(res.success).toBe(true);
      expect(mockPaiementsService.traiterWebhook).toHaveBeenCalledWith(
        'demo',
        'sig-123',
        payload,
      );
    });
  });
});

