# ntanova-site

Le site de NTanova : l'annuaire public des écoles de la République du Congo (**Congo-Brazzaville, pas la RDC**), l'espace des relais qui relèvent les écoles sur le terrain, et l'administration. Dépôt privé `benaja-bendo/ntanova-site`.

- **Les relais collectent partout au Congo-Brazzaville** (fondateur, 04/11/2026). Collecter, accepter et publier sont trois gestes distincts : rien ne se publie seul. Lots, secteurs et états de la carte n'interdisent jamais une collecte.
- Ce dépôt ne contient que le code. Stratégie, hypothèses et seuils vivent dans le dépôt privé `ntanova` : **n'en recopier aucun ici**.
- Ce fichier ne garde que l'état actuel, l'architecture et les règles actives. **Le détail de chaque livraison, ticket par ticket : `docs/archive/2026-11-15-claude-md-avant-compression/`** (son `INDEX.md` dit où chercher).

## Préparation de la refonte publique (24/11/2026)

Demande du fondateur : une livraison complète du nouveau site public, préparée par lots successifs. Exception temporaire au circuit habituel : `refonte/site-public`, issue du `main` consolidé, reçoit les PR de lots ; elle sera fusionnée dans `main` puis supprimée après recette et ordre de livraison. Une branche courte par lot, **PR vers `refonte/site-public`** ; aucune livraison de production lot par lot. Le dépôt documentaire reste sur `main`.

Contrat technique, lot par lot : `docs/refonte-site-public.md`. **Lots 1 à 6 intégrés à `refonte/site-public`** (PR 212, 214, 216, 218, 220, 222, 224 et 226, `14630a2`). **Lot 7, livraison unique (ticket 227)** : la PR globale vers `main` part de cette branche ; fusion et production sur ordre distinct du fondateur. L'état constaté (sauvegarde, migrations, essai, courrier, réglages des formulaires) est dans `RELEVE-LOT-07.md`, jamais à supposer d'ici. Ce que la refonte change, en bref : en-tête et pied partagés, accueil illustré, recherche `q` + `ou` ; `/orienter/` (cinq sections, six activités, dix domaines) ; `/contact/` et `/contribuer/`, **fermés sauf si `PUBLIC_FORMULAIRES` vaut `ouverts` et que la base a un secret d'envoi** ; « Messages reçus » dans l'administration ; `/methode/`, `/donnees/`, `/a-propos/`, `/villes/` ; `/pour-les-ecoles/` et ses outils, présentés comme en préparation. Plan, procédure et relevé dans le dépôt documentaire : `~/Desktop/NTANOVA/docs/produit/2026-11-24-refonte-site-public/`. Les propositions de la maquette ne remplacent une décision datée qu'après lancement explicite du lot qui les énumère.

## Où on en est (16/11/2026)

