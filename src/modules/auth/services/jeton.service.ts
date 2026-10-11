import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ChargeUtileJwt {
  sub: string;
  role: string;
  telephone: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JetonService {
  private readonly logger = new Logger(JetonService.name);
  private readonly secretAcces: string;
  private readonly expirationAccesSecondes: number;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    const estProd = this.configService.get<string>('NODE_ENV') === 'production';

    if (!secret || secret.trim().length === 0) {
      if (estProd) {
        throw new Error("JWT_ACCESS_SECRET est obligatoire en environnement de production.");
      }
      this.logger.warn('JWT_ACCESS_SECRET non configuré. Utilisation d\'un secret de développement par défaut.');
      this.secretAcces = 'secret-dev-insecure-change-in-production-collecte-dechets-api';
    } else {
      this.secretAcces = secret;
    }

    const dureeAcces = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    this.expirationAccesSecondes = this.convertirDureeEnSecondes(dureeAcces);
  }

  /**
   * Convertit une chaîne de durée (ex: "15m", "1h", "30d") en secondes.
   */
  convertirDureeEnSecondes(duree: string): number {
    const unite = duree.slice(-1);
    const valeur = parseInt(duree.slice(0, -1), 10);

    if (isNaN(valeur)) {
      return 15 * 60; // 15 minutes par défaut
    }

    switch (unite) {
      case 's':
        return valeur;
      case 'm':
        return valeur * 60;
      case 'h':
        return valeur * 3600;
      case 'd':
        return valeur * 86400;
      default:
        return 15 * 60;
    }
  }

  /**
   * Génère un jeton d'accès JWT signé en HS256.
   */
  genererAccessToken(payload: { sub: string; role: string; telephone: string }): string {
    const maintenant = Math.floor(Date.now() / 1000);
    const expiration = maintenant + this.expirationAccesSecondes;

    const chargeUtile: ChargeUtileJwt = {
      ...payload,
      iat: maintenant,
      exp: expiration,
    };

    const enTete = { alg: 'HS256', typ: 'JWT' };
    const enTeteB64 = this.base64UrlEncode(JSON.stringify(enTete));
    const chargeUtileB64 = this.base64UrlEncode(JSON.stringify(chargeUtile));

    const contenu = `${enTeteB64}.${chargeUtileB64}`;
    const signature = this.signerHmac(contenu, this.secretAcces);

    return `${contenu}.${signature}`;
  }

  /**
   * Vérifie et décode un jeton d'accès JWT.
   */
  verifierAccessToken(jeton: string): ChargeUtileJwt {
    if (!jeton || typeof jeton !== 'string') {
      throw new UnauthorizedException('Jeton d\'accès manquant ou invalide.');
    }

    const segments = jeton.split('.');
    if (segments.length !== 3) {
      throw new UnauthorizedException('Format du jeton JWT invalide.');
    }

    const [enTeteB64, chargeUtileB64, signatureFournie] = segments;

    // 1. Validation stricte de l'algorithme d'en-tête (refus de alg: none ou substitution)
    try {
      const enTeteJson = this.base64UrlDecode(enTeteB64);
      const enTete = JSON.parse(enTeteJson);
      if (enTete.alg !== 'HS256' || (enTete.typ && enTete.typ !== 'JWT')) {
        throw new UnauthorizedException('Algorithme de signature non autorisé. Seul HS256 est accepté.');
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('En-tête de jeton JWT invalide.');
    }

    // 2. Vérification HMAC en temps constant
    const contenu = `${enTeteB64}.${chargeUtileB64}`;
    const signatureAttendue = this.signerHmac(contenu, this.secretAcces);

    const bufFourni = Buffer.from(signatureFournie);
    const bufAttendu = Buffer.from(signatureAttendue);

    if (bufFourni.length !== bufAttendu.length || !timingSafeEqual(bufFourni, bufAttendu)) {
      throw new UnauthorizedException('Signature du jeton invalide.');
    }

    // 3. Décodage et vérification des claims indispensables
    try {
      const chargeUtileJson = this.base64UrlDecode(chargeUtileB64);
      const chargeUtile = JSON.parse(chargeUtileJson) as ChargeUtileJwt;

      const maintenant = Math.floor(Date.now() / 1000);
      if (!chargeUtile.exp || chargeUtile.exp < maintenant) {
        throw new UnauthorizedException('Le jeton d\'accès a expiré.');
      }

      if (!chargeUtile.sub || !chargeUtile.role) {
        throw new UnauthorizedException('Claims obligatoires manquants dans le jeton d\'accès.');
      }

      return chargeUtile;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Jeton d\'accès illisible.');
    }
  }

  private signerHmac(contenu: string, secret: string): string {
    return createHmac('sha256', secret)
      .update(contenu)
      .digest('base64url');
  }

  private base64UrlEncode(texte: string): string {
    return Buffer.from(texte, 'utf8').toString('base64url');
  }

  private base64UrlDecode(base64url: string): string {
    return Buffer.from(base64url, 'base64url').toString('utf8');
  }
}

