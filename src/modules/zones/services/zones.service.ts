import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreerZoneDto } from '../dto/creer-zone.dto.js';
import { ModifierZoneDto } from '../dto/modifier-zone.dto.js';
import { FiltreZonesDto } from '../dto/filtre-zones.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../../common/dto/pagination-query.dto.js';

@Injectable()
export class ZonesService {
  constructor(private readonly prisma: PrismaService) {}

  async listerZones(filtre: FiltreZonesDto): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.Zone;

    const statutFiltre = filtre.statut || 'ACTIF';
    if (statutFiltre !== 'TOUS') {
      query = query.where((z: any) => z.statut.eq(statutFiltre));
    }

    if (filtre.ville && filtre.ville.trim().length > 0) {
      query = query.where((z: any) => z.ville.ilike(`%${filtre.ville!.trim()}%`));
    }

    if (filtre.recherche && filtre.recherche.trim().length > 0) {
      const recherchePattern = `%${filtre.recherche.trim()}%`;
      query = query.where((z: any) => z.nom.ilike(recherchePattern));
    }

    const total = await query.count();

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'nom', 'ville', 'date_creation'],
      'nom',
    );
    const estDesc = (filtre.ordre || 'asc').toLowerCase() === 'desc';

    query = query.orderBy((z: any) =>
      estDesc ? z[champTri].desc() : z[champTri].asc(),
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

  async obtenirZoneParId(id: bigint) {
    const zone = await this.prisma.orm.public.Zone
      .where((z: any) => z.id.eq(id))
      .first();

    if (!zone) {
      throw new NotFoundException('Zone géographique introuvable.');
    }

    return zone;
  }

  async creerZone(dto: CreerZoneDto) {
    // Vérifier l'unicité de la zone par ville et nom
    const existante = await this.prisma.orm.public.Zone
      .where((z: any) => z.ville.ilike(dto.ville.trim()))
      .where((z: any) => z.nom.ilike(dto.nom.trim()))
      .first();

    if (existante && existante.statut === 'ACTIF') {
      throw new ConflictException(
        `Une zone active nommée '${dto.nom.trim()}' existe déjà dans la ville de ${dto.ville.trim()}.`,
      );
    }

    const nouvelleZone = await this.prisma.orm.public.Zone.create({
      nom: dto.nom.trim() as any,
      ville: dto.ville.trim() as any,
      description: (dto.description ?? null) as any,
      latitude: (dto.latitude ?? null) as any,
      longitude: (dto.longitude ?? null) as any,
      statut: (dto.statut || 'ACTIF') as any,
    });

    return nouvelleZone;
  }

  async modifierZone(id: bigint, dto: ModifierZoneDto) {
    const zone = await this.prisma.orm.public.Zone
      .where((z: any) => z.id.eq(id))
      .first();

    if (!zone) {
      throw new NotFoundException('Zone géographique introuvable.');
    }

    const nouveauNom = dto.nom ? dto.nom.trim() : zone.nom;
    const nouvelleVille = dto.ville ? dto.ville.trim() : zone.ville;

    if (
      (dto.nom && dto.nom.trim().toLowerCase() !== zone.nom.toLowerCase()) ||
      (dto.ville && dto.ville.trim().toLowerCase() !== zone.ville.toLowerCase())
    ) {
      const existante = await this.prisma.orm.public.Zone
        .where((z: any) => z.ville.ilike(nouvelleVille))
        .where((z: any) => z.nom.ilike(nouveauNom))
        .first();

      if (existante && existante.id !== id && existante.statut === 'ACTIF') {
        throw new ConflictException(
          `Une zone active nommée '${nouveauNom}' existe déjà dans la ville de ${nouvelleVille}.`,
        );
      }
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.ville !== undefined) payload.ville = dto.ville.trim();
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.latitude !== undefined) payload.latitude = dto.latitude;
    if (dto.longitude !== undefined) payload.longitude = dto.longitude;
    if (dto.statut !== undefined) payload.statut = dto.statut;

    const zoneModifiee = await this.prisma.orm.public.Zone
      .where((z: any) => z.id.eq(id))
      .update(payload as any);

    return zoneModifiee;
  }

  async desactiverZone(id: bigint) {
    const zone = await this.prisma.orm.public.Zone
      .where((z: any) => z.id.eq(id))
      .first();

    if (!zone) {
      throw new NotFoundException('Zone géographique introuvable.');
    }

    const zoneDesactivee = await this.prisma.orm.public.Zone
      .where((z: any) => z.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return zoneDesactivee;
  }
}

