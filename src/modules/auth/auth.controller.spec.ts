import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthController } from './auth.controller.js';
import { AuthService } from './services/auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let mockAuthService: Partial<AuthService>;

  beforeEach(() => {
    mockAuthService = {
      inscrire: vi.fn(),
      connecter: vi.fn(),
      rafraichir: vi.fn(),
      deconnecter: vi.fn(),
      obtenirProfil: vi.fn(),
      modifierProfil: vi.fn(),
      changerMotDePasse: vi.fn(),
    };

    controller = new AuthController(mockAuthService as AuthService);
  });

  it('devrait retourner le format de succès standard sur /inscription', async () => {
    const mockResult = {
      utilisateur: { id: '1', nom: 'Alice', telephone: '+237690000001' },
      tokens: { access_token: 'jwt', refresh_token: 'refresh' },
    };
    vi.mocked(mockAuthService.inscrire!).mockResolvedValue(mockResult as any);

    const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'vitest' }, socket: {} } as any;

    const response = await controller.inscrire(
      {
        nom: 'Alice',
        telephone: '+237690000001',
        mot_de_passe: 'Secret1234',
        role: 'PARTICULIER',
      },
      mockReq,
    );

    expect(response).toEqual({
      success: true,
      message: 'Compte créé avec succès.',
      data: mockResult,
    });
  });

  it('devrait retourner le format de succès standard sur /connexion', async () => {
    const mockResult = {
      utilisateur: { id: '1', nom: 'Alice', telephone: '+237690000001' },
      tokens: { access_token: 'jwt', refresh_token: 'refresh' },
    };
    vi.mocked(mockAuthService.connecter!).mockResolvedValue(mockResult as any);

    const mockReq = { ip: '127.0.0.1', headers: { 'user-agent': 'vitest' }, socket: {} } as any;

    const response = await controller.connecter(
      { identifiant: '+237690000001', mot_de_passe: 'Secret1234' },
      mockReq,
    );

    expect(response).toEqual({
      success: true,
      message: 'Connexion réussie.',
      data: mockResult,
    });
  });

  it('devrait retourner le format de succès standard sur /me', async () => {
    const mockUser = { id: '1', nom: 'Alice', role: 'PARTICULIER' };
    vi.mocked(mockAuthService.obtenirProfil!).mockResolvedValue(mockUser as any);

    const response = await controller.obtenirProfil({ id: '1' });

    expect(response).toEqual({
      success: true,
      message: 'Profil récupéré avec succès.',
      data: mockUser,
    });
  });
});

