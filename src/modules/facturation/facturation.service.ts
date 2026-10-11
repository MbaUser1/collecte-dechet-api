import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  FiltreDevisDto,
  FiltreFacturesEntrepriseDto,
  CreerDevisDto,
  CreerFactureDirecteDto,
} from './dto/facturation.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';

function genererNumeroDocument(prefix: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const alea = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${ts}-${alea}`;
}

@Injectable()
export class FacturationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'entité Entreprise liée à un compte utilisateur.
   */
  async obtenirEntreprisePourUtilisateur(utilisateurId: bigint) {
    const entreprise = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.utilisateur_id.eq(utilisateurId))
      .first();

    if (!entreprise) {
      throw new ForbiddenException('Aucun profil entreprise associé à ce compte utilisateur.');
    }

    return entreprise;
  }

  /**
   * Consultation paginée des devis de l'entreprise connectée.
   */
  async listerMesDevis(
    utilisateurId: bigint,
    filtre: FiltreDevisDto,
  ): Promise<ResultatPagine<any>> {
    const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateurId);

    let query: any = this.prisma.orm.public.Devis
      .where((d: any) => d.entreprise_id.eq(entreprise.id));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((d: any) => d.statut.eq(filtre.statut));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'numero', 'montant_ttc', 'date_emission', 'statut'],
      'date_emission',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((d: any) =>
      estDesc ? d[champTri].desc() : d[champTri].asc(),
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
   * Consultation détaillée d'un devis avec contrôle de propriété.
   */
  async obtenirDevisParId(devisId: bigint, utilisateurId: bigint, role: string) {
    const devis = await this.prisma.orm.public.Devis
      .where((d: any) => d.id.eq(devisId))
      .first();

    if (!devis) {
      throw new NotFoundException('Devis introuvable.');
    }

    if (role !== 'ADMINISTRATEUR') {
      const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateurId);
      if (devis.entreprise_id !== entreprise.id) {
        throw new ForbiddenException('Accès refusé à ce devis.');
      }
    }

    const factureAssociee = await this.prisma.orm.public.Facture
      .where((f: any) => f.devis_id.eq(devis.id))
      .first();

    return {
      ...devis,
      facture: factureAssociee,
    };
  }

  /**
   * Acceptation d'un devis par l'entreprise : passage à VALIDE et génération automatique
   * de la facture correspondante en statut EMISE.
   */
  async accepterDevis(devisId: bigint, utilisateurId: bigint) {
    const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateurId);

    return this.prisma.transaction(async (tx: any) => {
      const devis = await tx.orm.public.Devis
        .where((d: any) => d.id.eq(devisId))
        .first();

      if (!devis) {
        throw new NotFoundException('Devis introuvable.');
      }

      if (devis.entreprise_id !== entreprise.id) {
        throw new ForbiddenException('Accès refusé : ce devis n’appartient pas à votre entreprise.');
      }

      if (devis.statut === 'VALIDE') {
        const factureExistante = await tx.orm.public.Facture
          .where((f: any) => f.devis_id.eq(devis.id))
          .first();

        return {
          succes: true,
          message: 'Ce devis a déjà été validé.',
          devis,
          facture: factureExistante,
        };
      }

      if (devis.statut !== 'EN_ATTENTE_VALIDATION') {
        throw new BadRequestException(
          `Impossible d’accepter ce devis dans son statut actuel (${devis.statut}).`,
        );
      }

      if (new Date(devis.date_validite) < new Date()) {
        await tx.orm.public.Devis
          .where((d: any) => d.id.eq(devis.id))
          .update({ statut: 'EXPIRE', date_modification: new Date() } as any);

        throw new BadRequestException('Ce devis a expiré.');
      }

      const maintenant = new Date();

      // 1. Mettre à jour le devis
      const devisValide = await tx.orm.public.Devis
        .where((d: any) => d.id.eq(devis.id))
        .update({
          statut: 'VALIDE',
          date_modification: maintenant,
        } as any);

      // 2. Générer la facture correspondante
      const numeroFacture = genererNumeroDocument('FACT');
      const dateEcheance = new Date(Date.now() + 30 * 24 * 3600 * 1000); // Échéance 30j

      const facture = await tx.orm.public.Facture.create({
        numero: numeroFacture as any,
        entreprise_id: devis.entreprise_id as any,
        devis_id: devis.id as any,
        montant_ht: devis.montant_ht as any,
        montant_tva: devis.montant_tva as any,
        montant_ttc: devis.montant_ttc as any,
        date_emission: maintenant as any,
        date_echeance: dateEcheance as any,
        statut: 'EMISE' as any,
      });

      return {
        succes: true,
        message: 'Devis accepté avec succès ! La facture correspondante a été générée.',
        devis: devisValide,
        facture,
      };
    });
  }

  /**
   * Refus d'un devis par l'entreprise.
   */
  async refuserDevis(devisId: bigint, utilisateurId: bigint) {
    const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateurId);

    const devis = await this.prisma.orm.public.Devis
      .where((d: any) => d.id.eq(devisId))
      .first();

    if (!devis) {
      throw new NotFoundException('Devis introuvable.');
    }

    if (devis.entreprise_id !== entreprise.id) {
      throw new ForbiddenException('Accès refusé : ce devis n’appartient pas à votre entreprise.');
    }

    if (devis.statut === 'REFUSE') {
      return { succes: true, message: 'Ce devis est déjà refusé.', devis };
    }

    if (devis.statut !== 'EN_ATTENTE_VALIDATION') {
      throw new BadRequestException(`Impossible de refuser ce devis dans son statut actuel (${devis.statut}).`);
    }

    const maintenant = new Date();
    const devisRefuse = await this.prisma.orm.public.Devis
      .where((d: any) => d.id.eq(devis.id))
      .update({
        statut: 'REFUSE',
        date_modification: maintenant,
      } as any);

    return {
      succes: true,
      message: 'Devis refusé.',
      devis: devisRefuse,
    };
  }

  /**
   * Consultation paginée des factures de l'entreprise avec calcul du solde restant dû.
   */
  async listerMesFactures(
    utilisateurId: bigint,
    filtre: FiltreFacturesEntrepriseDto,
  ): Promise<ResultatPagine<any>> {
    const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateurId);

    let query: any = this.prisma.orm.public.Facture
      .where((f: any) => f.entreprise_id.eq(entreprise.id));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((f: any) => f.statut.eq(filtre.statut));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'numero', 'montant_ttc', 'date_emission', 'date_echeance', 'statut'],
      'date_emission',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((f: any) =>
      estDesc ? f[champTri].desc() : f[champTri].asc(),
    );

    const facturesBrutes = await query
      .limit(filtre.limite)
      .offset(filtre.offset)
      .all();

    // Enrichissement avec le solde payé et restant dû
    const elements = await Promise.all(
      facturesBrutes.map(async (facture: any) => {
        const paiements = await this.prisma.orm.public.Paiement
          .where((p: any) => p.facture_id.eq(facture.id))
          .where((p: any) => p.statut.eq('PAYE'))
          .all();

        const montantPaye = paiements.reduce(
          (sum: number, p: any) => sum + Number(p.montant),
          0,
        );
        const montantTtc = Number(facture.montant_ttc);
        const restantDu = Math.max(0, montantTtc - montantPaye);

        return {
          ...facture,
          montant_paye: montantPaye,
          restant_du: restantDu,
        };
      }),
    );

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
   * Consultation détaillée d'une facture.
   */
  async obtenirFactureParId(factureId: bigint, utilisateurId: bigint, role: string) {
    const facture = await this.prisma.orm.public.Facture
      .where((f: any) => f.id.eq(factureId))
      .first();

    if (!facture) {
      throw new NotFoundException('Facture introuvable.');
    }

    if (role !== 'ADMINISTRATEUR') {
      const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateurId);
      if (facture.entreprise_id !== entreprise.id) {
        throw new ForbiddenException('Accès refusé à cette facture.');
      }
    }

    const paiements = await this.prisma.orm.public.Paiement
      .where((p: any) => p.facture_id.eq(facture.id))
      .all();

    const montantPaye = paiements
      .filter((p: any) => p.statut === 'PAYE')
      .reduce((sum: number, p: any) => sum + Number(p.montant), 0);

    const montantTtc = Number(facture.montant_ttc);
    const restantDu = Math.max(0, montantTtc - montantPaye);

    return {
      ...facture,
      paiements,
      montant_paye: montantPaye,
      restant_du: restantDu,
    };
  }

  /**
   * Administration : création d'un devis pour une entreprise.
   */
  async creerDevis(dto: CreerDevisDto) {
    const entreprise = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.id.eq(BigInt(dto.entreprise_id)))
      .first();

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable.');
    }

    const montantHt = Number(dto.montant_ht);
    const montantTva = Number(dto.montant_tva || 0);
    const montantTtc = Math.round((montantHt + montantTva) * 100) / 100;

    const numeroDevis = genererNumeroDocument('DEV');

    const devis = await this.prisma.orm.public.Devis.create({
      numero: numeroDevis as any,
      entreprise_id: BigInt(dto.entreprise_id) as any,
      montant_ht: montantHt.toString() as any,
      montant_tva: montantTva.toString() as any,
      montant_ttc: montantTtc.toString() as any,
      description: (dto.description ?? null) as any,
      date_validite: dto.date_validite as any,
      statut: 'BROUILLON' as any,
    });

    return {
      succes: true,
      message: 'Devis créé en brouillon avec succès.',
      devis,
    };
  }

  /**
   * Administration : émission d'un devis (passage à EN_ATTENTE_VALIDATION).
   */
  async emettreDevis(devisId: bigint) {
    const devis = await this.prisma.orm.public.Devis
      .where((d: any) => d.id.eq(devisId))
      .first();

    if (!devis) {
      throw new NotFoundException('Devis introuvable.');
    }

    if (devis.statut === 'EN_ATTENTE_VALIDATION') {
      return {
        succes: true,
        message: 'Ce devis est déjà en attente de validation.',
        devis,
      };
    }

    if (devis.statut !== 'BROUILLON') {
      throw new BadRequestException(
        `Seul un devis au statut BROUILLON peut être émis (statut actuel: ${devis.statut}).`,
      );
    }

    const maintenant = new Date();
    const maj = await this.prisma.orm.public.Devis
      .where((d: any) => d.id.eq(devis.id))
      .update({
        statut: 'EN_ATTENTE_VALIDATION',
        date_emission: maintenant,
        date_modification: maintenant,
      } as any);

    return {
      succes: true,
      message: 'Devis émis et soumis à validation auprès de l’entreprise.',
      devis: maj,
    };
  }

  /**
   * Administration : création directe d'une facture sans devis préalable.
   */
  async creerFactureDirecte(dto: CreerFactureDirecteDto) {
    const entreprise = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.id.eq(BigInt(dto.entreprise_id)))
      .first();

    if (!entreprise) {
      throw new NotFoundException('Entreprise introuvable.');
    }

    const montantHt = Number(dto.montant_ht);
    const montantTva = Number(dto.montant_tva || 0);
    const montantTtc = Math.round((montantHt + montantTva) * 100) / 100;

    const numeroFacture = genererNumeroDocument('FACT');

    const facture = await this.prisma.orm.public.Facture.create({
      numero: numeroFacture as any,
      entreprise_id: BigInt(dto.entreprise_id) as any,
      devis_id: (dto.devis_id ? BigInt(dto.devis_id) : null) as any,
      montant_ht: montantHt.toString() as any,
      montant_tva: montantTva.toString() as any,
      montant_ttc: montantTtc.toString() as any,
      date_echeance: dto.date_echeance as any,
      url_document: (dto.url_document ?? null) as any,
      statut: 'EMISE' as any,
    });

    return {
      succes: true,
      message: 'Facture émise avec succès.',
      facture,
    };
  }
}

