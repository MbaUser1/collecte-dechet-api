-- ============================================================================
-- MIGRATION 01 — Alignement des 4 tables existantes sur Supabase
-- Cible : portefeuilles, points_collecte
-- RÈGLE : Strictement idempotent, non destructif, préservation des données existantes
-- ============================================================================

BEGIN;

-- 1. Contrôle préalable sur les tables et colonnes existantes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'portefeuilles') THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : La table public.portefeuilles est introuvable.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'entreprises') THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : La table public.entreprises est introuvable.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'utilisateurs') THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : La table public.utilisateurs est introuvable.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'points_collecte') THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : La table public.points_collecte est introuvable.';
  END IF;

  -- Vérification qu'aucun solde existant n'est négatif avant pose de la contrainte
  IF EXISTS (SELECT 1 FROM public.portefeuilles WHERE solde < 0) THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : Des portefeuilles ont un solde négatif. Régularisation manuelle requise.';
  END IF;
END $$;

-- 2. Alignement de la table portefeuilles
-- A. Rendre utilisateur_id optionnel (nullable) pour permettre les portefeuilles d'entreprises
ALTER TABLE public.portefeuilles 
  ALTER COLUMN utilisateur_id DROP NOT NULL;

-- B. Création de la colonne entreprise_id et validation du type si préexistante
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'portefeuilles' AND column_name = 'entreprise_id'
  ) THEN
    ALTER TABLE public.portefeuilles ADD COLUMN entreprise_id bigint;
  ELSE
    IF (
      SELECT udt_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'portefeuilles' AND column_name = 'entreprise_id'
    ) NOT IN ('int8', 'int4') THEN
      RAISE EXCEPTION 'INCOMPATIBILITÉ DÉTECTÉE : La colonne portefeuilles.entreprise_id existe mais n''est pas de type entier (bigint).';
    END IF;
  END IF;
END $$;

-- C. Contrôle de cohérence sur l'exclusivité du propriétaire (exécuté après garantie d'existence de entreprise_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.portefeuilles 
    WHERE (utilisateur_id IS NULL AND entreprise_id IS NULL) 
       OR (utilisateur_id IS NOT NULL AND entreprise_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'PRÉREQUIS ÉCHOUÉ : Des portefeuilles violent la règle de propriétaire exclusif (utilisateur_id / entreprise_id). Régularisation requise.';
  END IF;
END $$;

-- D. Pose de la contrainte UNIQUE sur entreprise_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_entreprise_id_key' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_entreprise_id_key UNIQUE (entreprise_id);
  END IF;
END $$;

-- E. Clé étrangère entreprise_id -> entreprises(id) ON DELETE RESTRICT (préservation historique financier)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_entreprise_id_fkey' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_entreprise_id_fkey 
      FOREIGN KEY (entreprise_id) REFERENCES public.entreprises(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- F. Alignement de la clé étrangère utilisateur_id -> utilisateurs(id) ON DELETE RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_utilisateur_id_fkey' AND conrelid = 'public.portefeuilles'::regclass
      AND confdeltype != 'r'
  ) THEN
    ALTER TABLE public.portefeuilles DROP CONSTRAINT portefeuilles_utilisateur_id_fkey;
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_utilisateur_id_fkey 
      FOREIGN KEY (utilisateur_id) REFERENCES public.utilisateurs(id) ON DELETE RESTRICT;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'portefeuilles_utilisateur_id_fkey' AND conrelid = 'public.portefeuilles'::regclass
  ) THEN
    ALTER TABLE public.portefeuilles 
      ADD CONSTRAINT portefeuilles_utilisateur_id_fkey 
      FOREIGN KEY (utilisateur_id) REFERENCES public.utilisateurs(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- G. Ajout de la contrainte CHECK sur le solde non négatif
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

-- H. Ajout de la contrainte CHECK d'exclusivité de propriétaire (particulier OU entreprise)
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