- **`main`** : la refonte v2 de l'espace relais et de l'administration (Tailwind et shadcn, PR 175) ; le lot 1 de la base du site public (PR 176 : `billed_months`, `confirmed_on`, `accepted_bac_tracks`, `campus_openings`, `campus_class_sizes`, `family_demands`). **Migrations et code en production : `main` `be8ef31` (lots 1 à 4 bis, contacts de l’école PR 184, ajout d’un site et doublon PR 185, corrections de position PR 188-189, carte de « Les écoles » qui suit la personne PR 190, toute école située sur la carte et migration `20261117140000` PR 192) mis en ligne le 17/11 ; puis `7f88110` (tiroirs de la fiche admin, mot de la direction relu depuis l'école, ajout d'une formation et migration `20261118180000`, PR 193) mis en ligne le 18/11 ; puis `721f7f3` (fiche tenue avec des données extrêmes et visionneuse native des photos, PR 195) mis en ligne le 19/11 ; puis `324a210` (paie : un solde, des versements et des gains ajoutés, migration `20261119120000`, PR 196) mis en ligne le 19/11 ; puis `37993a7` (Astro 7.4.12, « À valider » lisible sur téléphone, PR 197) mis en ligne le 19/11 ; puis `f711036` (sûreté des frais : frais de dossier qui suit le OUI, dates jamais pré-remplies, « à partir de », ordre des lignes, migration `20261120120000`, PR 200) mis en ligne le 20/11 ; puis `f6188eb` (école connue sans position et source de la position, migration `20261120180000`, PR 202) mis en ligne le 20/11 ; puis `114d33e` (plusieurs sites : nom du site, sigle, titre court, copier les formations, migration `20261120210000`, PR 204) mis en ligne le 20/11 ; puis `fac4a0e` (la saisie : agrément cité sans date, accord au fondateur, numéro de l'école, document privé, « En couverture », plusieurs rentrées, diplômes, détail d'une formation importée, migration `20261120230000`, PR 206) mis en ligne le 20/11 ; puis `bcfeabb` (confort : recherche dans toutes les écoles, diplôme et domaine en tête des formations, équipement autre, numéro lisible, PR 208) mis en ligne le 20/11 ; puis `71e1126` (`/llms.txt` et `/.well-known/security.txt` construits avec le site, PR 209 ; l'artefact de `mise-en-ligne.yml` garde les dossiers cachés, `include-hidden-files: true`, PR 210) mis en ligne le 23/11** (mise en ligne sur ordre du fondateur).
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
- **À la main, jamais en CI** (refonte, lot 3C) : `pnpm test:constructions` (quatre constructions du faux catalogue dans un dossier temporaire : `PUBLIC_FORMULAIRES` fermé puis ouvert, un retrait cherché dans chaque fichier produit) ; `pnpm test:api-locale` (l'adaptateur des formulaires contre la pile locale, refusée si elle n'est pas `127.0.0.1` ; elle part d'une base sans secret d'envoi et la laisse ainsi).
- **Contrat avec la base** (`tests/unitaires/contrat-schema.test.ts`) : tout ce que `src/infra/supabase/` appelle existe dans les migrations ; une migration qui renomme ou retire change l'adaptateur dans le même commit.
- **CI** (`verif.yml`, chaque PR et `main`) : `verif`, `base`, deux lots de parcours ; verdict **Validation complète**.

### Tests proportionnés (fondateur, 25/11/2026)

- **Avant d'ajouter un test, chercher la couverture existante.** Nommer le défaut qu'il détecterait en plus ; compléter le test existant quand il protège déjà ce comportement. Ni un fichier par lot, ni un nombre de tests à atteindre.
- **Choisir le niveau le moins coûteux qui reproduit réellement le risque** : règle de calcul en unitaire, droits et contraintes dans la base, interaction dans le navigateur. Plusieurs niveaux se justifient pour des risques distincts : validation à l'écran et refus d'un appel direct, par exemple. Un faux serveur ne prouve pas le fonctionnement de la vraie API ; rejouer les essais locaux concernés si son contrat ou son adaptateur change.
- **Tester le résultat et les contrats publics.** Ne pas exiger un nom de variable, une chaîne dans le code source, une classe CSS ou une structure interne si le comportement rendu suffit. Les contrôles statiques de sécurité, de frontières et de budgets restent légitimes ; ils complètent les essais réels.
- **Entretenir les tests avec le code** : conserver, modifier, regrouper ou supprimer les doublons et les attentes abandonnées. Pour chaque suppression, indiquer la protection conservée et où elle est vérifiée, ou la décision qui l'a rendue obsolète. Git garde l'historique. Ne jamais retirer un test seulement parce qu'il échoue.
- **Éviter les exécutions répétées** : réunir les contrôles complémentaires d'une même page quand cela évite une navigation et ne crée pas de dépendance entre tests. Répéter une largeur seulement si elle change le comportement ou la mise en page ; garder les cas limites qui protègent des risques différents.
- **Un correctif de bug reproduit son défaut avant correction**, dans un test existant ou nouveau. Une retouche de texte ou de style n'impose pas un nouveau parcours si les contrôles existants suffisent. Un test instable se diagnostique : ni attente arbitraire ni assertion affaiblie pour le faire passer.
- **Pendant l'itération, contrôles ciblés ; avant la PR, `pnpm verif:ci` et parcours concernés**, suite complète si le changement touche un socle partagé ou la suite de tests. La CI complète reste requise. Les protections de collecte hors ligne, de droits, de confidentialité, d'accord daté et d'envoi sans doublon restent prioritaires ; téléphone réel et recette visuelle complètent l'automatisation.
- **Compte rendu de PR** : risques protégés, couverture réutilisée, tests ajoutés/modifiés/supprimés et raison, commandes et résultats réellement obtenus. Le nombre de tests ne remplace pas cette explication. Utiliser le modèle de PR du dépôt.

## Architecture

```text
src/modele/     TypeScript pur : schémas, listes fermées, règles, ports.ts (les contrats)
src/infra/      seul dossier qui connaît Supabase (supabase/) ; faux serveur (faux/) ; index.ts branche l'adaptateur
src/app/        relais/ (Dexie, file d'envoi), admin/, commun/, carte/ (l'îlot) : React, n'appellent que les ports
src/pages/      Astro : site public (lit le catalogue à la construction), coquilles /relais et /admin
src/ui/         jetons, composants (CSS du site, shadcn, v2), sans appel réseau
supabase/       migrations, règles d'accès, pgTAP · tests/ unitaires et parcours · outils/ contrôles maison
```

- **Frontières gardées par ESLint** (`eslint.config.js`, testé par `frontieres.test.ts`) : changer l'import, jamais la règle. `@supabase/*` seulement dans `src/infra/` ; `app/` et `pages/` reçoivent les adaptateurs par `src/infra/index.ts` ; `modele/` sans React ni `infra` ni `ui` ; relais et admin ne dépendent pas l'un de l'autre (pas de `Relais.tsx` dans l'admin). Ce que le gabarit public montrerait sur chaque page depuis le catalogue passerait par un `src/middleware.ts` et `Astro.locals` (retirés au lot 4 de la refonte : le pied ne liste plus les villes).
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
- **Les messages reçus** (Contact, annuaire ; refonte, lots 3B1, 3B2 et 3C, pas encore en ligne) : tout dans `prive`, envoyés par `send_public_request(json)` seulement (en POST JSON brut par `fetch`, jamais `.rpc` nommé ; `55000` = envois fermés), lus par l'administration seule (`#demandes`) ; rien d'écrit par une personne dans une erreur, un journal, une liste ou une adresse. Lister n'ouvre rien, ouvrir fige, chaque geste porte `row_version`. Le service d'alerte (`supabase/functions/alerte-messages/`) est préparé, jamais déployé sans ordre. `supabase/schema.md`, « Les messages reçus ».
- Un « introuvable » que l'écran doit lire lève **`PT404`** : PostgREST 14 rend `P0002` en 500, comme une panne.
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
- Aucun lien public vers un lieu sans fiche publiée (`lieuxAvecEcoles`, 16/11) ; sa page existe, en `noindex` (08/11). Le lien vers `/pour-les-ecoles/` s'appelle « Pour les écoles » (refonte, lot 1, 24/11 ; avant : « Espace écoles ») ; la Méthode s'affiche « Fiabilité des informations » ; les adresses ne changent pas. Jamais « toutes les écoles » dans un texte public.
- Une école fictive (la démonstration) n'entre jamais dans le catalogue, la recherche ou le plan du site : elle porte « Exemple » sur la ligne de son nom.

