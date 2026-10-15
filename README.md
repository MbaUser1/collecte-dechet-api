# Collecte Déchets API — Guide Technique et d'Exploitation

API REST de gestion des demandes de collecte de déchets, abonnements, missions des collecteurs, portefeuilles, facturation d'entreprises, récompenses citoyennes et administration opérationnelle.

Conçue avec **NestJS 12**, **TypeScript**, **Prisma ORM 8 RC** (`@prisma/orm-postgres`) et **PostgreSQL (Supabase)**.

---

## 1. Architecture Applicative et Modules

L'architecture est structurée selon une approche modulaire en couches (Contrôleurs, Services, Guards, DTOs, Entités/Types Prisma 8) :

```
src/
├── common/                     # Intercepteurs unifiés, filtres d'exceptions, pagination et sérialiseur
├── config/                     # Validation des variables d'environnement (class-validator)
├── prisma/                     # Client d'accès à la base de données PostgreSQL via Prisma ORM 8
└── modules/
    ├── auth/                   # Inscription, JWT HS256, sessions, rotation refresh tokens, RBAC
    ├── catalogue/              # Catégories et types de déchets
    ├── zones/                  # Découpage géographique, périmètres et calcul de distance géodésique
    ├── tarifs/                 # Grille tarifaire dynamique par type de déchet et zone
    ├── plans-abonnement/       # Formules d'abonnement (particuliers / entreprises)
    ├── points-collecte/        # Adresses et coordonnées GPS des clients
    ├── abonnements/            # Cycle de vie des abonnements et réservation des quotas
    ├── demandes-collecte/      # Demandes de collecte, tarification estimée et statuts
    ├── portefeuille/           # Portefeuilles client, transactions crédit/débit et anti-découvert
    ├── paiements/              # Règlement collecte/abonnement/facture, webhooks HMAC, idempotence
    ├── ajustements/            # Ajustements tarifaires suite au pesage réel
    ├── missions/               # Acceptation atomique, scan QR code, pesée et clôture de mission
    ├── signalements/           # Dépôts sauvages et chantiers de nettoyage communautaires
    ├── recompenses/            # Points fidélité citoyen, catalogue et réclamations de bons
    ├── facturation/            # Devis et factures entreprises, règlements partiels et solde dû
    ├── notifications/          # Boîte de réception in-app et préférences de canaux
    ├── audit/                  # Journalisation sécurisée des actions sensibles (sans secrets)
    └── admin/                  # Tableau de bord synthétique, affectation collecteurs, modération
```

---

## 2. Variables d'Environnement

Créez un fichier `.env` à la racine en vous basant sur les variables ci-dessous (**valeurs fictives pour la documentation**) :

```bash
# Environnement d'exécution (development, test, production)
NODE_ENV=development
PORT=3000

# Base de données PostgreSQL (Transaction pooler IPv4)
DATABASE_URL="postgresql://postgres.example:MyStrongPassword123@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Base de données PostgreSQL directe (Session pooler pour introspection)
DIRECT_URL="postgresql://postgres.example:MyStrongPassword123@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"

# Base de données dédiée aux tests d'intégration réels (optionnelle en local)
DATABASE_TEST_URL="postgresql://postgres:testpass@localhost:5432/collecte_test"

# Secrets cryptographiques JWT (Obligatoires et distincts en production)
JWT_ACCESS_SECRET="CHANGE_ME_IN_PROD_MIN_64_CHARACTERS_RANDOM_ACCESS_SECRET_KEY_ABC"
JWT_REFRESH_SECRET="CHANGE_ME_IN_PROD_MIN_64_CHARACTERS_RANDOM_REFRESH_SECRET_KEY_XYZ"

# Durées de validité des jetons
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="30d"

# Clé secrète HMAC pour les webhooks fournisseurs
WEBHOOK_SECRET_KEY="my-webhook-hmac-sha256-secret-key"
```

> [!WARNING]
> En environnement de production (`NODE_ENV=production`), `JWT_ACCESS_SECRET` et `JWT_REFRESH_SECRET` doivent impérativement être définis avec des entropies élevées. Le serveur refuse de démarrer avec les clés par défaut.

---

## 3. Installation et Scripts de Développement

### Installation
```bash
npm install
```

