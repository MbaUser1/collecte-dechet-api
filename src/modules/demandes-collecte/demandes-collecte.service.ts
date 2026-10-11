import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CalculTarifService } from '../tarifs/services/calcul-tarif.service.js';
import { TarifsService } from '../tarifs/services/tarifs.service.js';
import { DistanceService } from '../zones/services/distance.service.js';
import { QuotaService } from '../abonnements/services/quota.service.js';
import { CreerDemandeCollecteDto } from './dto/creer-demande-collecte.dto.js';
import { FiltreDemandesCollecteDto } from './dto/filtre-demandes-collecte.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';
import { AjustementsService } from '../ajustements/ajustements.service.js';

@Injectable()
export class DemandesCollecteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculTarifService: CalculTarifService,
    private readonly tarifsService: TarifsService,
    private readonly distanceService: DistanceService,
    private readonly quotaService: QuotaService,
    private readonly ajustementsService: AjustementsService,
  ) {}

  /**
   * Création d'une demande de collecte avec calcul côté serveur du tarif officiel
   * et réservation atomique du quota si un abonnement actif est disponible.
   */
  async creerDemande(
    dto: CreerDemandeCollecteDto,
    utilisateur: { id: bigint; role: string },
  ) {
    // 1. Vérification du rôle autorisé
    if (utilisateur.role !== 'PARTICULIER' && utilisateur.role !== 'ENTREPRISE') {
      throw new ForbiddenException(
        'Ce rôle utilisateur n’est pas autorisé à créer une demande de collecte.',
      );
    }

    // 2. Vérification du point de collecte et de son statut
    const pointId = BigInt(dto.point_collecte_id);
    const point = await this.prisma.orm.public.PointCollecte
      .where((p: any) => p.id.eq(pointId))
      .first();

    if (!point) {
      throw new NotFoundException('Point de collecte introuvable.');
    }

    if (point.statut !== 'ACTIF') {
      throw new BadRequestException('Le point de collecte sélectionné est inactif.');
    }

    let entrepriseId: bigint | null = null;
    if (utilisateur.role === 'PARTICULIER') {
      if (point.utilisateur_id !== utilisateur.id) {
        throw new ForbiddenException(
          'Accès refusé : vous n’êtes pas le propriétaire de ce point de collecte.',
        );
      }
    } else if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.prisma.orm.public.Entreprise
        .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
        .first();

      if (!entreprise || point.entreprise_id !== entreprise.id) {
        throw new ForbiddenException(
          'Accès refusé : ce point de collecte n’appartient pas à votre entreprise.',
        );
      }
      entrepriseId = entreprise.id;
    }

    // 2.bis Blocage des nouvelles demandes si le compte a des ajustements débiteurs en attente
    const aDesDebitsEnAttente = await this.ajustementsService.aDesAjustementsDebiteursEnAttente(
      utilisateur.id,
      entrepriseId ?? undefined,
    );
    if (aDesDebitsEnAttente) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'AJUSTEMENT_DEBITEUR_EN_ATTENTE',
        message: 'Impossible de créer une nouvelle demande de collecte tant que des ajustements débiteurs restent impayés.',
      });
    }

    // 3. Vérification du type de déchet
    const typeDechetId = BigInt(dto.type_dechet_id);
    const typeDechet = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.id.eq(typeDechetId))
      .first();

    if (!typeDechet) {
      throw new NotFoundException('Type de déchet introuvable.');
    }

    if (typeDechet.statut !== 'ACTIF') {
      throw new BadRequestException('Le type de déchet sélectionné est inactif.');
    }

    // 4. Détermination de la zone active correspondant à la ville du point
    let zone = await this.prisma.orm.public.Zone
      .where((z: any) => z.ville.ilike(point.ville))
      .where((z: any) => z.statut.eq('ACTIF'))
      .first();

    if (!zone) {
      // Recherche globale si le nom de zone correspond au quartier ou première zone active
      zone = await this.prisma.orm.public.Zone
        .where((z: any) => z.statut.eq('ACTIF'))
        .first();

      if (!zone) {
        throw new BadRequestException(
          `Aucune zone de collecte active n'est actuellement desservie pour la localité de ${point.ville}.`,
        );
      }
    }

    // 5. Recherche du tarif officiel applicable à cette date
    const tarif = await this.tarifsService.obtenirTarifApplicable({
      type_dechet_id: Number(typeDechet.id),
      zone_id: Number(zone.id),
      date: new Date(),
    });

    // 6. Calcul de distance (Haversine ou distance de base)
    let distanceKm = 0;
    if (point.latitude && point.longitude && zone.latitude && zone.longitude) {
      distanceKm = this.distanceService.calculerDistanceKm(
        { latitude: Number(point.latitude), longitude: Number(point.longitude) },
        { latitude: Number(zone.latitude), longitude: Number(zone.longitude) },
      );
    }

    // 7. Calcul du prix estimé officiel (serveur uniquement)
    const estimation = this.calculTarifService.calculerPrix({
      prix_base: Number(tarif.prix_base),
      prix_par_kg: Number(tarif.prix_par_kg),
      prix_par_km: Number(tarif.prix_par_km),
      prix_minimum: Number(tarif.prix_minimum),
      poids_kg: dto.poids_estime,
      distance_km: distanceKm,
    });

    const prixEstime = estimation.prix_final;
    const detailsPrix = JSON.stringify(estimation);

    // 8. Application des règles d'abonnement et de quota
    let abonnementId: bigint | null = null;
    let statutInitial = 'EN_ATTENTE_PAIEMENT';

    if (utilisateur.role === 'PARTICULIER') {
      const abonnementActif = await this.prisma.orm.public.Abonnement
        .where((a: any) => a.utilisateur_id.eq(utilisateur.id))
        .where((a: any) => a.statut.eq('ACTIF'))
        .first();

      if (abonnementActif) {
        const dispo = this.quotaService.calculerDisponibilite(abonnementActif);
        if (dispo.quota_disponible > 0) {
          abonnementId = abonnementActif.id;
          statutInitial = 'EN_ATTENTE_ATTRIBUTION';
        }
      }
    }

    // 9. Numéro unique de collecte
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const randStr = Math.random().toString(36).substring(2, 7).toUpperCase();
    const numero = `COL-${dateStr}-${randStr}`;

    // 10. Exécution transactionnelle de la création et de la réservation
    const nouvelleDemande = await this.prisma.transaction(async (tx: any) => {
      const demande = await tx.orm.public.DemandeCollecte.create({
        numero: numero as any,
        utilisateur_id: utilisateur.id as any,
        entreprise_id: (entrepriseId ?? null) as any,
        point_collecte_id: point.id as any,
        type_dechet_id: typeDechet.id as any,
        zone_id: zone.id as any,
        abonnement_id: (abonnementId ?? null) as any,
        adresse: point.adresse as any,
        ville: point.ville as any,
        quartier: point.quartier as any,
        latitude: (point.latitude ?? null) as any,
        longitude: (point.longitude ?? null) as any,
        instructions_acces: (dto.instructions_acces ?? point.instructions_acces ?? null) as any,
        poids_estime: dto.poids_estime.toString() as any,
        prix_estime: prixEstime.toString() as any,
        details_prix: detailsPrix as any,
        statut: statutInitial as any,
        date_collecte_souhaitee: (dto.date_collecte_souhaitee ?? null) as any,
        creneau_horaire: (dto.creneau_horaire ?? null) as any,
      });

      // Réservation atomique du quota si couvert par abonnement
      if (abonnementId && statutInitial === 'EN_ATTENTE_ATTRIBUTION') {
        await this.quotaService.reserverQuota(abonnementId, demande.id, tx);
      }

      return demande;
    });

    return {
      demande: nouvelleDemande,
      couvert_par_abonnement: !!abonnementId,
      statut: statutInitial,
      estimation,
    };
  }

  /**
   * Consultation paginée des demandes de collecte du compte connecté.
   */
  async listerMesDemandes(
    utilisateur: { id: bigint; role: string },
    filtre: FiltreDemandesCollecteDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.DemandeCollecte;

    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.prisma.orm.public.Entreprise
        .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
        .first();

      if (entreprise) {
        query = query.where((d: any) => d.entreprise_id.eq(entreprise.id));
      } else {
        query = query.where((d: any) => d.utilisateur_id.eq(utilisateur.id));
      }
    } else {
      query = query.where((d: any) => d.utilisateur_id.eq(utilisateur.id));
    }

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((d: any) => d.statut.eq(filtre.statut));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'numero', 'prix_estime', 'date_creation', 'statut'],
      'date_creation',
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
   * Consultation d'une demande avec contrôle de propriété strict.
   */
  async obtenirDemandeParId(
    id: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    const demande = await this.prisma.orm.public.DemandeCollecte
      .where((d: any) => d.id.eq(id))
      .first();

    if (!demande) {
      throw new NotFoundException('Demande de collecte introuvable.');
    }

    await this.verifierProprieteDemande(demande, utilisateur);

    return demande;
  }

  /**
   * Annulation d'une demande selon les règles métier de transition de statut
   * et libération automatique du quota si réservé.
   */
  async annulerDemande(
    id: bigint,
    utilisateur: { id: bigint; role: string },
  ) {
    const demande = await this.obtenirDemandeParId(id, utilisateur);

    if (demande.statut === 'ANNULEE') {
      return { message: 'Cette demande de collecte est déjà annulée.', demande };
    }

    // Seuls les statuts avant attribution effective peuvent être annulés
    const statutsAnnulables = ['EN_ATTENTE_PAIEMENT', 'PAYEE', 'EN_ATTENTE_ATTRIBUTION'];
    if (!statutsAnnulables.includes(demande.statut)) {
      throw new BadRequestException(
        `Impossible d’annuler une demande avec le statut actuel '${demande.statut}'.`,
      );
    }

    const demandeAnnulee = await this.prisma.transaction(async (tx: any) => {
      // 1. Libération de quota si lié à un abonnement
      if (demande.abonnement_id) {
        await this.quotaService.libererQuota(demande.id, tx);
      }

      // 2. Mise à jour du statut
      const maj = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(id))
        .update({
          statut: 'ANNULEE',
          date_modification: new Date(),
        } as any);

      return maj;
    });

    return {
      demande: demandeAnnulee,
      message: 'Demande de collecte annulée avec succès. Les réservations associées ont été libérées.',
    };
  }

  private async verifierProprieteDemande(
    demande: any,
    utilisateur: { id: bigint; role: string },
  ) {
    if (utilisateur.role === 'ADMINISTRATEUR') {
      return;
    }

    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.prisma.orm.public.Entreprise
        .where((e: any) => e.utilisateur_id.eq(utilisateur.id))
        .first();

      if (!demande.entreprise_id || demande.entreprise_id !== entreprise?.id) {
        throw new ForbiddenException(
          'Accès refusé : cette demande n’appartient pas à votre entreprise.',
        );
      }
      return;
    }

    if (demande.utilisateur_id !== utilisateur.id) {
      throw new ForbiddenException(
        'Accès refusé : vous n’êtes pas le propriétaire de cette demande.',
      );
    }
  }
}

