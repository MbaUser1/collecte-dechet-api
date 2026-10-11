import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { ModifierEntrepriseDto } from '../dto/modifier-entreprise.dto.js';

@Injectable()
export class EntrepriseService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenirProfilEntreprise(utilisateurId: bigint) {
    const entreprise = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.utilisateur_id.eq(utilisateurId))
      .first();

    if (!entreprise) {
      throw new NotFoundException('Profil entreprise introuvable pour cet utilisateur.');
    }

    return entreprise;
  }

  async modifierProfilEntreprise(utilisateurId: bigint, dto: ModifierEntrepriseDto) {
    const entreprise = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.utilisateur_id.eq(utilisateurId))
      .first();

    if (!entreprise) {
      throw new NotFoundException('Profil entreprise introuvable pour cet utilisateur.');
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.raison_sociale !== undefined) payload.raison_sociale = dto.raison_sociale.trim();
    if (dto.numero_enregistrement !== undefined) {
      payload.numero_enregistrement = dto.numero_enregistrement.trim();
    }
    if (dto.email !== undefined) payload.email = dto.email.trim();
    if (dto.telephone !== undefined) payload.telephone = dto.telephone.trim();

    const entrepriseModifiee = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.id.eq(entreprise.id))
      .update(payload as any);

    return entrepriseModifiee;
  }
}

