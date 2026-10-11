import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Notification: {
            create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 100n, ...data })),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([
              {
                id: 100n,
                utilisateur_id: 1n,
                titre: 'Collecte confirmée',
                message: 'Votre collecte est confirmée.',
                type: 'COLLECTE',
                lu: false,
                donnees: JSON.stringify({ demande_id: '50' }),
                date_creation: new Date(),
              },
            ]),
            first: vi.fn(),
            update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 100n, lu: true, ...data })),
            count: vi.fn().mockResolvedValue(1),
          },
          PreferenceNotification: {
            create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 5n, ...data })),
            where: vi.fn().mockReturnThis(),
            first: vi.fn(),
            update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 5n, ...data })),
          },
        },
      },
    };

    service = new NotificationsService(mockPrisma);
  });

  describe('envoyerNotification', () => {
    it('doit persister une notification in-app pour l utilisateur', async () => {
      const res = await service.envoyerNotification(
        1n,
        'Mission affectée',
        'Une nouvelle mission vous attend.',
        'MISSION',
        { mission_id: 12 },
      );

      expect(res).toBeDefined();
      expect(mockPrisma.orm.public.Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 1n,
          titre: 'Mission affectée',
          type: 'MISSION',
          lu: false,
          donnees: JSON.stringify({ mission_id: 12 }),
        }),
      );
    });
  });

  describe('listerMesNotifications', () => {
    it('doit filtrer strictement sur l utilisateur_id du compte connecté', async () => {
      const res = await service.listerMesNotifications(1n, { page: 1, limite: 10 });

      expect(mockPrisma.orm.public.Notification.where).toHaveBeenCalled();
      expect(res.elements).toHaveLength(1);
      expect(res.elements[0].id).toBe('100');
      expect(res.elements[0].donnees).toEqual({ demande_id: '50' });
    });
  });

  describe('compterNonLues', () => {
    it('doit retourner le nombre exact de notifications non lues', async () => {
      mockPrisma.orm.public.Notification.count.mockResolvedValue(3);

      const res = await service.compterNonLues(1n);
      expect(res.non_lues).toBe(3);
    });
  });

  describe('marquerCommeLue', () => {
    it('doit lever NotFoundException si la notification n existe pas', async () => {
      mockPrisma.orm.public.Notification.first.mockResolvedValue(null);

      await expect(service.marquerCommeLue(1n, 999n)).rejects.toThrow(NotFoundException);
    });

    it('doit lever ForbiddenException si la notification appartient à un autre utilisateur', async () => {
      mockPrisma.orm.public.Notification.first.mockResolvedValue({
        id: 100n,
        utilisateur_id: 2n, // Autre utilisateur
        lu: false,
      });

      await expect(service.marquerCommeLue(1n, 100n)).rejects.toThrow(ForbiddenException);
    });

    it('doit marquer la notification comme lue avec date_lecture', async () => {
      mockPrisma.orm.public.Notification.first.mockResolvedValue({
        id: 100n,
        utilisateur_id: 1n,
        lu: false,
      });

      const res = await service.marquerCommeLue(1n, 100n);
      expect(res.lu).toBe(true);
      expect(mockPrisma.orm.public.Notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ lu: true }),
      );
    });
  });

  describe('marquerToutesCommeLues', () => {
    it('doit mettre à jour toutes les notifications non lues de l utilisateur', async () => {
      mockPrisma.orm.public.Notification.count.mockResolvedValue(4);

      const res = await service.marquerToutesCommeLues(1n);
      expect(res.compteurs_mis_a_jour).toBe(4);
      expect(mockPrisma.orm.public.Notification.update).toHaveBeenCalledWith(
        expect.objectContaining({ lu: true }),
      );
    });
  });

  describe('preferences', () => {
    it('doit initialiser les préférences par défaut si aucune configuration n existe', async () => {
      mockPrisma.orm.public.PreferenceNotification.first.mockResolvedValue(null);

      const res = await service.obtenirPreferences(1n);
      expect(res.email_actif).toBe(true);
      expect(res.sms_actif).toBe(true);
      expect(res.push_actif).toBe(true);
      expect(res.whatsapp_actif).toBe(false);
    });

    it('doit mettre à jour les préférences autorisées', async () => {
      mockPrisma.orm.public.PreferenceNotification.first.mockResolvedValue({
        id: 5n,
        utilisateur_id: 1n,
        email_actif: true,
        sms_actif: true,
        push_actif: true,
        whatsapp_actif: false,
      });

      await service.modifierPreferences(1n, { email_actif: false, whatsapp_actif: true });

      expect(mockPrisma.orm.public.PreferenceNotification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          email_actif: false,
          whatsapp_actif: true,
        }),
      );
    });
  });
});

