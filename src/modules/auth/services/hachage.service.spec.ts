import { describe, it, expect } from 'vitest';
import { HachageService } from './hachage.service.js';

describe('HachageService', () => {
  const service = new HachageService();

  it('devrait hacher un mot de passe et produire un format scrypt valide', async () => {
    const hash = await service.hacherMotDePasse('monSuperMotDePasse123');
    expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  it('devrait valider un mot de passe correct', async () => {
    const motDePasse = 'Secret_12345';
    const hash = await service.hacherMotDePasse(motDePasse);
    const estValide = await service.verifierMotDePasse(motDePasse, hash);
    expect(estValide).toBe(true);
  });

  it('devrait rejeter un mot de passe erroné', async () => {
    const hash = await service.hacherMotDePasse('Secret_12345');
    const estValide = await service.verifierMotDePasse('MauvaisMotDePasse', hash);
    expect(estValide).toBe(false);
  });

  it('devrait générer un sel différent à chaque hachage (même mot de passe)', async () => {
    const hash1 = await service.hacherMotDePasse('Identique123');
    const hash2 = await service.hacherMotDePasse('Identique123');
    expect(hash1).not.toBe(hash2);
  });

  it('devrait hacher un jeton en SHA-256 de façon déterministe', () => {
    const jeton = 'mon-token-aleatoire';
    const hash1 = service.hacherJeton(jeton);
    const hash2 = service.hacherJeton(jeton);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('devrait générer un jeton aléatoire de longueur adéquate', () => {
    const jeton = service.genererJetonAleatoire(32);
    expect(jeton).toHaveLength(64); // 32 octets = 64 hex chars
  });
});

