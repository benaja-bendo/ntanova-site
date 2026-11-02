# ntanova-site

Le site de NTanova : l'annuaire public des écoles de la République du Congo (**Congo-Brazzaville, pas la RDC**), qui démarre à Pointe-Noire, quartier par quartier ; l'espace des relais qui relèvent les écoles sur le terrain ; et l'administration, poste de pilotage du catalogue. La plateforme est faite pour tout le pays et pour d'autres villes ou pays : **l'ouverture d'une zone aux relais est un réglage** (`geo_divisions.open_for_fieldwork`), pas du code. Dépôt privé `benaja-bendo/ntanova-site`.

Ce dépôt ne contient que le code. La stratégie, les hypothèses et les seuils vivent ailleurs, dans un dépôt privé : **n'en recopier aucun ici**, ni dans le code, ni dans les commentaires, ni dans les commits.

## Lancer

```bash
nvm use                # Node 24 (.nvmrc)
pnpm install
cp .env.example .env   # puis compléter les valeurs publiques
pnpm dev               # http://localhost:4321
```

Le catalogue du système de design : http://localhost:4321/dev/catalogue/ (en développement seulement).

## Vérifier

- `pnpm verif` : format, lint (dont les frontières), couleurs, types, tests unitaires, construction, poids des pages. **Rien n'est fini tant qu'elle ne passe pas.** La CI (`.github/workflows/verif.yml`) lance la même commande.
- `pnpm test:parcours` : les parcours Playwright, dans un téléphone Android de 360 px, sur le site construit servi par wrangler comme en production. La spec `mise-en-page` (les tests qui dépendent de la largeur : barre de l'administration, tableaux, défilement de côté…) tourne aussi à 768 px (tablette) et 1 280 px (ordinateur).
  Le site y est construit avec le **faux serveur** (`PUBLIC_ADAPTATEUR=faux`, `src/infra/faux/`) : l'espace relais tourne sans Supabase, hors ligne compris. Le parcours « trois fiches hors ligne, le réseau revient, tout est parti, le contact a disparu du téléphone » ne doit jamais être affaibli.
- `pnpm captures` : une image de chaque écran (site public, relais, administration) à 360, 768, 1 280 et 1 920 px, dans `captures/` (ignoré par git), pour relire une mise en page à l'œil. Elle ne vérifie rien.
- `pnpm base:tests` : les tests pgTAP des droits et des règles de la base (`supabase/tests/`, 425 vérifications), sur la base locale (`pnpm base:demarrer`, Docker). La CI les lance aussi. Sans Docker (session cloud) : `supabase/portabilite/banc.sh verifier` rejoue les migrations sur un PostgreSQL jetable, lance les mêmes tests, puis prouve que la base se restaure sur un PostgreSQL ordinaire.
- **Le contrat avec la base** (`tests/unitaires/contrat-schema.test.ts`) : tout ce que `src/infra/supabase/` appelle (fonctions et paramètres, tables, vues, colonnes, liens) doit exister dans les migrations. Les parcours tournent sur un faux serveur : sans ce test, un nom de colonne faux ne se verrait qu'en production. **Toute migration qui renomme ou retire quelque chose change l'adaptateur dans le même commit.**

## Architecture

```text
src/
  modele/      schémas Zod, listes fermées, règles pures, ports.ts (les contrats)
  infra/       seul dossier qui connaît Supabase : supabase/, et index.ts qui branche l'adaptateur
  app/relais/  React : écrans, base locale (Dexie), file d'envoi ; n'appelle que les ports
  app/admin/   React : À valider, Relais ; n'appelle que les ports
  app/commun/  ce que partagent relais et admin : connexion Google, navigation par le dièse
  pages/       Astro : site public (lit le catalogue à la construction : zones, fiches, formations, cartes, recherche), coquilles /relais et /admin
  ui/          jetons (variables CSS) et composants, sans appel réseau
  worker/      le compteur /go/ (Cloudflare Worker)
supabase/      migrations SQL, règles d'accès, tests pgTAP, données fictives
tests/         unitaires (Vitest), parcours (Playwright)
outils/        contrôles maison (couleurs, poids), import des écoles du Sheet (JSON pour l'administration), rues d'OpenStreetMap
```

Les frontières sont **gardées par ESLint** (`eslint.config.js`), et la règle elle-même par `tests/unitaires/frontieres.test.ts`. Ne jamais l'affaiblir pour faire passer un import : changer l'import.

- `@supabase/*` ne s'importe que dans `src/infra/`.
- `src/app/` et `src/pages/` reçoivent les adaptateurs par `src/infra/index.ts`, jamais par un fichier de `src/infra/supabase/`.
- `src/modele/` reste en TypeScript pur : ni React, ni `infra`, ni `ui`.
- `src/ui/` ne fait aucun appel réseau.
- L'espace relais et l'administration ne dépendent pas l'un de l'autre ; ce qu'ils partagent vit dans `src/app/commun/` (sans appel à `infra` autre que par les ports) ou `src/ui/` (composants React sans réseau, `src/ui/composants.tsx`). La règle d'ESLint reconnaît un dossier `relais` ou `admin` à son nom : un fichier de l'administration ne s'appelle pas `Relais.tsx`.
- Des fonctions simples plutôt que des classes ; aucun outil d'injection de dépendances.

### Les ports, nommés d'après les routes qu'ils deviendront

Le jour où un serveur (Spring Boot) remplacera Supabase, seul `src/infra/` sera réécrit en appels REST.

| Port | Opérations | Route future |
| --- | --- | --- |
| Catalogue public (à la construction) | Lister les divisions (du pays au quartier), les campus publiés avec leurs cycles et leurs formations, les domaines, les renvois des anciennes adresses | `GET /public/divisions`, `GET /public/ecoles`, `GET /public/domaines`, `GET /public/renvois` |
| Session | Se connecter avec le jeton Google, se déconnecter, lire l'utilisateur courant, obtenir un jeton frais | `POST /auth/google`, `GET /moi` |
| Relais | Mon profil, mon lot, mes relevés et leurs retours, les écoles qu'on me confie ; envoyer une photo, un relevé, un contact, une erreur | `GET /moi/lot`, `GET /moi/releves`, `GET /moi/ecoles-a-completer`, `PUT /photos/{chemin}`, `POST /releves`, `POST /contacts`, `POST /erreurs` |
| Administration (`PortAdministration`) | Le rôle ; les relevés à valider, leur détail, **leurs photos côte à côte**, leur contact ; accepter **en un geste (nouvelle école, nouvelle implantation, mise à jour, nouveaux niveaux) avec les formations lues sur les photos**, demander une correction, refuser, confirmer un contact ; **le pont avec la direction** (premier message, accord daté) ; les relais, les lots, **les zones** (ouvrir, ajouter) ; les écoles : les corriger, les confier à un relais (mission), les situer, **en créer ou en importer une liste (simulation d'abord)**, publier, retirer, fusionner ; **la paie du vendredi** | `GET /admin/releves`, `GET /admin/releves/{id}`, `POST /admin/releves/{id}/decision`, `GET /admin/releves/{id}/photos`, `GET /admin/relais`, `POST /admin/relais/{id}/activation`, `GET /admin/zones`, `PUT /admin/zones/{id}/ouverture`, `POST /admin/lots`, `GET /admin/ecoles`, `PATCH /admin/ecoles/{id}`, `POST /admin/ecoles`, `POST /admin/ecoles/import`, `POST /admin/ecoles/{id}/confier`, `PUT /admin/ecoles/{id}/position`, `POST /admin/verifications`, `GET /admin/paie`, `POST /admin/paie/{vendredi}/cloture` |

- **Chaque envoi porte un identifiant créé sur le téléphone** et répond « reçu » ou « déjà reçu ».
- **Relevés et photos** : `.insert()` sans `.select()`, photo sans écrasement. Un second envoi du même identifiant renvoie une erreur de doublon (code `23505`, ou 409 pour la photo), que l'adaptateur traduit en « déjà reçu ». Jamais d'`upsert`.
- **Contacts** : par la fonction `send_contact()`, qui répond `recu` ou `deja_recu`. La table vit dans le schéma `prive`, que l'API n'expose pas : le relais ne peut pas la relire.
- **L'ordre d'envoi d'une fiche** : le relevé, puis ses photos (chacune rejouable), puis le contact.
- **Les photos d'une fiche** : l'enseigne seule est obligatoire ; trois autres au plus (panneau des formations, prospectus, vue du bâtiment, **jamais d'enfant**). Chacune est **allégée dans le téléphone à moins de 200 Ko** (WebP, sinon JPEG ; on baisse la qualité, puis la taille ; une photo qui ne passerait jamais est refusée, jamais gardée trop lourde). **Fiches et photos vivent dans IndexedDB (Dexie), jamais dans `localStorage`** (`tests/unitaires/hors-ligne.test.ts` le garde). Le cache local des écoles connues du lot fait marcher l'alerte « une école est déjà relevée à 40 m » **sans réseau**.
- **Session** : le jeton expire au bout d'une heure et ne se renouvelle qu'avec du réseau. Le port fournit un jeton frais à la file d'envoi ; un relais saisit même avec une session expirée et se reconnecte sans rien perdre. Le rôle (relais actif, administrateur) vient de la base, pas de Google.
- **L'application installable se limite à `/relais/`** : son cache ne touche ni le site public ni l'administration.

### Ce qui vit dans la base (`supabase/`)

La carte des tables, des droits et des fonctions : [`supabase/schema.md`](supabase/schema.md).

- Les contraintes, les déclencheurs (doublon possible à moins de 40 m, hors du lot au-delà de 50 m du contour, heure de réception donnée par le serveur, adresse publique à un seul propriétaire) et les vues (campus publiés, relevés à valider, compteurs par relais, statistiques par zone). Ce sont les règles qui doivent survivre à un changement de serveur.
- **Structure en anglais, vocabulaire en français** : tables, colonnes et fonctions de la base sont en anglais (`geo_divisions`, `campuses`, `accept_submission`) ; les ports (`src/modele/ports.ts`) et l'interface sont en français ; **seuls les adaptateurs de `src/infra/supabase/` traduisent**. `relais`, `lots`, `echanges`, `erreurs` et `prive` gardent leur nom.
- **Portable** : le cœur de la base (`public`, `prive`) ne dépend de rien de Supabase (extensions `postgis`, `pg_trgm`, `unaccent`, `ltree` ; identité par `current_user_id()`). Ce qui est propre à Supabase est dans `20261101200900_supabase_couche.sql`. Le guide pour sortir de Supabase : `supabase/schema.md`, « Sortir de Supabase ».
- Les règles d'accès (RLS) sur chaque table.
- **Des `grant` explicites** : en ligne, une table créée par `postgres` ne donne rien à `anon` ni à `authenticated` ; en local, Supabase leur donne tout. Chaque migration qui crée une table, une vue ou une fonction retire donc d'abord les droits, puis donne exactement ceux qu'il faut (voir `20261031010200_droits.sql`). Le relais n'a le droit d'écrire que les colonnes remplies par le téléphone.
- **Les lots fins** (ticket #49, `supabase/schema.md`, « Les lots fins ») : une division se coupe en lots par une migration de données qui utilise `ST_Split`, rattache les relevés (`prive.attach_submissions_to_fine_lots`) et se vérifie avec `prive.lot_problems`. « Hors du lot » compte à plus de 50 m du contour : la base (le déclencheur d'insertion d'un relevé) et le téléphone (`TOLERANCE_LOT_M`, `src/modele/geo.ts`) changent ensemble. **Un lot se pose sur une zone ouverte aux relais** (`create_lot` refuse une zone fermée, sauf lot d'entraînement). Ne pas confondre la contre-visite de l'application (un type de relevé) et la « contre-visite de lot » (un contrôle fait à la main, hors de l'application).
- **Les listes fermées sont des domaines SQL**, copiés dans `src/modele/listes.ts` : un test vérifie qu'ils restent identiques. **Une liste ne bloque jamais personne** (ticket #12) : toujours une case de sortie (`autre`, `non_indique`), rien d'obligatoire ni coché d'avance si cela fausse la donnée, un texte libre facultatif (`programme`) pour ce que la liste ne sait pas encore, l'administration qui corrige sans repasser par le relais, des lectures tolérantes (`typeConnu`, `niveauxConnus` : une valeur inconnue se lit « Pas indiqué » ou se laisse de côté, jamais d'erreur). **On ne retire et on ne renomme jamais une valeur** (pour changer un mot, on change le libellé).
- **Ajouter une valeur à une liste** : 1) une migration `alter domain … drop constraint`, puis `add constraint … check (value in (…)) not valid` (**`not valid` obligatoire** : `niveaux` est un tableau, que PostgreSQL ne sait pas revalider) ; 2) `src/modele/listes.ts` ; 3) `src/modele/libelles.ts` ; 4) `pnpm verif` ; 5) `pnpm exec supabase db push` **avant** la mise en ligne. Le détail : [`supabase/schema.md`](supabase/schema.md), « Les listes ».
- Les relais sont liés à leur compte Google (l'identifiant `sub`), pas seulement à leur identifiant Supabase.
- **Les photos : des chemins relatifs, jamais une adresse de serveur** (`<relevé>/<photo>.webp` dans le seau `releves`) ; une contrainte de la base refuse tout ce qui ressemble à une adresse. Une photo est **privée** tant que l'administration n'a pas vérifié qu'elle est publiable (sans enfant ni donnée personnelle) : un prospectus peut porter le nom d'un directeur.
- Des données d'exemple **fictives** seulement. Les vraies écoles connues par les entretiens entrent par `node outils/importer-ecoles.ts <export.csv> > import.json`, puis l'administration (onglet « Écoles », « Ajouter ou importer des écoles », « Une liste ») qui vérifie en simulation avant d'écrire : le CSV et le JSON réels ne passent jamais par git.
- **Jamais de position inventée** : une position vient d'un relais sur place, ou de l'administration qui connaît l'école et la prend sur une carte (`locate_campus`, `create_catalog_entry`, décision du fondateur le 31/10 ; la base garde qui et quand : `located_by`, `located_at`). Sinon l'école reste « à situer ». Une fiche qu'aucun relevé n'a décrite dit « Fiche ajoutée par NTanova le … », jamais « relevée par un jeune du quartier ».
- Les migrations s'appliquent depuis le Mac du fondateur (`pnpm exec supabase db push`), après relecture, **avant** la mise en ligne du code. Jamais depuis la CI pour l'instant.
- **Deux lignes rouges du fondateur** : la confiance n'est pas à vendre (le badge « Vérifié par la direction » ne s'achète jamais et ne s'écrit qu'avec un accord daté ; une information factuelle ne se modifie pas contre paiement) ; et NTanova n'encaisse jamais les frais de scolarité (la paie ne concerne que les relais).

