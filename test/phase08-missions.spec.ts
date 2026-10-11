/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from 'vitest';
import { MissionsController } from '../src/modules/missions/missions.controller.js';

describe('Phase 08 - Contrôleur Collecteur / Missions', () => {
  it('délègue la consultation des collectes disponibles', async () => {
    const mockMissionsService = {
      listerCollectesDisponibles: vi.fn().mockResolvedValue({
        elements: [{ id: 10n, numero: 'COL-001' }],
        pagination: { total: 1, page: 1, limite: 10, pages_totales: 1 },
      }),
    };

    const controller = new MissionsController(mockMissionsService as any);
    const res = await controller.listerCollectesDisponibles({ page: 1, limite: 10, offset: 0 });

    expect(res.success).toBe(true);
    expect(res.data.length).toBe(1);
    expect(mockMissionsService.listerCollectesDisponibles).toHaveBeenCalledWith({
      page: 1,
      limite: 10,
      offset: 0,
    });
  });

  it('délègue l’acceptation d’une collecte avec l’utilisateur connecté', async () => {
    const mockMissionsService = {
      accepterCollecte: vi.fn().mockResolvedValue({
        succes: true,
        message: 'Collecte acceptée.',
        mission: { id: 1n, statut: 'ATTRIBUEE' },
      }),
    };

    const controller = new MissionsController(mockMissionsService as any);
    const utilisateur = { id: '50', role: 'COLLECTEUR' };

    const res = await controller.accepterCollecte(10, utilisateur);

    expect(res.success).toBe(true);
    expect(mockMissionsService.accepterCollecte).toHaveBeenCalledWith(
      10n,
      { id: 50n, role: 'COLLECTEUR' },
    );
  });

  it('délègue le scan du QR code et le démarrage de la mission', async () => {
    const mockMissionsService = {
      scannerQrEtDemarrer: vi.fn().mockResolvedValue({
        succes: true,
        message: 'Mission démarrée.',
      }),
    };

    const controller = new MissionsController(mockMissionsService as any);
    const utilisateur = { id: '50', role: 'COLLECTEUR' };

    const dto = {
      jeton_qr: '123e4567-e89b-12d3-a456-426614174000',
      latitude: 4.05,
      longitude: 9.7,
    };

    const res = await controller.scannerQr(1, dto, utilisateur);

    expect(res.success).toBe(true);
    expect(mockMissionsService.scannerQrEtDemarrer).toHaveBeenCalledWith(
      1n,
      dto,
      50n,
    );
  });

  it('délègue l’enregistrement de la pesée réelle', async () => {
    const mockMissionsService = {
      enregistrerCollecte: vi.fn().mockResolvedValue({
        succes: true,
        message: 'Collecte finalisée.',
        prix_final: 3500,
      }),
    };

    const controller = new MissionsController(mockMissionsService as any);
    const utilisateur = { id: '50', role: 'COLLECTEUR' };

    const dto = {
      poids_reel_total: 18.5,
      tri_respecte: true,
      notes: 'Déchets propres',
    };

    const res = await controller.enregistrerCollecte(1, dto, utilisateur);

    expect(res.success).toBe(true);
    expect(mockMissionsService.enregistrerCollecte).toHaveBeenCalledWith(
      1n,
      dto,
      50n,
    );
  });

  it('délègue la déclaration d’échec de mission', async () => {
    const mockMissionsService = {
      declarerEchec: vi.fn().mockResolvedValue({
        succes: true,
        message: 'Échec enregistré.',
      }),
    };

    const controller = new MissionsController(mockMissionsService as any);
    const utilisateur = { id: '50', role: 'COLLECTEUR' };

    const dto = {
      motif: 'CLIENT_ABSENT',
      notes: 'Aucune réponse au téléphone',
    };

    const res = await controller.declarerEchec(1, dto, utilisateur);

    expect(res.success).toBe(true);
    expect(mockMissionsService.declarerEchec).toHaveBeenCalledWith(
      1n,
      dto,
      50n,
    );
  });
});

