import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreerPlanAbonnementDto } from './dto/creer-plan-abonnement.dto.js';
import { ModifierPlanAbonnementDto } from './dto/modifier-plan-abonnement.dto.js';
import { FiltrePlansAbonnementDto } from './dto/filtre-plans-abonnement.dto.js';
import {
  ResultatPagine,
  validerChampTri,
} from '../../common/dto/pagination-query.dto.js';
import { compterLignes } from '../../common/utils/compteur.util.js';

@Injectable()
export class PlansAbonnementService {
  constructor(private readonly prisma: PrismaService) {}

  async listerPlans(filtre: FiltrePlansAbonnementDto): Promise<ResultatPagine<any>> {
    let query: any = this.prisma.orm.public.PlanAbonnement;

    const statutFiltre = filtre.statut || 'ACTIF';
    if (statutFiltre !== 'TOUS') {
      query = query.where((p: any) => p.statut.eq(statutFiltre));
    }

    if (filtre.recherche && filtre.recherche.trim().length > 0) {
      const pattern = `%${filtre.recherche.trim()}%`;
      query = query.where((p: any) => p.nom.ilike(pattern));
    }

    const total = await compterLignes(query);

    const champTri = validerChampTri(
      filtre.trier_par,
      ['id', 'nom', 'prix', 'duree_jours', 'date_creation'],
      'nom',
    );
    const estDesc = (filtre.ordre || 'asc').toLowerCase() === 'desc';

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

  async obtenirPlanParId(id: bigint) {
    const plan = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(id))
      .first();

    if (!plan) {
      throw new NotFoundException("Plan d'abonnement introuvable.");
    }

    return plan;
  }

  async creerPlan(dto: CreerPlanAbonnementDto) {
    // Vérifier l'unicité fonctionnelle du nom parmi les plans actifs
    const existant = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.nom.ilike(dto.nom.trim()))
      .first();

    if (existant && existant.statut === 'ACTIF') {
      throw new ConflictException(
        `Un plan d'abonnement actif nommé '${dto.nom.trim()}' existe déjà.`,
      );
    }

    const nouveauPlan = await this.prisma.orm.public.PlanAbonnement.create({
      nom: dto.nom.trim() as any,
      description: (dto.description ?? null) as any,
      prix: dto.prix.toString() as any,
      duree_jours: dto.duree_jours as any,
      nombre_collectes_incluses: dto.nombre_collectes_incluses as any,
      poids_max_par_collecte: dto.poids_max_par_collecte.toString() as any,
      statut: (dto.statut || 'ACTIF') as any,
    });

    return nouveauPlan;
  }

  async modifierPlan(id: bigint, dto: ModifierPlanAbonnementDto) {
    const plan = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(id))
      .first();

    if (!plan) {
      throw new NotFoundException("Plan d'abonnement introuvable.");
    }

    if (dto.nom && dto.nom.trim().toLowerCase() !== plan.nom.toLowerCase()) {
      const existant = await this.prisma.orm.public.PlanAbonnement
        .where((p: any) => p.nom.ilike(dto.nom!.trim()))
        .first();

      if (existant && existant.id !== id && existant.statut === 'ACTIF') {
        throw new ConflictException(
          `Un plan d'abonnement actif nommé '${dto.nom!.trim()}' existe déjà.`,
        );
      }
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.description !== undefined) payload.description = dto.description;
    if (dto.prix !== undefined) payload.prix = dto.prix.toString();
    if (dto.duree_jours !== undefined) payload.duree_jours = dto.duree_jours;
    if (dto.nombre_collectes_incluses !== undefined) {
      payload.nombre_collectes_incluses = dto.nombre_collectes_incluses;
    }
    if (dto.poids_max_par_collecte !== undefined) {
      payload.poids_max_par_collecte = dto.poids_max_par_collecte.toString();
    }
    if (dto.statut !== undefined) payload.statut = dto.statut;

    const planModifie = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(id))
      .update(payload as any);

    return planModifie;
  }

  async desactiverPlan(id: bigint) {
    const plan = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(id))
      .first();

    if (!plan) {
      throw new NotFoundException("Plan d'abonnement introuvable.");
    }

    const planDesactive = await this.prisma.orm.public.PlanAbonnement
      .where((p: any) => p.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return planDesactive;
  }
}

