import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FiltreTransactionsDto } from './dto/filtre-transactions.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';
import { compterLignes } from '../../common/utils/compteur.util.js';

function genererReferenceTransaction(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const alea = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ts}-${alea}`;
}

@Injectable()
export class PortefeuilleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère ou initialise de façon atomique le portefeuille du propriétaire (particulier ou entreprise).
   */
  async obtenirPortefeuillePourProprietaire(
    utilisateur: { id: bigint; role: string },
    clientTx?: any,
  ) {
    const prisma = clientTx || this.prisma;

    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await prisma.orm.public.Entreprise
        .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
        .first();

      if (!entreprise) {
        throw new ForbiddenException('Compte entreprise introuvable pour cet utilisateur.');
      }

      let portefeuille = await prisma.orm.public.Portefeuille
        .where((p: any) => p.entreprise_id.eq(entreprise.id))
        .first();

      if (!portefeuille) {
        portefeuille = await prisma.orm.public.Portefeuille.create({
          entreprise_id: entreprise.id as any,
          utilisateur_id: null as any,
          solde: '0' as any,
          devise: 'XAF' as any,
          statut: 'ACTIF' as any,
        });
      }

      return portefeuille;
    }

    // Particulier (ou administrateur)
    let portefeuille = await prisma.orm.public.Portefeuille
      .where((p: any) => p.utilisateur_id.eq(utilisateur.id))
      .first();

    if (!portefeuille) {
      portefeuille = await prisma.orm.public.Portefeuille.create({
        utilisateur_id: utilisateur.id as any,
        entreprise_id: null as any,
        solde: '0' as any,
        devise: 'XAF' as any,
        statut: 'ACTIF' as any,
      });
    }

    return portefeuille;
  }

  /**
   * Consultation du portefeuille de l'utilisateur connecté.
   */
  async consulterPortefeuille(utilisateur: { id: bigint; role: string }) {
    const portefeuille = await this.obtenirPortefeuillePourProprietaire(utilisateur);
    return {
      id: portefeuille.id,
      solde: Number(portefeuille.solde),
      devise: portefeuille.devise,
      statut: portefeuille.statut,
      date_modification: portefeuille.date_modification,
    };
  }

  /**
   * Crédit atomique et traçable du portefeuille.
   */
  async crediter(
    portefeuilleId: bigint,
    montant: number,
    motif: string,
    reference?: string,
    clientTx?: any,
  ) {
    if (montant <= 0) {
      throw new BadRequestException('Le montant à créditer doit être strictement positif.');
    }

    const executer = async (tx: any) => {
      const portefeuille = await tx.orm.public.Portefeuille
        .where((p: any) => p.id.eq(portefeuilleId))
        .first();

      if (!portefeuille) {
        throw new NotFoundException('Portefeuille introuvable.');
      }

      if (portefeuille.statut !== 'ACTIF') {
        throw new ForbiddenException(
          `Opération impossible : le portefeuille est ${portefeuille.statut}.`,
        );
      }

      const soldeActuel = Number(portefeuille.solde);
      const soldeApres = Math.round((soldeActuel + montant) * 100) / 100;

      const refTransaction =
        reference || genererReferenceTransaction('TX-CR');

      // 1. Enregistrement de la trace de transaction
      const transaction = await tx.orm.public.TransactionPortefeuille.create({
        portefeuille_id: portefeuilleId as any,
        montant: montant.toString() as any,
        sens: 'CREDIT' as any,
        motif: motif.trim() as any,
        reference: refTransaction as any,
        solde_apres: soldeApres.toString() as any,
      });

      // 2. Mise à jour atomique conditionnelle du solde
      const portefeuilleMisAJour = await tx.orm.public.Portefeuille
        .where((p: any) => p.id.eq(portefeuilleId).and(p.solde.eq(portefeuille.solde)))
        .update({
          solde: soldeApres.toString() as any,
          date_modification: new Date(),
        } as any);

      if (!portefeuilleMisAJour) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CONCURRENCE_PORTEFEUILLE',
          message: 'Le solde du portefeuille a été modifié simultanément par une autre opération. Veuillez réessayer.',
        });
      }

      return {
        transaction,
        portefeuille: portefeuilleMisAJour,
        solde: soldeApres,
      };
    };

    if (clientTx) {
      return executer(clientTx);
    }
    return this.prisma.transaction(executer);
  }

  /**
   * Débit atomique du portefeuille avec protection contre les découverts et la concurrence.
   * Lève une exception FONDS_INSUFFISANTS sans débit partiel si le solde est inférieur au montant.
   */
  async debiter(
    portefeuilleId: bigint,
    montant: number,
    motif: string,
    reference?: string,
    clientTx?: any,
  ) {
    if (montant <= 0) {
      throw new BadRequestException('Le montant à débiter doit être strictement positif.');
    }

    const executer = async (tx: any) => {
      const portefeuille = await tx.orm.public.Portefeuille
        .where((p: any) => p.id.eq(portefeuilleId))
        .first();

      if (!portefeuille) {
        throw new NotFoundException('Portefeuille introuvable.');
      }

      if (portefeuille.statut !== 'ACTIF') {
        throw new ForbiddenException(
          `Opération impossible : le portefeuille est ${portefeuille.statut}.`,
        );
      }

      const soldeActuel = Number(portefeuille.solde);

      // Protection stricte : aucun débit partiel si solde insuffisant
      if (soldeActuel < montant) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'FONDS_INSUFFISANTS',
          message: 'Fonds insuffisants sur le portefeuille pour effectuer ce débit.',
          solde_disponible: soldeActuel,
          montant_requis: montant,
        });
      }

      const soldeApres = Math.round((soldeActuel - montant) * 100) / 100;

      const refTransaction =
        reference || genererReferenceTransaction('TX-DB');

      // 1. Enregistrement de la trace de transaction
      const transaction = await tx.orm.public.TransactionPortefeuille.create({
        portefeuille_id: portefeuilleId as any,
        montant: montant.toString() as any,
        sens: 'DEBIT' as any,
        motif: motif.trim() as any,
        reference: refTransaction as any,
        solde_apres: soldeApres.toString() as any,
      });

      // 2. Mise à jour atomique conditionnelle du solde (protection contre les modifications concurrentes)
      const portefeuilleMisAJour = await tx.orm.public.Portefeuille
        .where((p: any) => p.id.eq(portefeuilleId).and(p.solde.eq(portefeuille.solde)))
        .update({
          solde: soldeApres.toString() as any,
          date_modification: new Date(),
        } as any);

      if (!portefeuilleMisAJour) {
        throw new ConflictException({
          statusCode: 409,
          code: 'CONCURRENCE_PORTEFEUILLE',
          message: 'Le solde du portefeuille a été modifié simultanément par une autre opération. Veuillez réessayer.',
        });
      }

      return {
        transaction,
        portefeuille: portefeuilleMisAJour,
        solde: soldeApres,
      };
    };

    if (clientTx) {
      return executer(clientTx);
    }
    return this.prisma.transaction(executer);
  }

  /**
   * Historique paginé des transactions du portefeuille de l'utilisateur.
   */
  async listerTransactions(
    utilisateur: { id: bigint; role: string },
    filtre: FiltreTransactionsDto,
  ): Promise<ResultatPagine<any>> {
    const portefeuille = await this.obtenirPortefeuillePourProprietaire(utilisateur);

    let query: any = this.prisma.orm.public.TransactionPortefeuille
      .where((t: any) => t.portefeuille_id.eq(portefeuille.id));

    if (filtre.sens && filtre.sens !== 'TOUS') {
      query = query.where((t: any) => t.sens.eq(filtre.sens));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'montant', 'date_creation', 'sens'],
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

