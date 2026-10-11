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

1. **`FOURNISSEUR_DEMO`** :
   - Fournisseur de simulation pour les environnements de développement et de test.
   - **Protection de production** : Le fournisseur lève une exception `ForbiddenException` immédiate dès que `NODE_ENV === 'production'`. Il ne peut pas être déclenché accidentellement en environnement réel.
2. **Fournisseurs réels (MTN Mobile Money, Orange Money, Stripe)** :
   - L'interface [`IFournisseurPaiement`](file:///e:/projets-next/collecte-dechets-api/src/modules/paiements/fournisseurs/fournisseur-paiement.interface.ts) définit le contrat attendu (`initierPaiement`, `verifierSignatureWebhook`, `analyserNotification`).
   - L'intégration de chaque opérateur réel exigera la configuration de leurs identifiants marchands et clés de webhook dans les variables d'environnement.

---

## 7. Limitations Connues et Prérequis SQL

### A. Limites Fonctionnelles Actuelles
- **Invalidation immédiate des Access Tokens JWT** :
  - La suspension d'un compte bloque instantanément les requêtes grâce au contrôle de statut en base effectué dans `JwtAuthGuard`.
  - La révocation unitaire d'une seule session par un utilisateur sans suspension du compte laisse l'access token actif jusqu'à expiration (≤ 15 minutes) car le token est apatride (stateless). L'intégration d'une liste noire distribuée (Redis ou table `jetons_revoques`) sera nécessaire pour une invalidation instantanée d'un jeton spécifique.
- **Passerelles Externes de Notifications (SMS / Push / WhatsApp)** :
  - Les notifications in-app sont persistées en base (`Notification`).
  - L'envoi vers les terminaux distants (Twilio / Firebase Cloud Messaging) requiert une file de traitement persistante (ex. BullMQ / Redis) pour garantir la livraison sans impacter le temps de réponse HTTP.
- **Participations aux Chantiers Communautaires** :
  - Les chantiers sont modélisés par `SignalementDechet.est_collecte_communautaire`. L'attribution des points est tracée dans `TransactionPoints`.
  - Il n'existe pas de table dédiée `participations_chantiers` permettant d'inscrire des bénévoles préalablement à l'événement.

### B. Prérequis SQL pour Évolutions Futures
Pour des charges transactionnelles très élevées avec concurrence extrême, les contraintes et index suivants devront être ajoutés dans une future migration DDL planifiée :
1. `CREATE UNIQUE INDEX IF NOT EXISTS idx_demande_mission_unique ON missions_collecte (demande_collecte_id);`
2. `ALTER TABLE portefeuilles ADD CONSTRAINT portefeuilles_solde_non_negatif CHECK (solde >= 0);`
3. Verrouillage pessimiste (`SELECT ... FOR UPDATE`) sur les lignes `portefeuilles` lors des débits à forte concurrence.

---

## 8. Procédure de Déploiement

1. Configurer les variables d'environnement de production sur l'hébergeur (`NODE_ENV=production`, clés JWT aléatoires ≥ 64 caractères, `DATABASE_URL`).
2. Exécuter le build : `npm run build`.
3. Vérifier l'intégrité : `npm run test` et `npm run lint`.
4. Démarrer le service avec un gestionnaire de processus (ex. PM2 ou conteneur Docker) : `node dist/main.js`.
5. Configurer un reverse proxy (Nginx, Cloudflare) avec terminaison SSL, compression Gzip, et limitation de débit (rate limiting) sur `/api/v1/auth/*` et `/api/v1/paiements/*`.
