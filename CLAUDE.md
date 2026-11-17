# ntanova-site

Le site de NTanova : l'annuaire public des écoles de la République du Congo (**Congo-Brazzaville, pas la RDC**), l'espace des relais qui relèvent les écoles sur le terrain, et l'administration. Dépôt privé `benaja-bendo/ntanova-site`.

- **Les relais collectent partout au Congo-Brazzaville** (fondateur, 04/11/2026). Collecter, accepter et publier sont trois gestes distincts : rien ne se publie seul. Lots, secteurs et états de la carte n'interdisent jamais une collecte.
- Ce dépôt ne contient que le code. Stratégie, hypothèses et seuils vivent dans le dépôt privé `ntanova` : **n'en recopier aucun ici**.
- Ce fichier ne garde que l'état actuel, l'architecture et les règles actives. **Le détail de chaque livraison, ticket par ticket : `docs/archive/2026-11-15-claude-md-avant-compression/`** (son `INDEX.md` dit où chercher).

## Où on en est (16/11/2026)

- **`main`** : la refonte v2 de l'espace relais et de l'administration (Tailwind et shadcn, PR 175) ; le lot 1 de la base du site public (PR 176 : `billed_months`, `confirmed_on`, `accepted_bac_tracks`, `campus_openings`, `campus_class_sizes`, `family_demands`). **Migrations et code en production : `main` `7baa394` (lots 1 à 4 bis, contacts de l’école PR 184, ajout d’un site et doublon PR 185) mis en ligne le 17/11** (mise en ligne sur ordre du fondateur).
- **Lot 2, fait le 16/11** : l'administration saisit ces champs : mois facturés et **« Noter le OUI de l'école »** (Frais), séries admises (Formations), « Places et effectifs » (fiche), demandes des familles (« Aujourd'hui »). Journal : `docs/avancement-admin-v2.md`.
- **Des frais ne sont publics qu'avec `confirmed_on`**, le jour du OUI écrit de l'école ; modifier une ligne l'efface (l'écran ne réécrit que les lignes qui changent).
- **Lot 3, fait le 16/11** (planches « Accueil » de la version 44) : l'en-tête à trois piliers, Trouver une école · S'orienter · Espace écoles (plus de bouton Menu) ; le pied de page (« Une école manque ? », les villes, la date de l'annuaire) ; **l'accueil sans carte ni JavaScript** ; `/orienter/` de passage (chaque profil ouvre sa liste) jusqu'aux questions du lot 5. Le mode « accueil » de la carte (`chargeur.ts`, `chargement.ts`) n'est plus appelé.
- **Contacts de l'école, 16/11** (planches « Contacts de l'école, privé », page Fiche d'école du canevas, version 51) : la fiche admin d'une école montre, dans une carte privée (sous « À compléter »), toutes les personnes rencontrées par les relais sur ce site (fiche d'origine, corrections, contre-visites), leur numéro, « WhatsApp » et « Appeler », qui les a relevées et quand ; « Gérer » ajoute, corrige, efface. `contacts_of_campus` et `add_campus_contact` (admin seulement, jamais `exiger_gestion_site`) ; une personne peut appartenir au site sans fiche (`direction_contacts.campus_id`) ; la fusion la déplace.
- **Le plan** (ordre du 16/11) : lot 4 réduit à la fiche mince, 4 bis (« Les écoles » et la carte), 4 ter (le reste de la fiche), puis 5 à 8 (S'orienter, Espace écoles, Comparer, pré-inscription) : §7 de `docs/produit/2026-11-15-site-public-trois-piliers.md`, dépôt `ntanova`. Aucun lot ne commence sans le feu vert du fondateur.
- **Lot 4, fait le 16/11** (planches « Fiche mince » de la version 44, la fiche du 14/11 reprise) : couverture = la couverture choisie, sinon la photo d'enseigne (en hauteur : entière sur la pierre ; elle dit « Photo prise sur place le … ») ; sans photo, aucun bandeau. Actions sur deux colonnes ; « À savoir » ; « Où trouver » sans petit plan ; « Écoles proches » (vues sur place, < 5 km, un niveau commun) ; « Cette école vous intéresse ? » : « Demander la vérification » appelle `count_family_demand` (clé tirée au hasard dans le navigateur, seule son empreinte part) et « Vous avez son prospectus ? » ; « Vous dirigez cette école ? ». La carte d'école partagée : `CarteEcole.astro` (accueil, « Écoles proches »), vignettes d'enseigne construites dans `/photos/vignettes/`. Deux scripts en ligne sur une fiche non confirmée (Partager, la demande), 2 Ko chacun, contrôlés par `pnpm poids`.
- **Lot 4 bis, fait le 16/11** (planches « Les écoles » de la version 46) : `/ecoles/` a deux vues, Liste (par défaut) et Carte (`?vue=carte`), mêmes recherche, filtres, tri et adresse. La page construite pose les 20 premières cartes et les filtres sans choix ; `app/carte/liste-ecoles.ts` lit `/recherche.json` au premier geste ; `app/carte/liste-carte.ts` charge MapLibre au toucher de « Carte ». Filtres pilotés par les données (`modele/liste-ecoles.ts`) : une option dès une école, avec son compteur ; cochée, elle reste à 0 ; un groupe qui ne trie rien est caché. La carte d'école et les filtres s'écrivent une seule fois en HTML (`modele/carte-ecole.ts`, `modele/filtres-html.ts`), pour la page et le navigateur. `/carte/` renvoie vers `/ecoles/` (301, paramètres compris : `?ecole=` rouvre l'école sur la carte) ; plus de lien « Carte » au pied ; les liens « Voir sur la carte » et ceux des lieux mènent à `/ecoles/?vue=carte&ecole=…` ou `&cadre=…`. Le premier affichage de la carte ne compte pas les images `loading="lazy"` (fondateur, 16/11). Filtre « Places » : pas encore, le catalogue public ne lit pas les annonces.

## Lancer

```bash
nvm use                # Node 24, dans chaque terminal
pnpm install
cp .env.example .env   # valeurs publiques seulement
pnpm dev               # http://localhost:4321 ; catalogue du design : /dev/catalogue/
```

**Serveur local du fondateur** : `pnpm test:parcours:preparer` (construction avec le faux serveur), servie par `pnpm exec wrangler dev --ip 127.0.0.1 --port 8787 --local-protocol https` ; `/admin/?scenario=admin` charge les états des planches. **Jamais `astro build` seul dans ce clone** : il remplace cette construction. Relancer wrangler s'il s'arrête pendant une construction. Pour un téléphone du réseau : `--ip 0.0.0.0`, en https.

## Vérifier

- **`pnpm verif`** : format, lint (frontières), couleurs, types, unitaires, construction (elle exporte le guide du relais : `pnpm exec playwright install chromium`), poids. **Rien n'est fini sans elle.** La CI lance `pnpm verif:ci` (catalogue fictif).
- **`pnpm test:parcours`** : Playwright sur le site construit avec le faux serveur, servi par wrangler (port 4329, ou `PLAYWRIGHT_PORT`). Android 360 px ; quelques specs aussi à 768 et 1 280 px (`playwright.config.ts`). En travaillant : `pnpm test:parcours:preparer` après chaque changement, puis `pnpm test:parcours:exec tests/parcours/<fichier>.spec.ts`. Sous charge, des parcours de carte échouent et passent seuls. « Trois fiches hors ligne, le réseau revient, tout est parti » ne s'affaiblit jamais.
- **`pnpm base:tests`** : pgTAP (`supabase/tests/`) sur la base locale (Docker ; `pnpm base:reset` après une migration).
- **Contrat avec la base** (`tests/unitaires/contrat-schema.test.ts`) : tout ce que `src/infra/supabase/` appelle existe dans les migrations ; une migration qui renomme ou retire change l'adaptateur dans le même commit.
- **CI** (`verif.yml`, chaque PR et `main`) : `verif`, `base`, deux lots de parcours ; verdict **Validation complète**.

## Architecture

```text
src/modele/     TypeScript pur : schémas, listes fermées, règles, ports.ts (les contrats)
src/infra/      seul dossier qui connaît Supabase (supabase/) ; faux serveur (faux/) ; index.ts branche l'adaptateur
src/app/        relais/ (Dexie, file d'envoi), admin/, commun/, carte/ (l'îlot) : React, n'appellent que les ports
src/pages/      Astro : site public (lit le catalogue à la construction), coquilles /relais et /admin
src/ui/         jetons, composants (CSS du site, shadcn, v2), sans appel réseau
supabase/       migrations, règles d'accès, pgTAP · tests/ unitaires et parcours · outils/ contrôles maison
```

- **Frontières gardées par ESLint** (`eslint.config.js`, testé par `frontieres.test.ts`) : changer l'import, jamais la règle. `@supabase/*` seulement dans `src/infra/` ; `app/` et `pages/` reçoivent les adaptateurs par `src/infra/index.ts` ; `modele/` sans React ni `infra` ni `ui` ; relais et admin ne dépendent pas l'un de l'autre (pas de `Relais.tsx` dans l'admin). Ce que le gabarit public montre sur chaque page (les villes du pied) passe par `src/middleware.ts` et `Astro.locals`.
- **Les ports** (`src/modele/ports.ts`) portent le nom de leur future route REST : le jour d'un serveur, seul `src/infra/` change. Le faux serveur implémente chaque geste nouveau, sinon les parcours ne le voient pas.

### L'espace relais : ce qui ne s'affaiblit jamais

- Chaque envoi porte un identifiant créé sur le téléphone : « reçu » ou « déjà reçu » (`23505`, 409 pour une photo) ; `.insert()` sans `.select()`, jamais d'`upsert`. Le contact passe par `send_contact()`.
- Ordre d'une fiche : relevé, contact, photos. La file d'envoi ne se bloque jamais et le dit : une fiche en échec ne retient pas les suivantes ; seul `navigator.onLine` faux l'arrête ; chaque appel a sa limite de temps.
- Photos lues en mémoire avant l'envoi (iPhone), sous 200 Ko, l'enseigne seule obligatoire, jamais d'enfant. Fiches et photos dans IndexedDB, jamais `localStorage` ; versions de la base du téléphone sans trou.
- Chaque fiche porte le `compteId` de son relais et ne part jamais sous un autre nom ; « Se déconnecter » n'efface rien.
- L'application installable se limite à `/relais/` ; son service worker ne liste que ce que `/relais/` charge.

### La base (`supabase/`, carte complète : `supabase/schema.md`)

- Structure en anglais, vocabulaire en français ; seuls les adaptateurs de `src/infra/supabase/` traduisent. `public` et `prive` ne dépendent pas de Supabase (le reste : `20261101200900_supabase_couche.sql`).
- RLS sur chaque table ; `revoke` puis `grant` explicites, objet par objet ; fonctions `security definer` avec `search_path = ''` ; historiques dans `prive` ; vues publiques en `security_barrier`. `droits.test.sql` garde la liste exacte de ce que `anon` lit.
- **Écrire les données d'une école passe par `exiger_gestion_site(site)`**, donc `peut_gerer_site` : aujourd'hui `est_admin()`, demain aussi le compte de la direction du site.
- **Listes fermées** : domaines SQL copiés dans `src/modele/listes.ts` (un test les compare), libellés dans `libelles.ts`. Une liste ne bloque personne (case de sortie, rien de coché d'avance, lecture tolérante) ; on ne retire ni ne renomme une valeur. Ajouter : `alter domain … add constraint … not valid` (`niveau` sert dans un tableau).
- Jamais de position inventée. Photos : chemins relatifs, privées tant que l'administration ne les a pas contrôlées. Données d'exemple fictives ; les vraies écoles entrent par `outils/importer-ecoles.ts` puis l'administration, jamais par git.
- Migrations appliquées depuis le Mac du fondateur (`pnpm exec supabase db push --linked`, après une sauvegarde), **avant** toute construction qui les lit ; jamais par la CI.
- **Deux lignes rouges** : la confiance ne s'achète pas (« Confirmée par la direction » exige un accord daté) ; NTanova n'encaisse jamais les frais de scolarité.

## Secrets

- Dans le navigateur, seulement la clé `publishable` ; variables publiques par `astro:env` (`PUBLIC_…`) ; `.env` jamais commité ; sur GitHub, les valeurs publiques sont des variables (`vars.PUBLIC_…`).
- Le mot de passe de la base et la clé `secret` restent dans le gestionnaire du fondateur : ne jamais les demander, les afficher ni les écrire dans un fichier.

## Système de design

- **Lire `DESIGN_SYSTEM.md`** avant de créer ou de modifier un composant. Le code est la source ; canevas et artefacts en sont des copies.
- **Les règles de design et de produit sont sur la page « Règles » du canevas « NTanova v2 : admin et relais »** (https://claude.ai/artifact/XJ6z1jbqfeA7vogNbpp5aM, depuis le 17/11) : ce qui paraît au public, collecter / accepter / publier, écrire un écran, ce qui reste interne, de la planche au code. Avant de coder un écran, lire cette page ; une règle nouvelle s'y ajoute, datée, et nulle part ailleurs. Pour les composants, `DESIGN_SYSTEM.md` et le code restent la source.
- **Administration et espace relais : Tailwind v4 et shadcn (Radix)** depuis la refonte v2. Composants dans `src/ui/shadcn/` ; pièces communes dans `src/ui/v2/` (`classes.ts` : `v2.bouton`, `v2.champ`, `v2.puce`… ; `admin.tsx` : `Bouton`, `Dialogue`, `ActionsSecondaires` ; `formulaire.tsx` : `Champ`, `Bandeau`). Icônes copiées (`src/ui/shadcn/icones.ts`), jamais lucide-react ni Iconify. Le site public reste en CSS simple ; un fichier est soit en Tailwind, soit en classes du site.
- **Couleurs** : seulement dans `src/ui/jetons.css` (`pnpm couleurs` refuse le reste, même le `rgb()` d'une ombre).
- Texte à 16 px ; Source Serif 4 et Nunito Sans servies par le site ; cibles de 48 px (44 au moins) ; thème clair d'abord ; survol seulement avec une souris. Chaque composant entre dans le catalogue (`src/pages/dev/`).
- **L'administration** : un cadre (`Cadre.tsx`, seuil de 64 rem) ; chaque écran pose son titre par `TitreEcran`, son aide dans `regles`. La fiche d'une école est une page (`#ecoles/fiche/<id>`) dont les rubriques (`FicheEcole.tsx`) s'ouvrent en tiroir ou en page (`Ecoles.tsx`). Aides des parcours : `tests/parcours/aides.ts`.

## Écriture et données

- Tout en français, interface, code et commits. On vouvoie familles, directions et relais ; l'administration tutoie le fondateur.
- Un ton factuel : ni « gratuit », ni audience inventée, aucune phrase qui se fait passer pour un parent. Des nombres, jamais un objectif ni un seuil de mesure.
- Aucune donnée personnelle dans le dépôt. Le numéro WhatsApp vient de `PUBLIC_WHATSAPP`, jamais écrit dans le code (un parcours ne l'attend jamais en dur).
- L'administration ne promet ni nuit ni heure de mise en ligne : « à la prochaine mise à jour du site ».
- Aucun lien public vers un lieu sans fiche publiée (`lieuxAvecEcoles`, 16/11) ; sa page existe, en `noindex` (08/11). Le lien vers `/pour-les-ecoles/` s'appelle « Espace écoles », comme le pilier (l'adresse change au lot 6, l'ancienne renverra en 301).

## Budgets des pages

- **Une page publique pèse moins de 200 Ko et n'a pas de JavaScript**, sauf ces exceptions, contrôlées par `pnpm poids` :
  - `/ecoles/` : script de filtrage de 20 Ko et `/recherche.json` de 300 Ko au plus (compressés) ; la position, demandée au seul bouton « Autour de moi », n'est envoyée à personne ;
  - la vue Carte de `/ecoles/` (lot 4 bis) : script de la page 20 Ko, îlot MapLibre 500 Ko servis, premier affichage 700 Ko sans les images `loading="lazy"` ; `/carte/` n'est plus qu'un renvoi ;
  - « Partager » sur une fiche : un script de 2 Ko au plus, sinon un lien WhatsApp.
- **À venir (fondateur, 15/11)** : calculateur, test d'orientation et Comparer s'affichent d'abord en HTML et CSS dans les 200 Ko ; leur JavaScript ne se charge qu'à la demande (script natif ou îlot `client:visible`), déclaré à `pnpm poids`.

## Budget GitHub Actions (fondateur, 05/11/2026)

Le quota s'est épuisé le 05/11 et a bloqué une mise en production : chaque minute de CI se paie.

- Vérifier en local d'abord ; la CI confirme, elle ne débogue pas. Pousser une seule fois quand c'est prêt (chaque poussée sur une branche avec PR rejoue tout) ; jamais de relance d'une CI identique.
- Documentation pure (`CLAUDE.md`, `docs/`, `README`) : un commit `[skip ci]` sur `main`, sans PR. La fusion d'une PR en un seul commit porte aussi `[skip ci]`.
- Aucun workflow, déclencheur ou matrice de plus sans l'accord du fondateur. Mise en ligne planifiée : le lundi à 1 h UTC, vers essai seulement ; sauvegarde chiffrée de la base chaque nuit.

## Mise en ligne

- Cloudflare Workers : `ntanova.com` et `essai.ntanova.com`, qui lisent la même base. Seulement par GitHub Actions : `gh workflow run mise-en-ligne.yml -f cible=essai` (ou `--ref <branche>`), `-f cible=production` depuis `main`.
- **La production part sur ordre du fondateur** ; la construction du lundi n'y va que si `NUIT_VERS_PRODUCTION` vaut `oui`.

## Façon de travailler

- Une tâche = un ticket du projet GitHub n° 29 : état des lieux, go du fondateur (rien n'est codé avant), PR « Fixes #N », tests d'abord, compte rendu (fait, vérifié, pas vérifié). Un bug corrigé arrive avec un test qui échoue sans le correctif.
- **Un regard critique à chaque étape** : croiser maquette, ticket et code avec le contexte et dire ce qui ne colle pas ; ne jamais recopier une maquette telle quelle.
- **Un test protège une décision, pas un ancien écran** (fondateur, 16/11/2026) : quand une planche de la version 44 contredit un test ou une ancienne route, la planche gagne ; réécrire le test et le dire dans le compte rendu. La charte (cibles de 44 px, logo, poids des pages) reste au-dessus des planches. **Quand la planche renverse une décision datée du registre** (exemple : couverture dessinée et « plus de petit plan », 08/11), lister d'abord les renversements au fondateur et attendre son accord avant de coder (16/11).
- **Git** : jamais de code poussé directement sur `main` ; une branche courte par tâche, une PR, une fusion en un seul commit, la branche supprimée ; un seul clone. Commits en français, préfixe court (`site:`, `relais:`, `admin:`, `base:`, `ui:`, `outils:`, `docs:`).
- **Phase d'essai jusqu'au 30/11/2026** : Claude peut pousser, fusionner une PR, lancer une mise en ligne, en prévenant le fondateur. **À partir du 01/12/2026, redemander avant chaque fusion, chaque mise en ligne et chaque `supabase db push`.**

## Pièges connus

- pnpm refuse une version publiée depuis moins de 24 h : voulu. TypeScript reste en 6.0. `pnpm preview` lance `wrangler dev`.
- **Une table ou une vue créée après le `revoke all` d'une migration garde les droits par défaut** en local et en CI, pas en ligne : retirer ses droits juste avant de donner les siens.
- Ajouter un paramètre à une fonction : supprimer d'abord l'ancienne signature ; changer son type de retour exige `drop function`.
- PostgREST répond 300 à un lien ambigu entre deux tables : nommer la contrainte (`geo_divisions!campuses_division_id_fkey`).
- Dans `src/`, écrire « ticket 114 », jamais « ticket #114 » : `pnpm couleurs` y lit une couleur.
- `no-restricted-imports` ne se cumule pas : chaque bloc de `frontiere()` donne la liste complète de son dossier.
- `react-hooks` refuse un `setState` direct dans un effet : le faire dans les rappels de l'action.
- Un parcours attend l'état final avant d'agir ; le vérifier en ralentissant le faux serveur (`localStorage['ntanova-faux-latence']`). Avant `context.setOffline(true)` : `attendreLaLecture(page)`.
- Astro : un retour à la ligne entre un mot et une expression mange l'espace ; écrire `{' '}`.
- Site public : `public.css` est servi avant `composants.css` ; une surcharge d'une seule classe de `.bouton` y perd, écrire `.bouton.bouton-accent`.
- Carte : enregistrer toutes ses images dès `style.load` (sinon pas d'épingles) ; regarder la carte, pas seulement ses tests.
