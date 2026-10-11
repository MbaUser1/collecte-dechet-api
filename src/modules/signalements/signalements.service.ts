import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreerSignalementDto } from './dto/creer-signalement.dto.js';
import { FiltreSignalementsDto } from './dto/filtre-signalements.dto.js';
import {
  ValiderSignalementDto,
  RejeterSignalementDto,
  ResoudreSignalementDto,
} from './dto/actions-signalement.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';

@Injectable()
export class SignalementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Création d'un signalement citoyen de déchet ou dépôt sauvage.
   */
  async creerSignalement(
    dto: CreerSignalementDto,
    utilisateur: { id: bigint; role: string },
  ) {
    if (dto.latitude !== undefined && (dto.latitude < -90 || dto.latitude > 90)) {
      throw new BadRequestException('La latitude doit être comprise entre -90 et 90.');
    }
    if (dto.longitude !== undefined && (dto.longitude < -180 || dto.longitude > 180)) {
      throw new BadRequestException('La longitude doit être comprise entre -180 et 180.');
    }

    const signalement = await this.prisma.orm.public.Signalement.create({
      utilisateur_id: utilisateur.id as any,
      description: dto.description.trim() as any,
      adresse: dto.adresse.trim() as any,
      ville: dto.ville.trim() as any,
      quartier: dto.quartier.trim() as any,
      latitude: (dto.latitude ?? null) as any,
      longitude: (dto.longitude ?? null) as any,
      photo: (dto.photo ?? null) as any,
      statut: 'SOUMIS' as any,
      points_attribues: 0,
    });

    return {
      succes: true,
      message: 'Signalement citoyen enregistré avec succès.',
      signalement,
    };
  }

  /**
   * Consultation de ses propres signalements par le citoyen.
   */
  async listerMesSignalements(
    utilisateurId: bigint,
    filtre: FiltreSignalementsDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Signalement
      .where((s: any) => s.utilisateur_id.eq(utilisateurId));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((s: any) => s.statut.eq(filtre.statut));
    }

    if (filtre.ville) {
      query = query.where((s: any) => s.ville.ilike(`%${filtre.ville}%`));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_creation', 'statut', 'ville'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((s: any) =>
      estDesc ? s[champTri].desc() : s[champTri].asc(),
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
   * Consultation d'un signalement spécifique avec contrôle des droits.
   */
  async obtenirSignalementParId(
    id: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    const signalement = await this.prisma.orm.public.Signalement
      .where((s: any) => s.id.eq(id))
      .first();

    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }

    if (
      utilisateur.role !== 'ADMINISTRATEUR' &&
      signalement.utilisateur_id !== utilisateur.id
    ) {
      throw new ForbiddenException('Accès refusé à ce signalement.');
    }

    return signalement;
  }

  /**
   * Liste complète de tous les signalements pour l'administration.
   */
  async listerTousSignalementsAdmin(
    filtre: FiltreSignalementsDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Signalement;

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((s: any) => s.statut.eq(filtre.statut));
    }

    if (filtre.ville) {
      query = query.where((s: any) => s.ville.ilike(`%${filtre.ville}%`));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_creation', 'statut', 'ville'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((s: any) =>
      estDesc ? s[champTri].desc() : s[champTri].asc(),
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
   * Validation d'un signalement par l'administrateur.
   */
  async validerSignalement(
    id: bigint,
    dto: ValiderSignalementDto,
    adminId: bigint,
  ) {
    const signalement = await this.prisma.orm.public.Signalement
      .where((s: any) => s.id.eq(id))
      .first();

    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }

    if (signalement.statut === 'VALIDE' || signalement.statut === 'NETTOYE') {
      return {
        succes: true,
        message: 'Ce signalement est déjà validé.',
        signalement,
      };
    }

    if (signalement.statut === 'REJETE') {
      throw new BadRequestException('Impossible de valider un signalement déjà rejeté.');
    }

    return this.prisma.transaction(async (tx: any) => {
      const maintenant = new Date();
      const points = dto.points_a_attribuer || 0;

      const maj = await tx.orm.public.Signalement
        .where((s: any) => s.id.eq(id))
        .update({
          statut: 'VALIDE',
          validateur_id: adminId as any,
          date_validation: maintenant,
          notes_administrateur: (dto.notes_administrateur ?? signalement.notes_administrateur) as any,
          points_attribues: points,
          date_modification: maintenant,
        } as any);

      // Attribution immédiate de points pour le signalement civique si spécifié
      if (points > 0) {
        await tx.orm.public.TransactionPoints.create({
          utilisateur_id: signalement.utilisateur_id as any,
          points: points,
          sens: 'CREDIT' as any,
          motif: `Validation signalement civique #${signalement.id}` as any,
          signalement_id: signalement.id as any,
        });
      }

      return {
        succes: true,
        message: 'Signalement validé avec succès.',
        signalement: maj,
      };
    });
  }

  /**
   * Rejet d'un signalement avec motif obligatoire.
   */
  async rejeterSignalement(
    id: bigint,
    dto: RejeterSignalementDto,
    adminId: bigint,
  ) {
    const signalement = await this.prisma.orm.public.Signalement
      .where((s: any) => s.id.eq(id))
      .first();

    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }

    if (signalement.statut === 'NETTOYE') {
      throw new BadRequestException('Impossible de rejeter un signalement déjà résolu et nettoyé.');
    }

    if (signalement.statut === 'REJETE') {
      return {
        succes: true,
        message: 'Ce signalement est déjà rejeté.',
        signalement,
      };
    }

    const maintenant = new Date();
    const maj = await this.prisma.orm.public.Signalement
      .where((s: any) => s.id.eq(id))
      .update({
        statut: 'REJETE',
        validateur_id: adminId as any,
        date_validation: maintenant,
        notes_administrateur: `REJET: ${dto.motif}` as any,
        date_modification: maintenant,
      } as any);

    return {
      succes: true,
      message: 'Signalement rejeté.',
      signalement: maj,
    };
  }

  /**
   * Clôture et résolution citoyenne : passage à NETTOYE et attribution des points.
   */
  async resoudreSignalement(
    id: bigint,
    dto: ResoudreSignalementDto,
    adminId: bigint,
  ) {
    const signalement = await this.prisma.orm.public.Signalement
      .where((s: any) => s.id.eq(id))
      .first();

    if (!signalement) {
      throw new NotFoundException('Signalement introuvable.');
    }

    if (signalement.statut === 'NETTOYE') {
      return {
        succes: true,
        message: 'Ce signalement a déjà été marqué comme nettoyé et récompensé.',
        signalement,
      };
    }

    if (signalement.statut !== 'VALIDE') {
      throw new BadRequestException(
        `Seul un signalement au statut VALIDE peut être résolu comme nettoyé (statut actuel: ${signalement.statut}).`,
      );
    }

    return this.prisma.transaction(async (tx: any) => {
      const maintenant = new Date();
      const points = dto.points_a_attribuer;

      const maj = await tx.orm.public.Signalement
        .where((s: any) => s.id.eq(id))
        .update({
          statut: 'NETTOYE',
          validateur_id: adminId as any,
          date_validation: maintenant,
          notes_administrateur: (dto.notes_administrateur ?? 'Nettoyage citoyen vérifié') as any,
          points_attribues: (signalement.points_attribues + points) as any,
          date_modification: maintenant,
        } as any);

      // Attribution des points citoyens
      await tx.orm.public.TransactionPoints.create({
        utilisateur_id: signalement.utilisateur_id as any,
        points: points,
        sens: 'CREDIT' as any,
        motif: `Résolution & nettoyage signalement #${signalement.id}` as any,
        signalement_id: signalement.id as any,
      });

      return {
        succes: true,
        message: 'Signalement résolu avec succès. Points civiques crédités à l’auteur.',
        signalement: maj,
      };
    });
  }

  /**
   * Collectes communautaires : liste paginée des chantiers citoyens ouverts (statut VALIDE).
   */
  async listerCollectesCommunautaires(
    filtre: FiltreSignalementsDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Signalement
      .where((s: any) => s.statut.eq('VALIDE'));

    if (filtre.ville) {
      query = query.where((s: any) => s.ville.ilike(`%${filtre.ville}%`));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_creation', 'ville'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((s: any) =>
      estDesc ? s[champTri].desc() : s[champTri].asc(),
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
   * Enregistrement atomique de la participation d'un citoyen à un chantier de nettoyage communautaire.
   * Persiste réellement l'inscription dans la table participations_collectes_communautaires.
   */
  async participerCollecteCommunautaire(
    signalementId: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    if (
      utilisateur.role !== 'PARTICULIER' &&
      utilisateur.role !== 'ENTREPRISE' &&
      utilisateur.role !== 'ADMINISTRATEUR'
    ) {
      throw new ForbiddenException('Seuls les particuliers et entreprises peuvent participer aux chantiers citoyens.');
    }

    return this.prisma.transaction(async (tx: any) => {
      const signalement = await tx.orm.public.Signalement
        .where((s: any) => s.id.eq(signalementId))
        .first();

      if (!signalement) {
        throw new NotFoundException('Collecte communautaire introuvable.');
      }

      if (signalement.statut !== 'VALIDE') {
        throw new BadRequestException('Cette collecte communautaire n’est plus ouverte aux participations.');
      }

      // Vérifier si une participation existe déjà pour cet utilisateur sur ce signalement
      const existante = await tx.orm.public.ParticipationCollecteCommunautaire
        .where((p: any) => p.signalement_id.eq(signalementId).and(p.utilisateur_id.eq(utilisateur.id)))
        .first();

      let participation: any;
      const maintenant = new Date();

      if (existante) {
        if (existante.statut === 'INSCRIT' || existante.statut === 'CONFIRME') {
          throw new ConflictException({
            statusCode: 409,
            code: 'PARTICIPATION_DEJA_ENREGISTREE',
            message: 'Vous êtes déjà inscrit à cette collecte communautaire.',
          });
        }

        // Réactivation d'une inscription précédemment annulée
        participation = await tx.orm.public.ParticipationCollecteCommunautaire
          .where((p: any) => p.id.eq(existante.id))
          .update({
            statut: 'INSCRIT',
            date_modification: maintenant,
          } as any);
      } else {
        // Nouvelle inscription persistée en base
        try {
          participation = await tx.orm.public.ParticipationCollecteCommunautaire.create({
            signalement_id: signalementId as any,
            utilisateur_id: utilisateur.id as any,
            statut: 'INSCRIT' as any,
            date_creation: maintenant as any,
            date_modification: maintenant as any,
          });
        } catch (err: any) {
          if (err?.code === 'P2002' || err?.message?.includes('unique') || err?.message?.includes('Unique')) {
            throw new ConflictException({
              statusCode: 409,
              code: 'PARTICIPATION_DEJA_ENREGISTREE',
              message: 'Vous êtes déjà inscrit à cette collecte communautaire.',
            });
          }
          throw err;
        }
      }

      return {
        succes: true,
        message: 'Participation enregistrée avec succès au chantier citoyen.',
        signalement,
        participant_id: utilisateur.id,
        participation,
      };
    });
  }

  /**
   * Annulation de la participation d'un citoyen à un chantier communautaire.
   */
  async annulerParticipation(
    signalementId: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    return this.prisma.transaction(async (tx: any) => {
      const participation = await tx.orm.public.ParticipationCollecteCommunautaire
        .where((p: any) => p.signalement_id.eq(signalementId).and(p.utilisateur_id.eq(utilisateur.id)))
        .first();

      if (!participation) {
        throw new NotFoundException('Aucune participation trouvée pour ce chantier citoyen.');
      }

      if (participation.statut === 'ANNULE') {
        return {
          succes: true,
          message: 'Votre participation est déjà annulée.',
          participation,
        };
      }

      const maintenant = new Date();
      const maj = await tx.orm.public.ParticipationCollecteCommunautaire
        .where((p: any) => p.id.eq(participation.id))
        .update({
          statut: 'ANNULE',
          date_modification: maintenant,
        } as any);

      return {
        succes: true,
        message: 'Votre participation à la collecte communautaire a été annulée.',
        participation: maj,
      };
    });
  }

  /**
   * Consultation paginée de ses propres participations aux chantiers communautaires.
   */
  async listerMesParticipations(
    utilisateurId: bigint,
    filtre: FiltreSignalementsDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.ParticipationCollecteCommunautaire
      .where((p: any) => p.utilisateur_id.eq(utilisateurId));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((p: any) => p.statut.eq(filtre.statut));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_creation', 'statut'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((p: any) =>
      estDesc ? p[champTri].desc() : p[champTri].asc(),
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
}

