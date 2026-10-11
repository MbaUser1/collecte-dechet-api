-- ============================================================================
-- MIGRATION 01 — Alignement des 4 tables existantes sur Supabase
-- Cible : portefeuilles, points_collecte
-- RÈGLE : Strictement idempotent, non destructif, préservation des données existantes
-- ============================================================================

BEGIN;

-- 1. Contrôle préalable sur la table portefeuilles
-- Vérification qu'aucun solde existant n'est négatif avant pose de la contrainte
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.portefeuilles WHERE solde < 0) THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : Des portefeuilles ont un solde négatif. Régularisation manuelle requise.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.portefeuilles 
    WHERE (utilisateur_id IS NULL AND entreprise_id IS NULL) 
       OR (utilisateur_id IS NOT NULL AND entreprise_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : Des portefeuilles violent la règle de propriétaire exclusif. Régularisation manuelle requise.';
  END IF;
END $$;

-- 2. Alignement de la table portefeuilles
-- A. Rendre utilisateur_id optionnel (nullable) pour permettre les portefeuilles d'entreprises
ALTER TABLE public.portefeuilles 
  ALTER COLUMN utilisateur_id DROP NOT NULL;

-- B. Ajout de la colonne entreprise_id avec contrainte de clé étrangère RESTRICT vers entreprises(id)
ALTER TABLE public.portefeuilles 
  ADD COLUMN IF NOT EXISTS entreprise_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_entreprise_id_key' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_entreprise_id_key UNIQUE (entreprise_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_entreprise_id_fkey' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_entreprise_id_fkey 
      FOREIGN KEY (entreprise_id) REFERENCES public.entreprises(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- C. Ajout de la contrainte CHECK sur le solde non négatif
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_solde_non_negatif' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_solde_non_negatif CHECK (solde >= 0);
  END IF;
END $$;

-- D. Ajout de la contrainte CHECK d'exclusivité de propriétaire (particulier OU entreprise)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_proprietaire_exclusif' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_proprietaire_exclusif CHECK (
        (utilisateur_id IS NOT NULL AND entreprise_id IS NULL) OR 
        (utilisateur_id IS NULL AND entreprise_id IS NOT NULL)
      );
  END IF;
END $$;

-- 3. Alignement de la table points_collecte
-- Création de l'index partiel garantissant qu'un particulier ne possède qu'un seul point de collecte actif
CREATE UNIQUE INDEX IF NOT EXISTS points_collecte_particulier_actif_unique 
  ON public.points_collecte (utilisateur_id) 
  WHERE (statut = 'ACTIF');

COMMIT;

