-- ============================================================================
-- MIGRATION 06 — Déploiement des tables de niveau 4
-- Tables : elements_collectes, ajustements_prix
-- ============================================================================

BEGIN;

-- 1. elements_collectes
CREATE TABLE IF NOT EXISTS public.elements_collectes (
  id BIGSERIAL PRIMARY KEY,
  mission_collecte_id BIGINT NOT NULL REFERENCES public.missions_collecte(id) ON DELETE CASCADE,
  type_dechet_id BIGINT NOT NULL REFERENCES public.types_dechets(id) ON DELETE RESTRICT,
  poids NUMERIC(10, 2) NOT NULL,
  volume_estime NUMERIC(10, 2),
  notes TEXT,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT elements_collectes_poids_positif CHECK (poids >= 0)
);

CREATE INDEX IF NOT EXISTS elements_collectes_mission_collecte_id_idx ON public.elements_collectes (mission_collecte_id);
CREATE INDEX IF NOT EXISTS elements_collectes_type_dechet_id_idx ON public.elements_collectes (type_dechet_id);

-- 2. ajustements_prix
CREATE TABLE IF NOT EXISTS public.ajustements_prix (
  id BIGSERIAL PRIMARY KEY,
  demande_collecte_id BIGINT NOT NULL REFERENCES public.demandes_collecte(id) ON DELETE RESTRICT,
  paiement_id BIGINT REFERENCES public.paiements(id) ON DELETE RESTRICT,
  montant NUMERIC(15, 2) NOT NULL,
  sens VARCHAR(10) NOT NULL,
  motif VARCHAR(255) NOT NULL,
  statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE',
  date_reglement TIMESTAMPTZ,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_modification TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ajustements_montant_positif CHECK (montant > 0)
);

CREATE INDEX IF NOT EXISTS ajustements_prix_demande_collecte_id_idx ON public.ajustements_prix (demande_collecte_id);
CREATE INDEX IF NOT EXISTS ajustements_prix_paiement_id_idx ON public.ajustements_prix (paiement_id);
CREATE INDEX IF NOT EXISTS ajustements_prix_statut_idx ON public.ajustements_prix (statut);

COMMIT;

