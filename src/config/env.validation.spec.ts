import { describe, it, expect } from 'vitest';
import { validateEnv, Environment } from './env.validation.js';

describe('validateEnv', () => {
  it('devrait valider un objet de configuration valide avec valeurs par défaut', () => {
    const config = validateEnv({});
    expect(config.NODE_ENV).toBe(Environment.Development);
    expect(config.PORT).toBe(3000);
    expect(config.JWT_ACCESS_EXPIRES_IN).toBe('15m');
  });

  it('devrait accepter les variables fournies', () => {
    const config = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });
    expect(config.NODE_ENV).toBe(Environment.Production);
    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
  });

  it('devrait rejeter un environnement invalide', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
      }),
    ).toThrow('Erreur de validation de configuration');
  });
});

