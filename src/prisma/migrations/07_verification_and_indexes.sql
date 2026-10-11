-- ============================================================================
-- SCRIPT 07 — Requêtes de validation et de contrôle post-déploiement
-- Permet de vérifier la présence et l'intégrité des 30 tables et contraintes
-- EXÉCUTION STRICTEMENT EN LECTURE SEULE
-- ============================================================================

-- 1. Nombre total de tables publiques
SELECT count(*)::int AS total_tables_publiques
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. Liste des tables attendues avec leur état (présente / absente)
WITH attendues AS (
  SELECT unnest(ARRAY[
    'utilisateurs', 'entreprises', 'portefeuilles', 'points_collecte',
    'categories_dechets', 'types_dechets', 'zones', 'tarifs',
    'plans_abonnement', 'abonnements', 'utilisations_abonnement',
    'demandes_collecte', 'transactions_portefeuille', 'paiements',
    'ajustements_prix', 'missions_collecte', 'elements_collectes',
    'devis', 'factures', 'signalements', 'partenaires', 'recompenses',
    'reclamations_recompenses', 'transactions_points', 'notifications',
    'preferences_notification', 'journaux_audit', 'cles_idempotence',
    'sessions_utilisateur', 'participations_collectes_communautaires'
  ]) AS table_name
)
SELECT 
  a.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'DÉPLOYÉE' ELSE 'MANQUANTE' END AS statut
FROM attendues a
LEFT JOIN information_schema.tables t 
  ON t.table_schema = 'public' AND t.table_name = a.table_name
ORDER BY statut DESC, a.table_name;

-- 3. Vérification des contraintes d'intégrité sur les portefeuilles
SELECT 
  conname,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE n.nspname = 'public' AND r.relname = 'portefeuilles';

-- 4. Vérification des index et contraintes de la participation citoyenne
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'participations_collectes_communautaires';

-- 5. Vérification de l'ensemble des contraintes CHECK critiques déployées
SELECT 
  r.relname AS table_nom,
  c.conname AS contrainte_nom,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE n.nspname = 'public' 
  AND c.contype = 'c'
ORDER BY r.relname, c.conname;

-- 6. Vérification des index partiels d'unicité (abonnements actifs, points collecte actifs)
SELECT 
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND indexname IN (
    'abonnements_utilisateur_actif_unique',
    'points_collecte_particulier_actif_unique',
    'part_comm_sig_user_unique'
  );

-- 7. Synthèse globale du schéma : nombre de tables, colonnes, contraintes et index
SELECT 
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS nb_tables,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public') AS nb_colonnes,
  (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public') AS nb_contraintes,
  (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public') AS nb_index;