## Budgets des pages

- **Une page publique pèse moins de 200 Ko et n'a pas de JavaScript**, sauf ces exceptions, contrôlées par `pnpm poids` :
  - `/ecoles/` : script de filtrage de 20 Ko et `/recherche.json` de 300 Ko au plus (compressés) ; la position, demandée au seul bouton « Autour de moi », n'est envoyée à personne ;
  - la vue Carte de `/ecoles/` (lot 4 bis) : script de la page 20 Ko, îlot MapLibre 500 Ko servis, premier affichage 700 Ko sans les images `loading="lazy"` ; `/carte/` n'est plus qu'un renvoi ;
  - « Partager » sur une fiche : un script de 2 Ko au plus, sinon un lien WhatsApp.
  - la visionneuse des photos (fiche et page des photos, fondateur, 19/11) : un `<dialog>` natif et un script de 2 Ko au plus ; les grandes images (`grande`, 1 080 px, 90 Ko) n'ont de `src` qu'à l'ouverture. Jamais shadcn ni React sur le site public.
  - `/orienter/` (refonte, lot 2, 24/11) : l'amorce des six activités, chargée avec la page, et le script des réponses, chargé à l'approche ou au premier geste ; **10 Ko gzip au plus pour tout le JavaScript de la page**, imports suivis ; premier affichage sous 200 Ko. Aucune réponse dans l'adresse, un stockage, un cookie ou le réseau.
  - `/contact/` et `/contribuer/` (refonte, lot 3C, 24/11) : un script natif partagé, **10 Ko gzip au plus par page, imports statiques et à la demande compris** (le faux serveur des parcours mis à part) ; premier affichage sous 200 Ko. Le texte écrit ne va que dans `sessionStorage` et le corps de l'envoi : jamais dans une adresse, un journal, un cookie ou `localStorage`.
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

- Une tâche = un ticket du projet GitHub n° 29 : état des lieux, go du fondateur (rien n'est codé avant), PR « Fixes #N », vérification adaptée au risque (voir « Tests proportionnés »), compte rendu (fait, vérifié, pas vérifié). Un bug corrigé arrive avec un test qui échoue sans le correctif ; une couverture existante peut suffire aux autres changements.
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