## Secrets

- Dans le navigateur, **seulement la clé `publishable`** de Supabase. Aucun composant en ligne n'utilise la clé `secret`.
- Les variables publiques passent par `astro:env` (schéma dans `astro.config.mjs`) et commencent par `PUBLIC_`.
- `.env` n'est jamais commité ; `.env.example` ne contient que des valeurs publiques.
- GitHub : deux secrets seulement, `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`.
- Le mot de passe de la base et la clé `secret` restent dans le gestionnaire du fondateur. Ne jamais les demander, les afficher ni les écrire dans un fichier.

## Système de design

- **Du CSS simple**, sans Tailwind. Les jetons sont dans `src/ui/jetons.css`, **seul fichier où une couleur s'écrit en valeur** (`pnpm couleurs` refuse les autres). Les composants utilisent les jetons de rôle (`--fond`, `--texte`, `--marque`, `--etat-…`), pas les couleurs de base.
- Les classes de composants (`.bouton`, `.champ`, `.etiquette`, `.etat-verifiee`…) sont dans `src/ui/composants.css`, partagées par Astro et React.
- **Texte courant à 16 px.** Échelle : 12, 14, 16, 18, 22, 28 px (`--taille-…`).
- **Polices servies par le site** (`public/polices/`) : Poppins 700, Nunito Sans 400 et 700. Jamais Google Fonts ni un autre service extérieur.
- **Cibles** : 48 px pour les actions principales, 44 px au moins partout, 8 px entre deux cibles.
- Thème clair d'abord : on lit l'écran dehors, en plein soleil.
- Chaque nouveau composant entre dans le catalogue (`src/pages/dev/[page].astro`), dans chacun de ses états : normal, focus, désactivé, erreur, chargement.
- Le code est la source du système de design ; l'artefact de design n'en est qu'une copie.

