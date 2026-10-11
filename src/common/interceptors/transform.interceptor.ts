import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { serialiserDonnees } from '../utils/serializer.util.js';

export interface ReponseStandard<T> {
  success: true;
  message: string;
  data: T;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ReponseStandard<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<ReponseStandard<T>> {
    return next.handle().pipe(
      map((valeur) => {
        // Si le contrôleur a déjà fourni une réponse avec format structuré
        if (
          valeur &&
          typeof valeur === 'object' &&
          'success' in valeur &&
          valeur.success === true
        ) {
          return {
            success: true,
            message: (valeur.message as string) || 'Opération effectuée avec succès.',
            data: serialiserDonnees(valeur.data !== undefined ? (valeur.data as T) : ({} as T)),
          };
        }

        return {
          success: true,
          message: 'Opération effectuée avec succès.',
          data: serialiserDonnees(valeur !== undefined && valeur !== null ? (valeur as T) : ({} as T)),
        };
      }),
    );
  }
}

