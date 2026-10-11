import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

export interface QuotaDetails {
  quota_inclus: number;
  quota_utilise: number;
  quota_reserve: number;
  quota_disponible: number;
}

@Injectable()
export class QuotaService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcule le quota disponible d'un abonnement.
   * Formule : quota_disponible = quota_inclus - quota_utilise - quota_reserve
   */
  calculerDisponibilite(abonnement: {
    nombre_collectes_incluses: number;
    nombre_collectes_utilisees: number;
    nombre_collectes_reservees: number;
  }): QuotaDetails {
    const inclus = Number(abonnement.nombre_collectes_incluses);
    const utilise = Number(abonnement.nombre_collectes_utilisees);
    const reserve = Number(abonnement.nombre_collectes_reservees);
    const disponible = inclus - utilise - reserve;

    return {
      quota_inclus: inclus,
      quota_utilise: utilise,
      quota_reserve: reserve,
      quota_disponible: Math.max(0, disponible),
    };
  }

  /**
   * Réservation atomique d'un quota pour une demande de collecte.
   */
  async reserverQuota(
    abonnementId: bigint,
    demandeCollecteId: bigint,
    clientTx?: any,
  ): Promise<void> {
    const prisma = clientTx || this.prisma;

    // 1. Récupérer l'abonnement
    const abonnement = await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(abonnementId))
      .first();

    if (!abonnement) {
      throw new BadRequestException('Abonnement introuvable.');
    }

    if (abonnement.statut !== 'ACTIF') {
      throw new BadRequestException(
        `L'abonnement n'est pas actif (statut actuel: ${abonnement.statut}).`,
      );
    }

    const dispo = this.calculerDisponibilite(abonnement);
    if (dispo.quota_disponible <= 0) {
      throw new ConflictException(
        'Quota d’abonnement épuisé. Aucune collecte disponible restante sur cet abonnement.',
      );
    }

    // 2. Protection contre la double réservation pour la même demande
    const reservationExistante = await prisma.orm.public.UtilisationAbonnement
      .where((u: any) =>
        u.demande_collecte_id.eq(demandeCollecteId)
          .and(u.type.eq('RESERVATION'))
          .and(u.statut.eq('ACTIF')),
      )
      .first();

    if (reservationExistante) {
      // Déjà réservé pour cette demande, opération idempotente
      return;
    }

    // 3. Créer la trace UtilisationAbonnement de type RESERVATION
    await prisma.orm.public.UtilisationAbonnement.create({
      abonnement_id: abonnementId as any,
      demande_collecte_id: demandeCollecteId as any,
      type: 'RESERVATION' as any,
      quantite: 1,
      statut: 'ACTIF' as any,
    });

    // 4. Mettre à jour les compteurs de l'abonnement avec contrôle OCC
    const majAbonnement = await prisma.orm.public.Abonnement
      .where((a: any) =>
        a.id.eq(abonnementId)
          .and(a.nombre_collectes_reservees.eq(abonnement.nombre_collectes_reservees))
          .and(a.nombre_collectes_utilisees.eq(abonnement.nombre_collectes_utilisees)),
      )
      .update({
        nombre_collectes_reservees: abonnement.nombre_collectes_reservees + 1,
        date_modification: new Date(),
      } as any);

    if (!majAbonnement) {
      throw new ConflictException({
        statusCode: 409,
        code: 'CONCURRENCE_ABONNEMENT_QUOTA',
        message: 'Le quota de cet abonnement a été modifié simultanément par une autre opération. Veuillez réessayer.',
      });
    }
  }

  /**
   * Consommation définitive du quota réservé lorsqu'une collecte est validée comme terminée.
   */
  async consommerQuota(demandeCollecteId: bigint, clientTx?: any): Promise<void> {
    const prisma = clientTx || this.prisma;

    // 1. Rechercher la réservation active liée à cette demande
    const reservation = await prisma.orm.public.UtilisationAbonnement
      .where((u: any) =>
        u.demande_collecte_id.eq(demandeCollecteId)
          .and(u.type.eq('RESERVATION'))
          .and(u.statut.eq('ACTIF')),
      )
      .first();

    if (!reservation) {
      // Vérifier si elle est déjà consommée pour idempotence
      const dejaConsommee = await prisma.orm.public.UtilisationAbonnement
        .where((u: any) =>
          u.demande_collecte_id.eq(demandeCollecteId)
            .and(u.type.eq('CONSOMMATION')),
        )
        .first();

      if (dejaConsommee) {
        return; // Idempotent
      }

      throw new BadRequestException('Aucune réservation active trouvée pour cette collecte.');
    }

    const abonnement = await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(reservation.abonnement_id))
      .first();

    if (!abonnement) {
      throw new BadRequestException('Abonnement lié introuvable.');
    }

    // 2. Marquer atomiquement la réservation comme consommée
    const reservationConsommee = await prisma.orm.public.UtilisationAbonnement
      .where((u: any) => u.id.eq(reservation.id).and(u.statut.eq('ACTIF')))
      .update({
        statut: 'CONSOMME',
      } as any);

    if (!reservationConsommee) {
      return; // Déjà consommée par un appel concurrent
    }

    // 3. Créer la trace CONSOMMATION
    await prisma.orm.public.UtilisationAbonnement.create({
      abonnement_id: reservation.abonnement_id as any,
      demande_collecte_id: demandeCollecteId as any,
      type: 'CONSOMMATION' as any,
      quantite: 1,
      statut: 'VALIDE' as any,
    });

    // 4. Mettre à jour les compteurs
    const nouvellesReservations = Math.max(0, abonnement.nombre_collectes_reservees - 1);
    const nouvellesUtilisations = abonnement.nombre_collectes_utilisees + 1;

    await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(reservation.abonnement_id))
      .update({
        nombre_collectes_reservees: nouvellesReservations,
        nombre_collectes_utilisees: nouvellesUtilisations,
        date_modification: new Date(),
      } as any);
  }

  /**
   * Libération d'un quota réservé lors de l'annulation ou de l'échec d'une demande.
   */
  async libererQuota(demandeCollecteId: bigint, clientTx?: any): Promise<void> {
    const prisma = clientTx || this.prisma;

    // 1. Rechercher la réservation active liée à cette demande
    const reservation = await prisma.orm.public.UtilisationAbonnement
      .where((u: any) =>
        u.demande_collecte_id.eq(demandeCollecteId)
          .and(u.type.eq('RESERVATION'))
          .and(u.statut.eq('ACTIF')),
      )
      .first();

    if (!reservation) {
      // Idempotence : si déjà libéré ou aucune réservation, ne rien faire
      return;
    }

    const abonnement = await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(reservation.abonnement_id))
      .first();

    if (!abonnement) {
      throw new BadRequestException('Abonnement lié introuvable.');
    }

    // 2. Marquer atomiquement la réservation comme libérée
    const reservationLiberee = await prisma.orm.public.UtilisationAbonnement
      .where((u: any) => u.id.eq(reservation.id).and(u.statut.eq('ACTIF')))
      .update({
        statut: 'LIBERE',
      } as any);

    if (!reservationLiberee) {
      return; // Déjà libérée par un appel concurrent
    }

    // 3. Créer la trace LIBERATION
    await prisma.orm.public.UtilisationAbonnement.create({
      abonnement_id: reservation.abonnement_id as any,
      demande_collecte_id: demandeCollecteId as any,
      type: 'LIBERATION' as any,
      quantite: 1,
      statut: 'VALIDE' as any,
    });

    // 4. Décrémenter les réservations de l'abonnement
    const nouvellesReservations = Math.max(0, abonnement.nombre_collectes_reservees - 1);

    await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(reservation.abonnement_id))
      .update({
        nombre_collectes_reservees: nouvellesReservations,
        date_modification: new Date(),
      } as any);
  }
}

