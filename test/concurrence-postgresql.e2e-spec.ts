import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';

const { Client } = pg;

/**
 * Dispositif d'inspection stricte de la base de données.
 * Empêche formellement toute exécution contre Supabase ou une base de production.
 */
function inspecterCibleConnexion(rawUrl?: string): {
  isConfigured: boolean;
  isIsolatedTestDb: boolean;
  refusalReason?: string;
  host?: string;
  port?: string;
  database?: string;
} {
  if (!rawUrl || rawUrl.trim().length === 0) {
    return {
      isConfigured: false,
      isIsolatedTestDb: false,
      refusalReason: 'DATABASE_TEST_URL non configuré dans l’environnement.',
    };
  }

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname;
    const port = parsed.port;
    const database = parsed.pathname.replace(/^\//, '');

    // Refus formel de Supabase ou de tout host cloud distant
    if (
      host.includes('supabase.com') ||
      host.includes('pooler.supabase.com') ||
      host.includes('amazonaws.com')
    ) {
      return {
        isConfigured: true,
        isIsolatedTestDb: false,
        host,
        port,
        database,
        refusalReason: 'INTERDICTION ABSOLUE : La chaîne cible l’infrastructure Supabase / Cloud de production.',
      };
    }

    // Refus si la base porte un nom de base standard ou de production
    const nomsInterdits = ['postgres', 'production', 'prod', 'master', 'main'];
    if (nomsInterdits.includes(database.toLowerCase())) {
      return {
        isConfigured: true,
        isIsolatedTestDb: false,
        host,
        port,
        database,
        refusalReason: `INTERDICTION : Le nom de la base ('${database}') ne correspond pas à une base dédiée aux tests (ex: 'collecte_dechets_test').`,
      };
    }

    const estLocal = ['localhost', '127.0.0.1', '::1'].includes(host);
    if (!estLocal) {
      return {
        isConfigured: true,
        isIsolatedTestDb: false,
        host,
        port,
        database,
        refusalReason: 'INTERDICTION : La base de test doit être hébergée localement ou sur une instance de test explicitement isolée.',
      };
    }

    return {
      isConfigured: true,
      isIsolatedTestDb: true,
      host,
      port,
      database,
    };
  } catch {
    return {
      isConfigured: false,
      isIsolatedTestDb: false,
      refusalReason: 'Format de chaîne de connexion invalide.',
    };
  }
}

