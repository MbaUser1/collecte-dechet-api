import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { FiltreAuditDto } from './dto/filtre-audit.dto.js';
import { ResultatPagine } from '../../common/dto/pagination-query.dto.js';
import { serialiserDonnees } from '../../common/utils/serializer.util.js';

const CLES_SENSIBLES = [
  'mot_de_passe',
  'password',
  'jeton',
  'token',
  'refresh_token',
  'secret',
  'signature',
  'jeton_refresh_hash',
];

export function assainirDetailsAudit(valeur: any): any {
  if (valeur === null || valeur === undefined) {
    return valeur;
  }
  if (typeof valeur !== 'object') {
    return valeur;
  }
  if (Array.isArray(valeur)) {
    return valeur.map((elt) => assainirDetailsAudit(elt));
  }
  const resultat: Record<string, any> = {};
  for (const [cle, val] of Object.entries(valeur)) {
    const cleNormalisee = cle.toLowerCase();
    if (CLES_SENSIBLES.some((sensible) => cleNormalisee.includes(sensible))) {
      resultat[cle] = '[MASQUE]';
    } else if (typeof val === 'object' && val !== null) {
      resultat[cle] = assainirDetailsAudit(val);
    } else {
      resultat[cle] = val;
    }
  }
  return resultat;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enregistre un événement dans le journal d'audit en assainissant les secrets.
   */
  async enregistrerAction(
    acteurId: bigint | null,
    action: string,
    entite: string,
    entiteId?: bigint | null,
    details?: Record<string, any> | string,
    adresseIp?: string,
    agentUtilisateur?: string,
    clientPrisma?: any,
  ): Promise<void> {
    try {
      let detailsFormates: string | null = null;
      if (details) {
        if (typeof details === 'string') {
          detailsFormates = details;
        } else {
          const assaini = assainirDetailsAudit(details);
          detailsFormates = JSON.stringify(assaini);
        }
      }

      const client = clientPrisma || this.prisma;
      await client.orm.public.JournalAudit.create({
        utilisateur_id: acteurId ?? null,
        action,
        entite,
        entite_id: entiteId ?? null,
        details: detailsFormates,
        adresse_ip: adresseIp ? adresseIp.substring(0, 50) : null,
        agent_utilisateur: agentUtilisateur ? agentUtilisateur.substring(0, 500) : null,
      });
    } catch (erreur) {
      // L'audit ne doit pas bloquer une opération métier critique, mais on consigne l'erreur
      this.logger.error(`Erreur lors de l'enregistrement d'audit: ${action} sur ${entite}`, erreur);
    }
  }

  /**
   * Liste les événements du journal d'audit avec pagination et filtres.
   */
  async listerJournaux(filtre: FiltreAuditDto): Promise<ResultatPagine<any>> {
    const page = filtre.page || 1;
    const limite = filtre.limite || 20;
    const offset = (page - 1) * limite;

    let requete = this.prisma.orm.public.JournalAudit;

    if (filtre.action) {
      requete = requete.where((j: any) => j.action.eq(filtre.action as any)) as any;
    }
    if (filtre.entite) {
      requete = requete.where((j: any) => j.entite.eq(filtre.entite as any)) as any;
    }
    if (filtre.utilisateur_id) {
      requete = requete.where((j: any) => j.utilisateur_id.eq(BigInt(filtre.utilisateur_id!))) as any;
    }

    const [elements, totalCount] = await Promise.all([
      requete
        .orderBy((j: any) => j.date_creation.desc())
        .offset(offset)
        .limit(limite)
        .all(),
      Promise.resolve(requete.count()),
    ]);

    const total = Number(totalCount);

    const formattedElements = elements.map((item: any) => ({
      ...serialiserDonnees(item),
      details: item.details ? (() => {
        try { return JSON.parse(item.details); } catch { return item.details; }
      })() : null,
    }));

    return {
      elements: formattedElements,
      pagination: {
        total,
        page,
        limite,
        pages_totales: Math.ceil(total / limite) || 1,
      },
    };
  }
}
