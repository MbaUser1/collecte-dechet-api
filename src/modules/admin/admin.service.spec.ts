import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminService } from './admin.service.js';
import { StatutUtilisateurEnum } from './dto/filtre-admin-utilisateurs.dto.js';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

describe('AdminService', () => {
  let service: AdminService;
  let mockPrisma: any;
  let mockAudit: any;
  let mockNotifications: any;

  beforeEach(() => {
    mockAudit = {
      enregistrerAction: vi.fn().mockResolvedValue(undefined),
    };

    mockNotifications = {
      envoyerNotification: vi.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      transaction: vi.fn().mockImplementation(async (callback) => callback(mockPrisma)),
      orm: {
        public: {
          DemandeCollecte: {
            count: vi.fn().mockResolvedValue(10),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([]),
            first: vi.fn(),
            update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 50n, ...data })),
          },
          Utilisateur: {
            count: vi.fn().mockResolvedValue(5),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([]),
            first: vi.fn(),
            update: vi.fn().mockImplementation((data) => Promise.resolve({ id: 10n, ...data })),
          },
          Abonnement: {
            count: vi.fn().mockResolvedValue(2),
            where: vi.fn().mockReturnThis(),
          },
          Paiement: {
            count: vi.fn().mockResolvedValue(1),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([]),
          },
          AjustementPrix: {
            count: vi.fn().mockResolvedValue(0),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([]),
          },
          Facture: {
            count: vi.fn().mockResolvedValue(1),
            where: vi.fn().mockReturnThis(),
          },
          MissionCollecte: {
            first: vi.fn(),
            create: vi.fn().mockImplementation((data) => Promise.resolve({ id: 88n, ...data })),
            where: vi.fn().mockReturnThis(),
          },
          SessionUtilisateur: {
            where: vi.fn().mockReturnThis(),
            update: vi.fn().mockResolvedValue({ count: 2 }),
          },
          ElementCollecte: {
            where: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue([]),
          },
        },
      },
    };

    service = new AdminService(mockPrisma, mockAudit, mockNotifications);
  });

  describe('obtenirDashboard', () => {
    it('doit agréger correctement toutes les métriques opérationnelles et financières', async () => {
      const dashboard = await service.obtenirDashboard();

      expect(dashboard).toBeDefined();
      expect(dashboard.demandes).toBeDefined();
      expect(dashboard.utilisateurs).toBeDefined();
      expect(dashboard.abonnements).toBeDefined();
      expect(dashboard.finances).toBeDefined();
      expect(typeof dashboard.demandes.total).toBe('number');
    });
  });

  describe('changerStatutUtilisateur', () => {
    it('doit refuser la suspension de son propre compte administrateur', async () => {
      await expect(
        service.changerStatutUtilisateur(
          1n,
          { statut: StatutUtilisateurEnum.SUSPENDU },
          1n, // adminId identique
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('doit révoquer toutes les sessions et tracer un audit lors d une suspension', async () => {
      mockPrisma.orm.public.Utilisateur.first.mockResolvedValue({
        id: 10n,
        statut: 'ACTIF',
        mot_de_passe: 'secret_hash',
      });

      const res = await service.changerStatutUtilisateur(
        10n,
        { statut: StatutUtilisateurEnum.SUSPENDU, motif: 'Fraude récurrente' },
        1n,
        '10.0.0.1',
        'AdminBrowser/1.0',
      );

      expect(res.statut).toBe('SUSPENDU');
      expect(res.mot_de_passe).toBeUndefined(); // Pas de mot de passe exposé
      expect(mockPrisma.orm.public.SessionUtilisateur.update).toHaveBeenCalledWith(
        expect.objectContaining({ revoque: true }),
      );
      expect(mockAudit.enregistrerAction).toHaveBeenCalledWith(
        1n,
        'SUSPENSION_COMPTE',
        'Utilisateur',
        10n,
        expect.objectContaining({
          ancien_statut: 'ACTIF',
          nouveau_statut: 'SUSPENDU',
          motif: 'Fraude récurrente',
        }),
        '10.0.0.1',
        'AdminBrowser/1.0',
        expect.anything(),
      );
      expect(mockNotifications.envoyerNotification).toHaveBeenCalled();
    });
  });

  describe('affecterCollecteur', () => {
    it('doit refuser si le collecteur est inexistant ou n a pas le statut ACTIF', async () => {
      mockPrisma.orm.public.Utilisateur.first.mockResolvedValue(null);

      await expect(
        service.affecterCollecteur(50n, { collecteur_id: 99 }, 1n),
      ).rejects.toThrow(BadRequestException);
    });

    it('doit refuser si la demande est déjà attribuée ou n est pas EN_ATTENTE_ATTRIBUTION', async () => {
      mockPrisma.orm.public.Utilisateur.first.mockResolvedValue({
        id: 7n,
        role: 'COLLECTEUR',
        statut: 'ACTIF',
      });

      mockPrisma.orm.public.DemandeCollecte.first.mockResolvedValue({
        id: 50n,
        statut: 'ATTRIBUEE',
        collecteur_id: 8n,
      });

      await expect(
        service.affecterCollecteur(50n, { collecteur_id: 7 }, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('doit refuser si une mission a déjà été créée pour cette demande', async () => {
      mockPrisma.orm.public.Utilisateur.first.mockResolvedValue({
        id: 7n,
        role: 'COLLECTEUR',
        statut: 'ACTIF',
      });

      mockPrisma.orm.public.DemandeCollecte.first.mockResolvedValue({
        id: 50n,
        statut: 'EN_ATTENTE_ATTRIBUTION',
        collecteur_id: null,
      });

      mockPrisma.orm.public.MissionCollecte.first.mockResolvedValue({
        id: 88n,
        demande_collecte_id: 50n,
      });

      await expect(
        service.affecterCollecteur(50n, { collecteur_id: 7 }, 1n),
      ).rejects.toThrow(ConflictException);
    });

    it('doit affecter de manière atomique la demande, créer la mission, notifier et auditer', async () => {
      mockPrisma.orm.public.Utilisateur.first.mockResolvedValue({
        id: 7n,
        role: 'COLLECTEUR',
        statut: 'ACTIF',
      });

      mockPrisma.orm.public.DemandeCollecte.first.mockResolvedValue({
        id: 50n,
        numero: 'DEM-2026-00050',
        statut: 'EN_ATTENTE_ATTRIBUTION',
        collecteur_id: null,
        utilisateur_id: 3n,
      });

      mockPrisma.orm.public.MissionCollecte.first.mockResolvedValue(null);

      const res = await service.affecterCollecteur(
        50n,
        { collecteur_id: 7 },
        1n,
        '10.0.0.1',
        'AdminBrowser/1.0',
      );

      expect(res.succes).toBe(true);
      expect(mockPrisma.orm.public.DemandeCollecte.update).toHaveBeenCalledWith(
        expect.objectContaining({
          collecteur_id: 7n,
          statut: 'ATTRIBUEE',
        }),
      );
      expect(mockPrisma.orm.public.MissionCollecte.create).toHaveBeenCalledWith(
        expect.objectContaining({
          demande_collecte_id: 50n,
          collecteur_id: 7n,
          statut: 'ATTRIBUEE',
        }),
      );
      expect(mockAudit.enregistrerAction).toHaveBeenCalledWith(
        1n,
        'AFFECTATION_ADMINISTRATIVE_COLLECTEUR',
        'DemandeCollecte',
        50n,
        expect.objectContaining({ collecteur_id: 7 }),
        '10.0.0.1',
        'AdminBrowser/1.0',
        expect.anything(),
      );
      // Deux notifications : au collecteur et au client
      expect(mockNotifications.envoyerNotification).toHaveBeenCalledTimes(2);
    });
  });
});

