import { describe, it, expect, vi } from 'vitest';
import { AdminController } from '../src/modules/admin/admin.controller.js';
import { NotificationsController } from '../src/modules/notifications/notifications.controller.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { StatutUtilisateurEnum } from '../src/modules/admin/dto/filtre-admin-utilisateurs.dto.js';
import { ROLES_KEY } from '../src/modules/auth/decorators/roles.decorator.js';

describe('Phase 10 - Contrôleurs Administration, Notifications, Audit et Sessions', () => {
  describe('AdminController', () => {
    it('doit être annoté avec le rôle ADMINISTRATEUR', () => {
      const roles = Reflect.getMetadata(ROLES_KEY, AdminController);
      expect(roles).toEqual(['ADMINISTRATEUR']);
    });

    it('délègue l obtention du dashboard', async () => {
      const mockAdminService = {
        obtenirDashboard: vi.fn().mockResolvedValue({
          demandes: { total: 12 },
          utilisateurs: { total: 5 },
        }),
      };
      const mockAuditService = {
        listerJournaux: vi.fn(),
      };

      const controller = new AdminController(mockAdminService as any, mockAuditService as any);
      const res = await controller.obtenirDashboard();

      expect(res.success).toBe(true);
      expect(mockAdminService.obtenirDashboard).toHaveBeenCalled();
      expect(res.data.demandes.total).toBe(12);
    });

    it('délègue le changement de statut utilisateur avec traçabilité IP/UA', async () => {
      const mockAdminService = {
        changerStatutUtilisateur: vi.fn().mockResolvedValue({
          id: '10',
          statut: 'SUSPENDU',
        }),
      };
      const mockAuditService = { listerJournaux: vi.fn() };

      const controller = new AdminController(mockAdminService as any, mockAuditService as any);
      const mockReq = {
        ip: '192.168.1.50',
        headers: { 'user-agent': 'AdminPanel/2.0' },
      } as any;

      const res = await controller.changerStatutUtilisateur(
        10,
        { statut: StatutUtilisateurEnum.SUSPENDU, motif: 'Violation des CGU' },
        '99',
        mockReq,
      );

      expect(res.success).toBe(true);
      expect(mockAdminService.changerStatutUtilisateur).toHaveBeenCalledWith(
        10n,
        { statut: StatutUtilisateurEnum.SUSPENDU, motif: 'Violation des CGU' },
        99n,
        '192.168.1.50',
        'AdminPanel/2.0',
      );
    });

    it('délègue l affectation administrative d une collecte à un collecteur', async () => {
      const mockAdminService = {
        affecterCollecteur: vi.fn().mockResolvedValue({
          succes: true,
          message: 'Demande affectée au collecteur avec succès.',
        }),
      };
      const mockAuditService = { listerJournaux: vi.fn() };

      const controller = new AdminController(mockAdminService as any, mockAuditService as any);
      const mockReq = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'AdminBrowser' },
      } as any;

      const res = await controller.affecterCollecteur(
        42,
        { collecteur_id: 7 },
        '99',
        mockReq,
      );

      expect(res.success).toBe(true);
      expect(mockAdminService.affecterCollecteur).toHaveBeenCalledWith(
        42n,
        { collecteur_id: 7 },
        99n,
        '127.0.0.1',
        'AdminBrowser',
      );
    });

    it('délègue la consultation du journal d audit', async () => {
      const mockAdminService = {};
      const mockAuditService = {
        listerJournaux: vi.fn().mockResolvedValue({
          elements: [{ id: '1', action: 'CONNEXION' }],
          pagination: { total: 1, page: 1, limite: 20, pages_totales: 1 },
        }),
      };

      const controller = new AdminController(mockAdminService as any, mockAuditService as any);
      const res = await controller.listerAudit({ page: 1, limite: 20 });

      expect(res.success).toBe(true);
      expect(mockAuditService.listerJournaux).toHaveBeenCalledWith({ page: 1, limite: 20 });
    });
  });

  describe('NotificationsController', () => {
    it('isole la récupération des notifications pour l utilisateur connecté', async () => {
      const mockService = {
        listerMesNotifications: vi.fn().mockResolvedValue({
          elements: [{ id: '10', titre: 'Alerte' }],
          pagination: { total: 1, page: 1, limite: 20, pages_totales: 1 },
        }),
      };

      const controller = new NotificationsController(mockService as any);
      const res = await controller.listerMesNotifications('42', { page: 1, limite: 20 });

      expect(res.success).toBe(true);
      expect(mockService.listerMesNotifications).toHaveBeenCalledWith(42n, { page: 1, limite: 20 });
    });

    it('délègue le marquage d une notification comme lue', async () => {
      const mockService = {
        marquerCommeLue: vi.fn().mockResolvedValue({ id: '10', lu: true }),
      };

      const controller = new NotificationsController(mockService as any);
      const res = await controller.marquerCommeLue('42', 10);

      expect(res.success).toBe(true);
      expect(mockService.marquerCommeLue).toHaveBeenCalledWith(42n, 10n);
    });

    it('délègue la mise à jour des préférences de notification', async () => {
      const mockService = {
        modifierPreferences: vi.fn().mockResolvedValue({ email_actif: false, push_actif: true }),
      };

      const controller = new NotificationsController(mockService as any);
      const res = await controller.modifierPreferences('42', { email_actif: false });

      expect(res.success).toBe(true);
      expect(mockService.modifierPreferences).toHaveBeenCalledWith(42n, { email_actif: false });
    });
  });

  describe('AuthController - Sessions', () => {
    it('permet de lister les sessions sans exposer de hash de jeton', async () => {
      const mockAuthService = {
        listerSessions: vi.fn().mockResolvedValue([
          {
            id: '1',
            adresse_ip: '192.168.1.1',
            agent_utilisateur: 'Chrome',
            revoque: false,
          },
        ]),
      };

      const controller = new AuthController(mockAuthService as any);
      const res = await controller.listerSessions('42');

      expect(res.success).toBe(true);
      expect(res.data[0].jeton_refresh_hash).toBeUndefined();
      expect(mockAuthService.listerSessions).toHaveBeenCalledWith(42n);
    });

    it('permet de révoquer une session ciblée', async () => {
      const mockAuthService = {
        revoquerSession: vi.fn().mockResolvedValue({ message: 'Session révoquée avec succès.' }),
      };

      const controller = new AuthController(mockAuthService as any);
      const res = await controller.revoquerSession('42', 1);

      expect(res.success).toBe(true);
      expect(mockAuthService.revoquerSession).toHaveBeenCalledWith(42n, 1n);
    });

    it('permet de révoquer toutes les sessions de l utilisateur', async () => {
      const mockAuthService = {
        revoquerToutesLesSessions: vi.fn().mockResolvedValue({
          message: 'Toutes vos sessions actives ont été révoquées avec succès.',
        }),
      };

      const controller = new AuthController(mockAuthService as any);
      const res = await controller.revoquerToutesLesSessions('42');

      expect(res.success).toBe(true);
      expect(mockAuthService.revoquerToutesLesSessions).toHaveBeenCalledWith(42n);
    });
  });
});