### Compilation et exécution
```bash
# Mode développement avec rechargement automatique
npm run start:dev

# Compilation de production
npm run build

# Démarrage en production
npm run start:prod
```

### Qualité du code et validation des tests
```bash
# Exécution de l'ensemble des tests unitaires et d'intégration applicatifs (Vitest)
npm run test

# Exécution des tests End-to-End
npm run test:e2e

# Analyse statique et respect des règles TypeScript (Oxlint)
npm run lint

# Formatage automatique
npm run format
```

---

## 4. Rôles et Modèle de Sécurité

L'API applique un contrôle d'accès basé sur les rôles (RBAC) via `JwtAuthGuard` et `RolesGuard` :

1. **`PARTICULIER`** : Utilisateur grand public. Peut créer jusqu'à 3 points de collecte, souscrire à des abonnements individuels, commander des collectes, signaler des dépôts sauvages, accumuler des points et réclamer des récompenses.
2. **`ENTREPRISE`** : Compte professionnel avec raison sociale et numéro fiscal. Accède aux plans grands comptes, valide les devis, consulte et règle ses factures.
3. **`COLLECTEUR`** : Prestataire de terrain. Consulte les collectes disponibles, accepte une collecte de manière atomique, scanne le QR code client au démarrage, enregistre les pesées réelles et déclare l'issue de la mission.
4. **`ADMINISTRATEUR`** : Supervision globale. Accède au tableau de bord, affecte manuellement des collecteurs, modifie le statut des utilisateurs (avec révocation immédiate des sessions en cas de suspension), valide les signalements et audite l'ensemble des événements du système.

---

## 5. Endpoints Principaux

Tous les endpoints métier sont préfixés par `/api/v1` :

### Authentification & Sessions
- `POST /api/v1/auth/inscription` : Inscription publique (`PARTICULIER` ou `ENTREPRISE`).
- `POST /api/v1/auth/connexion` : Authentification et délivrance des jetons `access_token` (15m) et `refresh_token` (30j).
- `POST /api/v1/auth/rafraichir` : Rotation atomique du refresh token avec révocation de l'ancienne session.
- `POST /api/v1/auth/deconnexion` : Révocation du refresh token fourni.
- `GET /api/v1/auth/me` / `PATCH /api/v1/auth/me` : Consultation et mise à jour du profil.
- `POST /api/v1/auth/changer-mot-de-passe` : Changement sécurisé de mot de passe et révocation de toutes les sessions actives.
- `GET /api/v1/auth/sessions` : Liste des sessions actives (adresse IP, user agent, expiration, sans révéler le hash).
- `DELETE /api/v1/auth/sessions/:id` : Révocation d'une session spécifique.
- `DELETE /api/v1/auth/sessions` : Révocation de toutes les sessions actives de l'utilisateur.

### Demandes de Collecte & Abonnements
- `POST /api/v1/demandes-collecte` : Création d'une demande avec calcul serveur du prix estimé selon le snapshot tarifaire.
- `GET /api/v1/demandes-collecte/mes-demandes` : Consultation paginée des demandes du client connecté.
- `POST /api/v1/abonnements` : Souscription à un plan d'abonnement.
- `GET /api/v1/abonnements/mes-abonnements` : Consultation des abonnements actifs et quotas restants.

### Portefeuille & Paiements
- `GET /api/v1/portefeuille/mon-portefeuille` : Solde disponible et devise.
- `POST /api/v1/portefeuille/recharger` : Demande de recharge avec support d'idempotence.
- `POST /api/v1/paiements/collecte` : Règlement d'une collecte (par portefeuille ou fournisseur externe).
- `POST /api/v1/paiements/webhooks/:fournisseur` : Webhook serveur-à-serveur avec vérification de signature HMAC en temps constant (`timingSafeEqual`), contrôle de montant, de devise et protection contre les rejeux.

### Exécution Opérationnelle (Collecteurs)
- `GET /api/v1/missions/disponibles` : Liste des collectes prêtes à être prises en charge dans la zone du collecteur.
- `POST /api/v1/missions/demandes/:id/accepter` : Prise en charge atomique d'une collecte (verrou logique, création de mission).
- `POST /api/v1/missions/:id/demarrer-qr` : Validation du QR code client au moment de l'enlèvement sur place.
- `POST /api/v1/missions/:id/enregistrer` : Clôture de collecte, pesée réelle, vérification du respect du tri et calcul du prix final.

