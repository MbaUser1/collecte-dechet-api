-- ============================================================================
-- MIGRATION 04 — Déploiement des tables de niveau 2
-- Tables : demandes_collecte, factures, reclamations_recompenses
-- ============================================================================

BEGIN;

-- 1. demandes_collecte
CREATE TABLE IF NOT EXISTS public.demandes_collecte (
  id BIGSERIAL PRIMARY KEY,
  uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  numero VARCHAR(50) NOT NULL UNIQUE,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  entreprise_id BIGINT REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  collecteur_id BIGINT REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  point_collecte_id BIGINT REFERENCES public.points_collecte(id) ON DELETE RESTRICT,
  type_dechet_id BIGINT NOT NULL REFERENCES public.types_dechets(id) ON DELETE RESTRICT,
  zone_id BIGINT REFERENCES public.zones(id) ON DELETE RESTRICT,
  abonnement_id BIGINT REFERENCES public.abonnements(id) ON DELETE RESTRICT,
  adresse TEXT NOT NULL,
  ville VARCHAR(100) NOT NULL,
  quartier VARCHAR(100) NOT NULL,
  latitude REAL,
  longitude REAL,
  instructions_acces TEXT,
  poids_estime NUMERIC(10, 2) NOT NULL,
  poids_reel NUMERIC(10, 2),
  prix_estime NUMERIC(15, 2) NOT NULL,
  prix_final NUMERIC(15, 2),
  details_prix TEXT,
  statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE_PAIEMENT',
  date_collecte_souhaitee TIMESTAMPTZ,
  creneau_horaire VARCHAR(50),
  date_attribution TIMESTAMPTZ,
  date_realisation TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT demandes_poids_estime_positif CHECK (poids_estime > 0),
  CONSTRAINT demandes_poids_reel_positif CHECK (poids_reel IS NULL OR poids_reel >= 0),
  CONSTRAINT demandes_prix_estime_positif CHECK (prix_estime >= 0),
  CONSTRAINT demandes_prix_final_positif CHECK (prix_final IS NULL OR prix_final >= 0)
);

CREATE INDEX IF NOT EXISTS demandes_collecte_utilisateur_id_idx ON public.demandes_collecte (utilisateur_id);
CREATE INDEX IF NOT EXISTS demandes_collecte_entreprise_id_idx ON public.demandes_collecte (entreprise_id);
CREATE INDEX IF NOT EXISTS demandes_collecte_collecteur_id_idx ON public.demandes_collecte (collecteur_id);
CREATE INDEX IF NOT EXISTS demandes_collecte_type_dechet_id_idx ON public.demandes_collecte (type_dechet_id);
CREATE INDEX IF NOT EXISTS demandes_collecte_zone_id_idx ON public.demandes_collecte (zone_id);
CREATE INDEX IF NOT EXISTS demandes_collecte_abonnement_id_idx ON public.demandes_collecte (abonnement_id);
CREATE INDEX IF NOT EXISTS demandes_collecte_statut_idx ON public.demandes_collecte (statut);
CREATE INDEX IF NOT EXISTS demandes_collecte_date_creation_idx ON public.demandes_collecte (date_creation);

-- 2. factures
CREATE TABLE IF NOT EXISTS public.factures (
  id BIGSERIAL PRIMARY KEY,
  numero VARCHAR(50) NOT NULL UNIQUE,
  entreprise_id BIGINT NOT NULL REFERENCES public.entreprises(id) ON DELETE RESTRICT,
  devis_id BIGINT UNIQUE REFERENCES public.devis(id) ON DELETE SET NULL,
  statut VARCHAR(30) NOT NULL DEFAULT 'EMISE',
  montant_ht NUMERIC(15, 2) NOT NULL,
  montant_tva NUMERIC(15, 2) NOT NULL DEFAULT 0,
  montant_ttc NUMERIC(15, 2) NOT NULL,
  date_emission TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_echeance TIMESTAMPTZ NOT NULL,
  date_paiement TIMESTAMPTZ,
  url_document TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT factures_montants_valides CHECK (montant_ht >= 0 AND montant_tva >= 0 AND montant_ttc >= montant_ht)
);

CREATE INDEX IF NOT EXISTS factures_entreprise_id_idx ON public.factures (entreprise_id);
CREATE INDEX IF NOT EXISTS factures_statut_idx ON public.factures (statut);

-- 3. reclamations_recompenses
CREATE TABLE IF NOT EXISTS public.reclamations_recompenses (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  recompense_id BIGINT NOT NULL REFERENCES public.recompenses(id) ON DELETE RESTRICT,
  points_utilises INTEGER NOT NULL,
  code_reclamation VARCHAR(100) NOT NULL UNIQUE,
  statut VARCHAR(30) NOT NULL DEFAULT 'RESERVEE',
  date_utilisation TIMESTAMPTZ,
  date_expiration TIMESTAMPTZ NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reclamations_points_positifs CHECK (points_utilises > 0)
);

CREATE INDEX IF NOT EXISTS reclamations_recompenses_utilisateur_id_idx ON public.reclamations_recompenses (utilisateur_id);
CREATE INDEX IF NOT EXISTS reclamations_recompenses_recompense_id_idx ON public.reclamations_recompenses (recompense_id);
CREATE INDEX IF NOT EXISTS reclamations_recompenses_statut_idx ON public.reclamations_recompenses (statut);

COMMIT;

