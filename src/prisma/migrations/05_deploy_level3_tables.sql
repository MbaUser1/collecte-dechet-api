-- ============================================================================
-- MIGRATION 05 — Déploiement des tables de niveau 3
-- Tables : missions_collecte, utilisations_abonnement, paiements, transactions_points, participations_collectes_communautaires
-- ============================================================================

BEGIN;

-- 1. missions_collecte
CREATE TABLE IF NOT EXISTS public.missions_collecte (
  id BIGSERIAL PRIMARY KEY,
  demande_collecte_id BIGINT NOT NULL UNIQUE REFERENCES public.demandes_collecte(id) ON DELETE RESTRICT,
  collecteur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  statut VARCHAR(30) NOT NULL DEFAULT 'ATTRIBUEE',
  jeton_qr UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  date_attribution TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_acceptation TIMESTAMPTZ,
  date_debut TIMESTAMPTZ,
  date_fin TIMESTAMPTZ,
  poids_reel_total NUMERIC(10, 2),
  tri_respecte BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT missions_dates_coherentes CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut)
);

CREATE INDEX IF NOT EXISTS missions_collecte_collecteur_id_idx ON public.missions_collecte (collecteur_id);
CREATE INDEX IF NOT EXISTS missions_collecte_statut_idx ON public.missions_collecte (statut);

-- 2. utilisations_abonnement
CREATE TABLE IF NOT EXISTS public.utilisations_abonnement (
  id BIGSERIAL PRIMARY KEY,
  abonnement_id BIGINT NOT NULL REFERENCES public.abonnements(id) ON DELETE RESTRICT,
  demande_collecte_id BIGINT REFERENCES public.demandes_collecte(id) ON DELETE SET NULL,
  type VARCHAR(30) NOT NULL,
  quantite INTEGER NOT NULL,
  statut VARCHAR(30) NOT NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS utilisations_abonnement_abonnement_id_idx ON public.utilisations_abonnement (abonnement_id);
CREATE INDEX IF NOT EXISTS utilisations_abonnement_demande_collecte_id_idx ON public.utilisations_abonnement (demande_collecte_id);
CREATE INDEX IF NOT EXISTS utilisations_abonnement_type_idx ON public.utilisations_abonnement (type);

-- 3. paiements
CREATE TABLE IF NOT EXISTS public.paiements (
  id BIGSERIAL PRIMARY KEY,
  reference VARCHAR(100) NOT NULL UNIQUE,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  demande_collecte_id BIGINT REFERENCES public.demandes_collecte(id) ON DELETE RESTRICT,
  abonnement_id BIGINT REFERENCES public.abonnements(id) ON DELETE RESTRICT,
  facture_id BIGINT REFERENCES public.factures(id) ON DELETE RESTRICT,
  montant NUMERIC(15, 2) NOT NULL,
  devise VARCHAR(3) NOT NULL DEFAULT 'XAF',
  methode VARCHAR(30) NOT NULL,
  type VARCHAR(30) NOT NULL,
  statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
  reference_fournisseur VARCHAR(255),
  donnees_fournisseur TEXT,
  date_paiement TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT paiements_montant_positif CHECK (montant > 0)
);

CREATE INDEX IF NOT EXISTS paiements_utilisateur_id_idx ON public.paiements (utilisateur_id);
CREATE INDEX IF NOT EXISTS paiements_demande_collecte_id_idx ON public.paiements (demande_collecte_id);
CREATE INDEX IF NOT EXISTS paiements_abonnement_id_idx ON public.paiements (abonnement_id);
CREATE INDEX IF NOT EXISTS paiements_facture_id_idx ON public.paiements (facture_id);
CREATE INDEX IF NOT EXISTS paiements_statut_idx ON public.paiements (statut);
CREATE INDEX IF NOT EXISTS paiements_methode_idx ON public.paiements (methode);
CREATE INDEX IF NOT EXISTS paiements_type_idx ON public.paiements (type);

-- 4. transactions_points
CREATE TABLE IF NOT EXISTS public.transactions_points (
  id BIGSERIAL PRIMARY KEY,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE RESTRICT,
  points INTEGER NOT NULL,
  sens VARCHAR(10) NOT NULL,
  motif VARCHAR(255) NOT NULL,
  signalement_id BIGINT REFERENCES public.signalements(id) ON DELETE SET NULL,
  reclamation_recompense_id BIGINT REFERENCES public.reclamations_recompenses(id) ON DELETE SET NULL,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_points_positifs CHECK (points > 0)
);

CREATE INDEX IF NOT EXISTS transactions_points_utilisateur_id_idx ON public.transactions_points (utilisateur_id);
CREATE INDEX IF NOT EXISTS transactions_points_signalement_id_idx ON public.transactions_points (signalement_id);
CREATE INDEX IF NOT EXISTS transactions_points_reclamation_recompense_id_idx ON public.transactions_points (reclamation_recompense_id);

-- 5. participations_collectes_communautaires (Priorité 3)
CREATE TABLE IF NOT EXISTS public.participations_collectes_communautaires (
  id BIGSERIAL PRIMARY KEY,
  signalement_id BIGINT NOT NULL REFERENCES public.signalements(id) ON DELETE CASCADE,
  utilisateur_id BIGINT NOT NULL REFERENCES public.utilisateurs(id) ON DELETE CASCADE,
  statut VARCHAR(30) NOT NULL DEFAULT 'INSCRIT',
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT participations_statut_valide CHECK (statut IN ('INSCRIT', 'CONFIRME', 'ANNULE'))
);

CREATE UNIQUE INDEX IF NOT EXISTS part_comm_sig_user_unique ON public.participations_collectes_communautaires (signalement_id, utilisateur_id);
CREATE INDEX IF NOT EXISTS part_comm_sig_idx ON public.participations_collectes_communautaires (signalement_id);
CREATE INDEX IF NOT EXISTS part_comm_user_idx ON public.participations_collectes_communautaires (utilisateur_id);
CREATE INDEX IF NOT EXISTS part_comm_statut_idx ON public.participations_collectes_communautaires (statut);

COMMIT;