### Citoyenneté & Facturation
- `POST /api/v1/signalements` : Signalement géolocalisé d'un dépôt sauvage.
- `POST /api/v1/recompenses/:id/reclamer` : Échange de points citoyen contre un bon d'achat unique (`REC-XXXX`).
- `GET /api/v1/entreprises/factures` : Consultation des factures d'une entreprise et du solde restant dû.
- `POST /api/v1/entreprises/factures/:id/payer` : Règlement partiel ou total d'une facture.

### Administration & Audit
- `GET /api/v1/admin/dashboard` : Synthèse globale en temps réel (demandes par statut, comptes actifs, alertes financières).
- `GET /api/v1/admin/utilisateurs` : Annuaire paginé et filtré.
- `PATCH /api/v1/admin/utilisateurs/:id/statut` : Activation ou suspension de compte (avec révocation immédiate des sessions).
- `POST /api/v1/admin/demandes/:id/affecter-collecteur` : Affectation administrative d'une mission à un collecteur actif.
- `GET /api/v1/admin/audit` : Consultation du journal d'audit centralisé.

---

## 6. Fournisseurs de Paiement et Statut

1. **`FOURNISSEUR_DEMO` (Actif par défaut)** :
   - Fournisseur de simulation pour les environnements de développement et de test local.
   - **Protection absolue de production** : Le fournisseur lève une exception `ForbiddenException` immédiate dès que `NODE_ENV === 'production'`. Aucun flux d'argent réel ne peut transiter par ce mock.
2. **Fournisseurs réels (MTN Mobile Money, Orange Money, Stripe)** :
   - L'interface [`IFournisseurPaiement`](file:///e:/projets-next/collecte-dechets-api/src/modules/paiements/fournisseurs/fournisseur-paiement.interface.ts) définit le contrat attendu (`initierPaiement`, `verifierSignatureWebhook`, `analyserNotification`).
   - **Statut actuel** : Aucun compte marchand ni clé de passerelle réelle n'est actuellement configuré. L'intégration de chaque opérateur réel exigera la configuration de leurs identifiants marchands sécurisés et secrets de webhook dans les variables d'environnement de production.

---

## 7. Schéma SQL, Migrations et Limitations

