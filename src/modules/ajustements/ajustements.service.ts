import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PortefeuilleService } from '../portefeuille/portefeuille.service.js';

function genererReferenceAjustement(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const alea = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ts}-${alea}`;
}

@Injectable()
export class AjustementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portefeuilleService: PortefeuilleService,
  ) {}

  /**
   * Crée un ajustement de prix débiteur en attente (ex: écart de pesée en fin de collecte).
   */
  async creerAjustementDebit(
    demandeId: bigint,
    montant: number,
    motif: string,
    clientTx?: any,
  ) {
    if (montant <= 0) {
      throw new BadRequestException('Le montant de l’ajustement doit être strictement positif.');
    }

    const prisma = clientTx || this.prisma;

    const demande = await prisma.orm.public.DemandeCollecte
      .where((d: any) => d.id.eq(demandeId))
      .first();

    if (!demande) {
      throw new NotFoundException('Demande de collecte introuvable.');
    }

    const ajustement = await prisma.orm.public.AjustementPrix.create({
      demande_collecte_id: demandeId as any,
      montant: montant.toString() as any,
      sens: 'DEBIT' as any,
      motif: motif.trim() as any,
      statut: 'EN_ATTENTE' as any,
    });

    return ajustement;
  }

  /**
   * Crée un ajustement créditeur et rembourse immédiatement le client sur son portefeuille.
   */
  async creerAjustementCreditEtRembourser(
    demandeId: bigint,
    montant: number,
    motif: string,
    paiementOrigineId?: bigint,
    clientTx?: any,
  ) {
    if (montant <= 0) {
      throw new BadRequestException('Le montant de remboursement doit être strictement positif.');
    }

    const executer = async (tx: any) => {
      const demande = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demandeId))
        .first();

      if (!demande) {
        throw new NotFoundException('Demande de collecte introuvable.');
      }

      // 1. Vérifier si un paiement d'origine est spécifié et n'est pas déjà totalement remboursé
      let paiementOrigine: any = null;
      let nouveauStatutPaiement: string | null = null;
      if (paiementOrigineId) {
        paiementOrigine = await tx.orm.public.Paiement
          .where((p: any) => p.id.eq(paiementOrigineId))
          .first();

        if (!paiementOrigine) {
          throw new NotFoundException('Paiement d’origine introuvable.');
        }

        if (paiementOrigine.statut === 'REMBOURSE') {
          throw new ConflictException({
            statusCode: 409,
            code: 'PAIEMENT_DEJA_REMBOURSE',
            message: 'Ce paiement a déjà été intégralement remboursé.',
          });
        }

        // Calculer le total déjà remboursé sur ce paiement
        const remboursementsPrecedents = await tx.orm.public.AjustementPrix
          .where((a: any) => a.paiement_id.eq(paiementOrigine.id).and(a.sens.eq('CREDIT')).and(a.statut.eq('REGLE')))
          .all();

        const dejaRembourse = remboursementsPrecedents.reduce(
          (sum: number, a: any) => sum + Number(a.montant),
          0,
        );

        const montantPaiement = Number(paiementOrigine.montant);
        const restantRemboursable = Math.max(0, Math.round((montantPaiement - dejaRembourse) * 100) / 100);

        if (montant > restantRemboursable) {
          throw new BadRequestException({
            statusCode: 400,
            code: 'MONTANT_REMBOURSEMENT_EXCESSIF',
            message: `Le montant demandé (${montant} FCFA) dépasse le solde remboursable restant (${restantRemboursable} FCFA) pour ce paiement.`,
          });
        }

        const totalApres = dejaRembourse + montant;
        nouveauStatutPaiement = totalApres >= montantPaiement ? 'REMBOURSE' : 'REMBOURSE_PARTIELLEMENT';

        // VERROUILLAGE CONCURRENTIEL ET OCC SUR LE PAIEMENT AVANT TOUTE TRANSACTION FINANCIÈRE :
        // La mise à jour conditionnelle verrouille la ligne du paiement dans PostgreSQL et valide que
        // le statut et la date_modification n'ont pas changé.
        // Si deux opérations concurrentes tentent un remboursement simultané :
        // - L'opération 1 acquiert le verrou exclusif sur la ligne et met à jour statut et date_modification.
        // - L'opération 2 est mise en attente du verrou.
        // - Dès le commit de l'opération 1, l'opération 2 réévalue son WHERE : date_modification (et statut)
        //   ayant changé, 0 ligne n'est affectée.
        // - L'opération 2 lève immédiatement ConflictException sans créditer le portefeuille ni créer d'ajustement.
        const paiementMaj = await tx.orm.public.Paiement
          .where((p: any) => {
            let predicate = p.id.eq(paiementOrigineId).and(p.statut.eq(paiementOrigine.statut));
            if (paiementOrigine.date_modification) {
              predicate = predicate.and(p.date_modification.eq(paiementOrigine.date_modification));
            }
            return predicate;
          })
          .update({
            statut: nouveauStatutPaiement as any,
            date_modification: new Date(),
          } as any);

        if (!paiementMaj) {
          throw new ConflictException({
            statusCode: 409,
            code: 'CONCURRENCE_REMBOURSEMENT',
            message: 'Ce paiement a été modifié concurremment par une autre opération.',
          });
        }
      }

      // 2. Récupérer le portefeuille de l'utilisateur ou entreprise
      const portefeuille = demande.entreprise_id
        ? await tx.orm.public.Portefeuille.where((p: any) => p.entreprise_id.eq(demande.entreprise_id)).first()
        : await tx.orm.public.Portefeuille.where((p: any) => p.utilisateur_id.eq(demande.utilisateur_id)).first();

      if (!portefeuille) {
        throw new NotFoundException('Portefeuille destinataire du remboursement introuvable.');
      }

      // 3. Créditer le portefeuille
      const refCr = genererReferenceAjustement('REMB');
      await this.portefeuilleService.crediter(
        portefeuille.id,
        montant,
        `Remboursement collecte #${demande.numero} : ${motif}`,
        refCr,
        tx,
      );

      // 4. Enregistrer l'ajustement
      const dateReglement = new Date();
      const ajustement = await tx.orm.public.AjustementPrix.create({
        demande_collecte_id: demandeId as any,
        paiement_id: (paiementOrigineId ?? null) as any,
        montant: montant.toString() as any,
        sens: 'CREDIT' as any,
        motif: motif.trim() as any,
        statut: 'REGLE' as any,
        date_reglement: dateReglement as any,
      });

      return ajustement;
    };

    if (clientTx) {
      return executer(clientTx);
    }
    return this.prisma.transaction(executer);
  }

  /**
   * Vérifie si l'utilisateur possède un ajustement débiteur non soldé (bloquant de nouvelles demandes).
   */
  async aDesAjustementsDebiteursEnAttente(
    utilisateurId: bigint,
    entrepriseId?: bigint,
  ): Promise<boolean> {
    const demandes = entrepriseId
      ? await this.prisma.orm.public.DemandeCollecte.where((d: any) => d.entreprise_id.eq(entrepriseId)).all()
      : await this.prisma.orm.public.DemandeCollecte.where((d: any) => d.utilisateur_id.eq(utilisateurId)).all();

    if (!demandes || demandes.length === 0) {
      return false;
    }

    const demandeIds = demandes.map((d: any) => d.id);
    for (const dId of demandeIds) {
      const ajustementEnAttente = await this.prisma.orm.public.AjustementPrix
        .where((a: any) => a.demande_collecte_id.eq(dId))
        .where((a: any) => a.sens.eq('DEBIT'))
        .where((a: any) => a.statut.eq('EN_ATTENTE'))
        .first();

      if (ajustementEnAttente) {
        return true;
      }
    }

    return false;
  }

  /**
   * Vérifie si une demande peut être passée à FERMEE (interdit s'il y a un débit en attente).
   */
  async peutFermerDemande(demandeId: bigint): Promise<boolean> {
    const debitEnAttente = await this.prisma.orm.public.AjustementPrix
      .where((a: any) => a.demande_collecte_id.eq(demandeId))
      .where((a: any) => a.sens.eq('DEBIT'))
      .where((a: any) => a.statut.eq('EN_ATTENTE'))
      .first();

    return !debitEnAttente;
  }

  /**
   * Règle un ajustement débiteur via le portefeuille du client.
   */
  async reglerAjustementParPortefeuille(
    ajustementId: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    return this.prisma.transaction(async (tx: any) => {
      const ajustement = await tx.orm.public.AjustementPrix
        .where((a: any) => a.id.eq(ajustementId))
        .first();

      if (!ajustement) {
        throw new NotFoundException('Ajustement tarifaire introuvable.');
      }

      if (ajustement.statut === 'REGLE') {
        return { message: 'Cet ajustement est déjà réglé.', ajustement };
      }

      if (ajustement.statut !== 'EN_ATTENTE' || ajustement.sens !== 'DEBIT') {
        throw new BadRequestException(
          `Impossible de régler cet ajustement (statut: ${ajustement.statut}, sens: ${ajustement.sens}).`,
        );
      }

      const demande = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(ajustement.demande_collecte_id))
        .first();

      if (!demande) {
        throw new NotFoundException('Demande de collecte associée introuvable.');
      }

      // Vérification propriétaire
      if (utilisateur.role === 'ENTREPRISE') {
        const entreprise = await tx.orm.public.Entreprise
          .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
          .first();

        if (!demande.entreprise_id || demande.entreprise_id !== entreprise?.id) {
          throw new ForbiddenException('Accès refusé à cet ajustement de collecte.');
        }
      } else if (utilisateur.role !== 'ADMINISTRATEUR' && demande.utilisateur_id !== utilisateur.id) {
        throw new ForbiddenException('Accès refusé à cet ajustement de collecte.');
      }

      const montantAjustement = Number(ajustement.montant);

      // 1. Débiter le portefeuille
      const portefeuille = await this.portefeuilleService.obtenirPortefeuillePourProprietaire(
        utilisateur,
        tx,
      );

      const refDeb = `AJUST-${ajustement.id}-${Date.now().toString(36).toUpperCase()}`;
      await this.portefeuilleService.debiter(
        portefeuille.id,
        montantAjustement,
        `Règlement ajustement collecte #${demande.numero}`,
        refDeb,
        tx,
      );

      // 2. Enregistrer le paiement
      const datePaiement = new Date();
      const paiement = await tx.orm.public.Paiement.create({
        reference: genererReferenceAjustement('PAY-AJUST') as any,
        utilisateur_id: utilisateur.id as any,
        demande_collecte_id: demande.id as any,
        montant: montantAjustement.toString() as any,
        devise: 'XAF' as any,
        methode: 'PORTEFEUILLE' as any,
        type: 'COLLECTE' as any,
        statut: 'PAYE' as any,
        date_paiement: datePaiement as any,
      });

      // 3. Mettre à jour l'ajustement
      const ajustementMisAJour = await tx.orm.public.AjustementPrix
        .where((a: any) => a.id.eq(ajustementId))
        .update({
          statut: 'REGLE',
          paiement_id: paiement.id,
          date_reglement: datePaiement,
          date_modification: datePaiement,
        } as any);

      return {
        ajustement: ajustementMisAJour,
        paiement,
        message: 'Ajustement réglé avec succès depuis votre portefeuille.',
      };
    });
  }
}

