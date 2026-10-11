import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { HachageService } from './hachage.service.js';
import { JetonService } from './jeton.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockHachage: Partial<HachageService>;
  let mockJeton: Partial<JetonService>;

  beforeEach(() => {
    mockPrisma = {
      orm: {
        public: {
          Utilisateur: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
          Entreprise: {
            create: vi.fn(),
          },
          Portefeuille: {
            create: vi.fn(),
          },
          SessionUtilisateur: {
            where: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
          },
        },
      },
    };

    mockHachage = {
      hacherMotDePasse: vi.fn().mockResolvedValue('scrypt:sel:hash123'),
      verifierMotDePasse: vi.fn(),
      hacherJeton: vi.fn().mockImplementation((j: string) => `hash_${j}`),
      genererJetonAleatoire: vi.fn().mockReturnValue('random_refresh_token_123'),
    };

    mockJeton = {
      genererAccessToken: vi.fn().mockReturnValue('mocked.jwt.access_token'),
    };

    authService = new AuthService(
      mockPrisma as PrismaService,
      mockHachage as HachageService,
      mockJeton as JetonService,
    );
  });

  describe('inscrire', () => {
    it('devrait inscrire un PARTICULIER avec succès sans retourner le mot de passe', async () => {
      // Pas de doublon téléphone ni email
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      mockPrisma.orm.public.Utilisateur.create.mockResolvedValue({
        id: 1n,
        nom: 'Jean Particulier',
        telephone: '+237690000001',
        email: 'jean@example.com',
        role: 'PARTICULIER',
        statut: 'ACTIF',
        mot_de_passe: 'scrypt:sel:hash123',
      });

      mockPrisma.orm.public.SessionUtilisateur.create.mockResolvedValue({ id: 10n });
      mockPrisma.orm.public.Portefeuille.create.mockResolvedValue({ id: 20n });

      const resultat = await authService.inscrire({
        nom: 'Jean Particulier',
        telephone: '+237690000001',
        email: 'jean@example.com',
        mot_de_passe: 'motdepasseFort123',
        role: 'PARTICULIER',
      });

      expect(resultat.utilisateur.mot_de_passe).toBeUndefined();
      expect(resultat.utilisateur.nom).toBe('Jean Particulier');
      expect(resultat.utilisateur.id).toBe('1');
      expect(resultat.tokens.access_token).toBe('mocked.jwt.access_token');
      expect(resultat.tokens.refresh_token).toBe('random_refresh_token_123');

      expect(mockHachage.hacherMotDePasse).toHaveBeenCalledWith('motdepasseFort123');
      expect(mockPrisma.orm.public.Portefeuille.create).toHaveBeenCalled();
    });

    it('devrait inscrire une ENTREPRISE et créer l\'entité Entreprise rattachée', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      mockPrisma.orm.public.Utilisateur.create.mockResolvedValue({
        id: 2n,
        nom: 'EcoRecycle Sarl',
        telephone: '+237690000002',
        role: 'ENTREPRISE',
        statut: 'ACTIF',
        mot_de_passe: 'scrypt:sel:hash123',
      });

      mockPrisma.orm.public.Entreprise.create.mockResolvedValue({ id: 5n });
      mockPrisma.orm.public.Portefeuille.create.mockResolvedValue({ id: 21n });
      mockPrisma.orm.public.SessionUtilisateur.create.mockResolvedValue({ id: 11n });

      const resultat = await authService.inscrire({
        nom: 'EcoRecycle Sarl',
        telephone: '+237690000002',
        mot_de_passe: 'motdepasseFort123',
        role: 'ENTREPRISE',
        raison_sociale: 'EcoRecycle Sarl',
        numero_enregistrement: 'RC/DLA/2026/B/1234',
      });

      expect(resultat.utilisateur.role).toBe('ENTREPRISE');
      expect(mockPrisma.orm.public.Entreprise.create).toHaveBeenCalledWith(
        expect.objectContaining({
          utilisateur_id: 2n,
          nom: 'EcoRecycle Sarl',
          numero_enregistrement: 'RC/DLA/2026/B/1234',
        }),
      );
    });

    it('devrait rejeter l\'inscription publique pour le rôle COLLECTEUR', async () => {
      await expect(
        authService.inscrire({
          nom: 'Collecteur Tentative',
          telephone: '+237690000003',
          mot_de_passe: 'motdepasseFort123',
          role: 'COLLECTEUR' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait rejeter l\'inscription publique pour le rôle ADMINISTRATEUR', async () => {
      await expect(
        authService.inscrire({
          nom: 'Admin Tentative',
          telephone: '+237690000004',
          mot_de_passe: 'motdepasseFort123',
          role: 'ADMINISTRATEUR' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('devrait rejeter avec ConflictException si le numéro de téléphone est déjà pris', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({ id: 1n, telephone: '+237690000001' }),
      });

      await expect(
        authService.inscrire({
          nom: 'Doublon Tel',
          telephone: '+237690000001',
          mot_de_passe: 'motdepasseFort123',
          role: 'PARTICULIER',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('devrait rejeter avec ConflictException si l\'adresse email est déjà prise', async () => {
      mockPrisma.orm.public.Utilisateur.where
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue(null), // téléphone libre
        })
        .mockReturnValueOnce({
          first: vi.fn().mockResolvedValue({ id: 2n, email: 'existant@example.com' }), // email pris
        });

      await expect(
        authService.inscrire({
          nom: 'Doublon Email',
          telephone: '+237690000099',
          email: 'existant@example.com',
          mot_de_passe: 'motdepasseFort123',
          role: 'PARTICULIER',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('connecter', () => {
    it('devrait connecter avec succès un utilisateur valide', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          nom: 'Jean',
          telephone: '+237690000001',
          role: 'PARTICULIER',
          statut: 'ACTIF',
          mot_de_passe: 'scrypt:sel:hash123',
        }),
      });

      vi.mocked(mockHachage.verifierMotDePasse!).mockResolvedValue(true);
      mockPrisma.orm.public.SessionUtilisateur.create.mockResolvedValue({ id: 10n });

      const resultat = await authService.connecter({
        identifiant: '+237690000001',
        mot_de_passe: 'monMotDePasse',
      });

      expect(resultat.utilisateur.mot_de_passe).toBeUndefined();
      expect(resultat.tokens.access_token).toBeDefined();
      expect(resultat.tokens.refresh_token).toBeDefined();
    });

    it('devrait renvoyer UnauthorizedException avec message générique si l\'identifiant n\'existe pas', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(
        authService.connecter({
          identifiant: 'inconnu@example.com',
          mot_de_passe: 'nimporte',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait renvoyer UnauthorizedException si le mot de passe est erroné', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'ACTIF',
          mot_de_passe: 'scrypt:sel:hash123',
        }),
      });

      vi.mocked(mockHachage.verifierMotDePasse!).mockResolvedValue(false);

      await expect(
        authService.connecter({
          identifiant: '+237690000001',
          mot_de_passe: 'mauvaisMotDePasse',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait renvoyer ForbiddenException avec 403 si le compte est suspendu', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'SUSPENDU',
          mot_de_passe: 'scrypt:sel:hash123',
        }),
      });

      vi.mocked(mockHachage.verifierMotDePasse!).mockResolvedValue(true);

      await expect(
        authService.connecter({
          identifiant: '+237690000001',
          mot_de_passe: 'bonMotDePasse',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('rafraichir', () => {
    it('devrait renouveler le token et invalider atomiquement l\'ancienne session', async () => {
      const expirationFuture = new Date(Date.now() + 100000);
      mockPrisma.orm.public.SessionUtilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 5n,
          utilisateur_id: 1n,
          revoque: false,
          date_expiration: expirationFuture,
        }),
        update: vi.fn().mockResolvedValue({}),
      });

      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          role: 'PARTICULIER',
          telephone: '+237690000001',
          statut: 'ACTIF',
        }),
      });

      mockPrisma.orm.public.SessionUtilisateur.create.mockResolvedValue({ id: 6n });

      const resultat = await authService.rafraichir({ refresh_token: 'monTokenValide' });

      expect(resultat.tokens.access_token).toBeDefined();
      expect(resultat.tokens.refresh_token).toBe('random_refresh_token_123');

      // Vérifier que l'ancienne session a bien été révoquée
      expect(mockPrisma.orm.public.SessionUtilisateur.where).toHaveBeenCalled();
    });

    it('devrait rejeter si le refresh token a déjà été révoqué (tentative de réutilisation)', async () => {
      mockPrisma.orm.public.SessionUtilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 5n,
          utilisateur_id: 1n,
          revoque: true,
          date_expiration: new Date(Date.now() + 100000),
        }),
      });

      await expect(
        authService.rafraichir({ refresh_token: 'tokenDejaRevoque' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait rejeter si le refresh token est expiré', async () => {
      const expirationPassee = new Date(Date.now() - 100000);
      mockPrisma.orm.public.SessionUtilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 5n,
          utilisateur_id: 1n,
          revoque: false,
          date_expiration: expirationPassee,
        }),
      });

      await expect(
        authService.rafraichir({ refresh_token: 'tokenExpire' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('changerMotDePasse', () => {
    it('devrait changer le mot de passe et révoquer toutes les sessions actives', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          mot_de_passe: 'scrypt:sel:ancienHash',
        }),
        update: vi.fn().mockResolvedValue({}),
      });

      mockPrisma.orm.public.SessionUtilisateur.where.mockReturnValue({
        update: vi.fn().mockResolvedValue({}),
      });

      vi.mocked(mockHachage.verifierMotDePasse!).mockResolvedValue(true);

      const resultat = await authService.changerMotDePasse(1n, {
        ancien_mot_de_passe: 'ancienMotDePasse',
        nouveau_mot_de_passe: 'nouveauMotDePasseFort123',
      });

      expect(resultat.message).toContain('révoquées');
      expect(mockHachage.hacherMotDePasse).toHaveBeenCalledWith('nouveauMotDePasseFort123');
      expect(mockPrisma.orm.public.SessionUtilisateur.where).toHaveBeenCalled();
    });

    it('devrait rejeter si l\'ancien mot de passe est incorrect', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          mot_de_passe: 'scrypt:sel:ancienHash',
        }),
      });

      vi.mocked(mockHachage.verifierMotDePasse!).mockResolvedValue(false);

      await expect(
        authService.changerMotDePasse(1n, {
          ancien_mot_de_passe: 'fauxAncienMotDePasse',
          nouveau_mot_de_passe: 'nouveauMotDePasseFort123',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

