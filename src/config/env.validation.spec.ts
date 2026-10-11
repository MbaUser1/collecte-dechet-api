import { describe, it, expect } from 'vitest';
import { validateEnv, Environment } from './env.validation.js';

describe('validateEnv', () => {
  it('devrait valider un objet de configuration valide avec valeurs par défaut', () => {
    const config = validateEnv({});
    expect(config.NODE_ENV).toBe(Environment.Development);
    expect(config.PORT).toBe(3000);
    expect(config.JWT_ACCESS_EXPIRES_IN).toBe('15m');
  });

  it('devrait accepter une configuration de production complète et sécurisée', () => {
    const config = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_ACCESS_SECRET: 'cle-secrete-production-tres-longue-et-robuste-access-2026',
      JWT_REFRESH_SECRET: 'cle-secrete-production-tres-longue-et-robuste-refresh-2026',
    });
    expect(config.NODE_ENV).toBe(Environment.Production);
    expect(config.PORT).toBe(8080);
    expect(config.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
  });

  it('devrait refuser le démarrage en production si JWT_ACCESS_SECRET est absent', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      }),
    ).toThrow('JWT_ACCESS_SECRET est obligatoire en environnement de production');
  });

  it('devrait refuser le démarrage en production si JWT_ACCESS_SECRET est trop court ou utilise une valeur de démo', () => {
    // Trop court (< 32 caractères)
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_ACCESS_SECRET: 'secret-court',
      }),
    ).toThrow('JWT_ACCESS_SECRET est trop court');

    // Valeur de démo interdite
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_ACCESS_SECRET: 'secret-dev-insecure-change-in-production-collecte-dechets-api',
      }),
    ).toThrow('utilise une valeur de développement interdite');
  });

  it('devrait refuser le démarrage en production si les secrets d accès et de rafraîchissement sont identiques', () => {
    const secretCommun = 'cle-secrete-production-tres-longue-et-robuste-identique-2026';
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
        JWT_ACCESS_SECRET: secretCommun,
        JWT_REFRESH_SECRET: secretCommun,
      }),
    ).toThrow('JWT_ACCESS_SECRET et JWT_REFRESH_SECRET doivent être strictement distincts');
  });

  it('devrait refuser le démarrage en production si DATABASE_URL est absent', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'cle-secrete-production-tres-longue-et-robuste-access-2026',
      }),
    ).toThrow('DATABASE_URL est obligatoire en environnement de production');
  });

  it('devrait rejeter un environnement invalide', () => {
    expect(() =>
      validateEnv({
        NODE_ENV: 'staging',
      }),
    ).toThrow('Erreur de validation de configuration');
  });
});

