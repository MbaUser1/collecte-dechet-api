-- ============================================================================
-- SCRIPT 07 — Requêtes de validation et de contrôle post-déploiement
-- Permet de vérifier la présence et l'intégrité des 30 tables et contraintes
-- EXÉCUTION STRICTEMENT EN LECTURE SEULE
-- ============================================================================

-- 1. Rapport de présence et de structure des 30 tables attendues
WITH attendues AS (
  SELECT * FROM (VALUES
    ('utilisateurs', 15),
    ('entreprises', 12),
    ('portefeuilles', 8),
    ('points_collecte', 11),
    ('categories_dechets', 6),
    ('types_dechets', 7),
    ('zones', 9),
    ('tarifs', 12),
    ('plans_abonnement', 10),
    ('abonnements', 12),
    ('utilisations_abonnement', 7),
    ('demandes_collecte', 25),
    ('transactions_portefeuille', 8),
    ('paiements', 15),
    ('ajustements_prix', 10),
    ('missions_collecte', 13),
    ('elements_collectes', 7),
    ('devis', 12),
    ('factures', 13),
    ('signalements', 15),
    ('partenaires', 10),
    ('recompenses', 11),
    ('reclamations_recompenses', 9),
    ('transactions_points', 8),
    ('notifications', 9),
    ('preferences_notification', 8),
    ('journaux_audit', 9),
    ('cles_idempotence', 8),
    ('sessions_utilisateur', 9),
    ('participations_collectes_communautaires', 6)
  ) AS t(nom_table, colonnes_attendues)
),
reelles AS (
  SELECT table_name, count(*)::int AS nb_colonnes
  FROM information_schema.columns
  WHERE table_schema = 'public'
  GROUP BY table_name
)
SELECT 
  a.nom_table,
  a.colonnes_attendues,
  COALESCE(r.nb_colonnes, 0) AS colonnes_reelles,
  CASE 
    WHEN r.table_name IS NULL THEN 'TABLE_MANQUANTE'
    WHEN r.nb_colonnes < a.colonnes_attendues THEN 'STRUCTURE_INCOMPLETE'
    ELSE 'CONFORME'
  END AS diagnostic
FROM attendues a
LEFT JOIN reelles r ON r.table_name = a.nom_table
ORDER BY diagnostic DESC, a.nom_table;

-- 2. Audit des contraintes CHECK critiques requises par le contrat
WITH contraintes_attendues AS (
  SELECT * FROM (VALUES
    ('portefeuilles', 'portefeuilles_solde_non_negatif'),
    ('portefeuilles', 'portefeuilles_proprietaire_exclusif'),
    ('tarifs', 'tarifs_prix_non_negatifs'),
    ('tarifs', 'tarifs_dates_coherentes'),
    ('plans_abonnement', 'plans_prix_positif_ou_nul'),
    ('plans_abonnement', 'plans_parametres_strictement_positifs'),
    ('abonnements', 'abonnements_quotas_valides'),
    ('abonnements', 'abonnements_dates_coherentes'),
    ('transactions_portefeuille', 'transactions_portefeuille_montant_positif'),
    ('recompenses', 'recompenses_stock_et_points_valides'),
    ('signalements', 'signalements_points_positifs'),
    ('devis', 'devis_montants_valides'),
    ('demandes_collecte', 'demandes_poids_estime_positif'),
    ('demandes_collecte', 'demandes_prix_estime_positif'),
    ('factures', 'factures_montants_valides'),
    ('reclamations_recompenses', 'reclamations_points_positifs'),
    ('missions_collecte', 'missions_dates_coherentes'),
    ('paiements', 'paiements_montant_positif'),
    ('transactions_points', 'transactions_points_positifs'),
    ('elements_collectes', 'elements_collectes_poids_positif'),
    ('ajustements_prix', 'ajustements_montant_positif'),
    ('participations_collectes_communautaires', 'participations_statut_valide')
  ) AS t(nom_table, nom_contrainte)
),
contraintes_reelles AS (
  SELECT 
    r.relname AS nom_table,
    c.conname AS nom_contrainte,
    pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint c
  JOIN pg_class r ON r.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = r.relnamespace
  WHERE n.nspname = 'public' AND c.contype = 'c'
)
SELECT 
  ca.nom_table,
  ca.nom_contrainte,
  CASE 
    WHEN cr.nom_contrainte IS NOT NULL THEN 'DÉPLOYÉE' 
    ELSE 'MANQUANTE' 
  END AS etat,
  cr.definition
FROM contraintes_attendues ca
LEFT JOIN contraintes_reelles cr 
  ON cr.nom_table = ca.nom_table AND cr.nom_contrainte = ca.nom_contrainte
ORDER BY etat DESC, ca.nom_table, ca.nom_contrainte;

-- 3. Audit des index partiels et d'unicité critiques
WITH index_attendus AS (
  SELECT * FROM (VALUES
    ('points_collecte', 'points_collecte_particulier_actif_unique', 'statut = ''ACTIF'''),
    ('abonnements', 'abonnements_utilisateur_actif_unique', 'statut = ''ACTIF'''),
    ('participations_collectes_communautaires', 'part_comm_sig_user_unique', 'signalement_id, utilisateur_id')
  ) AS t(nom_table, nom_index, critere_attendu)
),
index_reels AS (
  SELECT 
    tablename AS nom_table,
    indexname AS nom_index,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
)
SELECT 
  ia.nom_table,
  ia.nom_index,
  ia.critere_attendu,
  CASE 
    WHEN ir.nom_index IS NULL THEN 'INDEX_MANQUANT'
    WHEN ir.indexdef NOT ILIKE '%' || ia.critere_attendu || '%' THEN 'PREDICAT_INCORRECT'
    ELSE 'CONFORME'
  END AS statut_index,
  ir.indexdef
FROM index_attendus ia
LEFT JOIN index_reels ir 
  ON ir.nom_table = ia.nom_table AND ir.nom_index = ia.nom_index;

-- 4. Synthèse globale et conformité d'ensemble
SELECT 
  (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS total_tables_publiques,
  (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public') AS total_colonnes,
  (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'c') AS total_check_constraints,
  (SELECT count(*)::int FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'f') AS total_foreign_keys,
  (SELECT count(*)::int FROM pg_indexes WHERE schemaname = 'public') AS total_indexes;

