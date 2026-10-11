import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { JetonService } from './jeton.service.js';

describe('JetonService', () => {
  let jetonService: JetonService;

  beforeEach(() => {
    const mockConfigService = {
      get: vi.fn((cle: string) => {
        if (cle === 'JWT_ACCESS_SECRET') return 'mon-secret-de-test-super-securise';
        if (cle === 'JWT_ACCESS_EXPIRES_IN') return '1h';
        if (cle === 'NODE_ENV') return 'test';
        return undefined;
      }),
    } as unknown as ConfigService;

    jetonService = new JetonService(mockConfigService);
  });

  it('devrait générer un JWT valide et le vérifier avec succès', () => {
    const payload = { sub: '42', role: 'PARTICULIER', telephone: '+237690000000' };
    const token = jetonService.genererAccessToken(payload);

    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = jetonService.verifierAccessToken(token);
    expect(decoded.sub).toBe('42');
    expect(decoded.role).toBe('PARTICULIER');
    expect(decoded.telephone).toBe('+237690000000');
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('devrait rejeter un JWT avec une fausse signature', () => {
    const payload = { sub: '42', role: 'PARTICULIER', telephone: '+237690000000' };
    const token = jetonService.genererAccessToken(payload);
    const parts = token.split('.');
    const falsifiedToken = `${parts[0]}.${parts[1]}.fausseSignature123`;

    expect(() => jetonService.verifierAccessToken(falsifiedToken)).toThrow(
      UnauthorizedException,
    );
  });

  it('devrait rejeter un jeton malformé', () => {
    expect(() => jetonService.verifierAccessToken('pas.un.vrai.jwt.quatre.parties')).toThrow(
      UnauthorizedException,
    );
    expect(() => jetonService.verifierAccessToken('')).toThrow(UnauthorizedException);
  });
});

