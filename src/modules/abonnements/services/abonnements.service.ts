import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { QuotaService } from './quota.service.js';
import { SouscrireAbonnementDto } from '../dto/souscrire-abonnement.dto.js';
import { FiltreAbonnementsDto } from '../dto/filtre-abonnements.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../../common/dto/pagination-query.dto.js';

@Injectable()
export class AbonnementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotaService: QuotaService,
  ) {}

  /**
   * Souscription à un plan d'abonnement.
   * Exclusivement réservée aux particuliers.
   */
  async souscrire(
    dto: SouscrireAbonnementDto,
    utilisateur: { id: bigint; role: string },
  ) {
    if (utilisateur.role !== 'PARTICULIER') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ABONNEMENT_NON_AUTORISE',
        message:
          'La souscription à un abonnement est exclusivement réservée aux comptes PARTICULIER.',
      });
    }

    const planId = BigInt(dto.plan_abonnement_id);
    const plan = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(planId))
      .first();

    if (!plan) {
      throw new NotFoundException("Plan d'abonnement introuvable.");
    }

    if (plan.statut !== 'ACTIF') {
      throw new BadRequestException("Ce plan d'abonnement n'est plus actif.");
    }

    // Interdire plusieurs abonnements actifs simultanés pour le même particulier
    const abonnementActif = await this.prisma.orm.public.Abonnement
      .where((a: any) => a.utilisateur_id.eq(utilisateur.id))
      .where((a: any) => a.statut.eq('ACTIF'))
      .first();

    if (abonnementActif) {
      throw new ConflictException(
        'Vous possédez déjà un abonnement actif. Vous devez attendre son expiration ou l’annuler avant de souscrire un nouveau plan.',
      );
    }

    // Période prévisionnelle basée sur la durée du plan (activation effective après paiement)
    const dateDebut = new Date();
    const dateFin = new Date(Date.now() + plan.duree_jours * 24 * 3600 * 1000);

    const nouvelAbonnement = await this.prisma.orm.public.Abonnement.create({
      utilisateur_id: utilisateur.id as any,
      plan_abonnement_id: plan.id as any,
      prix: plan.prix.toString() as any,
      nombre_collectes_incluses: plan.nombre_collectes_incluses as any,
      nombre_collectes_utilisees: 0 as any,
      nombre_collectes_reservees: 0 as any,
      poids_max_par_collecte: plan.poids_max_par_collecte.toString() as any,
      date_debut: dateDebut as any,
      date_fin: dateFin as any,
      statut: 'EN_ATTENTE_PAIEMENT' as any,
    });

    const quota = this.quotaService.calculerDisponibilite(nouvelAbonnement);

    return {
      abonnement: {
        ...nouvelAbonnement,
        plan: {
          id: plan.id,
          nom: plan.nom,
          description: plan.description,
          duree_jours: plan.duree_jours,
        },
        quota,
      },
      message:
        'Souscription enregistrée avec succès. L’abonnement sera activé dès réception de la confirmation de paiement.',
    };
  }

  /**
   * Point d'intégration pour la future phase financière :
   * Active l'abonnement après paiement confirmé et démarre sa période d'utilisation.
   */
  async activerAbonnementApresPaiement(abonnementId: bigint, clientTx?: any) {
    const prisma = clientTx || this.prisma;

    const abonnement = await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(abonnementId))
      .first();

    if (!abonnement) {
      throw new NotFoundException('Abonnement introuvable.');
    }

    if (abonnement.statut !== 'EN_ATTENTE_PAIEMENT') {
      throw new BadRequestException(
        `Impossible d'activer un abonnement avec le statut '${abonnement.statut}'.`,
      );
    }

    const plan = await prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(abonnement.plan_abonnement_id))
      .first();

    const dateDebut = new Date();
    const dateFin = new Date(Date.now() + (plan ? plan.duree_jours : 30) * 24 * 3600 * 1000);

    const abonnementActive = await prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(abonnementId))
      .update({
        statut: 'ACTIF',
        date_debut: dateDebut,
        date_fin: dateFin,
        date_modification: new Date(),
      } as any);

    return abonnementActive;
  }

  /**
   * Récupère l'abonnement courant de l'utilisateur avec le détail de ses quotas.
   */
  async obtenirAbonnementCourant(utilisateurId: bigint) {
    // 1. Chercher un abonnement actif en priorité
    let abonnement = await this.prisma.orm.public.Abonnement
      .where((a: any) => a.utilisateur_id.eq(utilisateurId))
      .where((a: any) => a.statut.eq('ACTIF'))
      .first();

    // 2. Sinon, le dernier abonnement créé (ex: en attente de paiement)
    if (!abonnement) {
      abonnement = await this.prisma.orm.public.Abonnement
        .where((a: any) => a.utilisateur_id.eq(utilisateurId))
        .orderBy((a: any) => a.date_creation.desc())
        .first();
    }

    if (!abonnement) {
      throw new NotFoundException('Aucun abonnement trouvé pour votre compte.');
    }

    const plan = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(abonnement.plan_abonnement_id))
      .first();

    const quota = this.quotaService.calculerDisponibilite(abonnement);

    return {
      ...abonnement,
      plan,
      quota,
    };
  }

  /**
   * Historique des abonnements de l'utilisateur.
   */
  async listerHistorique(
    utilisateurId: bigint,
    filtre: FiltreAbonnementsDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Abonnement
      .where((a: any) => a.utilisateur_id.eq(utilisateurId));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((a: any) => a.statut.eq(filtre.statut));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_creation', 'date_debut', 'statut'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((a: any) =>
      estDesc ? a[champTri].desc() : a[champTri].asc(),
    );

    const elements = await query
      .limit(filtre.limite)
      .offset(filtre.offset)
      .all();

    return {
      elements,
      pagination: {
        total,
        page: filtre.page,
        limite: filtre.limite,
        pages_totales: Math.ceil(total / filtre.limite) || 1,
      },
    };
  }

  /**
   * Consultation d'un abonnement avec contrôle de propriété strict.
   */
  async obtenirAbonnementParId(
    id: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    const abonnement = await this.prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(id))
      .first();

    if (!abonnement) {
      throw new NotFoundException('Abonnement introuvable.');
    }

    if (
      utilisateur.role !== 'ADMINISTRATEUR' &&
      abonnement.utilisateur_id !== utilisateur.id
    ) {
      throw new ForbiddenException('Accès refusé à cet abonnement.');
    }

    const plan = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(abonnement.plan_abonnement_id))
      .first();

    const quota = this.quotaService.calculerDisponibilite(abonnement);

    return {
      ...abonnement,
      plan,
      quota,
    };
  }

  /**
   * Demande d'annulation d'un abonnement selon les règles d'intégrité métier.
   */
  async annulerAbonnement(
    id: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    const abonnement = await this.obtenirAbonnementParId(id, utilisateur);

    if (abonnement.statut === 'ANNULE') {
      return { message: 'Cet abonnement est déjà annulé.' };
    }

    if (abonnement.statut === 'EXPIRE') {
      throw new BadRequestException('Impossible d’annuler un abonnement déjà expiré.');
    }

    if (abonnement.statut === 'ACTIF') {
      // Bloquer l'annulation si des collectes sont actuellement réservées en cours
      if (Number(abonnement.nombre_collectes_reservees) > 0) {
        throw new BadRequestException(
          'Impossible d’annuler un abonnement ayant des collectes en cours de réservation.',
        );
      }
    }

    const abonnementAnnule = await this.prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(id))
      .update({
        statut: 'ANNULE',
        date_modification: new Date(),
      } as any);

    return {
      abonnement: abonnementAnnule,
      message: 'Abonnement annulé avec succès.',
    };
  }
}

