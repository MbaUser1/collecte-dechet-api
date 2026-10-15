import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FiltreRecompensesDto,
  FiltreTransactionsPointsDto,
  CreerRecompenseDto,
  ModifierRecompenseDto,
} from './dto/recompenses.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';
import { compterLignes } from '../../common/utils/compteur.util.js';

@Injectable()
export class RecompensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcul du solde de points civiques et historique paginé des mouvements.
   */
  async obtenirSoldeEtHistoriquePoints(
    utilisateurId: bigint,
    filtre: FiltreTransactionsPointsDto,
  ) {
    // Calcul direct du solde total
    const toutesTransactions = await this.prisma.orm.public.TransactionPoints
      .where((t: any) => t.utilisateur_id.eq(utilisateurId))
      .all();

    const soldePoints = toutesTransactions.reduce((acc: number, t: any) => {
      return t.sens === 'CREDIT' ? acc + t.points : acc - t.points;
    }, 0);

    // Requête paginée pour l'historique
    let query: any = this.prisma.orm.public.TransactionPoints
      .where((t: any) => t.utilisateur_id.eq(utilisateurId));

    if (filtre.sens && filtre.sens !== 'TOUS') {
      query = query.where((t: any) => t.sens.eq(filtre.sens));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'points', 'date_creation', 'sens'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((t: any) =>
      estDesc ? t[champTri].desc() : t[champTri].asc(),
    );

    const elements = await query
      .limit(filtre.limite)
      .offset(filtre.offset)
      .all();

    return {
      solde_points: soldePoints,
      transactions: {
        elements,
        pagination: {
          total,
          page: filtre.page,
          limite: filtre.limite,
          pages_totales: Math.ceil(total / filtre.limite) || 1,
        },
      },
    };
  }

  /**
   * Consultation du catalogue public des récompenses disponibles en stock.
   */
  async listerRecompensesDisponibles(
    filtre: FiltreRecompensesDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Recompense
      .where((r: any) => r.statut.eq('ACTIF'))
      .where((r: any) => r.stock.gt(0));

    if (filtre.partenaire_id) {
      query = query.where((r: any) => r.partenaire_id.eq(BigInt(filtre.partenaire_id!)));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'points_requis', 'titre', 'date_creation'],
      'points_requis',
    );
    const estDesc = (filtre.ordre || 'asc').toLowerCase() === 'desc';

    query = query.orderBy((r: any) =>
      estDesc ? r[champTri].desc() : r[champTri].asc(),
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
   * Détail d'une récompense par son identifiant.
   */
  async obtenirRecompenseParId(id: bigint) {
    const recompense = await this.prisma.orm.public.Recompense
      .where((r: any) => r.id.eq(id))
      .first();

    if (!recompense) {
      throw new NotFoundException('Récompense introuvable.');
    }

    const partenaire = await this.prisma.orm.public.Partenaire
      .where((p: any) => p.id.eq(recompense.partenaire_id))
      .first();

    return {
      ...recompense,
      partenaire,
    };
  }

  /**
   * Réclamation atomique d'une récompense : vérification du solde, décrément de stock,
   * création du bon unique et débit traçable des points.
   */
  async reclamerRecompense(
    recompenseId: bigint,
    utilisateurId: bigint,
  ) {
    return this.prisma.transaction(async (tx: any) => {
      const recompense = await tx.orm.public.Recompense
        .where((r: any) => r.id.eq(recompenseId))
        .first();

      if (!recompense) {
        throw new NotFoundException('Récompense introuvable.');
      }

      if (recompense.statut !== 'ACTIF') {
        throw new BadRequestException('Cette récompense n’est plus active.');
      }

      if (recompense.stock <= 0) {
        throw new ConflictException({
          statusCode: 409,
          code: 'STOCK_EPUISE',
          message: 'Le stock de cette récompense est actuellement épuisé.',
        });
      }

      // 1. Contrôle du solde de points actuel
      const transactions = await tx.orm.public.TransactionPoints
        .where((t: any) => t.utilisateur_id.eq(utilisateurId))
        .all();

      const soldePoints = transactions.reduce((acc: number, t: any) => {
        return t.sens === 'CREDIT' ? acc + t.points : acc - t.points;
      }, 0);

      if (soldePoints < recompense.points_requis) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'POINTS_INSUFFISANTS',
          message: 'Solde de points civiques insuffisant pour réclamer cette récompense.',
          solde_actuel: soldePoints,
          points_requis: recompense.points_requis,
        });
      }

      // 2. Décrémenter le stock
      const nouveauStock = recompense.stock - 1;
      await tx.orm.public.Recompense
        .where((r: any) => r.id.eq(recompense.id))
        .update({
          stock: nouveauStock,
          date_modification: new Date(),
        } as any);

      // 3. Créer le bon de réclamation avec code unique
      const dateExpiration = new Date(Date.now() + 30 * 24 * 3600 * 1000); // 30 jours
      const codeUnique = `REC-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

      const reclamation = await tx.orm.public.ReclamationRecompense.create({
        utilisateur_id: utilisateurId as any,
        recompense_id: recompense.id as any,
        points_utilises: recompense.points_requis,
        code_reclamation: codeUnique as any,
        statut: 'RESERVEE' as any,
        date_expiration: dateExpiration as any,
      });

      // 4. Enregistrer la trace de transaction de points
      await tx.orm.public.TransactionPoints.create({
        utilisateur_id: utilisateurId as any,
        points: recompense.points_requis,
        sens: 'DEBIT' as any,
        motif: `Échange récompense #${recompense.id} : ${recompense.titre}` as any,
        reclamation_recompense_id: reclamation.id as any,
      });

      return {
        succes: true,
        message: 'Récompense réclamée avec succès ! Présentez votre code au partenaire.',
        reclamation,
        solde_restant: soldePoints - recompense.points_requis,
      };
    });
  }

  /**
   * Consultation de ses réclamations de récompenses.
   */
  async listerMesReclamations(
    utilisateurId: bigint,
    filtre: FiltreRecompensesDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.ReclamationRecompense
      .where((r: any) => r.utilisateur_id.eq(utilisateurId));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((r: any) => r.statut.eq(filtre.statut));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_creation', 'date_expiration', 'statut'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((r: any) =>
      estDesc ? r[champTri].desc() : r[champTri].asc(),
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
   * Administration : création d'une nouvelle récompense.
   */
  async creerRecompense(dto: CreerRecompenseDto) {
    const partenaire = await this.prisma.orm.public.Partenaire
      .where((p: any) => p.id.eq(BigInt(dto.partenaire_id)))
      .first();

    if (!partenaire) {
      throw new NotFoundException('Partenaire introuvable.');
    }

    const recompense = await this.prisma.orm.public.Recompense.create({
      partenaire_id: BigInt(dto.partenaire_id) as any,
      titre: dto.titre.trim() as any,
      description: (dto.description ?? null) as any,
      points_requis: dto.points_requis,
      stock: dto.stock,
      valeur_monetaire: (dto.valeur_monetaire !== undefined ? dto.valeur_monetaire.toString() : null) as any,
      statut: 'ACTIF' as any,
      date_debut: (dto.date_debut ?? null) as any,
      date_fin: (dto.date_fin ?? null) as any,
    });

    return {
      succes: true,
      message: 'Récompense créée avec succès dans le catalogue.',
      recompense,
    };
  }

  /**
   * Administration : mise à jour d'une récompense.
   */
  async modifierRecompense(id: bigint, dto: ModifierRecompenseDto) {
    const existante = await this.prisma.orm.public.Recompense
      .where((r: any) => r.id.eq(id))
      .first();

    if (!existante) {
      throw new NotFoundException('Récompense introuvable.');
    }

    const payload: any = { date_modification: new Date() };
    if (dto.titre !== undefined) payload.titre = dto.titre.trim();
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.points_requis !== undefined) payload.points_requis = dto.points_requis;
    if (dto.stock !== undefined) payload.stock = dto.stock;
    if (dto.valeur_monetaire !== undefined) payload.valeur_monetaire = dto.valeur_monetaire.toString();
    if (dto.statut !== undefined) payload.statut = dto.statut;
    if (dto.date_debut !== undefined) payload.date_debut = dto.date_debut;
    if (dto.date_fin !== undefined) payload.date_fin = dto.date_fin;

    const modifiee = await this.prisma.orm.public.Recompense
      .where((r: any) => r.id.eq(id))
      .update(payload);

    return {
      succes: true,
      message: 'Récompense mise à jour.',
      recompense: modifiee,
    };
  }

  /**
   * Administration : ajustement manuel du stock d'une récompense.
   */
  async ajusterStock(id: bigint, delta: number) {
    return this.prisma.transaction(async (tx: any) => {
      const recompense = await tx.orm.public.Recompense
        .where((r: any) => r.id.eq(id))
        .first();

      if (!recompense) {
        throw new NotFoundException('Récompense introuvable.');
      }

      const nouveauStock = recompense.stock + delta;
      if (nouveauStock < 0) {
        throw new BadRequestException('Le stock ne peut pas devenir négatif.');
      }

      const maj = await tx.orm.public.Recompense
        .where((r: any) => r.id.eq(id))
        .update({
          stock: nouveauStock,
          date_modification: new Date(),
        } as any);

      return {
        succes: true,
        message: `Stock ajusté de ${delta > 0 ? '+' + delta : delta}. Nouveau stock: ${nouveauStock}.`,
        recompense: maj,
      };
    });
  }

  /**
   * Administration / Partenaire : validation d'un bon de réclamation présenté par un citoyen.
   */
  async validerUtilisationReclamation(codeReclamation: string) {
    return this.prisma.transaction(async (tx: any) => {
      const codeNormalise = codeReclamation.trim().toUpperCase();
      const reclamation = await tx.orm.public.ReclamationRecompense
        .where((r: any) => r.code_reclamation.eq(codeNormalise))
        .first();

      if (!reclamation) {
        throw new NotFoundException('Bon de réclamation introuvable.');
      }

      if (reclamation.statut === 'UTILISEE') {
        return {
          succes: true,
          message: 'Ce bon a déjà été utilisé.',
          reclamation,
        };
      }

      if (reclamation.statut !== 'RESERVEE') {
        throw new BadRequestException(`Ce bon ne peut pas être validé (statut actuel: ${reclamation.statut}).`);
      }

      // Vérifier l'expiration
      if (new Date(reclamation.date_expiration) < new Date()) {
        await tx.orm.public.ReclamationRecompense
          .where((r: any) => r.id.eq(reclamation.id).and(r.statut.eq('RESERVEE')))
          .update({ statut: 'EXPIREE', date_modification: new Date() } as any);

        throw new BadRequestException('Ce bon de réclamation a expiré.');
      }

      const maintenant = new Date();
      const maj = await tx.orm.public.ReclamationRecompense
        .where((r: any) => r.id.eq(reclamation.id).and(r.statut.eq('RESERVEE')))
        .update({
          statut: 'UTILISEE',
          date_utilisation: maintenant,
          date_modification: maintenant,
        } as any);

      if (!maj) {
        throw new ConflictException({
          statusCode: 409,
          code: 'BON_DEJA_UTILISE',
          message: 'Ce bon a déjà été utilisé ou mis à jour concurremment.',
        });
      }

      return {
        succes: true,
        message: 'Bon de réclamation validé avec succès. Récompense remise au client.',
        reclamation: maj,
      };
    });
  }

  /**
   * Administration : annulation d'une réclamation et restitution des points et du stock.
   */
  async annulerReclamation(codeReclamation: string, motif?: string) {
    return this.prisma.transaction(async (tx: any) => {
      const codeNormalise = codeReclamation.trim().toUpperCase();
      const reclamation = await tx.orm.public.ReclamationRecompense
        .where((r: any) => r.code_reclamation.eq(codeNormalise))
        .first();

      if (!reclamation) {
        throw new NotFoundException('Bon de réclamation introuvable.');
      }

      if (reclamation.statut === 'ANNULEE') {
        return {
          succes: true,
          message: 'Ce bon est déjà annulé.',
          reclamation,
        };
      }

      if (reclamation.statut === 'UTILISEE') {
        throw new BadRequestException('Impossible d’annuler une récompense déjà utilisée.');
      }

      const maintenant = new Date();

      // 1. Mettre à jour la réclamation de manière strictement atomique
      const maj = await tx.orm.public.ReclamationRecompense
        .where((r: any) => r.id.eq(reclamation.id).and(r.statut.eq('RESERVEE')))
        .update({
          statut: 'ANNULEE',
          date_modification: maintenant,
        } as any);

      if (!maj) {
        throw new ConflictException({
          statusCode: 409,
          code: 'BON_DEJA_ANNULE',
          message: 'Ce bon n’est plus en état d’être annulé (déjà traité par une autre opération).',
        });
      }

      // 2. Restaurer le stock
      const recompense = await tx.orm.public.Recompense
        .where((r: any) => r.id.eq(reclamation.recompense_id))
        .first();

      if (recompense) {
        await tx.orm.public.Recompense
          .where((r: any) => r.id.eq(recompense.id))
          .update({
            stock: recompense.stock + 1,
            date_modification: maintenant,
          } as any);
      }

      // 3. Recréditer les points au citoyen
      await tx.orm.public.TransactionPoints.create({
        utilisateur_id: reclamation.utilisateur_id as any,
        points: reclamation.points_utilises,
        sens: 'CREDIT' as any,
        motif: `Remboursement annulation bon #${reclamation.code_reclamation}${motif ? ' : ' + motif : ''}` as any,
        reclamation_recompense_id: reclamation.id as any,
      });

      return {
        succes: true,
        message: 'Réclamation annulée. Points restitués et stock restauré.',
        reclamation: maj,
      };
    });
  }
}

