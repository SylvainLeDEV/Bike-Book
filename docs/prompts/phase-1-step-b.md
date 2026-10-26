# Prompt de développement — Bike-Book, phase 1, étape B (les vraies fonctionnalités)

À donner tel quel à l'assistant de code (une session neuve, à la racine du dépôt). Il est
autonome : il ne suppose aucune mémoire d'une conversation précédente.

---

Tu vas développer les **fonctionnalités de la phase 1 (MVP)** de **Bike-Book**, une application
web auto-hébergée de suivi de vélos : sorties, entretien, composants, et ce qui arrive (entretiens
dus en heures, en kilomètres ou à une date, pièces à racheter). Le socle technique (phase 0) et le
design system (phase 1, étape A) sont faits et validés. Il reste à construire **l'application
réelle** : base de données, logique métier, écrans branchés sur de vraies données.

**Objectif :** une version que je pourrai **déployer sur mon serveur** (image Docker publiée par un
tag `v*`) pour l'essayer en vrai, fonctionnalité après fonctionnalité. Les sauvegardes, la
restauration testée et l'envoi de 10 Mo à travers le proxy seront faits **après** la phase 1, avant
que je saisisse de vraies données : ne les traite pas, mais ne rends rien impossible.

Lis ce prompt en entier avant de commencer.

---

## 1. Règles de travail (non négociables)

1. **Langues.** Tu me parles en **français**, avec un tutoiement. Code, commentaires, noms,
   messages de commit et docs : en **anglais**. Tout texte visible dans l'application : en
   **français**, tutoiement, formats français (espace fine insécable pour les milliers, virgule
   décimale, espace insécable avant les unités, « € » après le montant). Utilise
   `src/lib/format.ts`, ne réécris pas de formatage à la main.
2. **Git : c'est moi qui committe et qui pousse.** Tu ne lances **jamais** `git add`,
   `git commit`, `git push` ni `git tag`. À la fin de chaque fonctionnalité, tu laisses les
   changements dans l'arbre de travail et tu me proposes un message de commit en anglais.
3. **Les docs font foi.** Les décisions `D-xx` de `docs/02-decisions-and-questions.md` sont
   contraignantes. Si une décision et la maquette divergent, la décision gagne.
4. **Pose des questions.** Dès qu'un choix n'est pas tranché par les docs, arrête-toi et demande-moi,
   en une question courte **avec ta recommandation**. Ne devine pas.
5. **Pas de nouvelle dépendance sans mon accord** : propose-la avec sa raison et son alternative
   (sharp, React Hook Form, Playwright, une bibliothèque ZIP, un décodeur HEIC…).
