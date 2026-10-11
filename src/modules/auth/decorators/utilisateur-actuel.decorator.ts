import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const UtilisateurActuel = createParamDecorator(
  (cle: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const utilisateur = request.utilisateur;

    if (!utilisateur) {
      return null;
    }

    return cle ? utilisateur[cle] : utilisateur;
  },
);

