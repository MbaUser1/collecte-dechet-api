-- ============================================================================
-- MIGRATION 03 — Déploiement des tables de niveau 1 (dépendances directes)
-- ============================================================================

BEGIN;

-- 1. types_dechets
CREATE TABLE IF NOT EXISTS public.types_dechets (
  id BIGSERIAL PRIMARY KEY,
  categorie_dechet_id BIGINT NOT NULL REFERENCES public.categories_dechets(id) ON DELETE RESTRICT,
  nom VARCHAR(150) NOT NULL,
  description TEXT,
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS types_dechets_categorie_dechet_id_idx ON public.types_dechets (categorie_dechet_id);
CREATE INDEX IF NOT EXISTS types_dechets_nom_idx ON public.types_dechets (nom);
CREATE INDEX IF NOT EXISTS types_dechets_statut_idx ON public.types_dechets (statut);

-- 2. tarifs
CREATE TABLE IF NOT EXISTS public.tarifs (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  type_dechet_id BIGINT NOT NULL REFERENCES public.types_dechets(id) ON DELETE RESTRICT,
  zone_id BIGINT NOT NULL REFERENCES public.zones(id) ON DELETE RESTRICT,
  prix_base NUMERIC(15, 2) NOT NULL DEFAULT 0,
  prix_par_kg NUMERIC(15, 2) NOT NULL DEFAULT 0,
  prix_par_km NUMERIC(15, 2) NOT NULL DEFAULT 0,
  prix_minimum NUMERIC(15, 2) NOT NULL DEFAULT 0,
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_debut TIMESTAMPTZ NOT NULL,
  date_fin TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tarifs_prix_non_negatifs CHECK (prix_base >= 0 AND prix_par_kg >= 0 AND prix_par_km >= 0 AND prix_minimum >= 0),
  CONSTRAINT tarifs_dates_coherentes CHECK (date_fin IS NULL OR date_fin > date_debut)
);

CREATE INDEX IF NOT EXISTS tarifs_type_dechet_id_idx ON public.tarifs (type_dechet_id);
CREATE INDEX IF NOT EXISTS tarifs_zone_id_idx ON public.tarifs (zone_id);
CREATE INDEX IF NOT EXISTS tarifs_statut_idx ON public.tarifs (statut);
CREATE INDEX IF NOT EXISTS tarifs_type_dechet_id_zone_id_statut_idx ON public.tarifs (type_dechet_id, zone_id, statut);

-- 3. abonnements
CREATE TABLE IF NOT EXISTS public.abonnements (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  plan_abonnement_id BIGINT NOT NULL REFERENCES public.plans_abonnement(id) ON DELETE RESTRICT,
  prix NUMERIC(15, 2) NOT NULL,
  nombre_collectes_incluses INTEGER NOT NULL,
  nombre_collectes_utilisees INTEGER NOT NULL DEFAULT 0,
  nombre_collectes_reservees INTEGER NOT NULL DEFAULT 0,
  poids_max_par_collecte NUMERIC(10, 2) NOT NULL,
  date_debut TIMESTAMPTZ NOT NULL,
  date_fin TIMESTAMPTZ NOT NULL,
  statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT abonnements_quotas_valides CHECK (nombre_collectes_utilisees >= 0 AND nombre_collectes_reservees >= 0 AND (nombre_collectes_utilisees + nombre_collectes_reservees) <= nombre_collectes_incluses),
  CONSTRAINT abonnements_dates_coherentes CHECK (date_fin > date_debut)
);

CREATE INDEX IF NOT EXISTS abonnements_utilisateur_id_idx ON public.abonnements (utilisateur_id);
CREATE INDEX IF NOT EXISTS abonnements_plan_abonnement_id_idx ON public.abonnements (plan_abonnement_id);
CREATE INDEX IF NOT EXISTS abonnements_statut_idx ON public.abonnements (statut);
CREATE UNIQUE INDEX IF NOT EXISTS abonnements_utilisateur_actif_unique ON public.abonnements (utilisateur_id) WHERE (statut = 'ACTIF');

-- 4. transactions_portefeuille
CREATE TABLE IF NOT EXISTS public.transactions_portefeuille (
  id BIGSERIAL PRIMARY KEY,
  portefeuille_id BIGINT NOT NULL REFERENCES public.portefeuilles(id) ON DELETE RESTRICT,
  montant NUMERIC(15, 2) NOT NULL,
  sens VARCHAR(10) NOT NULL,
  motif VARCHAR(255) NOT NULL,
  reference VARCHAR(100) NOT NULL UNIQUE,
  solde_apres NUMERIC(15, 2),
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_portefeuille_montant_positif CHECK (montant > 0)
);

CREATE INDEX IF NOT EXISTS transactions_portefeuille_portefeuille_id_idx ON public.transactions_portefeuille (portefeuille_id);
CREATE INDEX IF NOT EXISTS transactions_portefeuille_sens_idx ON public.transactions_portefeuille (sens);
CREATE INDEX IF NOT EXISTS transactions_portefeuille_date_creation_idx ON public.transactions_portefeuille (date_creation);

-- 5. recompenses
CREATE TABLE IF NOT EXISTS public.recompenses (
  id BIGSERIAL PRIMARY KEY,
  partenaire_id BIGINT NOT NULL REFERENCES public.partenaires(id) ON DELETE RESTRICT,
  titre VARCHAR(255) NOT NULL,
  description TEXT,
  points_requis INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  valeur_monetaire NUMERIC(15, 2),
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_debut TIMESTAMPTZ,
  date_fin TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recompenses_stock_et_points_valides CHECK (points_requis > 0 AND stock >= 0)
);

CREATE INDEX IF NOT EXISTS recompenses_partenaire_id_idx ON public.recompenses (partenaire_id);
CREATE INDEX IF NOT EXISTS recompenses_statut_idx ON public.recompenses (statut);

-- 6. signalements
CREATE TABLE IF NOT EXISTS public.signalements (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  adresse TEXT NOT NULL,
  ville VARCHAR(100) NOT NULL,
  quartier VARCHAR(100) NOT NULL,
  latitude REAL,
  longitude REAL,
  photo TEXT,
  statut VARCHAR(30) NOT NULL DEFAULT 'SOUMIS',
  points_attribues INTEGER NOT NULL DEFAULT 0,
  validateur_id BIGINT REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  date_validation TIMESTAMPTZ,
  notes_administrateur TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT signalements_points_positifs CHECK (points_attribues >= 0)
);

CREATE INDEX IF NOT EXISTS signalements_utilisateur_id_idx ON public.signalements (utilisateur_id);
CREATE INDEX IF NOT EXISTS signalements_validateur_id_idx ON public.signalements (validateur_id);
CREATE INDEX IF NOT EXISTS signalements_statut_idx ON public.signalements (statut);
CREATE INDEX IF NOT EXISTS signalements_ville_idx ON public.signalements (ville);

-- 7. devis
CREATE TABLE IF NOT EXISTS public.devis (
  id BIGSERIAL PRIMARY KEY,
  numero VARCHAR(50) NOT NULL UNIQUE,
  entreprise_id BIGINT NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  statut VARCHAR(30) NOT NULL DEFAULT 'BROUILLON',
  montant_ht NUMERIC(15, 2) NOT NULL,
  montant_tva NUMERIC(15, 2) NOT NULL DEFAULT 0,
  montant_ttc NUMERIC(15, 2) NOT NULL,
  description TEXT,
  date_emission TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_validite TIMESTAMPTZ NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT devis_montants_valides CHECK (montant_ht >= 0 AND montant_tva >= 0 AND montant_ttc >= montant_ht)
);

CREATE INDEX IF NOT EXISTS devis_entreprise_id_idx ON public.devis (entreprise_id);
CREATE INDEX IF NOT EXISTS devis_statut_idx ON public.devis (statut);

-- 8. preferences_notification
CREATE TABLE IF NOT EXISTS public.preferences_notification (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL UNIQUE REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  email_actif BOOLEAN NOT NULL DEFAULT true,
  sms_actif BOOLEAN NOT NULL DEFAULT true,
  push_actif BOOLEAN NOT NULL DEFAULT true,
  whatsapp_actif BOOLEAN NOT NULL DEFAULT false,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  titre VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT false,
  donnees TEXT,
  date_lecture TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_utilisateur_id_idx ON public.notifications (utilisateur_id);
CREATE INDEX IF NOT EXISTS notifications_lu_idx ON public.notifications (lu);

-- 10. sessions_utilisateur
CREATE TABLE IF NOT EXISTS public.sessions_utilisateur (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  jeton_refresh_hash TEXT NOT NULL UNIQUE,
  adresse_ip VARCHAR(50),
  agent_utilisateur TEXT,
  revoque BOOLEAN NOT NULL DEFAULT false,
  date_expiration TIMESTAMPTZ NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_utilisateur_utilisateur_id_idx ON public.sessions_utilisateur (utilisateur_id);
CREATE INDEX IF NOT EXISTS sessions_utilisateur_date_expiration_idx ON public.sessions_utilisateur (date_expiration);

-- 11. journaux_audit
CREATE TABLE IF NOT EXISTS public.journaux_audit (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT REFERENCES public.utilisateurs(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entite VARCHAR(100) NOT NULL,
  entite_id BIGINT,
  details TEXT,
  adresse_ip VARCHAR(50),
  agent_utilisateur TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS journaux_audit_utilisateur_id_idx ON public.journaux_audit (utilisateur_id);
CREATE INDEX IF NOT EXISTS journaux_audit_entite_entite_id_idx ON public.journaux_audit (entite, entite_id);
CREATE INDEX IF NOT EXISTS journaux_audit_action_idx ON public.journaux_audit (action);
CREATE INDEX IF NOT EXISTS journaux_audit_date_creation_idx ON public.journaux_audit (date_creation);

COMMIT;

