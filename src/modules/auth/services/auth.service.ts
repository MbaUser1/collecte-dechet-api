import 'temporal-polyfill/full/global';
import { Temporal } from 'temporal-polyfill';
import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { InscriptionDto } from '../dto/inscription.dto.js';
import { ConnexionDto } from '../dto/connexion.dto.js';
import { RafraichirDto } from '../dto/rafraichir.dto.js';
import { ModifierProfilDto } from '../dto/modifier-profil.dto.js';
import { ChangerMotDePasseDto } from '../dto/changer-mot-de-passe.dto.js';
import { HachageService } from './hachage.service.js';
import { JetonService } from './jeton.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hachage: HachageService,
    private readonly jeton: JetonService,
  ) {}

  /**
   * Inscription publique : uniquement PARTICULIER et ENTREPRISE.
   */
  async inscrire(dto: InscriptionDto, ip?: string, userAgent?: string) {
    if (dto.role !== 'PARTICULIER' && dto.role !== 'ENTREPRISE') {
      throw new BadRequestException(
        "L'inscription publique est exclusivement réservée aux rôles 'PARTICULIER' et 'ENTREPRISE'.",
      );
    }

    // 1. Vérifier l'unicité du téléphone
    const utilisateurExistantTel =
      await this.prisma.orm.public.Utilisateur.where((u) =>
        u.telephone.eq(dto.telephone as any),
      ).first();

    if (utilisateurExistantTel) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro de téléphone.',
      );
    }

    // 2. Vérifier l'unicité de l'email si renseigné
    if (dto.email && dto.email.trim().length > 0) {
      const utilisateurExistantEmail =
        await this.prisma.orm.public.Utilisateur.where((u) =>
          u.email.eq(dto.email as any),
        ).first();

      if (utilisateurExistantEmail) {
        throw new ConflictException(
          'Un compte existe déjà avec cette adresse email.',
        );
      }
    }

    // 3. Hacher le mot de passe
    const motDePasseHache = await this.hachage.hacherMotDePasse(
      dto.mot_de_passe,
    );

    // 4. Créer l'utilisateur
    const nouvelUtilisateur = await this.prisma.orm.public.Utilisateur.create({
      nom: dto.nom as any,
      telephone: dto.telephone as any,
      email: (dto.email ?? null) as any,
      mot_de_passe: motDePasseHache,
      role: dto.role as any,
      statut: 'ACTIF' as any,
      telephone_verifie: false,
    });

    // 5. Créer l'entité Entreprise si le rôle est ENTREPRISE
    if (dto.role === 'ENTREPRISE') {
      await this.prisma.orm.public.Entreprise.create({
        utilisateur_id: nouvelUtilisateur.id,
        nom: (dto.raison_sociale || dto.nom) as any,
        raison_sociale: (dto.raison_sociale ?? null) as any,
        numero_enregistrement: (dto.numero_enregistrement ?? null) as any,
        telephone: (dto.telephone ?? null) as any,
        email: (dto.email ?? null) as any,
        statut: 'ACTIF' as any,
      });
    }

    // 6. Créer le portefeuille associé avec solde initial à 0
    await this.prisma.orm.public.Portefeuille.create({
      utilisateur_id: nouvelUtilisateur.id,
      solde: '0' as any,
      devise: 'XAF' as any,
      statut: 'ACTIF' as any,
    });

    // 7. Créer une session initiale et générer les jetons
    const tokens = await this.creerSessionEtJetons(
      nouvelUtilisateur,
      ip,
      userAgent,
    );

    return {
      utilisateur: this.assainirUtilisateur(nouvelUtilisateur),
      tokens,
    };
  }

  /**
   * Connexion : vérification d'identifiants sans fuite d'existence de compte.
   */
  async connecter(dto: ConnexionDto, ip?: string, userAgent?: string) {
    const identifiant = dto.identifiant.trim();

    // Recherche par téléphone ou email
    let utilisateur = await this.prisma.orm.public.Utilisateur.where((u) =>
      u.telephone.eq(identifiant as any),
    ).first();

    if (!utilisateur) {
      utilisateur = await this.prisma.orm.public.Utilisateur.where((u) =>
        u.email.eq(identifiant as any),
      ).first();
    }

    if (!utilisateur) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    const motDePasseValide = await this.hachage.verifierMotDePasse(
      dto.mot_de_passe,
      utilisateur.mot_de_passe,
    );

    if (!motDePasseValide) {
      throw new UnauthorizedException('Identifiants incorrects.');
    }

    if (utilisateur.statut === 'SUSPENDU') {
      throw new ForbiddenException(
        "Votre compte a été suspendu. Veuillez contacter l'administration.",
      );
    }

    if (utilisateur.statut === 'INACTIF') {
      throw new ForbiddenException('Votre compte est actuellement inactif.');
    }

    const tokens = await this.creerSessionEtJetons(utilisateur, ip, userAgent);

    return {
      utilisateur: this.assainirUtilisateur(utilisateur),
      tokens,
    };
  }

  /**
   * Rafraîchissement avec invalidation atomique de l'ancien jeton (rotation des jetons).
   */
  async rafraichir(dto: RafraichirDto, ip?: string, userAgent?: string) {
    if (!dto.refresh_token || typeof dto.refresh_token !== 'string') {
      throw new UnauthorizedException(
        'Jeton de rafraîchissement manquant ou invalide.',
      );
    }

    // Protection anti-confusion : refuser si un jeton d'accès JWT est envoyé comme refresh token
    if (
      dto.refresh_token.includes('.') ||
      dto.refresh_token.startsWith('eyJ')
    ) {
      throw new UnauthorizedException(
        'Format de jeton invalide : un jeton d’accès ne peut pas être utilisé comme jeton de rafraîchissement.',
      );
    }

    const executer = async (prismaClient: any) => {
      const hashJeton = this.hachage.hacherJeton(dto.refresh_token);

      const session = await prismaClient.orm.public.SessionUtilisateur.where(
        (s: any) => s.jeton_refresh_hash.eq(hashJeton as any),
      ).first();

      if (!session) {
        throw new UnauthorizedException(
          'Jeton de rafraîchissement invalide ou inexistant.',
        );
      }

      if (session.revoque) {
        // Détection de réutilisation suspecte : alerte potentielle
        throw new UnauthorizedException(
          'Ce jeton de rafraîchissement a déjà été utilisé ou révoqué.',
        );
      }

      const maintenant = Date.now();
      const expiration = session.date_expiration.epochMilliseconds;

      if (expiration < maintenant) {
        throw new UnauthorizedException(
          'Le jeton de rafraîchissement a expiré.',
        );
      }

      // 1. Invalider immédiatement et de manière atomique conditionnelle l'ancienne session
      const sessionRevoquee =
        await prismaClient.orm.public.SessionUtilisateur.where((s: any) =>
          s.id.eq(session.id).and(s.revoque.eq(false)),
        ).update({ revoque: true } as any);

      if (!sessionRevoquee) {
        throw new UnauthorizedException(
          'Ce jeton de rafraîchissement a déjà été utilisé ou révoqué.',
        );
      }

      // 2. Charger l'utilisateur associé pour vérifier son statut
      const utilisateur = await prismaClient.orm.public.Utilisateur.where(
        (u: any) => u.id.eq(session.utilisateur_id),
      ).first();

      if (!utilisateur || utilisateur.statut !== 'ACTIF') {
        throw new UnauthorizedException(
          'Compte utilisateur indisponible ou inactif.',
        );
      }

      // 3. Créer une nouvelle session et émettre de nouveaux jetons
      const tokens = await this.creerSessionEtJetons(
        utilisateur,
        ip,
        userAgent,
        prismaClient,
      );

      return { tokens };
    };

    if (typeof this.prisma.transaction === 'function') {
      return this.prisma.transaction(executer);
    }
    return executer(this.prisma);
  }

  /**
   * Déconnexion : révocation de la session.
   */
  async deconnecter(refreshToken?: string) {
    if (refreshToken) {
      const hash = this.hachage.hacherJeton(refreshToken);
      await this.prisma.orm.public.SessionUtilisateur.where((s) =>
        s.jeton_refresh_hash.eq(hash as any),
      ).update({ revoque: true } as any);
    }

    return { message: 'Déconnexion effectuée avec succès.' };
  }

  /**
   * Consultation du profil connecté.
   */
  async obtenirProfil(utilisateurId: bigint) {
    const utilisateur = await this.prisma.orm.public.Utilisateur.where((u) =>
      u.id.eq(utilisateurId),
    ).first();

    if (!utilisateur) {
      throw new NotFoundException('Profil utilisateur introuvable.');
    }

    return this.assainirUtilisateur(utilisateur);
  }

  /**
   * Modification des seuls champs autorisés du profil (nom, email, photo).
   */
  async modifierProfil(utilisateurId: bigint, dto: ModifierProfilDto) {
    const utilisateur = await this.prisma.orm.public.Utilisateur.where((u) =>
      u.id.eq(utilisateurId),
    ).first();

    if (!utilisateur) {
      throw new NotFoundException('Profil utilisateur introuvable.');
    }

    if (dto.email && dto.email !== utilisateur.email) {
      const emailExistant = await this.prisma.orm.public.Utilisateur.where(
        (u) => u.email.eq(dto.email as any),
      ).first();

      if (emailExistant && emailExistant.id !== utilisateurId) {
        throw new ConflictException(
          'Cette adresse email est déjà utilisée par un autre compte.',
        );
      }
    }

    const payloadMaj: Record<string, unknown> = {};
    if (dto.nom !== undefined) payloadMaj.nom = dto.nom;
    if (dto.email !== undefined) payloadMaj.email = dto.email;
    if (dto.photo !== undefined) payloadMaj.photo = dto.photo;

    const utilisateurMisAJour = await this.prisma.orm.public.Utilisateur.where(
      (u) => u.id.eq(utilisateurId),
    ).update(payloadMaj as any);

    return this.assainirUtilisateur(utilisateurMisAJour);
  }

  /**
   * Changement de mot de passe et révocation de toutes les sessions actives.
   */
  async changerMotDePasse(utilisateurId: bigint, dto: ChangerMotDePasseDto) {
    const utilisateur = await this.prisma.orm.public.Utilisateur.where((u) =>
      u.id.eq(utilisateurId),
    ).first();

    if (!utilisateur) {
      throw new NotFoundException('Utilisateur introuvable.');
    }

    const valide = await this.hachage.verifierMotDePasse(
      dto.ancien_mot_de_passe,
      utilisateur.mot_de_passe,
    );

    if (!valide) {
      throw new BadRequestException("L'ancien mot de passe est incorrect.");
    }

    const nouveauHash = await this.hachage.hacherMotDePasse(
      dto.nouveau_mot_de_passe,
    );

    // 1. Mettre à jour le mot de passe
    await this.prisma.orm.public.Utilisateur.where((u) =>
      u.id.eq(utilisateurId),
    ).update({ mot_de_passe: nouveauHash } as any);

    // 2. Révoquer toutes les sessions de l'utilisateur
    await this.prisma.orm.public.SessionUtilisateur.where((s) =>
      s.utilisateur_id.eq(utilisateurId),
    ).update({ revoque: true } as any);

    return {
      message:
        'Mot de passe modifié avec succès. Toutes les sessions actives ont été révoquées.',
    };
  }

  /**
   * Consultation des sessions actives et passées du compte connecté.
   * Ne renvoie jamais les empreintes de jetons ou secrets.
   */
  async listerSessions(utilisateurId: bigint) {
    const sessions = await this.prisma.orm.public.SessionUtilisateur.where(
      (s) => s.utilisateur_id.eq(utilisateurId),
    )
      .orderBy((s: any) => s.date_creation.desc())
      .all();

    return sessions.map((s: any) => ({
      id: s.id.toString(),
      adresse_ip: s.adresse_ip,
      agent_utilisateur: s.agent_utilisateur,
      revoque: s.revoque,
      date_expiration: s.date_expiration,
      date_creation: s.date_creation,
    }));
  }

  /**
   * Révocation d'une session ciblée avec vérification de propriété.
   */
  async revoquerSession(utilisateurId: bigint, sessionId: bigint) {
    const session = await this.prisma.orm.public.SessionUtilisateur.where((s) =>
      s.id.eq(sessionId),
    ).first();

    if (!session) {
      throw new NotFoundException('Session introuvable.');
    }

    if (session.utilisateur_id !== utilisateurId) {
      throw new ForbiddenException('Cette session ne vous appartient pas.');
    }

    if (!session.revoque) {
      await this.prisma.orm.public.SessionUtilisateur.where((s) =>
        s.id.eq(sessionId),
      ).update({ revoque: true } as any);
    }

    return { message: 'Session révoquée avec succès.' };
  }

  /**
   * Révocation de toutes les sessions de l'utilisateur connecté.
   */
  async revoquerToutesLesSessions(utilisateurId: bigint) {
    await this.prisma.orm.public.SessionUtilisateur.where((s: any) =>
      s.utilisateur_id.eq(utilisateurId).and(s.revoque.eq(false)),
    ).update({ revoque: true } as any);

    return {
      message: 'Toutes vos sessions actives ont été révoquées avec succès.',
    };
  }

  private async creerSessionEtJetons(
    utilisateur: any,
    ip?: string,
    userAgent?: string,
    clientTx?: any,
  ) {
    const prisma = clientTx || this.prisma;

    const refreshTokenBrut = this.hachage.genererJetonAleatoire(32);
    const refreshTokenHash = this.hachage.hacherJeton(refreshTokenBrut);

    // Expiration du refresh token dans 30 jours.
    // Le codec PostgreSQL attend un Temporal.Instant.
    const dateExpiration = Temporal.Now.instant().add({
      seconds: 30 * 24 * 60 * 60,
    });
    await prisma.orm.public.SessionUtilisateur.create({
      utilisateur_id: utilisateur.id,
      jeton_refresh_hash: refreshTokenHash as any,
      adresse_ip: (ip ?? null) as any,
      agent_utilisateur: (userAgent ?? null) as any,
      revoque: false,
      date_expiration: dateExpiration as any,
    });

    const accessToken = this.jeton.genererAccessToken({
      sub: utilisateur.id.toString(),
      role: utilisateur.role,
      telephone: utilisateur.telephone,
    });

    return {
      access_token: accessToken,
      refresh_token: refreshTokenBrut,
      token_type: 'Bearer',
      expires_in: 15 * 60, // 15 minutes
    };
  }

  /**
   * Supprime le mot de passe et convertit les BigInt en string pour sérialisation JSON sécurisée.
   */
  private assainirUtilisateur(utilisateur: any) {
    if (!utilisateur) return null;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { mot_de_passe, ...sanitized } = utilisateur;
    return {
      ...sanitized,
      id: sanitized.id?.toString(),
    };
  }
}
