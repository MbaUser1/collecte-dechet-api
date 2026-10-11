import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { JetonService } from '../services/jeton.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jetonService: JetonService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const enTeteAuth = request.headers['authorization'];

    if (!enTeteAuth || typeof enTeteAuth !== 'string' || !enTeteAuth.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentification requise. Veuillez fournir un jeton Bearer.');
    }

    const token = enTeteAuth.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Jeton d\'accès manquant.');
    }

    const chargeUtile = this.jetonService.verifierAccessToken(token);

    let utilisateur;
    try {
      const idBigInt = BigInt(chargeUtile.sub);
      utilisateur = await this.prisma.orm.public.Utilisateur
        .where((u) => u.id.eq(idBigInt))
        .first();
    } catch (err) {
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        throw err;
      }
      throw new UnauthorizedException('Session utilisateur invalide.');
    }

    if (!utilisateur) {
      throw new UnauthorizedException('Compte utilisateur introuvable.');
    }

    if (utilisateur.statut === 'SUSPENDU') {
      throw new ForbiddenException('Votre compte a été suspendu. Veuillez contacter l\'administration.');
    }

    if (utilisateur.statut === 'INACTIF') {
      throw new ForbiddenException('Votre compte est actuellement inactif.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mot_de_passe: _, ...utilisateurSansSecret } = utilisateur;
    request.utilisateur = utilisateurSansSecret;

    return true;
  }
}

