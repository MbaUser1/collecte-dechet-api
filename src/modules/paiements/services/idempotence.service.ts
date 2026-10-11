import { Injectable, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service.js';

export interface ResultatIdempotence {
  estExistant: boolean;
  codeStatut?: number;
  reponse?: any;
}

@Injectable()
export class IdempotenceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vérifie la validité d'une clé d'idempotence.
   * Si la clé existe avec le même payload, retourne la réponse précédente.
   * Si la clé existe avec un payload différent, lève une exception 409 Conflict.
   */
  async verifierCle(
    cle: string,
    methode: string,
    chemin: string,
    corps: any,
  ): Promise<ResultatIdempotence> {
    if (!cle || cle.trim().length === 0) {
      return { estExistant: false };
    }

    const payloadHash = this.calculerHash({ methode, chemin, corps });

    const cleExistante = await this.prisma.orm.public.CleIdempotence
      .where((c: any) => c.cle.eq(cle.trim()))
      .first();

    if (!cleExistante) {
      return { estExistant: false };
    }

    // Si la clé existe, vérifier si le contenu stocké correspond
    // Le champ 'reponse' stocke un JSON { hash, data }
    let contenuStocke: { hash?: string; data?: any } = {};
    try {
      if (cleExistante.reponse) {
        contenuStocke = JSON.parse(cleExistante.reponse);
      }
    } catch {
      // Ignorer
    }

    if (contenuStocke.hash && contenuStocke.hash !== payloadHash) {
      throw new ConflictException({
        statusCode: 409,
        code: 'IDEMPOTENCY_KEY_REUTILISEE',
        message: 'Cette clé d’idempotence a déjà été utilisée avec des paramètres différents.',
      });
    }

    return {
      estExistant: true,
      codeStatut: cleExistante.code_statut || 200,
      reponse: contenuStocke.data ?? null,
    };
  }

  /**
   * Enregistre la réponse d'une opération idempotente.
   */
  async enregistrer(
    cle: string,
    methode: string,
    chemin: string,
    corps: any,
    codeStatut: number,
    reponse: any,
  ): Promise<void> {
    if (!cle || cle.trim().length === 0) {
      return;
    }

    const payloadHash = this.calculerHash({ methode, chemin, corps });
    const donneesSauvegardees = JSON.stringify({
      hash: payloadHash,
      data: reponse,
    });

    const dateExpiration = new Date(Date.now() + 24 * 3600 * 1000); // 24 heures

    try {
      await this.prisma.orm.public.CleIdempotence.create({
        cle: cle.trim() as any,
        methode_http: methode.toUpperCase() as any,
        chemin_uri: chemin as any,
        code_statut: codeStatut,
        reponse: donneesSauvegardees as any,
        date_expiration: dateExpiration as any,
      });
    } catch {
      // Si déjà inséré de façon concurrente, ignorer
    }
  }

  private calculerHash(objet: any): string {
    const json = JSON.stringify(objet || {});
    return createHash('sha256').update(json).digest('hex');
  }
}

