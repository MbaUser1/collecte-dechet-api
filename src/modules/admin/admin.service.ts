import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { FiltreAdminUtilisateursDto, StatutUtilisateurEnum } from './dto/filtre-admin-utilisateurs.dto.js';
import { ChangerStatutUtilisateurDto } from './dto/changer-statut-utilisateur.dto.js';
import { FiltreAdminDemandesDto } from './dto/filtre-admin-demandes.dto.js';
import { AffecterCollecteurDto } from './dto/affecter-collecteur.dto.js';
import { ResultatPagine } from '../../common/dto/pagination-query.dto.js';
import { serialiserDonnees } from '../../common/utils/serializer.util.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Tableau de bord synthétique des opérations administratives.
   */
  async obtenirDashboard(): Promise<any> {
    const rawCounts = await Promise.all([
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.count()),
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.where((d) => d.statut.eq('EN_ATTENTE_ATTRIBUTION' as any)).count()),
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.where((d) => d.statut.eq('ATTRIBUEE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.where((d) => d.statut.eq('EN_COURS' as any)).count()),
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.where((d) => d.statut.eq('TERMINEE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.where((d) => d.statut.eq('ECHOUEE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.DemandeCollecte.where((d) => d.statut.eq('ANNULEE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Utilisateur.where((u) => u.role.eq('PARTICULIER' as any)).where((u) => u.statut.eq('ACTIF' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Utilisateur.where((u) => u.role.eq('ENTREPRISE' as any)).where((u) => u.statut.eq('ACTIF' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Utilisateur.where((u) => u.role.eq('COLLECTEUR' as any)).where((u) => u.statut.eq('ACTIF' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Utilisateur.where((u) => u.statut.eq('SUSPENDU' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Utilisateur.count()),
      Promise.resolve(this.prisma.orm.public.Abonnement.where((a) => a.statut.eq('ACTIF' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Abonnement.count()),
      Promise.resolve(this.prisma.orm.public.Paiement.where((p) => p.statut.eq('EN_ATTENTE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Paiement.where((p) => p.statut.eq('REMBOURSE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.AjustementPrix.where((a) => a.statut.eq('EN_ATTENTE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Facture.where((f) => f.statut.eq('EMISE' as any)).count()),
      Promise.resolve(this.prisma.orm.public.Facture.where((f) => f.statut.eq('PARTIELLEMENT_PAYEE' as any)).count()),
    ]);

    const [
      totalDemandes,
      demandesEnAttenteAttribution,
      demandesAttribuees,
      demandesEnCours,
      demandesTerminees,
      demandesEchouees,
      demandesAnnulees,
      particuliersActifs,
      entreprisesActives,
      collecteursActifs,
      utilisateursSuspendus,
      totalUtilisateurs,
      abonnementsActifs,
      totalAbonnements,
      paiementsEnAttente,
      paiementsRembourses,
      ajustementsEnAttente,
      facturesImpayees,
      facturesPartielles,
    ] = rawCounts.map((c) => Number(c));

    return {
      demandes: {
        total: totalDemandes,
        en_attente_attribution: demandesEnAttenteAttribution,
        attribuees: demandesAttribuees,
        en_cours: demandesEnCours,
        terminees: demandesTerminees,
        echouees: demandesEchouees,
        annulees: demandesAnnulees,
      },
      utilisateurs: {
        total: totalUtilisateurs,
        particuliers_actifs: particuliersActifs,
        entreprises_actives: entreprisesActives,
        collecteurs_actifs: collecteursActifs,
        suspendus: utilisateursSuspendus,
      },
      abonnements: {
        total: totalAbonnements,
        actifs: abonnementsActifs,
      },
      finances: {
        paiements_en_attente: paiementsEnAttente,
        paiements_rembourses: paiementsRembourses,
        ajustements_en_attente: ajustementsEnAttente,
        factures_impayees: facturesImpayees,
        factures_partiellement_payees: facturesPartielles,
      },
    };
  }

  /**
   * Liste paginée des utilisateurs pour l'administration.
   */
  async listerUtilisateurs(filtre: FiltreAdminUtilisateursDto): Promise<ResultatPagine<any>> {
    const page = filtre.page || 1;
    const limite = filtre.limite || 20;
    const offset = (page - 1) * limite;

    let requete = this.prisma.orm.public.Utilisateur;

    if (filtre.role) {
      requete = requete.where((u) => u.role.eq(filtre.role as any)) as any;
    }
    if (filtre.statut) {
      requete = requete.where((u) => u.statut.eq(filtre.statut as any)) as any;
    }

    const [elements, totalCount] = await Promise.all([
      requete
        .orderBy((u: any) => u.date_creation.desc())
        .offset(offset)
        .limit(limite)
        .all(),
      Promise.resolve(requete.count()),
    ]);

    const total = Number(totalCount);

    const formatted = elements.map((u: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { mot_de_passe, ...sanitized } = u;
      return serialiserDonnees(sanitized);
    });

    return {
      elements: formatted,
      pagination: {
        total,
        page,
        limite,
        pages_totales: Math.ceil(total / limite) || 1,
      },
    };
  }

  /**
   * Détail d'un utilisateur par ID.
   */
  async obtenirUtilisateur(id: bigint) {
    const user = await this.prisma.orm.public.Utilisateur
      .where((u) => u.id.eq(id))
      .first();

    if (!user) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mot_de_passe, ...sanitized } = user;
    return serialiserDonnees(sanitized);
  }

  /**
   * Modification du statut d'un utilisateur avec révocation de session si suspension et traçabilité audit.
   */
  async changerStatutUtilisateur(
    id: bigint,
    dto: ChangerStatutUtilisateurDto,
    adminId: bigint,
    ip?: string,
    userAgent?: string,
  ) {
    if (id === adminId && dto.statut === StatutUtilisateurEnum.SUSPENDU) {
      throw new BadRequestException('Un administrateur ne peut pas suspendre son propre compte.');
    }

    return this.prisma.transaction(async (tx: any) => {
      const user = await tx.orm.public.Utilisateur
        .where((u: any) => u.id.eq(id))
        .first();

      if (!user) {
        throw new NotFoundException('Utilisateur introuvable.');
      }

      const ancienStatut = user.statut;

      const utilisateurMaj = await tx.orm.public.Utilisateur
        .where((u: any) => u.id.eq(id))
        .update({
          statut: dto.statut as any,
          date_modification: new Date() as any,
        });

      // Si suspension : révocation immédiate de toutes les sessions actives
      if (dto.statut === StatutUtilisateurEnum.SUSPENDU) {
        await tx.orm.public.SessionUtilisateur
          .where((s: any) => s.utilisateur_id.eq(id))
          .update({ revoque: true } as any);
      }

      // Enregistrement d'audit
      await this.auditService.enregistrerAction(
        adminId,
        dto.statut === StatutUtilisateurEnum.SUSPENDU ? 'SUSPENSION_COMPTE' : 'CHANGEMENT_STATUT_COMPTE',
        'Utilisateur',
        id,
        {
          ancien_statut: ancienStatut,
          nouveau_statut: dto.statut,
          motif: dto.motif ?? null,
        },
        ip,
        userAgent,
        tx,
      );

      // Notification à l'utilisateur
      await this.notificationsService.envoyerNotification(
        id,
        'Mise à jour du statut de votre compte',
        `Le statut de votre compte a été changé en : ${dto.statut}.${dto.motif ? ' Motif : ' + dto.motif : ''}`,
        'COMPTE',
        { ancien_statut: ancienStatut, nouveau_statut: dto.statut },
        tx,
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { mot_de_passe, ...sanitized } = utilisateurMaj;
      return serialiserDonnees(sanitized);
    });
  }

  /**
   * Consultation paginée des demandes de collecte pour l'administration.
   */
  async listerDemandes(filtre: FiltreAdminDemandesDto): Promise<ResultatPagine<any>> {
    const page = filtre.page || 1;
    const limite = filtre.limite || 20;
    const offset = (page - 1) * limite;

    let requete = this.prisma.orm.public.DemandeCollecte;

    if (filtre.statut) {
      requete = requete.where((d) => d.statut.eq(filtre.statut as any)) as any;
    }
    if (filtre.zone_id) {
      requete = requete.where((d) => d.zone_id.eq(BigInt(filtre.zone_id!))) as any;
    }
    if (filtre.type_dechet_id) {
      requete = requete.where((d) => d.type_dechet_id.eq(BigInt(filtre.type_dechet_id!))) as any;
    }
    if (filtre.client_id) {
      requete = requete.where((d) => d.utilisateur_id.eq(BigInt(filtre.client_id!))) as any;
    }
    if (filtre.collecteur_id) {
      requete = requete.where((d) => d.collecteur_id.eq(BigInt(filtre.collecteur_id!))) as any;
    }

    const [elements, totalCount] = await Promise.all([
      requete
        .orderBy((d: any) => d.date_creation.desc())
        .offset(offset)
        .limit(limite)
        .all(),
      Promise.resolve(requete.count()),
    ]);

    const total = Number(totalCount);

    return {
      elements: elements.map((d: any) => serialiserDonnees(d)),
      pagination: {
        total,
        page,
        limite,
        pages_totales: Math.ceil(total / limite) || 1,
      },
    };
  }

  /**
   * Détail complet d'une demande avec historique opérationnel.
   */
  async obtenirDemande(id: bigint) {
    const demande = await this.prisma.orm.public.DemandeCollecte
      .where((d) => d.id.eq(id))
      .first();

    if (!demande) {
      throw new NotFoundException('Demande de collecte introuvable.');
    }

    const [mission, paiements, ajustements] = await Promise.all([
      this.prisma.orm.public.MissionCollecte
        .where((m) => m.demande_collecte_id.eq(id))
        .first(),
      this.prisma.orm.public.Paiement
        .where((p) => p.demande_collecte_id.eq(id))
        .orderBy((p: any) => p.date_creation.desc())
        .all(),
      this.prisma.orm.public.AjustementPrix
        .where((a) => a.demande_collecte_id.eq(id))
        .orderBy((a: any) => a.date_creation.desc())
        .all(),
    ]);

    let elementsCollectes: any[] = [];
    if (mission) {
      elementsCollectes = await this.prisma.orm.public.ElementCollecte
        .where((e) => e.mission_collecte_id.eq(mission.id))
        .all();
    }

    return {
      demande: serialiserDonnees(demande),
      mission: mission
        ? {
            ...serialiserDonnees(mission),
            elements: elementsCollectes.map((e) => serialiserDonnees(e)),
          }
        : null,
      paiements: paiements.map((p) => serialiserDonnees(p)),
      ajustements: ajustements.map((a) => serialiserDonnees(a)),
    };
  }

  /**
   * Affectation administrative atomique d'une demande disponible à un collecteur actif.
   */
  async affecterCollecteur(
    demandeId: bigint,
    dto: AffecterCollecteurDto,
    adminId: bigint,
    ip?: string,
    userAgent?: string,
  ) {
    const collecteurId = BigInt(dto.collecteur_id);

    // 1. Vérification du collecteur cible
    const collecteur = await this.prisma.orm.public.Utilisateur
      .where((u) => u.id.eq(collecteurId))
      .first();

    if (!collecteur || collecteur.role !== 'COLLECTEUR' || collecteur.statut !== 'ACTIF') {
      throw new BadRequestException(
        "Le collecteur spécifié n'existe pas, ne possède pas le rôle COLLECTEUR ou n'est pas actif.",
      );
    }

    return this.prisma.transaction(async (tx: any) => {
      // 2. Vérification de la demande
      const demande = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demandeId))
        .first();

      if (!demande) {
        throw new NotFoundException('Demande de collecte introuvable.');
      }

      if (demande.statut !== 'EN_ATTENTE_ATTRIBUTION' || demande.collecteur_id !== null) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTE_DEJA_ATTRIBUEE',
          message: "Cette collecte a déjà été acceptée ou n'est plus disponible pour affectation.",
        });
      }

      // 3. Vérification de non-existence de mission
      const missionExistante = await tx.orm.public.MissionCollecte
        .where((m: any) => m.demande_collecte_id.eq(demandeId))
        .first();

      if (missionExistante) {
        throw new ConflictException({
          statusCode: 409,
          code: 'COLLECTE_DEJA_ATTRIBUEE',
          message: 'Une mission a déjà été créée pour cette demande de collecte.',
        });
      }

      const maintenant = new Date();

      // 4. Mise à jour de la demande
      const demandeMaj = await tx.orm.public.DemandeCollecte
        .where((d: any) => d.id.eq(demandeId))
        .update({
          collecteur_id: collecteurId as any,
          statut: 'ATTRIBUEE' as any,
          date_attribution: maintenant as any,
          date_modification: maintenant as any,
        });

      // 5. Création de la mission opérationnelle
      const mission = await tx.orm.public.MissionCollecte.create({
        demande_collecte_id: demandeId as any,
        collecteur_id: collecteurId as any,
        statut: 'ATTRIBUEE' as any,
        date_attribution: maintenant as any,
        date_acceptation: maintenant as any,
      });

      // 6. Journal d'audit
      await this.auditService.enregistrerAction(
        adminId,
        'AFFECTATION_ADMINISTRATIVE_COLLECTEUR',
        'DemandeCollecte',
        demandeId,
        {
          collecteur_id: dto.collecteur_id,
          mission_id: mission.id?.toString(),
        },
        ip,
        userAgent,
        tx,
      );

      // 7. Notifications automatiques
      await this.notificationsService.envoyerNotification(
        collecteurId,
        'Nouvelle mission affectée',
        `Une demande de collecte (#${demande.numero}) vous a été affectée par l'administration.`,
        'MISSION',
        { demande_id: demandeId.toString(), mission_id: mission.id?.toString() },
        tx,
      );

      await this.notificationsService.envoyerNotification(
        demande.utilisateur_id,
        'Collecteur assigné à votre demande',
        `Un collecteur a été assigné à votre demande de collecte #${demande.numero}.`,
        'COLLECTE',
        { demande_id: demandeId.toString(), collecteur_id: dto.collecteur_id },
        tx,
      );

      return {
        succes: true,
        message: 'Demande affectée au collecteur avec succès.',
        mission: serialiserDonnees(mission),
        demande: serialiserDonnees(demandeMaj),
      };
    });
  }
}
