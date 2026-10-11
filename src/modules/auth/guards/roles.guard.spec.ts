import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let mockReflector: Partial<Reflector>;

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: vi.fn(),
    };
    guard = new RolesGuard(mockReflector as Reflector);
  });

  const createMockContext = (user?: any) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ utilisateur: user }),
      }),
    }) as unknown as ExecutionContext;

  it('devrait autoriser l\'accès si aucune métadonnée de rôle n\'est spécifiée', () => {
    vi.mocked(mockReflector.getAllAndOverride!).mockReturnValue(undefined);
    const context = createMockContext({ role: 'PARTICULIER' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('devrait autoriser l\'accès si l\'utilisateur possède le rôle requis', () => {
    vi.mocked(mockReflector.getAllAndOverride!).mockReturnValue(['ADMINISTRATEUR', 'COLLECTEUR']);
    const context = createMockContext({ role: 'ADMINISTRATEUR' });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('devrait refuser avec 403 si l\'utilisateur ne possède pas le rôle requis', () => {
    vi.mocked(mockReflector.getAllAndOverride!).mockReturnValue(['ADMINISTRATEUR']);
    const context = createMockContext({ role: 'PARTICULIER' });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('devrait refuser avec 403 si l\'utilisateur n\'est pas présent dans la requête', () => {
    vi.mocked(mockReflector.getAllAndOverride!).mockReturnValue(['ADMINISTRATEUR']);
    const context = createMockContext(undefined);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

