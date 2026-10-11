import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FiltreNotificationsDto } from './dto/filtre-notifications.dto.js';
import { ModifierPreferencesDto } from './dto/modifier-preferences.dto.js';
import { ResultatPagine } from '../../common/dto/pagination-query.dto.js';
import { serialiserDonnees } from '../../common/utils/serializer.util.js';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre une notification in-app pour un utilisateur cible.
   */
  async envoyerNotification(
    utilisateurId: bigint,
    titre: string,
    message: string,
    type: string,
    donnees?: Record<string, any>,
    clientPrisma?: any,
  ): Promise<any> {
    try {
      const client = clientPrisma || this.prisma;
      const notification = await client.orm.public.Notification.create({
        utilisateur_id: utilisateurId,
        titre,
        message,
        type,
        lu: false,
        donnees: donnees ? JSON.stringify(donnees) : null,
      });

      return serialiserDonnees(notification);
    } catch (erreur) {
      this.logger.error(
        `Erreur lors de l'envoi de la notification à l'utilisateur ${utilisateurId}: ${titre}`,
        erreur,
      );
      // Ne bloque pas l'opération appelante si l'envoi de notification échoue
      return null;
    }
  }

  /**
   * Liste les notifications de l'utilisateur connecté avec pagination et filtrage par statut de lecture.
   */
  async listerMesNotifications(
    utilisateurId: bigint,
    filtre: FiltreNotificationsDto,
  ): Promise<ResultatPagine<any>> {
    const page = filtre.page || 1;
    const limite = filtre.limite || 20;
    const offset = (page - 1) * limite;

    let requete = this.prisma.orm.public.Notification.where((n) =>
      n.utilisateur_id.eq(utilisateurId),
    );

    if (filtre.lu !== undefined) {
      requete = requete.where((n: any) => n.lu.eq(filtre.lu!)) as any;
    }

    const [elements, totalCount] = await Promise.all([
      requete
        .orderBy((n: any) => n.date_creation.desc())
        .offset(offset)
        .limit(limite)
        .all(),
      Promise.resolve(requete.count()),
    ]);

    const total = Number(totalCount);

    const formattedElements = elements.map((item: any) => ({
      ...serialiserDonnees(item),
      donnees: item.donnees
        ? (() => {
            try {
              return JSON.parse(item.donnees);
            } catch {
              return item.donnees;
            }
          })()
        : null,
    }));

    return {
      elements: formattedElements,
      pagination: {
        total,
        page,
        limite,
        pages_totales: Math.ceil(total / limite) || 1,
      },
    };
  }

  /**
   * Compte le nombre de notifications non lues pour l'utilisateur connecté.
   */
  async compterNonLues(utilisateurId: bigint): Promise<{ non_lues: number }> {
    const count = Number(
      await Promise.resolve(
        this.prisma.orm.public.Notification
          .where((n) => n.utilisateur_id.eq(utilisateurId))
          .where((n) => n.lu.eq(false))
          .count(),
      ),
    );

    return { non_lues: count };
  }

  /**
   * Marque une notification spécifique comme lue.
   */
  async marquerCommeLue(utilisateurId: bigint, notificationId: bigint): Promise<any> {
    const notif = await this.prisma.orm.public.Notification
      .where((n) => n.id.eq(notificationId))
      .first();

    if (!notif) {
      throw new NotFoundException('Notification introuvable.');
    }

    if (notif.utilisateur_id !== utilisateurId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier une notification qui ne vous appartient pas.');
    }

    if (notif.lu) {
      return serialiserDonnees(notif);
    }

    const miseAJour = await this.prisma.orm.public.Notification
      .where((n) => n.id.eq(notificationId))
      .update({
        lu: true,
        date_lecture: new Date() as any,
      });

    return serialiserDonnees(miseAJour);
  }

  /**
   * Marque toutes les notifications non lues de l'utilisateur comme lues.
   */
  async marquerToutesCommeLues(utilisateurId: bigint): Promise<{ message: string; compteurs_mis_a_jour: number }> {
    const nonLues = Number(
      await Promise.resolve(
        this.prisma.orm.public.Notification
          .where((n) => n.utilisateur_id.eq(utilisateurId))
          .where((n) => n.lu.eq(false))
          .count(),
      ),
    );

    if (nonLues > 0) {
      await this.prisma.orm.public.Notification
        .where((n) => n.utilisateur_id.eq(utilisateurId))
        .where((n) => n.lu.eq(false))
        .update({
          lu: true,
          date_lecture: new Date() as any,
        });
    }

    return {
      message: 'Toutes les notifications ont été marquées comme lues.',
      compteurs_mis_a_jour: nonLues,
    };
  }

  /**
   * Obtient les préférences de notification de l'utilisateur (ou initialise les valeurs par défaut).
   */
  async obtenirPreferences(utilisateurId: bigint): Promise<any> {
    let prefs = await this.prisma.orm.public.PreferenceNotification
      .where((p) => p.utilisateur_id.eq(utilisateurId))
      .first();

    if (!prefs) {
      prefs = await this.prisma.orm.public.PreferenceNotification.create({
        utilisateur_id: utilisateurId,
        email_actif: true,
        sms_actif: true,
        push_actif: true,
        whatsapp_actif: false,
      });
    }

    return serialiserDonnees(prefs);
  }

  /**
   * Met à jour les canaux de notification souhaités par l'utilisateur.
   */
  async modifierPreferences(utilisateurId: bigint, dto: ModifierPreferencesDto): Promise<any> {
    // S'assurer de l'existence préalable
    await this.obtenirPreferences(utilisateurId);

    const payload: Record<string, any> = {
      date_modification: new Date() as any,
    };

    if (dto.email_actif !== undefined) payload.email_actif = dto.email_actif;
    if (dto.sms_actif !== undefined) payload.sms_actif = dto.sms_actif;
    if (dto.push_actif !== undefined) payload.push_actif = dto.push_actif;
    if (dto.whatsapp_actif !== undefined) payload.whatsapp_actif = dto.whatsapp_actif;

    const prefsMisesAJour = await this.prisma.orm.public.PreferenceNotification
      .where((p) => p.utilisateur_id.eq(utilisateurId))
      .update(payload as any);

    return serialiserDonnees(prefsMisesAJour);
  }
}
