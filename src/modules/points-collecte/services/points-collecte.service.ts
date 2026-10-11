import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CreerPointCollecteDto } from '../dto/creer-point-collecte.dto.js';
import { ModifierPointCollecteDto } from '../dto/modifier-point-collecte.dto.js';

@Injectable()
export class PointsCollecteService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liste les points de collecte appartenant à l'utilisateur connecté ou à son entreprise.
   */
  async listerPoints(utilisateur: { id: bigint; role: string }) {
    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateur.id);
      return this.prisma.orm.public.PointCollecte
        .where((p: any) => p.entreprise_id.eq(entreprise.id))
        .orderBy((p: any) => p.date_creation.desc())
        .all();
    }

    return this.prisma.orm.public.PointCollecte
      .where((p: any) => p.utilisateur_id.eq(utilisateur.id))
      .orderBy((p: any) => p.date_creation.desc())
      .all();
  }

  /**
   * Récupère un point en vérifiant rigoureusement la propriété côté serveur.
   */
  async obtenirPointParId(id: bigint, utilisateur: { id: bigint; role: string }) {
    const point = await this.prisma.orm.public.PointCollecte
      .where((p: any) => p.id.eq(id))
      .first();

    if (!point) {
      throw new NotFoundException('Point de collecte introuvable.');
    }

    await this.verifierProprietePoint(point, utilisateur);

    return point;
  }

  /**
   * Crée un point de collecte en appliquant la règle d'unicité active pour les particuliers.
   */
  async creerPoint(dto: CreerPointCollecteDto, utilisateur: { id: bigint; role: string }) {
    const statutVoulu = dto.statut || 'ACTIF';

    if (utilisateur.role === 'PARTICULIER') {
      // Règle V1 : un particulier ne peut avoir qu'un seul point actif
      if (statutVoulu === 'ACTIF') {
        const pointActifExistant = await this.prisma.orm.public.PointCollecte
          .where((p: any) => p.utilisateur_id.eq(utilisateur.id))
          .where((p: any) => p.statut.eq('ACTIF'))
          .first();

        if (pointActifExistant) {
          throw new ConflictException(
            "Un utilisateur particulier ne peut posséder qu'un seul point de collecte actif en V1. Veuillez modifier ou désactiver le point existant.",
          );
        }
      }

      return this.prisma.orm.public.PointCollecte.create({
        utilisateur_id: utilisateur.id as any,
        entreprise_id: null as any,
        nom: dto.nom.trim() as any,
        adresse: dto.adresse.trim() as any,
        ville: dto.ville.trim() as any,
        quartier: dto.quartier.trim() as any,
        latitude: (dto.latitude ?? null) as any,
        longitude: (dto.longitude ?? null) as any,
        instructions_acces: (dto.instructions_acces ?? null) as any,
        statut: statutVoulu as any,
      });
    }

    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateur.id);

      return this.prisma.orm.public.PointCollecte.create({
        utilisateur_id: null as any,
        entreprise_id: entreprise.id as any,
        nom: dto.nom.trim() as any,
        adresse: dto.adresse.trim() as any,
        ville: dto.ville.trim() as any,
        quartier: dto.quartier.trim() as any,
        latitude: (dto.latitude ?? null) as any,
        longitude: (dto.longitude ?? null) as any,
        instructions_acces: (dto.instructions_acces ?? null) as any,
        statut: statutVoulu as any,
      });
    }

    // Pour les administrateurs créant un point personnel
    return this.prisma.orm.public.PointCollecte.create({
      utilisateur_id: utilisateur.id as any,
      entreprise_id: null as any,
      nom: dto.nom.trim() as any,
      adresse: dto.adresse.trim() as any,
      ville: dto.ville.trim() as any,
      quartier: dto.quartier.trim() as any,
      latitude: (dto.latitude ?? null) as any,
      longitude: (dto.longitude ?? null) as any,
      instructions_acces: (dto.instructions_acces ?? null) as any,
      statut: statutVoulu as any,
    });
  }

  /**
   * Modifie un point après vérification de propriété et d'unicité du point actif particulier.
   */
  async modifierPoint(
    id: bigint,
    dto: ModifierPointCollecteDto,
    utilisateur: { id: bigint; role: string },
  ) {
    const point = await this.obtenirPointParId(id, utilisateur);

    // Si un particulier tente d'activer ou réactiver ce point
    if (utilisateur.role === 'PARTICULIER' && dto.statut === 'ACTIF' && point.statut !== 'ACTIF') {
      const pointActifExistant = await this.prisma.orm.public.PointCollecte
        .where((p: any) => p.utilisateur_id.eq(utilisateur.id))
        .where((p: any) => p.statut.eq('ACTIF'))
        .first();

      if (pointActifExistant && pointActifExistant.id !== id) {
        throw new ConflictException(
          "Un utilisateur particulier ne peut posséder qu'un seul point de collecte actif en V1. Veuillez d'abord désactiver votre point actif actuel.",
        );
      }
    }

    const payload: Record<string, unknown> = {
      date_modification: new Date() as any,
    };
    if (dto.nom !== undefined) payload.nom = dto.nom.trim();
    if (dto.adresse !== undefined) payload.adresse = dto.adresse.trim();
    if (dto.ville !== undefined) payload.ville = dto.ville.trim();
    if (dto.quartier !== undefined) payload.quartier = dto.quartier.trim();
    if (dto.latitude !== undefined) payload.latitude = dto.latitude;
    if (dto.longitude !== undefined) payload.longitude = dto.longitude;
    if (dto.instructions_acces !== undefined) payload.instructions_acces = dto.instructions_acces;
    if (dto.statut !== undefined) payload.statut = dto.statut;

    const pointModifie = await this.prisma.orm.public.PointCollecte
      .where((p: any) => p.id.eq(id))
      .update(payload as any);

    return pointModifie;
  }

  /**
   * Désactive un point de collecte appartenant à l'utilisateur.
   */
  async desactiverPoint(id: bigint, utilisateur: { id: bigint; role: string }) {
    await this.obtenirPointParId(id, utilisateur);

    const pointDesactive = await this.prisma.orm.public.PointCollecte
      .where((p: any) => p.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return pointDesactive;
  }

  /**
   * Suppression ou désactivation sécurisée :
   * Ne supprime jamais physiquement si une demande historique référence ce point.
   */
  async supprimerPoint(id: bigint, utilisateur: { id: bigint; role: string }) {
    await this.obtenirPointParId(id, utilisateur);

    // Vérifier si des demandes historiques sont rattachées à ce point
    const nbDemandes = await this.prisma.orm.public.DemandeCollecte
      .where((d: any) => d.point_collecte_id.eq(id))
      .count();

    if (Number(nbDemandes) > 0) {
      // Préservation impérative de l'historique : désactivation logique uniquement
      await this.prisma.orm.public.PointCollecte
        .where((p: any) => p.id.eq(id))
        .update({
          statut: 'INACTIF',
          date_modification: new Date(),
        } as any);

      return {
        desactive: true,
        message:
          'Le point de collecte a été désactivé pour conserver l’historique des demandes associées.',
      };
    }

    // Si aucune demande historique n'est rattachée, désactivation logique propre
    await this.prisma.orm.public.PointCollecte
      .where((p: any) => p.id.eq(id))
      .update({
        statut: 'INACTIF',
        date_modification: new Date(),
      } as any);

    return {
      desactive: true,
      message: 'Point de collecte désactivé avec succès.',
    };
  }

  private async obtenirEntreprisePourUtilisateur(utilisateurId: bigint) {
    const entreprise = await this.prisma.orm.public.Entreprise
      .where((e: any) => e.utilisateur_id.eq(utilisateurId))
      .first();

    if (!entreprise) {
      throw new ForbiddenException('Aucune entreprise rattachée à ce compte utilisateur.');
    }

    return entreprise;
  }

  private async verifierProprietePoint(point: any, utilisateur: { id: bigint; role: string }) {
    if (utilisateur.role === 'ADMINISTRATEUR') {
      return;
    }

    if (utilisateur.role === 'ENTREPRISE') {
      const entreprise = await this.obtenirEntreprisePourUtilisateur(utilisateur.id);
      if (!point.entreprise_id || point.entreprise_id !== entreprise.id) {
        throw new ForbiddenException(
          'Accès refusé : vous n’êtes pas le propriétaire de ce point de collecte.',
        );
      }
      return;
    }

    if (!point.utilisateur_id || point.utilisateur_id !== utilisateur.id) {
      throw new ForbiddenException(
        'Accès refusé : vous n’êtes pas le propriétaire de ce point de collecte.',
      );
    }
  }
}
