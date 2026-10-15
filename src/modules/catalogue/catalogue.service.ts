import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreerCategorieDto } from './dto/creer-categorie.dto.js';
import { ModifierCategorieDto } from './dto/modifier-categorie.dto.js';
import { FiltreCategoriesDto } from './dto/filtre-categories.dto.js';
import { CreerTypeDechetDto } from './dto/creer-type-dechet.dto.js';
import { ModifierTypeDechetDto } from './dto/modifier-type-dechet.dto.js';
import { FiltreTypesDechetsDto } from './dto/filtre-types-dechets.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';
import { compterLignes } from '../../common/utils/compteur.util.js';

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================
  // CATÉGORIES DE DÉCHETS
  // ==========================================

  async listerCategories(filtre: FiltreCategoriesDto): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.CategorieDechet;

    const statutFiltre = filtre.statut || 'ACTIF';
    if (statutFiltre !== 'TOUS') {
      query = query.where((c: any) => c.statut.eq(statutFiltre));
    }

    if (filtre.recherche && filtre.recherche.trim().length > 0) {
      const recherchePattern = `%${filtre.recherche.trim()}%`;
      query = query.where((c: any) => c.nom.ilike(recherchePattern));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'nom', 'date_creation'],
      'nom',
    );
    const estDesc = (filtre.ordre || 'asc').toLowerCase() === 'desc';

    query = query.orderBy((c: any) =>
      estDesc ? c[champTri].desc() : c[champTri].asc(),
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

  async obtenirCategorieParId(id: bigint) {
    const categorie = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(id))
      .first();

    if (!categorie) {
      throw new NotFoundException('Catégorie de déchet introuvable.');
    }

    // Récupérer les types associés actifs
    const typesAssocies = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.categorie_dechet_id.eq(id))
      .where((t: any) => t.statut.eq('ACTIF'))
      .orderBy((t: any) => t.nom.asc())
      .all();

    return {
      ...categorie,
      types_dechets: typesAssocies,
    };
  }

  async creerCategorie(dto: CreerCategorieDto) {
    // Vérifier l'unicité fonctionnelle du nom parmi les catégories actives
    const existante = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.nom.ilike(dto.nom.trim()))
      .first();

    if (existante && existante.statut === 'ACTIF') {
      throw new ConflictException(
        `Une catégorie active avec le nom '${dto.nom.trim()}' existe déjà.`,
      );
    }

    const nouvelleCategorie = await this.prisma.orm.public.CategorieDechet.create({
      nom: dto.nom.trim() as any,
      description: (dto.description ?? null) as any,
      statut: (dto.statut || 'ACTIF') as any,
    });

    return nouvelleCategorie;
  }

  async modifierCategorie(id: bigint, dto: ModifierCategorieDto) {
    const categorie = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(id))
      .first();

    if (!categorie) {
      throw new NotFoundException('Catégorie de déchet introuvable.');
    }

    if (dto.nom && dto.nom.trim().toLowerCase() !== categorie.nom.toLowerCase()) {
      const existante = await this.prisma.orm.public.CategorieDechet
        .where((c: any) => c.nom.ilike(dto.nom!.trim()))
        .first();

      if (existante && existante.id !== id && existante.statut === 'ACTIF') {
        throw new ConflictException(
          `Une catégorie active avec le nom '${dto.nom!.trim()}' existe déjà.`,
        );
      }
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.statut !== undefined) payload.statut = dto.statut;

    const categorieModifiee = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(id))
      .update(payload as any);

    return categorieModifiee;
  }

  async desactiverCategorie(id: bigint) {
    const categorie = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(id))
      .first();

    if (!categorie) {
      throw new NotFoundException('Catégorie de déchet introuvable.');
    }

    // Désactivation logique (ne pas supprimer physiquement les données liées)
    const categorieDesactivee = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return categorieDesactivee;
  }

  // ==========================================
  // TYPES DE DÉCHETS
  // ==========================================

  async listerTypesDechets(filtre: FiltreTypesDechetsDto): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.TypeDechet;

    const statutFiltre = filtre.statut || 'ACTIF';
    if (statutFiltre !== 'TOUS') {
      query = query.where((t: any) => t.statut.eq(statutFiltre));
    }

    if (filtre.categorie_dechet_id) {
      const catId = BigInt(filtre.categorie_dechet_id);
      query = query.where((t: any) => t.categorie_dechet_id.eq(catId));
    }

    if (filtre.recherche && filtre.recherche.trim().length > 0) {
      const recherchePattern = `%${filtre.recherche.trim()}%`;
      query = query.where((t: any) => t.nom.ilike(recherchePattern));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'nom', 'date_creation'],
      'nom',
    );
    const estDesc = (filtre.ordre || 'asc').toLowerCase() === 'desc';

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

  async obtenirTypeDechetParId(id: bigint) {
    const typeDechet = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.id.eq(id))
      .first();

    if (!typeDechet) {
      throw new NotFoundException('Type de déchet introuvable.');
    }

    // Récupérer la catégorie parente
    const categorie = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(typeDechet.categorie_dechet_id))
      .first();

    return {
      ...typeDechet,
      categorie,
    };
  }

  async creerTypeDechet(dto: CreerTypeDechetDto) {
    const categorieId = BigInt(dto.categorie_dechet_id);
    const categorie = await this.prisma.orm.public.CategorieDechet
      .where((c: any) => c.id.eq(categorieId))
      .first();

    if (!categorie) {
      throw new NotFoundException('Catégorie de déchet parente introuvable.');
    }

    // Vérifier l'unicité fonctionnelle du nom dans cette catégorie
    const existant = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.categorie_dechet_id.eq(categorieId))
      .where((t: any) => t.nom.ilike(dto.nom.trim()))
      .first();

    if (existant && existant.statut === 'ACTIF') {
      throw new ConflictException(
        `Un type de déchet actif avec le nom '${dto.nom.trim()}' existe déjà dans cette catégorie.`,
      );
    }

    const nouveauType = await this.prisma.orm.public.TypeDechet.create({
      categorie_dechet_id: categorieId as any,
      nom: dto.nom.trim() as any,
      description: (dto.description ?? null) as any,
      statut: (dto.statut || 'ACTIF') as any,
    });

    return nouveauType;
  }

  async modifierTypeDechet(id: bigint, dto: ModifierTypeDechetDto) {
    const typeDechet = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.id.eq(id))
      .first();

    if (!typeDechet) {
      throw new NotFoundException('Type de déchet introuvable.');
    }

    let nouvelleCategorieId = typeDechet.categorie_dechet_id;
    if (dto.categorie_dechet_id !== undefined) {
      nouvelleCategorieId = BigInt(dto.categorie_dechet_id);
      const categorie = await this.prisma.orm.public.CategorieDechet
        .where((c: any) => c.id.eq(nouvelleCategorieId))
        .first();

      if (!categorie) {
        throw new NotFoundException('Catégorie de déchet parente introuvable.');
      }
    }

    if (dto.nom && dto.nom.trim().toLowerCase() !== typeDechet.nom.toLowerCase()) {
      const existant = await this.prisma.orm.public.TypeDechet
        .where((t: any) => t.categorie_dechet_id.eq(nouvelleCategorieId))
        .where((t: any) => t.nom.ilike(dto.nom!.trim()))
        .first();

      if (existant && existant.id !== id && existant.statut === 'ACTIF') {
        throw new ConflictException(
          `Un type de déchet actif avec le nom '${dto.nom!.trim()}' existe déjà dans cette catégorie.`,
        );
      }
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.categorie_dechet_id !== undefined) payload.categorie_dechet_id = nouvelleCategorieId;
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.statut !== undefined) payload.statut = dto.statut;

    const typeModifie = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.id.eq(id))
      .update(payload as any);

    return typeModifie;
  }

  async desactiverTypeDechet(id: bigint) {
    const typeDechet = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.id.eq(id))
      .first();

    if (!typeDechet) {
      throw new NotFoundException('Type de déchet introuvable.');
    }

    // Ne supprime pas physiquement les éléments déjà référencés par des tarifs ou des demandes
    const typeDesactive = await this.prisma.orm.public.TypeDechet
      .where((t: any) => t.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return typeDesactive;
  }
}