### A. Schéma Supabase Distant vs Migrations SQL Préparées
- **État actuel de la base Supabase distante** : La base distante consultée ne contient actuellement que **4 tables applicatives** (`entreprises`, `points_collecte`, `portefeuilles`, `utilisateurs`).
- **Scripts de migration préparés (01 à 07)** :
  Sept scripts SQL locaux et idempotents ont été conçus dans `src/prisma/migrations/` pour amener la base de données aux **30 tables complètes** prévues par le contrat Prisma 8 :
  1. `01_align_existing_tables.sql` : Alignement des 4 tables existantes, sécurisation des types (`bigint`), ajout de la contrainte CHECK anti-découvert `solde >= 0`, et clé étrangère `ON DELETE RESTRICT`.
  2. `02_deploy_level0_tables.sql` : Déploiement des tables socles de niveau 0 sans dépendance externe (catalogue, rôles, statuts).
  3. `03_deploy_level1_tables.sql` : Déploiement des tables de niveau 1 (tarifs, plans d'abonnement, etc.).
  4. `04_deploy_level2_tables.sql` : Déploiement des tables de niveau 2 (demandes de collecte, abonnements, etc.).
  5. `05_deploy_level3_tables.sql` : Déploiement des tables de niveau 3 (missions, paiements, factures, participations communautaires, etc.).
  6. `06_deploy_level4_tables.sql` : Déploiement des tables de niveau 4 (ajustements financiers, audit logs, etc.).
  7. `07_verification_and_indexes.sql` : **Script de contrôle strictement en lecture seule** inspectant la présence des 30 tables, des 22 contraintes CHECK critiques et des index partiels.
- **Règle absolue** : **AUCUNE MIGRATION DIRECTE SUR LA BASE SUPABASE DE PRODUCTION**. Le schéma doit d'abord être validé sur un environnement de staging dédié (clone Supabase ou instance PostgreSQL isolée).

### B. Tests de Concurrence Réels PostgreSQL (`DATABASE_TEST_URL`)
- Le fichier [`test/concurrence-postgresql.e2e-spec.ts`](file:///e:/projets-next/collecte-dechets-api/test/concurrence-postgresql.e2e-spec.ts) implémente **9 scénarios réels de concurrence multi-connexions** via `pg.Client` natif (sans mocks) :
  1. Double requête concurrente avec la même clé d'idempotence.
  2. Deux débits concurrents dépassant le solde d'un portefeuille (intégrité CHECK `solde >= 0`).
  3. Débits concurrents compatibles avec le solde.
  4. Deux requêtes concurrentes consommant le quota restant d'un abonnement.
  5. Deux collecteurs acceptant la même demande de collecte simultanément.
  6. Double notification concurrente d'un webhook de paiement.
  7. Règlements partiels concurrents sur une facture d'entreprise.
  8. Annulation de collecte concurrente à la consommation de quota.
  9. Remboursements partiels concurrents sur un paiement.
- **Garde-fous d'infrastructure** :
  - Le banc de test inspecte l'URL de connexion et **refuse formellement** de s'exécuter sur un hôte cloud/Supabase ou sur une base dont le nom n'évoque pas explicitement un environnement de test (`test`, `ci`, `temp`).
  - Définir `DATABASE_TEST_URL="postgresql://postgres:postgres@localhost:5432/collecte_test"` pour exécuter ces tests sur une instance PostgreSQL locale.
  - En l'absence d'instance de test dédiée, les tests sont explicitement **sautés (`skipped`)** sans faux positifs.

### C. Limites Fonctionnelles Actuelles
- **Invalidation immédiate des Access Tokens JWT** :
  - La suspension d'un compte bloque instantanément les requêtes grâce au contrôle de statut en base effectué dans `JwtAuthGuard`.
  - La révocation unitaire d'une seule session par un utilisateur sans suspension du compte laisse l'access token actif jusqu'à expiration (≤ 15 minutes) car le token est apatride (stateless). L'intégration d'une liste noire distribuée (Redis ou table `jetons_revoques`) sera nécessaire pour une invalidation instantanée d'un jeton spécifique.
- **Passerelles Externes de Notifications (SMS / Push / WhatsApp)** :
  - Les notifications in-app sont persistées en base (`Notification`).
  - L'envoi vers les terminaux distants (Twilio / Firebase Cloud Messaging) requiert une file de traitement persistante (ex. BullMQ / Redis) pour garantir la livraison sans impacter le temps de réponse HTTP.
- **Participations aux Chantiers Communautaires** :
  - La table `participations_collectes_communautaires` est entièrement modélisée dans le contrat Prisma 8 et prévue dans le script `05_deploy_level3_tables.sql`.
  - Le service applicatif [`SignalementsService`](file:///e:/projets-next/collecte-dechets-api/src/modules/signalements/signalements.service.ts) implémente la persistance des participants (`rejoindreCollecteCommunautaire`, vérification de la capacité maximale et unicité).
  - La persistance en base sera effective dès que la migration 05 sera déployée sur l'infrastructure cible.

---

## 8. Procédure de Déploiement et Validation Staging

1. **Validation locale de l'application** :
   ```bash
   npm run lint
   npm test
   npm run build
   ```
2. **Préparation d'un environnement de staging isolé** :
   - Créer une instance PostgreSQL ou un projet Supabase de staging dédié.
   - Ne jamais exécuter de DDL sur l'instance de production directement.
3. **Application ordonnancée des migrations SQL** :
   - Appliquer successivement les scripts `01_align_existing_tables.sql` à `06_deploy_level4_tables.sql` via `psql` ou l'éditeur SQL de staging.
4. **Vérification automatique de conformité** :
   - Exécuter le script `07_verification_and_indexes.sql` en lecture seule et vérifier que les 30 tables, les 22 contraintes CHECK et les prédicats d'index retournent un statut `CONFORME`.
5. **Validation des tests de bout en bout** :
   - Configurer `DATABASE_TEST_URL` pointant vers la base de staging et lancer `npm run test:e2e`.
6. **Mise en production sécurisée** :
   - Configurer les variables d'environnement (`NODE_ENV=production`, secrets JWT cryptographiquement forts, `DATABASE_URL`).
   - Démarrer le service avec un gestionnaire de processus (PM2 / conteneur Docker) : `node dist/main.js`.
   - Placer l'API derrière un reverse proxy avec SSL, compression et rate limiting.
