import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateEnv, Environment } from '../src/config/env.validation.js';
import { JetonService } from '../src/modules/auth/services/jeton.service.js';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../src/modules/auth/guards/roles.guard.js';
import { AuthService } from '../src/modules/auth/services/auth.service.js';

describe('Durcissement Authentification et Configuration Production (Phase 11 - Prompt 3/5)', () => {
  const SECRET_VALIDE_32 = 'secret-production-haute-securite-au-moins-32-caracteres-2026';
  const REFRESH_VALIDE_32 = 'secret-refresh-haute-securite-au-moins-32-caracteres-2026';

  describe('1. Secret JWT absent en production', () => {
    it('doit refuser le démarrage si JWT_ACCESS_SECRET est absent en production', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
        }),
      ).toThrow('JWT_ACCESS_SECRET est obligatoire en environnement de production');
    });

    it('JetonService doit refuser de s’initialiser en production sans secret', () => {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'JWT_ACCESS_SECRET') return undefined;
          return undefined;
        }),
      } as unknown as ConfigService;

      expect(() => new JetonService(mockConfig)).toThrow('JWT_ACCESS_SECRET est obligatoire');
    });
  });

  describe('2. Secret trop faible ou valeur de démonstration interdite en production', () => {
    it('doit refuser un secret d’accès de moins de 32 caractères en production', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
          JWT_ACCESS_SECRET: 'trop-court',
        }),
      ).toThrow('JWT_ACCESS_SECRET est trop court');
    });

    it('doit refuser un secret utilisant une valeur connue de développement ou d’exemple', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
          JWT_ACCESS_SECRET: 'secret-dev-insecure-change-in-production-collecte-dechets-api',
        }),
      ).toThrow('utilise une valeur de développement interdite en production');
    });
  });

  describe('3. Secrets d’accès et de rafraîchissement identiques', () => {
    it('doit refuser le démarrage si les secrets d’accès et de refresh sont identiques', () => {
      expect(() =>
        validateEnv({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
          JWT_ACCESS_SECRET: SECRET_VALIDE_32,
          JWT_REFRESH_SECRET: SECRET_VALIDE_32,
        }),
      ).toThrow('JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être strictement distincts');
    });

    it('doit accepter des secrets d’accès et de rafraîchissement distincts et robustes', () => {
      const config = validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://postgres:secret@localhost:5432/db',
        JWT_ACCESS_SECRET: SECRET_VALIDE_32,
        JWT_REFRESH_SECRET: REFRESH_VALIDE_32,
      });
      expect(config.NODE_ENV).toBe(Environment.Production);
      expect(config.JWT_ACCESS_SECRET).toBe(SECRET_VALIDE_32);
      expect(config.JWT_REFRESH_SECRET).toBe(REFRESH_VALIDE_32);
    });
  });

  describe('4. Jeton valide : accepté', () => {
    let jetonService: JetonService;

    beforeEach(() => {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_SECRET') return SECRET_VALIDE_32;
          if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
          if (key === 'NODE_ENV') return 'test';
          return undefined;
        }),
      } as unknown as ConfigService;
      jetonService = new JetonService(mockConfig);
    });

    it('doit générer un token d’accès valide avec le type access et le décoder', () => {
      const token = jetonService.genererAccessToken({
        sub: '10',
        role: 'COLLECTEUR',
        telephone: '+237690000000',
      });

      const payload = jetonService.verifierAccessToken(token);
      expect(payload.sub).toBe('10');
      expect(payload.role).toBe('COLLECTEUR');
      expect(payload.type).toBe('access');
      expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('5. Jeton expiré, malformé ou signé avec un mauvais secret', () => {
    let jetonService: JetonService;

    beforeEach(() => {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_SECRET') return SECRET_VALIDE_32;
          if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
          if (key === 'NODE_ENV') return 'test';
          return undefined;
        }),
      } as unknown as ConfigService;
      jetonService = new JetonService(mockConfig);
    });

    it('doit rejeter un jeton malformé', () => {
      expect(() => jetonService.verifierAccessToken('invalide.jwt')).toThrow(UnauthorizedException);
      expect(() => jetonService.verifierAccessToken('')).toThrow(UnauthorizedException);
    });

    it('doit rejeter un jeton signé avec un autre secret', () => {
      const autreConfig = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_SECRET') return 'autre-secret-de-signature-different-32-chars';
          return undefined;
        }),
      } as unknown as ConfigService;
      const autreService = new JetonService(autreConfig);

      const tokenFauxSecret = autreService.genererAccessToken({
        sub: '10',
        role: 'PARTICULIER',
        telephone: '+237690000000',
      });

      expect(() => jetonService.verifierAccessToken(tokenFauxSecret)).toThrow(UnauthorizedException);
      try {
        jetonService.verifierAccessToken(tokenFauxSecret);
      } catch (err: any) {
        expect(err.message).toBe('Signature du jeton invalide.');
      }
    });

    it('doit rejeter un jeton expiré', () => {
      const configExpire = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_SECRET') return SECRET_VALIDE_32;
          if (key === 'JWT_ACCESS_EXPIRES_IN') return '0s';
          return undefined;
        }),
      } as unknown as ConfigService;
      const serviceExpire = new JetonService(configExpire);

      const tokenExpire = serviceExpire.genererAccessToken({
        sub: '10',
        role: 'PARTICULIER',
        telephone: '+237690000000',
      });

      expect(() => serviceExpire.verifierAccessToken(tokenExpire)).toThrow(UnauthorizedException);
      try {
        serviceExpire.verifierAccessToken(tokenExpire);
      } catch (err: any) {
        expect(err.message).toBe('Le jeton d\'accès a expiré.');
      }
    });
  });

  describe('6. Algorithme JWT non autorisé : rejeté', () => {
    let jetonService: JetonService;

    beforeEach(() => {
      const mockConfig = {
        get: vi.fn((key: string) => {
          if (key === 'JWT_ACCESS_SECRET') return SECRET_VALIDE_32;
          return undefined;
        }),
      } as unknown as ConfigService;
      jetonService = new JetonService(mockConfig);
    });

    it('doit rejeter formellement un jeton avec alg: none', () => {
      const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: '1', role: 'ADMINISTRATEUR', exp: Math.floor(Date.now() / 1000) + 1000 })).toString('base64url');
      const tokenNone = `${headerNone}.${payload}.`;

      expect(() => jetonService.verifierAccessToken(tokenNone)).toThrow(UnauthorizedException);
      try {
        jetonService.verifierAccessToken(tokenNone);
      } catch (err: any) {
        expect(err.message).toContain('Algorithme de signature non autorisé');
      }
    });

    it('doit rejeter un jeton avec un algorithme asymétrique inattendu (ex: RS256)', () => {
      const headerRs = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: '1', role: 'ADMINISTRATEUR', exp: Math.floor(Date.now() / 1000) + 1000 })).toString('base64url');
      const tokenRs = `${headerRs}.${payload}.fausseSignature`;

      expect(() => jetonService.verifierAccessToken(tokenRs)).toThrow(UnauthorizedException);
      try {
        jetonService.verifierAccessToken(tokenRs);
      } catch (err: any) {
        expect(err.message).toContain('Algorithme de signature non autorisé');
      }
    });
  });

  describe('7. Utilisateur suspendu ou inexistant : accès protégé refusé', () => {
    let guard: JwtAuthGuard;
    let mockJetonService: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockJetonService = {
        verifierAccessToken: vi.fn().mockReturnValue({
          sub: '42',
          role: 'PARTICULIER',
          telephone: '+237690000000',
        }),
      };

      mockPrisma = {
        orm: {
          public: {
            Utilisateur: {
              where: vi.fn(),
            },
          },
        },
      };

      guard = new JwtAuthGuard(mockJetonService, mockPrisma);
    });

    const createCtx = (token = 'Bearer jeton.valide.test') => ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: token },
          utilisateur: undefined,
        }),
      }),
    } as any);

    it('doit rejeter avec 401 si l’utilisateur a été supprimé de la base', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      });

      await expect(guard.canActivate(createCtx())).rejects.toThrow(UnauthorizedException);
    });

    it('doit rejeter avec 403 Forbidden si l’utilisateur est suspendu en base', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 42n,
          statut: 'SUSPENDU',
          role: 'PARTICULIER',
        }),
      });

      await expect(guard.canActivate(createCtx())).rejects.toThrow(ForbiddenException);
    });

    it('doit rejeter avec 403 Forbidden si l’utilisateur est inactif en base', async () => {
      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 42n,
          statut: 'INACTIF',
          role: 'PARTICULIER',
        }),
      });

      await expect(guard.canActivate(createCtx())).rejects.toThrow(ForbiddenException);
    });
  });

  describe('8. Refresh token révoqué et protection anti-confusion', () => {
    let authService: AuthService;
    let mockPrisma: any;
    let mockHachage: any;
    let mockJeton: any;

    beforeEach(() => {
      mockPrisma = {
        orm: {
          public: {
            SessionUtilisateur: {
              where: vi.fn(),
              create: vi.fn(),
            },
            Utilisateur: {
              where: vi.fn(),
            },
          },
        },
        transaction: vi.fn(async (cb) => cb(mockPrisma)),
      };

      mockHachage = {
        hacherJeton: vi.fn((j) => `hash_${j}`),
        genererJetonAleatoire: vi.fn(() => 'nouveau_refresh_token_789'),
      };

      mockJeton = {
        genererAccessToken: vi.fn(() => 'nouveau.jwt.access_token'),
      };

      authService = new AuthService(mockPrisma, mockHachage, mockJeton);
    });

    it('doit rejeter le renouvellement si la session a déjà été marquée comme révoquée', async () => {
      mockPrisma.orm.public.SessionUtilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          revoque: true,
          date_expiration: new Date(Date.now() + 100000),
        }),
      });

      await expect(
        authService.rafraichir({ refresh_token: 'token_deja_utilise' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('doit refuser un access token JWT passé comme refresh token (anti-confusion)', async () => {
      await expect(
        authService.rafraichir({ refresh_token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature' }),
      ).rejects.toThrow(UnauthorizedException);

      try {
        await authService.rafraichir({ refresh_token: 'eyJhbGciOiJIUzI1NiJ9.payload.signature' });
      } catch (err: any) {
        expect(err.message).toContain('un jeton d’accès ne peut pas être utilisé comme jeton de rafraîchissement');
      }
    });

    it('doit renouveler et invalider de manière atomique la session si elle est valide', async () => {
      mockPrisma.orm.public.SessionUtilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 10n,
          utilisateur_id: 1n,
          revoque: false,
          date_expiration: new Date(Date.now() + 100000),
        }),
        update: vi.fn().mockResolvedValue({ id: 10n, revoque: true }),
      });

      mockPrisma.orm.public.Utilisateur.where.mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 1n,
          statut: 'ACTIF',
          role: 'PARTICULIER',
          telephone: '+237690000000',
        }),
      });

      const res = await authService.rafraichir({ refresh_token: 'valid_refresh_token' });
      expect(res.tokens.access_token).toBe('nouveau.jwt.access_token');
      expect(res.tokens.refresh_token).toBe('nouveau_refresh_token_789');
    });
  });

  describe('9. Déconnexion et révocation conforme aux règles', () => {
    let authService: AuthService;
    let mockPrisma: any;
    let mockHachage: any;

    beforeEach(() => {
      mockPrisma = {
        orm: {
          public: {
            SessionUtilisateur: {
              where: vi.fn().mockReturnValue({
                update: vi.fn().mockResolvedValue({}),
                first: vi.fn().mockResolvedValue({ id: 2n, utilisateur_id: 5n, revoque: false }),
              }),
            },
          },
        },
      };

      mockHachage = {
        hacherJeton: vi.fn((j) => `hash_${j}`),
      };

      authService = new AuthService(mockPrisma, mockHachage, {} as any);
    });

    it('doit révoquer la session lors de la déconnexion avec refresh token', async () => {
      const res = await authService.deconnecter('mon_refresh_token');
      expect(res.message).toContain('Déconnexion effectuée');
      expect(mockPrisma.orm.public.SessionUtilisateur.where).toHaveBeenCalled();
    });

    it('doit révoquer toutes les sessions actives de l’utilisateur', async () => {
      const res = await authService.revoquerToutesLesSessions(5n);
      expect(res.message).toContain('Toutes vos sessions actives ont été révoquées');
    });
  });

  describe('10. Régression sur la connexion, l’inscription et les rôles autorisés', () => {
    it('doit interdire l’inscription directe avec le rôle ADMINISTRATEUR ou COLLECTEUR', async () => {
      const authService = new AuthService({} as any, {} as any, {} as any);
      await expect(
        authService.inscrire({
          nom: 'Admin',
          telephone: '+237690000000',
          mot_de_passe: 'Password123!',
          role: 'ADMINISTRATEUR' as any,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('RolesGuard doit vérifier le rôle réel depuis l’utilisateur chargé en base', () => {
      const reflector = {
        getAllAndOverride: vi.fn().mockReturnValue(['ADMINISTRATEUR']),
      } as any;
      const guard = new RolesGuard(reflector);

      const ctxAdmin = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            utilisateur: { id: 1n, role: 'ADMINISTRATEUR' },
          }),
        }),
      } as any;

      expect(guard.canActivate(ctxAdmin)).toBe(true);

      const ctxParticulier = {
        getHandler: vi.fn(),
        getClass: vi.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            utilisateur: { id: 2n, role: 'PARTICULIER' },
          }),
        }),
      } as any;

      expect(() => guard.canActivate(ctxParticulier)).toThrow(ForbiddenException);
    });
  });
});