function chargerDatabaseUrlProd(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (existsSync('.env')) {
    const contenu = readFileSync('.env', 'utf-8');
    const match = contenu.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

// Recherche prioritaire de la variable de test selon la convention unifiée
const dbUrlProd = chargerDatabaseUrlProd();
const dbUrlTest =
  process.env.DATABASE_TEST_URL ||
  process.env.DATABASE_URL_TEST ||
  process.env.TEST_DATABASE_URL;

const diagnostic = inspecterCibleConnexion(dbUrlTest);

describe('Sécurité et Validation de Concurrence PostgreSQL Réelle', () => {
  beforeAll(() => {
    // Vérification de sécurité : interdire formellement toute retombée silencieuse sur DATABASE_URL
    if (dbUrlProd && dbUrlTest) {
      expect(dbUrlProd).not.toEqual(dbUrlTest);
    }
  });

  describe('Garde-fous d’isolation stricte de la base', () => {
    it('doit refuser formellement toute connexion de test ciblant Supabase de production', () => {
      const prodCheck = inspecterCibleConnexion(dbUrlProd);
      expect(prodCheck.isIsolatedTestDb).toBe(false);
      expect(prodCheck.refusalReason).toContain('INTERDICTION');
    });

    it('doit refuser toute base ne comportant pas un nom explicite de test', () => {
      const checkPostgres = inspecterCibleConnexion('postgresql://postgres:pass@localhost:5432/postgres');
      expect(checkPostgres.isIsolatedTestDb).toBe(false);
      expect(checkPostgres.refusalReason).toContain('INTERDICTION');
    });

    it('doit attester de l’état d’isolation de l’environnement actuel', () => {
      // Si aucune base de test isolée n'est fournie, le diagnostic l'indique sans ambiguïté
      if (!diagnostic.isIsolatedTestDb) {
        expect(diagnostic.refusalReason).toBeDefined();
      }
    });
  });

  // Les 9 scénarios de concurrence ci-dessous sont suspendus (skipped) dès lors
  // qu'aucune base PostgreSQL isolée autorisée n'est fournie, garantissant qu'aucune
  // assertion triviale (ex: expect(true).toBe(true)) ne masque l'absence d'infrastructure.
  describe.skipIf(!diagnostic.isIsolatedTestDb)('9 Scénarios de concurrence PostgreSQL réels (multi-connexions)', () => {
    let clientA: any;
    let clientB: any;

    beforeAll(async () => {
      if (!diagnostic.isIsolatedTestDb || !dbUrlTest) {
        return;
      }
      clientA = new Client({ connectionString: dbUrlTest });
      clientB = new Client({ connectionString: dbUrlTest });
      await clientA.connect();
      await clientB.connect();
    });

    afterAll(async () => {
      if (clientA) await clientA.end().catch(() => {});
      if (clientB) await clientB.end().catch(() => {});
    });

    it('Scénario 1 : Deux requêtes concurrentes avec la même clé d’idempotence', async () => {
      const cle = `IDEM-TEST-${Date.now()}`;
      const q = `INSERT INTO public.cles_idempotence (cle, methode_http, chemin_uri, date_expiration) VALUES ($1, $2, $3, now() + interval '1 hour')`;

      const results = await Promise.allSettled([
        clientA.query(q, [cle, 'POST', '/test']),
        clientB.query(q, [cle, 'POST', '/test']),
      ]);

      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const rejectCount = results.filter((r) => r.status === 'rejected').length;

      expect(successCount).toBe(1);
      expect(rejectCount).toBe(1);

      // Nettoyage ciblé
      await clientA.query('DELETE FROM public.cles_idempotence WHERE cle = $1', [cle]);
    });

    it('Scénario 2 : Deux débits concurrents dépassant ensemble le solde disponible', async () => {
      // Création portefeuille temporaire avec 500 FCFA
      const resP = await clientA.query(
        `INSERT INTO public.portefeuilles (solde, devise, statut) VALUES (500, 'XAF', 'ACTIF') RETURNING id`,
      );
      const portefeuilleId = resP.rows[0].id;

      // Tentative de débiter 400 FCFA simultanément sur Client A et Client B
      const debitQuery = `
        UPDATE public.portefeuilles 
        SET solde = solde - 400, date_modification = now() 
        WHERE id = $1 AND solde >= 400 
        RETURNING solde
      `;

      const results = await Promise.all([
        clientA.query(debitQuery, [portefeuilleId]),
        clientB.query(debitQuery, [portefeuilleId]),
      ]);

      const rowsUpdated = results.reduce((acc, r) => acc + r.rowCount, 0);
      expect(rowsUpdated).toBe(1);

      const check = await clientA.query('SELECT solde FROM public.portefeuilles WHERE id = $1', [portefeuilleId]);
      expect(Number(check.rows[0].solde)).toBe(100);

      await clientA.query('DELETE FROM public.portefeuilles WHERE id = $1', [portefeuilleId]);
    });

    it('Scénario 3 : Deux débits concurrents restant possibles lorsque le solde suffit aux deux', async () => {
      const resP = await clientA.query(
        `INSERT INTO public.portefeuilles (solde, devise, statut) VALUES (1000, 'XAF', 'ACTIF') RETURNING id`,
      );
      const portefeuilleId = resP.rows[0].id;

      // Débit de 300 FCFA et 400 FCFA en concurrence
      const debitQuery = `
        UPDATE public.portefeuilles 
        SET solde = solde - $2, date_modification = now() 
        WHERE id = $1 AND solde >= $2 
        RETURNING solde
      `;

      await Promise.all([
        clientA.query(debitQuery, [portefeuilleId, 300]),
        clientB.query(debitQuery, [portefeuilleId, 400]),
      ]);

      const check = await clientA.query('SELECT solde FROM public.portefeuilles WHERE id = $1', [portefeuilleId]);
      expect(Number(check.rows[0].solde)).toBe(300);

      await clientA.query('DELETE FROM public.portefeuilles WHERE id = $1', [portefeuilleId]);
    });

    it('Scénario 4 : Plusieurs demandes concurrentes partageant un quota limité', async () => {
      // Création d'un abonnement temporaire avec quota restant = 1
      const resA = await clientA.query(`
        INSERT INTO public.abonnements 
          (utilisateur_id, plan_abonnement_id, prix, nombre_collectes_incluses, nombre_collectes_reservees, nombre_collectes_utilisees, poids_max_par_collecte, date_debut, date_fin, statut)
        VALUES 
          (1, 1, 5000, 1, 0, 0, 20, now(), now() + interval '30 days', 'ACTIF')
        RETURNING id
      `);
      const abonnementId = resA.rows[0].id;

      const reserveQuery = `
        UPDATE public.abonnements 
        SET nombre_collectes_reservees = nombre_collectes_reservees + 1, date_modification = now() 
        WHERE id = $1 AND (nombre_collectes_reservees + nombre_collectes_utilisees) < nombre_collectes_incluses 
        RETURNING *
      `;

      const results = await Promise.all([
        clientA.query(reserveQuery, [abonnementId]),
        clientB.query(reserveQuery, [abonnementId]),
      ]);

      const totalAccepted = results.reduce((acc, r) => acc + r.rowCount, 0);
      expect(totalAccepted).toBe(1);

      await clientA.query('DELETE FROM public.abonnements WHERE id = $1', [abonnementId]);
    });

    it('Scénario 5 : Deux collecteurs tentant d’accepter la même mission', async () => {
      const resM = await clientA.query(`
        INSERT INTO public.missions_collecte 
          (demande_collecte_id, collecteur_id, statut)
        VALUES 
          (1, 1, 'DISPONIBLE')
        RETURNING id
      `);
      const missionId = resM.rows[0].id;

      const acceptQuery = `
        UPDATE public.missions_collecte 
        SET collecteur_id = $2, statut = 'ATTRIBUEE', date_acceptation = now(), date_modification = now() 
        WHERE id = $1 AND statut = 'DISPONIBLE' 
        RETURNING *
      `;

      const results = await Promise.all([
        clientA.query(acceptQuery, [missionId, 10]),
        clientB.query(acceptQuery, [missionId, 20]),
      ]);

      const accepted = results.reduce((acc, r) => acc + r.rowCount, 0);
      expect(accepted).toBe(1);

      await clientA.query('DELETE FROM public.missions_collecte WHERE id = $1', [missionId]);
    });

    it('Scénario 6 : Deux notifications webhooks identiques traitées simultanément', async () => {
      const ref = `PAY-HOOK-${Date.now()}`;
      const insertWebhook = `
        INSERT INTO public.paiements 
          (reference, utilisateur_id, montant, devise, methode, type, statut)
        VALUES 
          ($1, 1, 10000, 'XAF', 'MOBILE_MONEY', 'COLLECTE', 'PAYE')
      `;

      const results = await Promise.allSettled([
        clientA.query(insertWebhook, [ref]),
        clientB.query(insertWebhook, [ref]),
      ]);

      const success = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      expect(success).toBe(1);
      expect(failed).toBe(1);

      await clientA.query('DELETE FROM public.paiements WHERE reference = $1', [ref]);
    });

    it('Scénario 7 : Deux paiements partiels concurrents sur une facture', async () => {
      const resF = await clientA.query(`
        INSERT INTO public.factures 
          (numero, entreprise_id, montant_ht, montant_tva, montant_ttc, date_echeance, statut)
        VALUES 
          ($1, 1, 10000, 0, 10000, now() + interval '30 days', 'EMISE')
        RETURNING id
      `, [`FACT-TEST-${Date.now()}`]);
      const factureId = resF.rows[0].id;

      // Deux paiements concurrents de 3 000 FCFA avec mise à jour du statut
      const payQuery = `
        UPDATE public.factures 
        SET statut = 'PARTIELLEMENT_PAYEE', date_modification = now() 
        WHERE id = $1 AND statut IN ('EMISE', 'PARTIELLEMENT_PAYEE') 
        RETURNING *
      `;

      const results = await Promise.all([
        clientA.query(payQuery, [factureId]),
        clientB.query(payQuery, [factureId]),
      ]);

      expect(results[0].rowCount).toBe(1);
      expect(results[1].rowCount).toBe(1);

      await clientA.query('DELETE FROM public.factures WHERE id = $1', [factureId]);
    });

    it('Scénario 8 : Annulation/échec concurrent avec consommation de quota (anti-double libération)', async () => {
      const resU = await clientA.query(`
        INSERT INTO public.utilisations_abonnement 
          (abonnement_id, demande_collecte_id, type, quantite, statut)
        VALUES 
          (1, 1, 'RESERVATION', 1, 'ACTIF')
        RETURNING id
      `);
      const resaId = resU.rows[0].id;

      // Opération 1 : tente de consommer
      // Opération 2 : tente de libérer
      const majQuery = `
        UPDATE public.utilisations_abonnement 
        SET statut = $2 
        WHERE id = $1 AND statut = 'ACTIF' 
        RETURNING *
      `;

      const results = await Promise.all([
        clientA.query(majQuery, [resaId, 'CONSOMME']),
        clientB.query(majQuery, [resaId, 'LIBERE']),
      ]);

      const totalTransition = results.reduce((acc, r) => acc + r.rowCount, 0);
      expect(totalTransition).toBe(1);

      await clientA.query('DELETE FROM public.utilisations_abonnement WHERE id = $1', [resaId]);
    });

    it('Scénario 9 : Deux remboursements partiels concurrents sur un même paiement (600 FCFA + 600 FCFA sur 1000 FCFA)', async () => {
      const resP = await clientA.query(`
        INSERT INTO public.paiements 
          (reference, utilisateur_id, montant, devise, methode, type, statut, date_modification)
        VALUES 
          ($1, 1, 1000, 'XAF', 'MOBILE_MONEY', 'COLLECTE', 'PAYE', now())
        RETURNING id, date_modification
      `, [`PAY-REMB-${Date.now()}`]);
      const paiementId = resP.rows[0].id;
      const initialDate = resP.rows[0].date_modification;

      // Simulation de l'OCC exact implémenté dans AjustementsService
      const refundOccQuery = `
        UPDATE public.paiements 
        SET statut = 'REMBOURSE_PARTIELLEMENT', date_modification = now() 
        WHERE id = $1 AND statut = 'PAYE' AND date_modification = $2 
        RETURNING id
      `;

      const results = await Promise.all([
        clientA.query(refundOccQuery, [paiementId, initialDate]),
        clientB.query(refundOccQuery, [paiementId, initialDate]),
      ]);

      const updatedCount = results.reduce((acc, r) => acc + r.rowCount, 0);
      // Exactement un remboursement réussit le verrou OCC
      expect(updatedCount).toBe(1);

      await clientA.query('DELETE FROM public.paiements WHERE id = $1', [paiementId]);
    });
  });
});
