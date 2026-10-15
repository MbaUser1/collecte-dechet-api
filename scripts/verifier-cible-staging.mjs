#!/usr/bin/env node

/**
 * Script de pré-vérification avant migration vers Supabase Staging.
 *
 * RÈGLES DE SÉCURITÉ :
 * 1. Refuse formellement d'exécuter si l'environnement n'est pas explicitement 'staging'.
 * 2. Ne sélectionne JAMAIS automatiquement la production en cas d'absence de configuration staging.
 * 3. Bloque si l'identifiant de projet Supabase correspond au projet de production.
 * 4. Vérifie la présence et l'intégrité ordonnée des scripts 01 à 07.
 * 5. Vérifie la confirmation d'une sauvegarde ou d'un point de restauration avant toute action.
 * 6. Ne révèle aucun secret, mot de passe ni identifiant dans les logs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Identifiant du projet de production connu à protéger impérativement
const KNOWN_PRODUCTION_PROJECT_REF = 'pubuqfskvytwxgxgbkqb';

function redactUrl(rawUrl) {
  if (!rawUrl) return '(non défini)';
  try {
    const u = new URL(rawUrl);
    const userRef = u.username ? (u.username.includes('.') ? u.username.split('.')[1] : u.username) : 'inconnu';
    return `${u.protocol}//${userRef}@${u.hostname}:${u.port || '5432'}${u.pathname}`;
  } catch {
    return '(URL non analysable / format invalide)';
  }
}

function extractProjectRef(rawUrl) {
  if (!rawUrl) return null;
  try {
    const u = new URL(rawUrl);
    if (u.username && u.username.includes('.')) {
      return u.username.split('.')[1];
    }
    // Cas où le host est du type <ref>.supabase.co
    const hostParts = u.hostname.split('.');
    if (hostParts.length > 2 && hostParts[1] === 'supabase') {
      return hostParts[0];
    }
    return u.username || null;
  } catch {
    return null;
  }
}

console.log('================================================================');
console.log('  CONTRÔLE DE SÉCURITÉ PRÉ-MIGRATION — CIBLE SUPABASE STAGING   ');
console.log('================================================================\n');

let hasErrors = false;
const errors = [];
const warnings = [];

// 1. Contrôle de l'environnement déclaré
const targetEnv = (process.env.TARGET_ENV || process.env.SUPABASE_ENV || '').trim().toLowerCase();
console.log(`1. Environnement cible déclaré : ${targetEnv || '(non spécifié)'}`);

if (targetEnv !== 'staging') {
  hasErrors = true;
  errors.push(
    `L'environnement cible n'est pas explicitement identifié comme 'staging' (reçu: '${targetEnv || 'vide'}'). ` +
    `Définissez impérativement TARGET_ENV=staging pour continuer.`
  );
}

// 2. Détection de l'URL cible
const stagingDbUrl = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL_STAGING;
const directDbUrl = process.env.DIRECT_URL;
const defaultDbUrl = process.env.DATABASE_URL;

console.log('2. Analyse des sources de connexion à la base de données :');
console.log(`   - STAGING_DATABASE_URL : ${stagingDbUrl ? redactUrl(stagingDbUrl) : '(non renseigné)'}`);
console.log(`   - DIRECT_URL           : ${directDbUrl ? redactUrl(directDbUrl) : '(non renseigné)'}`);
console.log(`   - DATABASE_URL         : ${defaultDbUrl ? redactUrl(defaultDbUrl) : '(non renseigné)'}`);

let targetUrl = stagingDbUrl;

if (!targetUrl) {
  // Vérifier si DATABASE_URL est explicitement confirmée pour staging
  if (process.env.CONFIRM_TARGET_IS_STAGING === 'true' && defaultDbUrl) {
    targetUrl = defaultDbUrl;
    warnings.push(
      'Utilisation de DATABASE_URL comme cible staging suite à la confirmation explicite CONFIRM_TARGET_IS_STAGING=true.'
    );
  } else {
    hasErrors = true;
    errors.push(
      'Aucune URL de base de données de staging distincte n\'est configurée. ' +
      'Définissez STAGING_DATABASE_URL avec la chaîne de connexion au projet Supabase de staging.'
    );
  }
}

// 3. Protection absolue contre le ciblage accidentel de la production
if (targetUrl) {
  const targetRef = extractProjectRef(targetUrl);
  console.log(`   - Identifiant de projet extrait de la cible : ${targetRef || '(non identifiable)'}`);

  if (targetRef && targetRef === KNOWN_PRODUCTION_PROJECT_REF) {
    hasErrors = true;
    errors.push(
      `ALERTE CRITIQUE DE SÉCURITÉ : La base de données ciblée possède l'identifiant de projet '${targetRef}' ` +
      `qui correspond à la base de PRODUCTION. Interdiction formelle d'exécuter des migrations sur cette cible !`
    );
  }

  if (targetUrl.includes('prod') || targetUrl.includes('production')) {
    hasErrors = true;
    errors.push(
      'La chaîne de connexion cible contient les mentions "prod" ou "production". Opération annulée par sécurité.'
    );
  }
}

// 4. Vérification de la disponibilité d'une sauvegarde ou d'un point de restauration
console.log('\n3. Vérification de la sauvegarde / point de restauration :');
const backupFile = process.env.STAGING_BACKUP_FILE;
const backupConfirmed = process.env.STAGING_BACKUP_CONFIRMED === 'true';

let backupAvailable = false;
let backupDetails = '';

if (backupFile) {
  const resolvedBackupPath = path.resolve(rootDir, backupFile);
  if (fs.existsSync(resolvedBackupPath)) {
    const stats = fs.statSync(resolvedBackupPath);
    if (stats.size > 0) {
      backupAvailable = true;
      backupDetails = `Fichier de sauvegarde local détecté (${path.basename(resolvedBackupPath)}, ${stats.size} octets)`;
      console.log(`   [OK] ${backupDetails}`);
    } else {
      hasErrors = true;
      errors.push(`Le fichier de sauvegarde spécifié (${backupFile}) est vide (0 octet).`);
    }
  } else {
    hasErrors = true;
    errors.push(`Le fichier de sauvegarde spécifié (${backupFile}) est introuvable sur le disque.`);
  }
} else if (backupConfirmed) {
  backupAvailable = true;
  backupDetails = `Point de restauration / backup Supabase confirmé manuellement via STAGING_BACKUP_CONFIRMED=true (Horodatage: ${process.env.STAGING_BACKUP_TIMESTAMP || 'récent'}).`;
  console.log(`   [OK] ${backupDetails}`);
} else {
  hasErrors = true;
  errors.push(
    'Aucune sauvegarde ni point de restauration confirmé pour la base de staging. ' +
    'Avant toute migration, effectuez un dump de sauvegarde (pg_dump) ou confirmez la présence ' +
    'd\'un backup/snapshot Supabase via STAGING_BACKUP_CONFIRMED=true (ou STAGING_BACKUP_FILE=<chemin>).'
  );
  console.log('   [MANQUANT] Aucune sauvegarde locale ni confirmation de snapshot distant.');
}

// 5. Vérification des scripts de migration SQL
console.log('\n4. Vérification des scripts SQL de migration :');
const expectedScripts = [
  '01_align_existing_tables.sql',
  '02_deploy_reference_tables.sql',
  '03_deploy_level1_tables.sql',
  '04_deploy_level2_tables.sql',
  '05_deploy_level3_tables.sql',
  '06_deploy_level4_tables.sql',
  '07_verification_and_indexes.sql',
];

const migrationsDir = path.join(rootDir, 'src', 'prisma', 'migrations');
let scriptsOk = true;

for (let i = 0; i < expectedScripts.length; i++) {
  const scriptName = expectedScripts[i];
  const scriptPath = path.join(migrationsDir, scriptName);
  if (!fs.existsSync(scriptPath)) {
    scriptsOk = false;
    hasErrors = true;
    errors.push(`Script de migration manquant : src/prisma/migrations/${scriptName}`);
    console.log(`   [MANQUANT] (${i + 1}/${expectedScripts.length}) ${scriptName}`);
  } else {
    const stats = fs.statSync(scriptPath);
    console.log(`   [OK] (${i + 1}/${expectedScripts.length}) ${scriptName} (${stats.size} octets)`);
  }
}

// Synthèse
console.log('\n================================================================');
console.log('                        BILAN DU CONTRÔLE                       ');
console.log('================================================================');

if (warnings.length > 0) {
  console.log('\nAVERTISSEMENTS :');
  for (const w of warnings) {
    console.log(` - ${w}`);
  }
}

if (hasErrors) {
  console.log('\nBLOCAGES DÉTECTÉS (MIGRATION STRICTEMENT INTERDITE) :');
  for (let i = 0; i < errors.length; i++) {
    console.log(` ${i + 1}. ${errors[i]}`);
  }
  console.log('\nSTATUT : REFUS D\'EXÉCUTION — Prérequis de staging non remplis.');
  process.exit(1);
} else {
  console.log('\nTOUS LES CONTRÔLES SONT VALIDES :');
  console.log(' - Environnement : staging');
  console.log(` - Cible : ${redactUrl(targetUrl)}`);
  console.log(` - Sauvegarde : ${backupDetails}`);
  console.log(` - Scripts : 7/7 vérifiés dans l'ordre`);
  console.log('\nSTATUT : PRÊT POUR L\'EXÉCUTION SUR STAGING.');
  process.exit(0);
}
