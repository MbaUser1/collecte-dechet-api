import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JetonService } from '../services/jeton.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockJetonService: Partial<JetonService>;
  let mockPrismaService: any;

  beforeEach(() => {
    mockJetonService = {
      verifierAccessToken: vi.fn(),
    };

    mockPrismaService = {
      orm: {
        public: {
          Utilisateur: {
            where: vi.fn().mockReturnValue({
              first: vi.fn(),
            }),
          },
        },
      },
    };

    guard = new JwtAuthGuard(
      mockJetonService as JetonService,
      mockPrismaService as PrismaService,
    );
  });

  const createMockContext = (authHeader?: string) => {
    const request = {
      headers: {
        authorization: authHeader,
      },
      utilisateur: undefined,
    };

    return {
      context: {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      } as unknown as ExecutionContext,
      request,
    };
  };

  it('devrait rejeter une requête sans en-tête Authorization', async () => {
    const { context } = createMockContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('devrait rejeter un en-tête qui ne commence pas par Bearer', async () => {
    const { context } = createMockContext('Basic xyz');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('devrait rejeter un jeton JWT invalide', async () => {
    const { context } = createMockContext('Bearer tokenInvalide');
    vi.mocked(mockJetonService.verifierAccessToken!).mockImplementation(() => {
      throw new UnauthorizedException('Signature invalide');
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('devrait rejeter si l\'utilisateur n\'existe pas en base', async () => {
    const { context } = createMockContext('Bearer tokenValide');
    vi.mocked(mockJetonService.verifierAccessToken!).mockReturnValue({
      sub: '99',
      role: 'PARTICULIER',
      telephone: '+237690000000',
    });

    mockPrismaService.orm.public.Utilisateur.where.mockReturnValue({
      first: vi.fn().mockResolvedValue(null),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('devrait rejeter avec 403 si le compte utilisateur est suspendu', async () => {
    const { context } = createMockContext('Bearer tokenValide');
    vi.mocked(mockJetonService.verifierAccessToken!).mockReturnValue({
      sub: '99',
      role: 'PARTICULIER',
      telephone: '+237690000000',
    });

    mockPrismaService.orm.public.Utilisateur.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({
        id: 99n,
        role: 'PARTICULIER',
        statut: 'SUSPENDU',
        mot_de_passe: 'hashSecret',
      }),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('devrait rejeter avec 403 si le compte utilisateur est inactif', async () => {
    const { context } = createMockContext('Bearer tokenValide');
    vi.mocked(mockJetonService.verifierAccessToken!).mockReturnValue({
      sub: '99',
      role: 'PARTICULIER',
      telephone: '+237690000000',
    });

    mockPrismaService.orm.public.Utilisateur.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({
        id: 99n,
        role: 'PARTICULIER',
        statut: 'INACTIF',
        mot_de_passe: 'hashSecret',
      }),
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('devrait attacher l\'utilisateur sans mot de passe et autoriser l\'accès pour un compte actif', async () => {
    const { context, request } = createMockContext('Bearer tokenValide');
    vi.mocked(mockJetonService.verifierAccessToken!).mockReturnValue({
      sub: '99',
      role: 'PARTICULIER',
      telephone: '+237690000000',
    });

    mockPrismaService.orm.public.Utilisateur.where.mockReturnValue({
      first: vi.fn().mockResolvedValue({
        id: 99n,
        nom: 'Dupont',
        role: 'PARTICULIER',
        statut: 'ACTIF',
        mot_de_passe: 'hashSecretSensible',
      }),
    });

    const autorise = await guard.canActivate(context);
    expect(autorise).toBe(true);
    expect(request.utilisateur).toBeDefined();
    expect(request.utilisateur.nom).toBe('Dupont');
    expect((request.utilisateur as any).mot_de_passe).toBeUndefined();
  });
});

