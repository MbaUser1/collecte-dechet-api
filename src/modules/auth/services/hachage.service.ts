import { Injectable } from '@nestjs/common';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

@Injectable()
export class HachageService {
  private readonly longueurCle = 64;
  // Paramètres de dérivation scrypt recommandés par l'OWASP
  private readonly scryptOptions = {
    N: 16384, // Coût CPU/mémoire
    r: 8,     // Taille des blocs
    p: 1,     // Parallélisme
    maxmem: 32 * 1024 * 1024,
  };

  /**
   * Hache un mot de passe en utilisant scrypt et un sel cryptographique aléatoire de 16 octets.
   * Format retourné : "scrypt:<sel_hex>:<hash_hex>"
   */
  async hacherMotDePasse(motDePasse: string): Promise<string> {
    const sel = randomBytes(16).toString('hex');
    const cleDerivee = (await scryptAsync(motDePasse, sel, this.longueurCle, this.scryptOptions)) as Buffer;
    return `scrypt:${sel}:${cleDerivee.toString('hex')}`;
  }

  /**
   * Vérifie un mot de passe en clair par rapport au hash stocké, avec comparaison en temps constant.
   */
  async verifierMotDePasse(motDePasse: string, hashStocke: string): Promise<boolean> {
    const parties = hashStocke.split(':');
    if (parties.length !== 3 || parties[0] !== 'scrypt') {
      return false;
    }

    const [, sel, cleHex] = parties;
    const cleBuffer = Buffer.from(cleHex, 'hex');
    const cleCalculee = (await scryptAsync(motDePasse, sel, this.longueurCle, this.scryptOptions)) as Buffer;

    if (cleBuffer.length !== cleCalculee.length) {
      return false;
    }

    return timingSafeEqual(cleBuffer, cleCalculee);
  }

  /**
   * Hache un jeton (ex. refresh token) en SHA-256 pour stockage sécurisé en base.
   */
  hacherJeton(jeton: string): string {
    return createHash('sha256').update(jeton).digest('hex');
  }

  /**
   * Génère un jeton cryptographiquement aléatoire et opaque.
   */
  genererJetonAleatoire(octets = 32): string {
    return randomBytes(octets).toString('hex');
  }
}