### La carte détourée (ticket #15)

- **Un SVG calculé à la construction, sans JavaScript ni serveur de cartes** : `src/modele/carte/` (projection, tracés, regroupement des écoles proches, cadrages), `src/ui/Carte.astro` (le dessin). Toucher, c'est changer de page : la ville `/cartes/congo/pointe-noire/`, un arrondissement `/cartes/congo/pointe-noire/<arrondissement>/`, un groupe vu de près `…/coin_N/`, et le petit plan de la fiche. Les cartes ne sont dessinées que pour Pointe-Noire (les seuls contours et rues que le projet ait) ; les autres zones ont une liste.
- **Le style** : les jetons `--carte-…` de `src/ui/jetons.css` (terre, ombre, rues, avenues, maisons, drapeaux, pastilles). **Les repères** du quartier (marché, rond-point…) : `src/modele/carte/reperes.ts`, des lieux publics seulement.
- **Les tracés** (`src/modele/carte/pointe-noire.json`, ignoré par Prettier) : les six arrondissements, et les rues de Tié-Tié et de Ngoyo, tirés d'OpenStreetMap (attribution obligatoire, elle est sous chaque carte). Les quatre autres arrondissements n'ont pas encore leurs rues. Le contrôle « hors du lot » lit les contours de la base, plus précis.
- **Les rues d'un arrondissement** (ticket #46) : `node outils/tracer-les-rues.ts <arrondissement>` (son slug : `loandjili`…) les tire d'Overpass, le serveur d'OpenStreetMap France (le seul qui répond de façon fiable depuis le Mac du fondateur ; sa base a du retard : celle de Ngoyo date du 10/08/2026), les coupe au contour de l'arrondissement et réécrit le fichier des tracés (une ligne, sans retour final). **Les règles sont celles de Tié-Tié** : avenues (`trunk`, `primary`, `secondary`, `tertiary`) toutes gardées, rues (`residential`, `unclassified`, `living_street`) d'au moins 640 m, rien d'autre ; simplifié à 20 m, arrondi à cinq décimales. Il refuse de refaire un arrondissement qui a déjà ses rues (`--remplacer` pour le décider) et relit au besoin une réponse déjà téléchargée (`node outils/tracer-les-rues.ts ngoyo reponse.json`). Un User-Agent générique, jamais d'e-mail. Limite connue : une voie qui traverse l'arrondissement sans un seul point dedans n'est pas dessinée (aucune à Ngoyo). Un arrondissement qui reçoit ses rues change ce que l'aperçu de l'accueil montre et le poids de ses pages : lancer `pnpm poids` et `pnpm captures`.
- **Une cible fait 54 unités du dessin** (400 de large) : 44 px sur un téléphone de 360 px. Deux marques plus proches deviennent une pastille ; ne pas réduire l'une sans l'autre.
- **L'aperçu de l'accueil** (ticket #42) : `src/ui/ApercuCarte.astro` pose deux dessins de `Carte.astro` en mode `apercu` (un par place, un seul s'affiche) dans la fenêtre que calcule `cadreApercu` (`src/modele/carte/plan.ts`) : l'arrondissement qui a le plus d'écoles sur la carte (`arrondissementDeLApercu`), au rapport de la place (350 × 150 jusqu'à 64 rem, 520 × 456 au-delà), chaque maison entière, 900 × 600 m au moins, jamais plus que l'arrondissement. Sans école : le cœur de Tié-Tié sur 2,5 km. **Sans rues dessinées** (les quatre arrondissements dont les rues ne sont pas encore tirées) : l'arrondissement sur toute sa largeur, sinon la fenêtre n'est qu'un aplat. Le dessin est décoratif : un seul lien pour tout le dessin, caché du clavier, des maisons qui n'en sont pas (une pastille ne peut pas mener à `coin-N`, numéroté à l'échelle de l'arrondissement). Dès 64 rem, la légende et le cartouche sont posés sur la carte, dans les bandes que la fenêtre leur laisse libres (`reserveHaut` 48 et `reserveBas` 104 unités, au plus petit agrandissement) : **si le CSS d'`ApercuCarte.astro` change, changer ces deux nombres** ; le parcours « ne cachent aucune école » le vérifie.

## Écriture

- Tout en français : l'interface, les noms dans le code, les commits.
- On **vouvoie** les familles, les directions et les relais ; l'administration tutoie le fondateur.
- Un ton factuel. Pas de « c'est gratuit ». Aucune phrase qui se fait passer pour un parent, aucune audience inventée.
- Les montants et tarifs non fixés restent entre crochets : `[montant]`.

## Données

- **Aucune donnée personnelle dans le dépôt** : pas de nom, pas de téléphone, pas d'adresse réelle. Exemples entre crochets (`[nom de l'école]`, `[N]`), données de test fictives.
- Le numéro WhatsApp vient de `PUBLIC_WHATSAPP`, jamais écrit dans le code.

## Budgets

- Une page publique pèse **moins de 100 Ko** en tout (HTML, CSS, polices, images) et n'a **aucun JavaScript**. `pnpm poids` le vérifie après la construction. Les applications `/relais/` et `/admin/` auront leur propre budget.
- **Deux exceptions contrôlées, `/recherche/` et `/autour-de-moi/`** : un petit script de filtrage (**20 Ko au plus**, compressé) qui filtre `/recherche.json` (**300 Ko au plus**, compressé), construit avec le site. **La position n'est demandée qu'à l'appui du bouton « Trouver les écoles près de moi »** ; elle sert à classer des écoles déjà dans la page et **reste dans le téléphone : elle n'est envoyée à personne** (un parcours le vérifie). Ces pages ont leur `Permissions-Policy` (géolocalisation), les autres non. Chaque formation, série, diplôme, domaine ou rythme a aussi sa **page statique sans JavaScript** (`/formations/…`) : la recherche n'est jamais le seul chemin.

## Mise en ligne

- Cloudflare Workers, fichiers statiques de `dist/` (`wrangler.jsonc`) : production `ntanova.com` ; `--env essai` pour `essai.ntanova.com`, la seule adresse de prévisualisation déclarée chez Google pour la connexion. Les deux sites lisent et écrivent **la même base** Supabase.
- **`essai.ntanova.com`, c'est la prochaine version ; `ntanova.com`, celle que le public et les relais utilisent.** Une branche peut aller sur essai pour être essayée sur un téléphone avant d'être fusionnée ; la production ne part que de `main`.
- La mise en ligne passe par GitHub Actions (`.github/workflows/mise-en-ligne.yml`), jamais depuis un poste. **Rien ne part sans que tous les tests passent**, dans cet ordre :
  1. les contrôles d'une pull request (`verif.yml`, rappelé tel quel : `pnpm verif`, parcours Playwright, tests pgTAP) ;
  2. une seule construction, envoyée telle quelle sur essai ;
  3. les contrôles en ligne sur essai (`pnpm test:en-ligne`, `tests/en-ligne/`, en lecture seule) ;
  4. la même construction sur `ntanova.com`, puis ses contrôles en ligne.
- La première semaine, pas de bouton : une mise en ligne chaque nuit, et un lancement à la main (`gh workflow run mise-en-ligne.yml -f cible=essai`, ou `--ref <branche>` pour essayer une branche sur essai).
- **La nuit n'envoie la production que sur ordre** (décision du fondateur, 02/11/2026, ticket #55) : elle met toujours à jour essai, et n'envoie `ntanova.com` que si la variable GitHub `NUIT_VERS_PRODUCTION` vaut `oui`. Absente, ou autre chose : essai seulement. Un lancement à la main garde son sens (`-f cible=production` envoie la production, sans dépendre de la variable). Un test (`tests/unitaires/mise-en-ligne.test.ts`) évalue la condition dans chaque situation. **Tant que les relais sont en pause, rien ne part chez eux sans un lancement à la main.** **L'administration ne promet donc ni nuit ni heure** pour l'arrivée d'un changement sur `ntanova.com` (« après la prochaine mise à jour du site », vrai dans les deux cas ; ticket #62) : le même test le garde.
- **Chaque bug corrigé arrive avec un test qui échoue sans le correctif** (vérifier qu'il échoue sur l'ancien code). GitHub ne protège pas `main` sur un dépôt privé gratuit : c'est la mise en ligne qui refait tous les contrôles.
- Les valeurs publiques de la construction sont des **variables** GitHub (`vars.PUBLIC_…`), pas des secrets.

## Une tâche = un ticket (protocole du fondateur, 31/10)

Les tâches sont des tickets du projet GitHub n° 29 (« NTanova site · feuille de route »), par priorité. Pour chaque ticket, dans cet ordre :

1. **État des lieux**, en commentaire sur le ticket : ce que le ticket doit produire ; ce qui existe (lu dans le code) ; les problèmes ; les options, avec une recommandation ; l'impact (migrations, écrans, tests, mise en ligne, actions du fondateur) ; ce qui reste hors du ticket ; les décisions attendues.
2. **Le go du fondateur**, tel quel ou modifié. **Rien n'est codé avant.**
3. **Réalisation** : une branche, une PR « Fixes #N », les tests d'abord (un test par bug, vérifié en échec sans le correctif), un essai sur essai.ntanova.com. Un ticket livré en plusieurs PR : les premières disent « Refs #N », seule la dernière dit « Fixes #N » (sinon la première fusionnée ferme le ticket). Essai et production lisent la vraie base : tant qu'aucune école n'y est publiée, ils ne montrent ni liste ni fiche ; pour voir ces écrans, `pnpm captures` (catalogue de test).
4. **Compte rendu** sur le ticket : fait, vérifié, pas vérifié. La fusion : voir « Git ».

**Un regard critique à chaque étape** (consigne du fondateur, 31/10). Il va vite : une consigne peut contenir une erreur de détail, et le travail peut s'éloigner du but sans qu'il le voie. D'abord à l'état des lieux, puis en réalisant, **croiser la maquette, le ticket et le code avec tout le contexte connu** (registre, décisions, autres tickets, état réel de la production) et **dire tout ce qui ne colle pas** : une incohérence dans la maquette, une promesse que le site ne tient pas, une façon de faire qui n'amène pas au résultat attendu. Proposer le correctif ; ne pas recopier une maquette telle quelle.

## Git

- **Jamais de poussée directe sur `main`** : une branche par tâche, puis une pull request. (GitHub ne protège pas `main` sur un dépôt privé gratuit : cette règle n'existe qu'ici.)
- **Phase d'essai (permission du fondateur, 31/10), jusqu'au 30/11/2026** : Claude peut pousser sa branche, ouvrir et fusionner la pull request, lancer une mise en ligne, en le prévenant d'un mot juste avant. Il peut retirer cette permission quand l'enjeu montera ; s'il le fait, le fondateur fusionne de nouveau. **La date de fin est celle de la mesure de D7a** (décision du fondateur du 01/11/2026, au registre) : **à partir du 01/12/2026, redemander avant chaque fusion et chaque mise en ligne** (et avant `supabase db push`), sauf nouvelle permission, décidée avec le fondateur au 30/11.
- Messages de commit en français, préfixe court (`site:`, `relais:`, `admin:`, `base:`, `ui:`, `outils:`, `ci:`, `docs:`), un sujet par commit.
- Un agent par dossier (`src/pages`, `src/app/relais`, `src/app/admin`, `supabase`) : jamais deux sur les mêmes fichiers.

## Pièges connus

- **Node 24** : faire `nvm use` dans chaque nouveau terminal (Astro 7 exige Node 22.23.4 au moins).
- **`alter domain … add constraint` sans `not valid` échoue pour `niveau`** (« cannot alter type "niveau" because column "field_submissions.levels" uses it ») : la colonne `levels` est un tableau de ce domaine. La CI le voit, puisqu'elle rejoue les migrations.
- **pnpm refuse une version publiée depuis moins de 24 h** (`minimumReleaseAge` dans `pnpm-workspace.yaml`) : c'est voulu.
- **TypeScript reste en 6.0** : `typescript-eslint` et `@astrojs/check` ne prennent pas encore la 7.
- **`astro preview` part en arrière-plan quand un agent le lance** (Astro 7) : `pnpm preview` utilise donc `wrangler dev`, qui sert le site comme Cloudflare.
- **En local, le conteneur des journaux de Supabase (`analytics`) échoue au démarrage** : il est coupé dans `supabase/config.toml`, avec le temps réel et les fonctions edge, inutilisés.
- **Le service worker de `/relais/`** est écrit à la construction (`outils/integration-relais.mjs`, modèle `outils/sw-relais.js`) avec la liste des fichiers à garder ; il n'est pas enregistré sur `localhost` (`pnpm dev`), seulement sur `127.0.0.1` (parcours) et en ligne. **Cette liste, et donc la version du service worker, ne couvrent que ce que `/relais/` charge** (`outils/fichiers-du-relais.mjs` : la page nomme son îlot, son renderer et ses styles, puis chaque fichier nomme les siens, `import()` compris), **pas tout `_astro/`** : une mise en ligne qui ne change que l'administration ou le site public ne change pas la version du relais, donc n'affiche pas « Nouvelle version prête » chez les relais (ticket #62). Une construction où la page du relais ne nomme rien, ou nomme un fichier absent, échoue. Garde-fous : `tests/unitaires/service-worker-relais.test.ts` et `tests/parcours/service-worker.spec.ts` (tout ce que le relais charge en parcourant ses écrans doit être dans la liste, sinon il manquerait hors ligne).
- **Un parcours qui agit juste après un message de succès peut agir avant que l'écran se soit rafraîchi** : la ligne est remise à zéro et le formulaire ouvert se referme (« Publier », puis « Retirer du site »). De même, ne pas couper le réseau avant que ce que l'écran doit garder soit affiché (le lot). Attendre l'état final (« Publiée », le nom du lot) avant d'agir. Pour le vérifier : ralentir le faux serveur (`localStorage['ntanova-faux-latence']`, en millisecondes) et voir l'ancien test échouer.
- **`react-hooks` refuse un `setState` direct dans un effet** : lancer l'action dans l'effet, et changer l'état dans ses rappels (voir `lancer` dans `src/app/relais/App.tsx`).
- **Une table ou une vue créée APRÈS le `revoke all` d'une migration garde les droits par défaut de Supabase** (écrire et supprimer compris) en local et dans la CI, pas en ligne : retirer ses droits, objet par objet, juste avant de donner ceux qu'il faut. Le banc (`supabase/portabilite/shim-supabase.sql`) imite ces droits par défaut, et aussi `storage.protect_delete` : un test qui supprime dans `storage.objects` pose d'abord `set local storage.allow_delete_query = 'true'`, comme le fait l'API du stockage. Sans cela, le banc est vert et la tâche `base` de la CI rouge (arrivé le 02/11 : sept vues).
- Les règles `no-restricted-imports` d'ESLint ne se cumulent pas : pour un fichier, seul le dernier bloc qui le vise compte. Chaque bloc de `frontiere()` donne donc la liste complète de son dossier.