6. **Dépôt public (D-22).** Jamais de secret, de donnée personnelle réelle, de `.env`, ni rien de
   propre à mon installation (IP, nom d'hôte, VPN, cible de sauvegarde). Données de démo et de test
   fictives.
7. **Next.js 16.4 n'est pas celui que tu connais.** Avant d'utiliser une API Next.js, lis le guide
   correspondant dans `node_modules/next/dist/docs/` (voir `AGENTS.md`). Cache Components est
   désactivé exprès (D-29) : ne le réactive pas.
8. **Pas de sur-ingénierie.** Construis ce que la phase 1 demande, sans fermer les portes
   (multi-utilisateur, PostgreSQL, import Garmin par API ou fichier FIT, phase 1.5). Pense à
   Garmin dès le modèle : une sortie a une `source` et un `external_activity_id` prévus (phase 2).
9. **Docs à jour.** Toute décision nouvelle ou modifiée va dans `docs/02` (datée), et le doc
   concerné est mis à jour dans le même changement.
10. **Honnêteté.** Si un contrôle échoue, dis-le avec la sortie. Ne présente jamais comme fini
    quelque chose qui ne l'est pas. Dis ce que tu n'as pas vérifié.

---

## 2. À lire avant d'écrire la moindre ligne

Dans cet ordre : `CLAUDE.md` et `AGENTS.md` ; `docs/02` (toutes les décisions, surtout D-25 à
D-53) ; `docs/03-data-model.md` (modèle **et dictionnaire de données**) ; `docs/04-architecture.md`
(stack, structure, routes proposées, design system) ; `docs/05-roadmap.md` ; `docs/01` (principes :
saisie en moins de 30 s, chiffres explicables) ; `docs/design/README.md`.

Puis le code : `src/server/db/` (schéma, client, couche d'accès, tests), `src/server/auth/`,
`src/app/` (dont `design/`), `src/components/`, `src/lib/` (`format.ts`, `display.ts`, `labels.ts`,
`view-models.ts`), `eslint.config.mjs`, `vitest.config.mts`.

Ouvre `/design` (`pnpm dev`, http://localhost:3000/design) : ce sont les écrans à brancher.
`docs/design/mockups.html` est gardé comme référence des écrans de la phase 1.5 et 3 (D-53) : pour la
phase 1, `/design` fait foi.

Fais-moi un **court résumé en français** (5 à 10 lignes) de ce que tu as compris et tes questions,
**avant** de commencer la fonctionnalité 1.

---

## 3. État actuel

- Next.js 16.4 (App Router, TypeScript strict, `output: "standalone"`), Tailwind CSS 4, Radix,
  Zod 4, Drizzle ORM + SQLite (WAL, `better-sqlite3`), Better Auth, Vitest 5, pnpm 12, Node 24.
- Tables existantes : `users`, `sessions`, `accounts`, `verifications`, `workspaces`,
  `memberships`. **Aucune table métier encore.** Migrations dans `src/server/db/migrations`,
  appliquées à l'ouverture de la base (D-28).
- Couche d'accès scopée dans `src/server/db` (point d'entrée `index.ts`), qui reçoit un
  `AccessContext` (utilisateur + workspace). ESLint interdit d'importer Drizzle, le schéma,
  `drizzle-orm` ou `better-sqlite3` ailleurs (tests exemptés).
- Design system complet dans `src/components` (shell, primitives, écrans) : l'écran reçoit des
  **view models** (`src/lib/view-models.ts`) en unités brutes (mètres, secondes, centimes, dates
  `YYYY-MM-DD`) ; `/design` les remplit avec des fixtures (`src/app/design/fixtures.ts`).
  **Les vraies pages remplissent les mêmes view models** avec la couche d'accès et le domaine.
  Si un view model doit changer, change-le **et** les fixtures dans le même mouvement.
- Les pages connectées actuelles (`src/app/(app)/`) sont **provisoires** : la fonctionnalité 1 les
  fait passer dans le vrai shell (`AppShell`) et remplace le tableau de bord de démo.
- Contrôles : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` (tous au vert au
  départ : 46 tests). `pnpm db:generate` génère une migration, `pnpm db:seed` crée la démo.

---

## 4. Architecture à respecter

- **Accès aux données scopé (D-25).** Pages, Server Actions et Route Handlers ne requêtent jamais
  les tables : ils passent par des fonctions de `src/server/db` qui reçoivent le contexte et
  filtrent dessus. Les tables sous un vélo héritent du workspace par `bike_id` : chaque fonction
  vérifie que le vélo appartient au workspace. **Chaque fonction a un test d'isolation** : un autre
  workspace ne voit rien et ne peut rien modifier.
- **Logique métier pure et testée** dans `src/server/domain` : compteurs d'usure, statut des
  règles, ETA, coût total, quantités de stock, tri de « À racheter ». Fonctions pures, sans
  base, avec tests Vitest. Les tests changent avec la logique.
- **Server Actions** pour les formulaires, avec un schéma Zod (validation côté serveur : champs
  requis, bornes, `trim`, pas de distance ni durée négative). **Route Handler en streaming**
  (`src/app/api/uploads`) pour les fichiers, jamais une Server Action (limite de 1 Mo).
- **Transactions** pour tout flux qui écrit plusieurs lignes, et **annulation** (toast « Annuler »)
  qui défait tout le flux. **Avant la première fonctionnalité qui en a besoin, propose-moi un seul
  mécanisme d'annulation** (arrêt n° 3, voir §7). Le toast existe déjà
  (`useToast`, option `undo`) ; le mécanisme serveur est à concevoir.
- **Unités entières** : mètres, secondes, centimes d'euro ; l'interface convertit. **Temps** :
  instants en UTC (epoch ms), affichés dans le fuseau `TZ` (`localDateOf` dans `format.ts`) ; dates
  calendaires en `YYYY-MM-DD`. Les changements d'heure sont l'endroit où se cachent les bugs :
  teste-les.
- **SQL portable** vers PostgreSQL (pas de SQL propre à SQLite dans les requêtes ; valeurs par
  défaut calculées par l'application avec `$defaultFn`). **Énumérations** : colonnes texte avec
  contrainte CHECK. **Suppression** : vélos, composants et objets d'atelier sont retirés ou
  archivés, jamais supprimés.
- **Routes** (proposition de `docs/04`, **à moins que je dise le contraire**) : `/`, `/bikes`,
  `/bikes/[bikeId]`, `/activity`, `/workshop`, `/workshop/[itemId]`, `/settings`. Saisie de sortie,
  saisie d'entretien, remplacement de pièce et éditions = **feuilles**, pas des routes. Le
  chemin `(app)/` est un groupe de routes : il sert de layout au shell.
- **Production** : tout ce dont l'application a besoin pour fonctionner **doit exister en
  production**, pas seulement dans le seed de démo (`pnpm db:seed` refuse de tourner en
  production). Les données de référence (fonctionnalité 2) passent donc par une **migration de
  données** versionnée.

---

## 5. Des données propres et explicables, utilisables par une IA (D-50)

La phase 3 fera lire ces données par un modèle local, et l'export ZIP doit être compréhensible sans
l'application. À **chaque** table que tu crées :

1. **Les noms disent quoi et dans quelle unité** (`distance_m`, `wear_s`, `price_cents`,
   `torque_nm`) ; `*_on` pour une date calendaire, `*_at` pour un instant. Pas d'abréviation.
2. **Énumérations en anglais, texte + CHECK**, chaque valeur définie dans `docs/03`. Les libellés
   français n'existent que dans l'interface (`src/lib/labels.ts`).
3. **Une colonne = un sens.** Pas de valeur magique (`-1`, `0` pour « inconnu ») : inconnu =
   `null`. JSON seulement pour des clés libres (`components.specs`, `setups.extra`).
4. **Propre à l'entrée** : toute écriture passe par un schéma Zod ; les CHECK de la base sont la
   dernière ligne de défense, pas la seule.
5. **Valeurs dérivées calculées, jamais stockées** (compteurs, statuts, ETA, quantités en stock,
   coût total), avec les sorties et événements dont elles viennent (chaque chiffre est explicable,
   lien « Voir le détail »).
6. **`docs/03` est le dictionnaire de données** : chaque table et colonne de `schema.ts` y est
   décrite, et le schéma porte un commentaire court sur chaque table et sur chaque colonne dont le
   nom ne suffit pas. Un changement de schéma met à jour les deux dans le même changement.
7. **L'export embarque le dictionnaire** (type, unité, valeurs permises, sens).
8. **Les données fictives respectent les mêmes règles** et restent réalistes et cohérentes.

À la fin de chaque fonctionnalité, vérifie ces huit points pour les tables touchées et dis-le dans
ton compte rendu.

---

## 6. Les fonctionnalités, dans l'ordre (`docs/05-roadmap.md`)

**Une fonctionnalité à la fois.** Pour chacune, la même définition de « fini » :

1. schéma Drizzle et migration (`pnpm db:generate`), **relue à la main** ;
2. fonctions de la couche d'accès scopée, avec test d'isolation entre workspaces ;
3. logique métier pure dans `src/server/domain`, avec tests ;
4. Server Actions avec Zod ;
5. écrans : **les composants de `/design`, branchés** (pas de nouveau design sans me demander) ;
6. seed de démo (`pnpm db:seed`) complété avec les données fictives de `/design` (aujourd'hui =
   dimanche 25 octobre 2026 ; vélos Spectral, Le Lourd, Gravel alu ; « Camille Martin », garage
   « Mon garage » : **aligne** le nom du garage du seed, aujourd'hui « Garage de démo ») ;
7. docs : `docs/03` (dictionnaire), `docs/02` si une décision est prise, `docs/05` (case cochée) ;
8. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check` au vert, **et vérification dans
   le navigateur** (téléphone 375 px, PC 1280 px, clair et sombre, clavier seul sur les écrans
   touchés) ;
9. `pnpm build` passe (et `docker build .` si Docker est disponible) : **l'application reste
   déployable à la fin de chaque fonctionnalité** ;
10. compte rendu (§8) et message de commit proposé. **Puis tu continues** avec la suivante, sauf
    si une décision m'appartient.

Points d'attention :

1. **Vélos** — `bikes` et `shops` (avec `kind`, D-37). Création, modification, fiche complète
   (D-43), statut avec son effet en une ligne (« Vendu » fait apparaître date et prix de vente),
   nom unique par workspace, jamais de suppression. **Fait passer les pages connectées dans
   `AppShell`** (fournit `ToastProvider`, les view models du shell, la saisie rapide) et remplace
   la page d'accueil provisoire. La feuille « Modifier le vélo » existe en esquisse dans la
   maquette (`docs/design/mockups.html`, feuille `sheet-bike`) : reconstruis-la dans `/design`
   d'abord, avec les mêmes composants. Déconnexion = Server Action `signOutAction` existante.
2. **Données de référence** — `component_types` et `rule_templates` (`workspace_id` vide = modèle
   intégré), par **migration de données**. Les intervalles gardent leur source et leur statut
   (`manufacturer`, `common_practice` ; les valeurs « Estimate » restent des estimations).
3. **Composants** — fiche d'origine (`origin = stock`) suivie par `replaces_component_id`,
   remplacement avec raison et détail (`removal_note`), un seul composant monté par emplacement
   (`single_slot`). Le compteur compte les sorties avec `installed_at ≤ started_at < removed_at`
   (des instants). Remplacement depuis l'atelier : avec la fonctionnalité 8 ; avant, seulement
   « Autre pièce, hors atelier ».
4. **Sorties** — saisie rapide en moins de 30 s (valeurs par défaut : dernier vélo, aujourd'hui,
   type le plus fréquent pour ce vélo), champs bike park, `lift_assisted` vrai par défaut en bike
   park, lieu proposé à partir des sorties précédentes, conditions. Au moins une durée parmi
   `total_time_s` et `moving_time_s`. Liste dans Activité. **Question à me poser** : la saisie ne
   demande qu'une date, mais `started_at` est un instant et le compteur d'un composant compare des
   instants. Propose une heure par défaut (ma recommandation : l'heure courante si la date est
   aujourd'hui, sinon midi local) et dis comment une sortie du matin d'un jour de remplacement
   est traitée.
5. **Entretiens** — événement avec ses lignes (`maintenance_items`), atelier ou soi-même, coût
   saisi ou somme des lignes, `created_by`. Les factures arrivent avec la fonctionnalité 10.
   L'écran de saisie n'est **pas** maquetté : propose-le moi (dans `/design`) avant de le coder.
6. **Moteur de règles** — usure d'une sortie selon **D-13** (temps de descente si remontées et
   saisi, sinon temps en mouvement, sinon temps total ; même logique pour la distance), dernière
   remise à zéro, usage depuis, ratio, statut (`ok`, `due_soon` dès `warn_ratio`, `overdue` à
   100 %, `snoozed`), ETA sur la moyenne des 8 dernières semaines. **L'exemple chiffré de
   `docs/03` (45 h 10 → 90 % → bientôt dû ; 33 h 10 → 66 %) devient un test.** Chaque résultat
   renvoie ses sources (sorties, remise à zéro) pour « Voir le détail ». Règles proposées depuis les
   modèles à la création d'un composant ; « C'est fait » ; report (snooze).
7. **Tâches** — tâches ponctuelles seulement (D-34) : `open`, `done`, `cancelled`, sous « À prévoir »,
   « Fait » avec annulation.
8. **Atelier : pièces et rachat** (D-33 à D-42) — tables **complètes** (`kind` avec `part`,
   `product`, `tool` ; toutes les colonnes) mais interface **pièces seulement**. Quantités
   **calculées** à partir des mouvements (D-39). Rachat `to_order` → `ordered` → reçu (quantité
   saisie à la commande, corrigeable à la réception, D-42). Stock bas = suggestion, jamais une
   commande automatique (D-35). Liens d'achat affichés et ouverts dans un nouvel onglet avec
   `rel="noopener noreferrer"`, **jamais récupérés par le serveur** (D-09). « À racheter » trié par
   urgence (D-41). « En stock pour ce vélo ». Remplacer une pièce depuis le stock : **une
   transaction** (retrait, nouveau composant, ligne `replaced`, mouvement −1), annulable d'un bloc ;
   coût = dernier prix d'achat, modifiable (D-38).
9. **Tableau de bord « À prévoir »** — en retard, bientôt dû, tâches, « À racheter ».
10. **Pièces jointes** (D-45, D-46) — Route Handler en streaming, 25 Mo maximum, type vérifié sur le
    **contenu** (magic bytes), noms de fichiers aléatoires, originaux dans `uploads/`, copies
    redimensionnées dans `cache/`, servis avec contrôle d'accès scopé et
    `X-Content-Type-Options: nosniff`. Une pièce jointe est liée à **exactement un** élément
    (CHECK). `taken_at` lu dans les métadonnées, sinon l'heure d'envoi. **Avant de coder l'envoi de
    photos, arrête-toi** : on teste ensemble avec mon iPhone (H-11) ce que Safari envoie quand
    `accept` liste JPEG en premier et pas HEIC. Un HEIC qui arrive quand même est accepté
    (original gardé ; copies via un décodeur **sans bibliothèque native** : propose-m'en un).
    Galerie par vélo, visionneuse, photo de couverture, factures PDF sur les entretiens et
    documents sur la fiche vélo. **Pas d'étiquettes** (phase 1.5). La feuille « Ajouter des
    photos » (lignes d'envoi avec progression) est esquissée dans la maquette : reconstruis-la dans
    `/design` d'abord.
11. **Page vélo** — branche `BikeScreen` sur les vraies données : compteurs, onglets sous 1024 px
    (D-48), composants aujourd'hui/origine, chronologie, **coût total** (D-44) : achat + total des
    entretiens − prix de vente si vendu ; pour 100 km avec et sans l'achat, sur la distance des
    sorties (sans `initial_distance_m`) ; pièces comptées une seule fois, via les entretiens ;
    fonction pure testée et « Voir le calcul ».
12. **Export ZIP** — CSV/JSON de chaque table **du workspace courant uniquement**, les fichiers
    envoyés, et le **dictionnaire de données** (D-50). **Jamais** les tables d'authentification
    (`accounts` contient les empreintes de mots de passe, `sessions` les jetons) ni les données d'un
    autre workspace. Test dédié : l'export ne contient rien d'un autre workspace ni d'auth.

---

## 7. Points d'arrêt obligatoires

1. Après la lecture : ton résumé et tes questions (§2).
2. **Mécanisme d'annulation** : avant la première fonctionnalité qui en a besoin (ma recommandation
   d'ordre : propose-le au début de la fonctionnalité 3 ou 4).
3. **Heure de départ d'une sortie** (fonctionnalité 4) et **écran de saisie d'un entretien**
   (fonctionnalité 5) : propositions à valider.
4. **Avant l'envoi de photos** (fonctionnalité 10) : test iPhone et choix du décodeur HEIC.
5. Toute nouvelle dépendance, tout choix non tranché par les docs, tout écart avec une décision.

---

## 8. Compte rendu (en français, court) à chaque fonctionnalité

- ce qui est fait, en quelques lignes ;
- les décisions prises (et ajoutées dans `docs/02`) ou les questions pour moi ;
- les contrôles et la vérification navigateur, avec leur résultat **réel** (et ce qui n'a pas été
  vérifié) ;
- les huit points D-50 vérifiés pour les tables touchées ;
- le **message de commit proposé**, en anglais (je committe moi-même) ;
- ce qu'il reste à faire ensuite.

---

## 9. Quand la phase 1 est terminée

Prépare la mise en service, sans rien committer ni publier :

1. relis `docs/05-roadmap.md` : toutes les cases de la phase 1 cochées, ou dis lesquelles ne le
   sont pas et pourquoi ;
2. vérifie la liste de contrôle de production : `AUTH_SECRET` et `PUBLIC_URL` obligatoires, données
   de référence présentes sans seed, migrations qui s'appliquent sur une base existante de la phase
   0, `docker build .`, `/api/healthz`, export ZIP, 404 sur `/design` ;
3. propose la version à étiqueter (`v0.2.0`…) et un message de commit ; **c'est moi qui crée le
   tag** (`v*` déclenche la CI qui publie l'image) ;
4. rappelle-moi ce qui reste avant de saisir de vraies données : sauvegarde du dossier de données
   avec une restauration testée, et un envoi de 10 Mo à travers le proxy.

## 10. Hors périmètre de la phase 1 (ne pas construire)

Étiquettes de photos et recherche entre vélos ; produits et outils de l'atelier ; fiches d'entretien
et mode atelier ; statistiques par mois et par année ; notifications Telegram et calendrier ;
journal de réglages ; relevés Bosch ; import Garmin (API ou fichier FIT) ; IA. Les tables de la
phase 1.5 sont **documentées** dans `docs/03` mais **ne sont pas créées**. Ne ferme simplement
aucune porte vers elles.
