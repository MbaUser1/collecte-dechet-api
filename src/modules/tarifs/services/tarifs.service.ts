import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CalculTarifService } from './calcul-tarif.service.js';
import { CreerTarifDto } from '../dto/creer-tarif.dto.js';
import { ModifierTarifDto } from '../dto/modifier-tarif.dto.js';
import { FiltreTarifsDto } from '../dto/filtre-tarifs.dto.js';
import { EstimerTarifDto } from '../dto/estimer-tarif.dto.js';
import { TarifApplicableQueryDto } from '../dto/tarif-applicable-query.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../../common/dto/pagination-query.dto.js';
import { compterLignes } from '../../../common/utils/compteur.util.js';

@Injectable()
export class TarifsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculTarifService: CalculTarifService,
  ) {}

  async listerTarifs(filtre: FiltreTarifsDto): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Tarif;

    const statutFiltre = filtre.statut || 'ACTIF';
    if (statutFiltre !== 'TOUS') {
      query = query.where((t: any) => t.statut.eq(statutFiltre));
    }

    if (filtre.type_dechet_id) {
      const typeId = BigInt(filtre.type_dechet_id);
      query = query.where((t: any) => t.type_dechet_id.eq(typeId));
    }

    if (filtre.zone_id) {
      const zoneId = BigInt(filtre.zone_id);
      query = query.where((t: any) => t.zone_id.eq(zoneId));
    }

    if (filtre.recherche && filtre.recherche.trim().length > 0) {
      const pattern = `%${filtre.recherche.trim()}%`;
      query = query.where((t: any) => t.nom.ilike(pattern));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'nom', 'prix_base', 'date_debut', 'date_creation'],
      'date_debut',
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

  async obtenirTarifParId(id: bigint) {
    const tarif = await this.prisma.orm.public.Tarif
      .where((t: any) => t.id.eq(id))
      .first();

    if (!tarif) {
      throw new NotFoundException('Barème tarifaire introuvable.');
    }

    const [typeDechet, zone] = await Promise.all([
      this.prisma.orm.public.TypeDechet
        .where((td: any) => td.id.eq(tarif.type_dechet_id))
        .first(),
      this.prisma.orm.public.Zone
        .where((z: any) => z.id.eq(tarif.zone_id))
        .first(),
    ]);

    return {
      ...tarif,
      type_dechet: typeDechet,
      zone,
    };
  }

  /**
   * Trouve le barème tarifaire actif applicable à une date donnée pour un type de déchet et une zone.
   */
  async obtenirTarifApplicable(queryDto: TarifApplicableQueryDto) {
    const typeDechetId = BigInt(queryDto.type_dechet_id);
    const zoneId = BigInt(queryDto.zone_id);
    const dateCible = queryDto.date ? new Date(queryDto.date) : new Date();

    const candidats = await this.prisma.orm.public.Tarif
      .where((t: any) => t.type_dechet_id.eq(typeDechetId))
      .where((t: any) => t.zone_id.eq(zoneId))
      .where((t: any) => t.statut.eq('ACTIF'))
      .all();

    const tarifValide = candidats.find((t: any) => {
      const debut = new Date(t.date_debut);
      const fin = t.date_fin ? new Date(t.date_fin) : null;
      return debut <= dateCible && (!fin || fin >= dateCible);
    });

    if (!tarifValide) {
      throw new NotFoundException(
        `Aucun tarif actif n'est applicable pour ce type de déchet et cette zone à la date spécifiée (${dateCible.toISOString()}).`,
      );
    }

    return tarifValide;
  }

  /**
   * Estimation du prix par le backend officiel.
   * Ne prend JAMAIS en compte un prix fourni par le client.
   */
  async estimerTarif(dto: EstimerTarifDto) {
    const tarif = await this.obtenirTarifApplicable({
      type_dechet_id: dto.type_dechet_id,
      zone_id: dto.zone_id,
      date: dto.date,
    });

    const estimation = this.calculTarifService.calculerPrix({
      prix_base: Number(tarif.prix_base),
      prix_par_kg: Number(tarif.prix_par_kg),
      prix_par_km: Number(tarif.prix_par_km),
      prix_minimum: Number(tarif.prix_minimum),
      poids_kg: dto.poids_kg,
      distance_km: dto.distance_km,
      supplements_cfa: dto.supplements_cfa,
    });

    return {
      tarif: {
        id: tarif.id,
        nom: tarif.nom,
        type_dechet_id: tarif.type_dechet_id,
        zone_id: tarif.zone_id,
        prix_base: Number(tarif.prix_base),
        prix_par_kg: Number(tarif.prix_par_kg),
        prix_par_km: Number(tarif.prix_par_km),
        prix_minimum: Number(tarif.prix_minimum),
      },
      estimation,
    };
  }

  async creerTarif(dto: CreerTarifDto) {
    const typeDechetId = BigInt(dto.type_dechet_id);
    const zoneId = BigInt(dto.zone_id);

    // 1. Vérifier l'existence du type de déchet et de la zone
    const [typeDechet, zone] = await Promise.all([
      this.prisma.orm.public.TypeDechet.where((t: any) => t.id.eq(typeDechetId)).first(),
      this.prisma.orm.public.Zone.where((z: any) => z.id.eq(zoneId)).first(),
    ]);

    if (!typeDechet) {
      throw new NotFoundException('Type de déchet introuvable.');
    }
    if (!zone) {
      throw new NotFoundException('Zone géographique introuvable.');
    }

    // 2. Cohérence des dates
    const dateDebut = new Date(dto.date_debut);
    let dateFin: Date | null = null;
    if (dto.date_fin) {
      dateFin = new Date(dto.date_fin);
      if (dateFin <= dateDebut) {
        throw new BadRequestException(
          'La date de fin doit être strictement postérieure à la date de début.',
        );
      }
    }

    // 3. Détection des chevauchements tarifaires
    const statut = dto.statut || 'ACTIF';
    if (statut === 'ACTIF') {
      await this.verifierChevauchement(typeDechetId, zoneId, dateDebut, dateFin);
    }

    const nouveauTarif = await this.prisma.orm.public.Tarif.create({
      nom: dto.nom.trim() as any,
      type_dechet_id: typeDechetId as any,
      zone_id: zoneId as any,
      prix_base: (dto.prix_base ?? 0).toString() as any,
      prix_par_kg: (dto.prix_par_kg ?? 0).toString() as any,
      prix_par_km: (dto.prix_par_km ?? 0).toString() as any,
      prix_minimum: (dto.prix_minimum ?? 0).toString() as any,
      date_debut: dateDebut as any,
      date_fin: (dateFin ?? null) as any,
      statut: statut as any,
    });

    return nouveauTarif;
  }

  async modifierTarif(id: bigint, dto: ModifierTarifDto) {
    const tarif = await this.prisma.orm.public.Tarif
      .where((t: any) => t.id.eq(id))
      .first();

    if (!tarif) {
      throw new NotFoundException('Barème tarifaire introuvable.');
    }

    const typeDechetId = dto.type_dechet_id ? BigInt(dto.type_dechet_id) : tarif.type_dechet_id;
    const zoneId = dto.zone_id ? BigInt(dto.zone_id) : tarif.zone_id;
    const statutFinal = dto.statut !== undefined ? dto.statut : tarif.statut;

    const dateDebut = dto.date_debut ? new Date(dto.date_debut) : new Date(tarif.date_debut);
    let dateFin: Date | null =
      dto.date_fin !== undefined
        ? dto.date_fin ? new Date(dto.date_fin) : null
        : (tarif.date_fin ? new Date(tarif.date_fin) : null);

    if (dateFin && dateFin <= dateDebut) {
      throw new BadRequestException(
        'La date de fin doit être strictement postérieure à la date de début.',
      );
    }

    if (statutFinal === 'ACTIF') {
      await this.verifierChevauchement(typeDechetId, zoneId, dateDebut, dateFin, id);
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.type_dechet_id !== undefined) payload.type_dechet_id = typeDechetId;
    if (dto.zone_id !== undefined) payload.zone_id = zoneId;
    if (dto.prix_base !== undefined) payload.prix_base = dto.prix_base.toString();
    if (dto.prix_par_kg !== undefined) payload.prix_par_kg = dto.prix_par_kg.toString();
    if (dto.prix_par_km !== undefined) payload.prix_par_km = dto.prix_par_km.toString();
    if (dto.prix_minimum !== undefined) payload.prix_minimum = dto.prix_minimum.toString();
    if (dto.date_debut !== undefined) payload.date_debut = dateDebut;
    if (dto.date_fin !== undefined) payload.date_fin = dateFin;
    if (dto.statut !== undefined) payload.statut = dto.statut;

    const tarifModifie = await this.prisma.orm.public.Tarif
      .where((t: any) => t.id.eq(id))
      .update(payload as any);

    return tarifModifie;
  }

  async desactiverTarif(id: bigint) {
    const tarif = await this.prisma.orm.public.Tarif
      .where((t: any) => t.id.eq(id))
      .first();

    if (!tarif) {
      throw new NotFoundException('Barème tarifaire introuvable.');
    }

    const tarifDesactive = await this.prisma.orm.public.Tarif
      .where((t: any) => t.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return tarifDesactive;
  }

  /**
   * Vérifie qu'aucun autre tarif ACTIF ne chevauche la période [debut, fin].
   */
  private async verifierChevauchement(
    typeDechetId: bigint,
    zoneId: bigint,
    dateDebut: Date,
    dateFin: Date | null,
    exclureId?: bigint,
  ): Promise<void> {
    const existants = await this.prisma.orm.public.Tarif
      .where((t: any) => t.type_dechet_id.eq(typeDechetId))
      .where((t: any) => t.zone_id.eq(zoneId))
      .where((t: any) => t.statut.eq('ACTIF'))
      .all();

    const tDebut = dateDebut.getTime();
    const tFin = dateFin ? dateFin.getTime() : Infinity;

    for (const tarifExistant of existants) {
      if (exclureId && tarifExistant.id === exclureId) {
        continue;
      }

      const eDebut = new Date(tarifExistant.date_debut).getTime();
      const eFin = tarifExistant.date_fin ? new Date(tarifExistant.date_fin).getTime() : Infinity;

      // Chevauchement si tDebut < eFin && tFin > eDebut
      if (tDebut < eFin && tFin > eDebut) {
        throw new ConflictException(
          `Un tarif actif ('${tarifExistant.nom}') chevauche déjà cette période pour ce type de déchet et cette zone.`,
        );
      }
    }
  }
}

