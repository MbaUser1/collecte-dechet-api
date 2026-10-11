import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CalculTarifService, ParametresCalculTarif } from '../tarifs/services/calcul-tarif.service.js';
import { TarifsService } from '../tarifs/services/tarifs.service.js';
import { QuotaService } from '../abonnements/services/quota.service.js';
import { AjustementsService } from '../ajustements/ajustements.service.js';
import { FiltreCollectesDisponiblesDto } from './dto/filtre-collectes-disponibles.dto.js';
import { FiltreMissionsCollecteurDto } from './dto/filtre-missions-collecteur.dto.js';
import { ScannerQrDto } from './dto/scanner-qr.dto.js';
import { EnregistrerCollecteDto } from './dto/enregistrer-collecte.dto.js';
import { DeclarerEchecMissionDto } from './dto/declarer-echec-mission.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';

@Injectable()
export class MissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculTarifService: CalculTarifService,
    private readonly tarifsService: TarifsService,
    private readonly quotaService: QuotaService,
    private readonly ajustementsService: AjustementsService,
  ) {}

  /**
   * 1. Liste paginée des collectes disponibles pour les collecteurs.
   * Ne montre que les demandes au statut 'EN_ATTENTE_ATTRIBUTION' et sans collecteur affecté.
   */
  async listerCollectesDisponibles(
    filtre: FiltreCollectesDisponiblesDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.DemandeCollecte
      .where((d: any) => d.statut.eq('EN_ATTENTE_ATTRIBUTION'))
      .where((d: any) => d.collecteur_id.isNull());

    if (filtre.ville) {
      query = query.where((d: any) => d.ville.ilike(`%${filtre.ville}%`));
    }

    if (filtre.type_dechet_id) {
      query = query.where((d: any) => d.type_dechet_id.eq(BigInt(filtre.type_dechet_id!)));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'poids_estime', 'date_creation', 'date_collecte_souhaitee'],
      'date_creation',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((d: any) =>
      estDesc ? d[champTri].desc() : d[champTri].asc(),
    );

    const elementsBruts = await query
      .limit(filtre.limite)
      .offset(filtre.offset)
      .all();

    // Masquage des données sensibles internes, exposition des informations utiles à l'intervention
    const elements = elementsBruts.map((d: any) => ({
      id: d.id,
      numero: d.numero,
      ville: d.ville,
      quartier: d.quartier,
      adresse: d.adresse,
      instructions_acces: d.instructions_acces,
      type_dechet_id: d.type_dechet_id,
      poids_estime: Number(d.poids_estime),
      date_collecte_souhaitee: d.date_collecte_souhaitee,
      creneau_horaire: d.creneau_horaire,
      date_creation: d.date_creation,
    }));

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
   * 2. Acceptation atomique d'une collecte disponible par un collecteur.
   * Protection stricte contre la concurrence : si deux collecteurs acceptent simultanément,
   * un seul réussit et l'autre reçoit COLLECTE_DEJA_ATTRIBUEE.
   */
  async accepterCollecte(
    demandeId: bigint,
    collecteur: { id: bigint; role: string },
  ) {
    if (collecteur.role !== 'COLLECTEUR') {
      throw new ForbiddenException('Seuls les utilisateurs au rôle COLLECTEUR peuvent accepter une collecte.');
    }

    return this.prisma.transaction(async (tx: any) => {
      const demande = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demandeId))
        .first();

      if (!demande) {
        throw new NotFoundException('Demande de collecte introuvable.');
      }

      // Vérification d'éligibilité et de disponibilité
      if (demande.statut !== 'EN_ATTENTE_ATTRIBUTION' || demande.collecteur_id !== null) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTE_DEJA_ATTRIBUEE',
          message: 'Cette collecte a déjà été acceptée ou n’est plus disponible.',
        });
      }

      // Vérifier qu'aucune mission n'existe déjà pour cette demande
      const missionExistante = await tx.orm.public.MissionCollecte
        .where((m: any) => m.demande_collecte_id.eq(demandeId))
        .first();

      if (missionExistante) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTE_DEJA_ATTRIBUEE',
          message: 'Une mission a déjà été créée pour cette demande.',
        });
      }

      const maintenant = new Date();

      // 1. Attribution atomique conditionnelle de la demande (réservation exclusive)
      const demandeMaj = await tx.orm.public.DemandeCollecte
        .where((d: any) =>
          d.id.eq(demandeId)
            .and(d.statut.eq('EN_ATTENTE_ATTRIBUTION'))
            .and(d.collecteur_id.isNull()),
        )
        .update({
          collecteur_id: collecteur.id as any,
          statut: 'ATTRIBUEE',
          date_attribution: maintenant,
          date_modification: maintenant,
        } as any);

      if (!demandeMaj) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTE_DEJA_ATTRIBUEE',
          message: 'Cette collecte a déjà été acceptée ou n’est plus disponible.',
        });
      }

      // 2. Création de la mission opérationnelle (protégée par contrainte UNIQUE sur demande_collecte_id)
      let mission: any;
      try {
        mission = await tx.orm.public.MissionCollecte.create({
          demande_collecte_id: demandeId as any,
          collecteur_id: collecteur.id as any,
          statut: 'ATTRIBUEE' as any,
          date_attribution: maintenant as any,
          date_acceptation: maintenant as any,
        });
      } catch (err: any) {
        if (err?.code === 'P2002' || err?.message?.includes('unique') || err?.message?.includes('Unique')) {
          throw new ConflictException({
            statusCode: 409,
            code: 'COLLECTE_DEJA_ATTRIBUEE',
            message: 'Cette collecte a déjà été acceptée ou n’est plus disponible.',
          });
        }
        throw err;
      }

      return {
        succes: true,
        message: 'Collecte acceptée avec succès.',
        mission,
        demande: demandeMaj,
      };
    });
  }

  /**
   * 3. Liste paginée des missions du collecteur connecté.
   */
  async listerMesMissions(
    collecteurId: bigint,
    filtre: FiltreMissionsCollecteurDto,
  ): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.MissionCollecte
      .where((m: any) => m.collecteur_id.eq(collecteurId));

    if (filtre.statut && filtre.statut !== 'TOUS') {
      query = query.where((m: any) => m.statut.eq(filtre.statut));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'date_attribution', 'date_debut', 'statut'],
      'date_attribution',
    );
    const estDesc = (filtre.ordre || 'desc').toLowerCase() === 'desc';

    query = query.orderBy((m: any) =>
      estDesc ? m[champTri].desc() : m[champTri].asc(),
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
   * 4. Consultation détaillée d'une mission avec contrôle strict de propriété.
   */
  async obtenirMissionParId(missionId: bigint, collecteurId: bigint) {
    const mission = await this.prisma.orm.public.MissionCollecte
      .where((m: any) => m.id.eq(missionId))
      .first();

    if (!mission) {
      throw new NotFoundException('Mission introuvable.');
    }

    if (mission.collecteur_id !== collecteurId) {
      throw new ForbiddenException('Accès refusé : cette mission ne vous appartient pas.');
    }

    const demande = await this.prisma.orm.public.DemandeCollecte
      .where((d: any) => d.id.eq(mission.demande_collecte_id))
      .first();

    const elementsCollectes = await this.prisma.orm.public.ElementCollecte
      .where((el: any) => el.mission_collecte_id.eq(mission.id))
      .all();

    return {
      ...mission,
      demande,
      elements_collectes: elementsCollectes,
    };
  }

  /**
   * 5. Démarrage de mission exclusivement par scan du QR code.
   * Vérifie le QR code, valide les coordonnées GPS et passe la mission à EN_COURS.
   */
  async scannerQrEtDemarrer(
    missionId: bigint,
    dto: ScannerQrDto,
    collecteurId: bigint,
  ) {
    // 1. Contrôle des coordonnées GPS
    if (
      dto.latitude < -90 ||
      dto.latitude > 90 ||
      dto.longitude < -180 ||
      dto.longitude > 180 ||
      isNaN(dto.latitude) ||
      isNaN(dto.longitude)
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'POSITION_COLLECTEUR_INVALIDE',
        message: 'Les coordonnées GPS fournies sont hors bornes ou invalides.',
      });
    }

    const mission = await this.prisma.orm.public.MissionCollecte
      .where((m: any) => m.id.eq(missionId))
      .first();

    if (!mission) {
      throw new NotFoundException('Mission introuvable.');
    }

    if (mission.collecteur_id !== collecteurId) {
      throw new ForbiddenException('Accès refusé : cette mission ne vous appartient pas.');
    }

    if (mission.statut === 'EN_COURS') {
      throw new ConflictException({
        statusCode: 409,
        code: 'QR_DEJA_SCANE',
        message: 'Cette mission est déjà en cours d’exécution.',
      });
    }

    if (mission.statut !== 'ATTRIBUEE') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'STATUT_MISSION_INCOMPATIBLE',
        message: `Impossible de démarrer la mission : son statut actuel est '${mission.statut}'.`,
      });
    }

    // Charger la demande et le point de collecte associé pour vérification du jeton QR
    const demande = await this.prisma.orm.public.DemandeCollecte
      .where((d: any) => d.id.eq(mission.demande_collecte_id))
      .first();

    if (!demande) {
      throw new NotFoundException('Demande associée à la mission introuvable.');
    }

    let pointCollecte: any = null;
    if (demande.point_collecte_id) {
      pointCollecte = await this.prisma.orm.public.PointCollecte
        .where((p: any) => p.id.eq(demande.point_collecte_id))
        .first();
    }

    // Vérification de validité et de correspondance du jeton QR
    const jetonAttenduMission = mission.jeton_qr?.toLowerCase();
    const jetonAttenduPoint = pointCollecte?.jeton_qr?.toLowerCase();
    const jetonFourni = dto.jeton_qr.trim().toLowerCase();

    const jetonCorrespond =
      (jetonAttenduMission && jetonFourni === jetonAttenduMission) ||
      (jetonAttenduPoint && jetonFourni === jetonAttenduPoint);

    if (!jetonCorrespond) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'QR_NON_CORRESPONDANT',
        message: 'Le QR code scanné ne correspond pas à cette collecte.',
      });
    }

    // Démarrage atomique dans une transaction
    return this.prisma.transaction(async (tx: any) => {
      const maintenant = new Date();

      const missionMaj = await tx.orm.public.MissionCollecte
        .where((m: any) => m.id.eq(mission.id))
        .update({
          statut: 'EN_COURS',
          date_debut: maintenant,
          date_modification: maintenant,
        } as any);

      await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demande.id))
        .update({
          statut: 'EN_COURS',
          date_modification: maintenant,
        } as any);

      return {
        succes: true,
        message: 'Mission démarrée avec succès. Vous pouvez maintenant procéder à la collecte et à la pesée.',
        mission: missionMaj,
      };
    });
  }

  /**
   * 6. Enregistrement du résultat réel de la collecte, pesée, tri et calcul du prix final côté serveur.
   */
  async enregistrerCollecte(
    missionId: bigint,
    dto: EnregistrerCollecteDto,
    collecteurId: bigint,
  ) {
    const mission = await this.prisma.orm.public.MissionCollecte
      .where((m: any) => m.id.eq(missionId))
      .first();

    if (!mission) {
      throw new NotFoundException('Mission introuvable.');
    }

    if (mission.collecteur_id !== collecteurId) {
      throw new ForbiddenException('Accès refusé : cette mission ne vous appartient pas.');
    }

    // Traitement idempotent si la collecte a déjà été enregistrée
    if (mission.statut === 'TERMINEE') {
      return {
        succes: true,
        message: 'Cette mission a déjà été enregistrée et finalisée.',
        mission,
      };
    }

    if (mission.statut !== 'EN_COURS') {
      throw new BadRequestException(
        `Impossible d’enregistrer la collecte : la mission doit être EN_COURS (statut actuel: ${mission.statut}).`,
      );
    }

    if (dto.poids_reel_total <= 0) {
      throw new BadRequestException('Le poids réel total doit être strictement positif.');
    }

    // Contrôle de cohérence entre le total et la somme des éléments si fournis
    if (dto.elements && dto.elements.length > 0) {
      for (const el of dto.elements) {
        if (el.poids < 0) {
          throw new BadRequestException('Le poids d’un élément ne peut pas être négatif.');
        }

        const typeDechet = await this.prisma.orm.public.TypeDechet
          .where((t: any) => t.id.eq(BigInt(el.type_dechet_id)))
          .first();

        if (!typeDechet) {
          throw new NotFoundException(`Type de déchet #${el.type_dechet_id} introuvable.`);
        }

        if (typeDechet.statut !== 'ACTIF') {
          throw new BadRequestException(`Le type de déchet '${typeDechet.nom}' est inactif.`);
        }
      }

      const totalElements = dto.elements.reduce((acc, el) => acc + Number(el.poids), 0);
      const ecartElements = Math.abs(Math.round((totalElements - dto.poids_reel_total) * 100) / 100);

      // Tolérance métier de 100g (0.1 kg) pour les imprécisions d'arrondi
      if (ecartElements > 0.1) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INCOHERENCE_POIDS_ELEMENTS',
          message: `Incohérence de pesée : la somme des éléments (${totalElements} kg) ne correspond pas au poids réel total déclaré (${dto.poids_reel_total} kg). Écart: ${ecartElements} kg.`,
        });
      }
    }

    // Exécution transactionnelle de la finalisation opérationnelle et financière
    return this.prisma.transaction(async (tx: any) => {
      const demande = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(mission.demande_collecte_id))
        .first();

      if (!demande) {
        throw new NotFoundException('Demande de collecte associée introuvable.');
      }

      // 1. Calcul du prix final côté serveur à partir du barème historique snapshoté
      let paramsTarif: ParametresCalculTarif;
      try {
        const snap = JSON.parse(demande.details_prix || '{}');
        paramsTarif = {
          prix_base: Number(snap.prix_base ?? 0),
          prix_par_kg: Number(snap.details?.prix_par_kg ?? snap.prix_par_kg ?? 0),
          prix_par_km: Number(snap.details?.prix_par_km ?? snap.prix_par_km ?? 0),
          prix_minimum: Number(snap.prix_minimum ?? 0),
          poids_kg: dto.poids_reel_total,
          distance_km: Number(snap.details?.distance_km ?? 0),
          supplements_cfa: Number(snap.supplements ?? 0),
        };
      } catch {
        let zoneIdNum = demande.zone_id ? Number(demande.zone_id) : 1;
        if (!demande.zone_id) {
          const zoneSecours = await this.prisma.orm.public.Zone.where((z: any) => z.statut.eq('ACTIF')).first();
          if (zoneSecours) {
            zoneIdNum = Number(zoneSecours.id);
          }
        }
        const tarif = await this.tarifsService.obtenirTarifApplicable({
          type_dechet_id: Number(demande.type_dechet_id),
          zone_id: zoneIdNum,
        });
        paramsTarif = {
          prix_base: Number(tarif.prix_base),
          prix_par_kg: Number(tarif.prix_par_kg),
          prix_par_km: Number(tarif.prix_par_km),
          prix_minimum: Number(tarif.prix_minimum),
          poids_kg: dto.poids_reel_total,
        };
      }

      const calculFinal = this.calculTarifService.calculerPrix(paramsTarif);
      const prixFinal = calculFinal.prix_final;
      const detailsPrixFinal = JSON.stringify(calculFinal);

      let ajustementCree: any = null;

      // 2. Traitement des quotas d'abonnement ou de l'écart financier
      if (demande.abonnement_id) {
        // Consommation définitive du quota réservé
        await this.quotaService.consommerQuota(demande.id, tx);
      } else {
        // Collecte à la pièce : calcul de l'écart financier
        const prixEstime = Number(demande.prix_estime);
        const difference = Math.round((prixFinal - prixEstime) * 100) / 100;

        if (difference > 0) {
          // Surpoids : complément débiteur dû par le client (EN_ATTENTE)
          ajustementCree = await this.ajustementsService.creerAjustementDebit(
            demande.id,
            difference,
            `Complément surpoids pesée réelle (+${difference} FCFA, ${dto.poids_reel_total}kg réels vs ${demande.poids_estime}kg estimés)`,
            tx,
          );
        } else if (difference < 0) {
          // Poids réel inférieur : remboursement créditeur automatique sur le portefeuille
          const paiementOrigine = await tx.orm.public.Paiement
            .where((p: any) => p.demande_collecte_id.eq(demande.id).and(p.statut.eq('PAYE')))
            .first();

          ajustementCree = await this.ajustementsService.creerAjustementCreditEtRembourser(
            demande.id,
            Math.abs(difference),
            `Remboursement écart pesée réelle (${Math.abs(difference)} FCFA)`,
            paiementOrigine?.id,
            tx,
          );
        }
      }

      // 3. Enregistrement des éléments individuels de collecte si fournis
      if (dto.elements && dto.elements.length > 0) {
        for (const el of dto.elements) {
          await tx.orm.public.ElementCollecte.create({
            mission_collecte_id: mission.id as any,
            type_dechet_id: BigInt(el.type_dechet_id) as any,
            poids: el.poids.toString() as any,
            volume_estime: (el.volume_estime !== undefined ? el.volume_estime.toString() : null) as any,
            notes: (el.notes ?? null) as any,
          });
        }
      }

      const maintenant = new Date();

      // 4. Clôture opérationnelle de la mission
      const missionMaj = await tx.orm.public.MissionCollecte
        .where((m: any) => m.id.eq(mission.id))
        .update({
          statut: 'TERMINEE',
          poids_reel_total: dto.poids_reel_total.toString() as any,
          tri_respecte: (dto.tri_respecte ?? true) as any,
          notes: (dto.notes ?? null) as any,
          date_fin: maintenant,
          date_modification: maintenant,
        } as any);

      // 5. Mise à jour de la demande de collecte
      const demandeMaj = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demande.id))
        .update({
          statut: 'TERMINEE',
          poids_reel: dto.poids_reel_total.toString() as any,
          prix_final: prixFinal.toString() as any,
          details_prix: detailsPrixFinal as any,
          date_realisation: maintenant,
          date_modification: maintenant,
        } as any);

      return {
        succes: true,
        message: 'Collecte enregistrée avec succès. Données de pesée et tarification finalisées.',
        mission: missionMaj,
        demande: demandeMaj,
        prix_estime: Number(demande.prix_estime),
        prix_final: prixFinal,
        ajustement: ajustementCree,
      };
    });
  }

  /**
   * 7. Déclaration d'échec d'une mission (client absent, accès impossible, etc.).
   */
  async declarerEchec(
    missionId: bigint,
    dto: DeclarerEchecMissionDto,
    collecteurId: bigint,
  ) {
    const mission = await this.prisma.orm.public.MissionCollecte
      .where((m: any) => m.id.eq(missionId))
      .first();

    if (!mission) {
      throw new NotFoundException('Mission introuvable.');
    }

    if (mission.collecteur_id !== collecteurId) {
      throw new ForbiddenException('Accès refusé : cette mission ne vous appartient pas.');
    }

    if (mission.statut === 'TERMINEE') {
      throw new BadRequestException('Une mission terminée ne peut pas être déclarée échouée.');
    }

    if (mission.statut === 'ECHOUEE') {
      return {
        succes: true,
        message: 'Cette mission est déjà marquée comme échouée.',
        mission,
      };
    }

    if (mission.statut !== 'ATTRIBUEE' && mission.statut !== 'EN_COURS') {
      throw new BadRequestException(
        `Impossible de déclarer l’échec pour une mission avec le statut '${mission.statut}'.`,
      );
    }

    return this.prisma.transaction(async (tx: any) => {
      const demande = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(mission.demande_collecte_id))
        .first();

      if (!demande) {
        throw new NotFoundException('Demande associée introuvable.');
      }

      // Libération de la réservation de quota si la collecte échoue
      if (demande.abonnement_id) {
        await this.quotaService.libererQuota(demande.id, tx);
      }

      const maintenant = new Date();
      const observation = dto.notes ? `${dto.motif} - ${dto.notes}` : dto.motif;

      const missionMaj = await tx.orm.public.MissionCollecte
        .where((m: any) => m.id.eq(mission.id))
        .update({
          statut: 'ECHOUEE',
          notes: observation as any,
          date_fin: maintenant,
          date_modification: maintenant,
        } as any);

      await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demande.id))
        .update({
          statut: 'ECHOUEE',
          date_modification: maintenant,
        } as any);

      return {
        succes: true,
        message: 'Échec de la collecte enregistré. Le quota éventuel a été libéré.',
        mission: missionMaj,
      };
    });
  }
}
