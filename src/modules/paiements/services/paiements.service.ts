import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { PortefeuilleService } from '../../portefeuille/portefeuille.service.js';
import { IdempotenceService } from './idempotence.service.js';
import { FournisseurDemoService } from '../fournisseurs/fournisseur-demo.service.js';
import { AbonnementsService } from '../../abonnements/services/abonnements.service.js';
import { PayerCollecteDto } from '../dto/payer-collecte.dto.js';
import { PayerAbonnementDto } from '../dto/payer-abonnement.dto.js';
import { PayerFactureDto } from '../dto/payer-facture.dto.js';
import { RechargerPortefeuilleDto } from '../../portefeuille/dto/recharger-portefeuille.dto.js';
import { FiltrePaiementsDto } from '../dto/filtre-paiements.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../../common/dto/pagination-query.dto.js';

@Injectable()
export class PaiementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portefeuilleService: PortefeuilleService,
    private readonly idempotenceService: IdempotenceService,
    private readonly fournisseurPaiement: FournisseurDemoService,
    private readonly abonnementsService: AbonnementsService,
  ) {}

  /**
   * Paiement d'une demande de collecte.
   */
  async payerCollecte(
    dto: PayerCollecteDto,
    utilisateur: { id: bigint; role: string },
    cleIdempotence?: string,
  ) {
    if (cleIdempotence) {
      const idem = await this.idempotenceService.verifierCle(
        cleIdempotence,
        'POST',
        '/paiements/collecte',
        dto,
      );
      if (idem.estExistant) {
        return idem.reponse;
      }
    }

    const demandeId = BigInt(dto.demande_id);
    const demande = await this.prisma.orm.public.DemandeCollecte
      .where((d: any) => d.id.eq(demandeId))
      .first();

    if (!demande) {
      throw new NotFoundException('Demande de collecte introuvable.');
    }

    // Contrôle propriétaire
    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.prisma.orm.public.Entreprise
        .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
        .first();

      if (!demande.entreprise_id || demande.entreprise_id !== entreprise?.id) {
        throw new ForbiddenException('Accès refusé à cette demande de collecte.');
      }
    } else if (utilisateur.role !== 'ADMINISTRATEUR' && demande.utilisateur_id !== utilisateur.id) {
      throw new ForbiddenException('Accès refusé à cette demande de collecte.');
    }

    if (demande.statut !== 'EN_ATTENTE_PAIEMENT') {
      throw new BadRequestException(
        `La demande de collecte n'est pas en attente de paiement (statut actuel: ${demande.statut}).`,
      );
    }

    const montant = Number(demande.prix_estime);
    const ref = `PAY-COL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    let reponseFinale: any;

    if (dto.methode === 'PORTEFEUILLE') {
      reponseFinale = await this.prisma.transaction(async (tx: any) => {
        const portefeuille = await this.portefeuilleService.obtenirPortefeuillePourProprietaire(
          utilisateur,
          tx,
        );

        // Débit atomique
        await this.portefeuilleService.debiter(
          portefeuille.id,
          montant,
          `Règlement collecte #${demande.numero}`,
          ref,
          tx,
        );

        const datePaiement = new Date();
        const paiement = await tx.orm.public.Paiement.create({
          reference: ref as any,
          utilisateur_id: utilisateur.id as any,
          demande_collecte_id: demande.id as any,
          montant: montant.toString() as any,
          devise: 'XAF' as any,
          methode: 'PORTEFEUILLE' as any,
          type: 'COLLECTE' as any,
          statut: 'PAYE' as any,
          date_paiement: datePaiement as any,
        });

        const demandeMaj = await tx.orm.public.DemandeCollecte
          .where((d: any) => d.id.eq(demande.id))
          .update({
            statut: 'PAYEE',
            date_modification: datePaiement,
          } as any);

        return {
          succes: true,
          paiement,
          demande: demandeMaj,
          message: 'Collecte réglée avec succès depuis votre portefeuille.',
        };
      });
    } else {
      // Initiation fournisseur externe
      const initiation = await this.fournisseurPaiement.initierPaiement({
        reference: ref,
        montant,
        devise: 'XAF',
        telephone: dto.telephone_payeur,
        description: `Paiement collecte #${demande.numero}`,
      });

      const paiement = await this.prisma.orm.public.Paiement.create({
        reference: ref as any,
        utilisateur_id: utilisateur.id as any,
        demande_collecte_id: demande.id as any,
        montant: montant.toString() as any,
        devise: 'XAF' as any,
        methode: dto.methode as any,
        type: 'COLLECTE' as any,
        statut: initiation.statut_initial as any,
        reference_fournisseur: initiation.reference_fournisseur as any,
        donnees_fournisseur: JSON.stringify(initiation.donnees) as any,
      });

      reponseFinale = {
        succes: true,
        paiement,
        url_paiement: initiation.url_paiement,
        message: 'Paiement initié. En attente de confirmation du fournisseur.',
      };
    }

    if (cleIdempotence) {
      await this.idempotenceService.enregistrer(
        cleIdempotence,
        'POST',
        '/paiements/collecte',
        dto,
        200,
        reponseFinale,
      );
    }

    return reponseFinale;
  }

  /**
   * Paiement d'un abonnement en attente.
   */
  async payerAbonnement(
    dto: PayerAbonnementDto,
    utilisateur: { id: bigint; role: string },
    cleIdempotence?: string,
  ) {
    if (cleIdempotence) {
      const idem = await this.idempotenceService.verifierCle(
        cleIdempotence,
        'POST',
        '/paiements/abonnement',
        dto,
      );
      if (idem.estExistant) {
        return idem.reponse;
      }
    }

    const abonnementId = BigInt(dto.abonnement_id);
    const abonnement = await this.prisma.orm.public.Abonnement
      .where((a: any) => a.id.eq(abonnementId))
      .first();

    if (!abonnement) {
      throw new NotFoundException('Abonnement introuvable.');
    }

    if (utilisateur.role !== 'ADMINISTRATEUR' && abonnement.utilisateur_id !== utilisateur.id) {
      throw new ForbiddenException('Accès refusé à cet abonnement.');
    }

    if (abonnement.statut !== 'EN_ATTENTE_PAIEMENT') {
      throw new BadRequestException(
        `L’abonnement n'est pas en attente de paiement (statut actuel: ${abonnement.statut}).`,
      );
    }

    const montant = Number(abonnement.prix);
    const ref = `PAY-ABO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    let reponseFinale: any;

    if (dto.methode === 'PORTEFEUILLE') {
      reponseFinale = await this.prisma.transaction(async (tx: any) => {
        const portefeuille = await this.portefeuilleService.obtenirPortefeuillePourProprietaire(
          utilisateur,
          tx,
        );

        await this.portefeuilleService.debiter(
          portefeuille.id,
          montant,
          `Paiement abonnement #${abonnement.id}`,
          ref,
          tx,
        );

        const datePaiement = new Date();
        const paiement = await tx.orm.public.Paiement.create({
          reference: ref as any,
          utilisateur_id: utilisateur.id as any,
          abonnement_id: abonnement.id as any,
          montant: montant.toString() as any,
          devise: 'XAF' as any,
          methode: 'PORTEFEUILLE' as any,
          type: 'ABONNEMENT' as any,
          statut: 'PAYE' as any,
          date_paiement: datePaiement as any,
        });

        const abonnementActive = await this.abonnementsService.activerAbonnementApresPaiement(
          abonnement.id,
          tx,
        );

        return {
          succes: true,
          paiement,
          abonnement: abonnementActive,
          message: 'Abonnement réglé et activé avec succès depuis votre portefeuille.',
        };
      });
    } else {
      const initiation = await this.fournisseurPaiement.initierPaiement({
        reference: ref,
        montant,
        devise: 'XAF',
        telephone: dto.telephone_payeur,
        description: `Paiement abonnement #${abonnement.id}`,
      });

      const paiement = await this.prisma.orm.public.Paiement.create({
        reference: ref as any,
        utilisateur_id: utilisateur.id as any,
        abonnement_id: abonnement.id as any,
        montant: montant.toString() as any,
        devise: 'XAF' as any,
        methode: dto.methode as any,
        type: 'ABONNEMENT' as any,
        statut: initiation.statut_initial as any,
        reference_fournisseur: initiation.reference_fournisseur as any,
        donnees_fournisseur: JSON.stringify(initiation.donnees) as any,
      });

      reponseFinale = {
        succes: true,
        paiement,
        url_paiement: initiation.url_paiement,
        message: 'Paiement d’abonnement initié. En attente de confirmation.',
      };
    }

    if (cleIdempotence) {
      await this.idempotenceService.enregistrer(
        cleIdempotence,
        'POST',
        '/paiements/abonnement',
        dto,
        200,
        reponseFinale,
      );
    }

    return reponseFinale;
  }

  /**
   * Initiation d'une recharge de portefeuille (l'argent n'est crédité qu'après confirmation).
   */
  async rechargerPortefeuille(
    dto: RechargerPortefeuilleDto,
    utilisateur: { id: bigint; role: string },
    cleIdempotence?: string,
  ) {
    if (cleIdempotence) {
      const idem = await this.idempotenceService.verifierCle(
        cleIdempotence,
        'POST',
        '/paiements/rechargement-portefeuille',
        dto,
      );
      if (idem.estExistant) {
        return idem.reponse;
      }
    }

    if ((dto.methode as string) === 'PORTEFEUILLE') {
      throw new BadRequestException('Impossible de recharger un portefeuille avec le portefeuille.');
    }

    const ref = `PAY-RECH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const initiation = await this.fournisseurPaiement.initierPaiement({
      reference: ref,
      montant: dto.montant,
      devise: 'XAF',
      telephone: dto.telephone_payeur,
      description: 'Rechargement de portefeuille',
    });

    const paiement = await this.prisma.orm.public.Paiement.create({
      reference: ref as any,
      utilisateur_id: utilisateur.id as any,
      montant: dto.montant.toString() as any,
      devise: 'XAF' as any,
      methode: dto.methode as any,
      type: 'RECHARGEMENT_PORTEFEUILLE' as any,
      statut: initiation.statut_initial as any,
      reference_fournisseur: initiation.reference_fournisseur as any,
      donnees_fournisseur: JSON.stringify(initiation.donnees) as any,
    });

    const reponseFinale = {
      succes: true,
      paiement,
      url_paiement: initiation.url_paiement,
      message: 'Intention de recharge créée. Le portefeuille sera crédité après confirmation.',
    };

    if (cleIdempotence) {
      await this.idempotenceService.enregistrer(
        cleIdempotence,
        'POST',
        '/paiements/rechargement-portefeuille',
        dto,
        200,
        reponseFinale,
      );
    }

    return reponseFinale;
  }

  /**
   * Paiement d'une facture d'entreprise.
   */
  async payerFacture(
    dto: PayerFactureDto,
    utilisateur: { id: bigint; role: string },
    cleIdempotence?: string,
  ) {
    if (cleIdempotence) {
      const idem = await this.idempotenceService.verifierCle(
        cleIdempotence,
        'POST',
        '/paiements/facture',
        dto,
      );
      if (idem.estExistant) {
        return idem.reponse;
      }
    }

    const factureId = BigInt(dto.facture_id);
    const facture = await this.prisma.orm.public.Facture
      .where((f: any) => f.id.eq(factureId))
      .first();

    if (!facture) {
      throw new NotFoundException('Facture introuvable.');
    }

    // Vérifier l'entreprise
    if (utilisateur.role !== 'ADMINISTRATEUR') {
      const entreprise = await this.prisma.orm.public.Entreprise
        .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
        .first();

      if (!entreprise || facture.entreprise_id !== entreprise.id) {
        throw new ForbiddenException('Accès refusé à cette facture.');
      }
    }

    if (facture.statut === 'PAYEE' || facture.statut === 'ANNULEE') {
      throw new BadRequestException(
        `Cette facture ne peut pas être payée (statut actuel: ${facture.statut}).`,
      );
    }

    // Calcul du solde restant
    const paiementsExistants = await this.prisma.orm.public.Paiement
      .where((p: any) => p.facture_id.eq(facture.id))
      .where((p: any) => p.statut.eq('PAYE'))
      .all();

    const dejaPaye = paiementsExistants.reduce(
      (sum: number, p: any) => sum + Number(p.montant),
      0,
    );
    const restantDu = Number(facture.montant_ttc) - dejaPaye;

    const montantAPayer = dto.montant || restantDu;

    if (montantAPayer > restantDu) {
      throw new BadRequestException(
        `Le montant spécifié (${montantAPayer} FCFA) dépasse le solde restant dû (${restantDu} FCFA).`,
      );
    }

    const ref = `PAY-FACT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    let reponseFinale: any;

    if (dto.methode === 'PORTEFEUILLE') {
      reponseFinale = await this.prisma.transaction(async (tx: any) => {
        const portefeuille = await this.portefeuilleService.obtenirPortefeuillePourProprietaire(
          utilisateur,
          tx,
        );

        await this.portefeuilleService.debiter(
          portefeuille.id,
          montantAPayer,
          `Règlement facture #${facture.numero}`,
          ref,
          tx,
        );

        const datePaiement = new Date();
        const paiement = await tx.orm.public.Paiement.create({
          reference: ref as any,
          utilisateur_id: utilisateur.id as any,
          facture_id: facture.id as any,
          montant: montantAPayer.toString() as any,
          devise: 'XAF' as any,
          methode: 'PORTEFEUILLE' as any,
          type: 'FACTURE' as any,
          statut: 'PAYE' as any,
          date_paiement: datePaiement as any,
        });

        const soldeApresPaiement = restantDu - montantAPayer;
        const statutFacture = soldeApresPaiement <= 0 ? 'PAYEE' : 'PARTIELLEMENT_PAYEE';

        const factureMaj = await tx.orm.public.Facture
          .where((f: any) => f.id.eq(facture.id))
          .update({
            statut: statutFacture as any,
            date_paiement: datePaiement,
            date_modification: datePaiement,
          } as any);

        return {
          succes: true,
          paiement,
          facture: factureMaj,
          message: 'Paiement de facture enregistré avec succès depuis votre portefeuille.',
        };
      });
    } else {
      const initiation = await this.fournisseurPaiement.initierPaiement({
        reference: ref,
        montant: montantAPayer,
        devise: 'XAF',
        telephone: dto.telephone_payeur,
        description: `Paiement facture #${facture.numero}`,
      });

      const paiement = await this.prisma.orm.public.Paiement.create({
        reference: ref as any,
        utilisateur_id: utilisateur.id as any,
        facture_id: facture.id as any,
        montant: montantAPayer.toString() as any,
        devise: 'XAF' as any,
        methode: dto.methode as any,
        type: 'FACTURE' as any,
        statut: initiation.statut_initial as any,
        reference_fournisseur: initiation.reference_fournisseur as any,
        donnees_fournisseur: JSON.stringify(initiation.donnees) as any,
      });

      reponseFinale = {
        succes: true,
        paiement,
        url_paiement: initiation.url_paiement,
        message: 'Paiement de facture initié. En attente de confirmation.',
      };
    }

    if (cleIdempotence) {
      await this.idempotenceService.enregistrer(
        cleIdempotence,
        'POST',
        '/paiements/facture',
        dto,
        200,
        reponseFinale,
      );
    }

    return reponseFinale;
  }

  /**
   * Traitement serveur-à-serveur (webhook) des notifications de paiement.
   */
  async traiterWebhook(
    fournisseur: string,
    signature: string,
    payload: any,
  ) {
    const valide = this.fournisseurPaiement.verifierSignatureWebhook(signature, payload);
    if (!valide) {
      throw new UnauthorizedException('Signature webhook de paiement invalide.');
    }

    const notif = await this.fournisseurPaiement.analyserNotification(payload);

    const paiement = await this.prisma.orm.public.Paiement
      .where((p: any) => p.reference.eq(notif.reference_paiement))
      .first();

    if (!paiement) {
      throw new NotFoundException(`Paiement introuvable pour la référence '${notif.reference_paiement}'.`);
    }

    // Protection contre les callbacks répétés (idempotence absolue)
    if (paiement.statut === 'PAYE' || paiement.statut === 'REMBOURSE') {
      return { recu: true, message: 'Notification déjà traitée antérieurement.' };
    }

    // Vérification de cohérence du montant et de la devise
    if (Number(paiement.montant) !== notif.montant) {
      throw new BadRequestException('Incohérence entre le montant du paiement et la notification reçue.');
    }

    if (paiement.devise && notif.devise && String(paiement.devise).toUpperCase() !== String(notif.devise).toUpperCase()) {
      throw new BadRequestException('Incohérence entre la devise du paiement et la notification reçue.');
    }

    if (notif.statut === 'PAYE') {
      return this.prisma.transaction(async (tx: any) => {
        const datePaiement = new Date();

        // 1. Mettre à jour le paiement
        const paiementMaj = await tx.orm.public.Paiement
          .where((p: any) => p.id.eq(paiement.id))
          .update({
            statut: 'PAYE',
            reference_fournisseur: notif.reference_fournisseur,
            date_paiement: datePaiement,
            date_modification: datePaiement,
          } as any);

        // 2. Traitement selon le type de paiement
        if (paiement.type === 'RECHARGEMENT_PORTEFEUILLE') {
          const user = await tx.orm.public.Utilisateur
            .where((u: any) => u.id.eq(paiement.utilisateur_id))
            .first();

          if (user) {
            const portefeuille = await this.portefeuilleService.obtenirPortefeuillePourProprietaire(
              user,
              tx,
            );
            await this.portefeuilleService.crediter(
              portefeuille.id,
              Number(paiement.montant),
              `Recharge confirmée ref #${paiement.reference}`,
              `CR-RECH-${paiement.id}`,
              tx,
            );
          }
        } else if (paiement.type === 'COLLECTE' && paiement.demande_collecte_id) {
          await tx.orm.public.DemandeCollecte
            .where((d: any) => d.id.eq(paiement.demande_collecte_id))
            .update({
              statut: 'PAYEE',
              date_modification: datePaiement,
            } as any);
        } else if (paiement.type === 'ABONNEMENT' && paiement.abonnement_id) {
          await this.abonnementsService.activerAbonnementApresPaiement(
            paiement.abonnement_id,
            tx,
          );
        } else if (paiement.type === 'FACTURE' && paiement.facture_id) {
          await tx.orm.public.Facture
            .where((f: any) => f.id.eq(paiement.facture_id))
            .update({
              statut: 'PAYEE',
              date_paiement: datePaiement,
              date_modification: datePaiement,
            } as any);
        }

        return {
          recu: true,
          statut: 'PAYE',
          paiement: paiementMaj,
          message: 'Paiement confirmé et ressource mise à jour avec succès.',
        };
      });
    }

    // Échec notifié
    const paiementEchoue = await this.prisma.orm.public.Paiement
      .where((p: any) => p.id.eq(paiement.id))
      .update({
        statut: 'ECHOUE',
        date_modification: new Date(),
      } as any);

    return {
      recu: true,
      statut: 'ECHOUE',
      paiement: paiementEchoue,
      message: 'Échec de paiement enregistré.',
    };
  }

  /**
   * Consultation paginée de l'historique des paiements de l'utilisateur.
   */
  async listerMesPaiements(
    utilisateur: { id: bigint; role: string },
    filtre: FiltrePaiementsDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Paiement
      .where((p: any) => p.utilisateur_id.eq(utilisateur.id));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((p: any) => p.statut.eq(filtre.statut));
    }

    if (filtre.type && filtre.type !== 'TOUS') {
      query = query.where((p: any) => p.type.eq(filtre.type));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'montant', 'date_creation', 'statut'],
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

  /**
   * Consultation d'un paiement spécifique avec contrôle propriétaire.
   */
  async obtenirPaiementParId(
    id: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    const paiement = await this.prisma.orm.public.Paiement
      .where((p: any) => p.id.eq(id))
      .first();

    if (!paiement) {
      throw new NotFoundException('Paiement introuvable.');
    }

    if (
      utilisateur.role !== 'ADMINISTRATEUR' &&
      paiement.utilisateur_id !== utilisateur.id
    ) {
      throw new ForbiddenException('Accès refusé à ce paiement.');
    }

    return paiement;
  }
}

