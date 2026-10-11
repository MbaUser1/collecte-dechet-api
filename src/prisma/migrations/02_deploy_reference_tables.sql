-- ============================================================================
-- MIGRATION 02 — Déploiement des tables de référence indépendantes
-- Tables : categories_dechets, zones, plans_abonnement, partenaires, cles_idempotence
-- ============================================================================

BEGIN;

-- 1. Table categories_dechets
CREATE TABLE IF NOT EXISTS public.categories_dechets (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  description TEXT,
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS categories_dechets_nom_idx ON public.categories_dechets (nom);
CREATE INDEX IF NOT EXISTS categories_dechets_statut_idx ON public.categories_dechets (statut);

-- 2. Table zones
CREATE TABLE IF NOT EXISTS public.zones (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  ville VARCHAR(100) NOT NULL,
  description TEXT,
  latitude REAL,
  longitude REAL,
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zones_ville_idx ON public.zones (ville);
CREATE INDEX IF NOT EXISTS zones_nom_idx ON public.zones (nom);
CREATE INDEX IF NOT EXISTS zones_statut_idx ON public.zones (statut);

-- 3. Table plans_abonnement
CREATE TABLE IF NOT EXISTS public.plans_abonnement (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(150) NOT NULL,
  description TEXT,
  prix NUMERIC(15, 2) NOT NULL,
  duree_jours INTEGER NOT NULL,
  nombre_collectes_incluses INTEGER NOT NULL,
  poids_max_par_collecte NUMERIC(10, 2) NOT NULL,
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plans_prix_positif_ou_nul CHECK (prix >= 0),
  CONSTRAINT plans_parametres_strictement_positifs CHECK (duree_jours > 0 AND nombre_collectes_incluses > 0 AND poids_max_par_collecte > 0)
);

CREATE INDEX IF NOT EXISTS plans_abonnement_statut_idx ON public.plans_abonnement (statut);
CREATE INDEX IF NOT EXISTS plans_abonnement_nom_idx ON public.plans_abonnement (nom);

-- 4. Table partenaires
CREATE TABLE IF NOT EXISTS public.partenaires (
  id BIGSERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  description TEXT,
  logo TEXT,
  site_web VARCHAR(255),
  telephone VARCHAR(30),
  email VARCHAR(255),
  statut VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partenaires_nom_idx ON public.partenaires (nom);
CREATE INDEX IF NOT EXISTS partenaires_statut_idx ON public.partenaires (statut);

-- 5. Table cles_idempotence
CREATE TABLE IF NOT EXISTS public.cles_idempotence (
  id BIGSERIAL PRIMARY KEY,
  cle VARCHAR(255) NOT NULL UNIQUE,
  methode_http VARCHAR(10) NOT NULL,
  chemin_uri VARCHAR(255) NOT NULL,
  code_statut INTEGER,
  reponse TEXT,
  date_expiration TIMESTAMPTZ NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cles_idempotence_date_expiration_idx ON public.cles_idempotence (date_expiration);

COMMIT;

