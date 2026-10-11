import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequis = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!rolesRequis || rolesRequis.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const utilisateur = request.utilisateur;

    if (!utilisateur || !utilisateur.role) {
      throw new ForbiddenException('Accès refusé. Profil utilisateur non chargé.');
    }

    const roleUtilisateur = utilisateur.role;
    if (!rolesRequis.includes(roleUtilisateur)) {
      throw new ForbiddenException(
        `Accès interdit. Votre rôle (${roleUtilisateur}) n'a pas les autorisations nécessaires.`,
      );
    }

    return true;
  }
}

