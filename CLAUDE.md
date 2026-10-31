# ntanova-site

Le site de NTanova : l'annuaire public des écoles de Pointe-Noire, quartier par quartier (République du Congo, **Congo-Brazzaville, pas la RDC**), l'espace des relais qui relèvent les écoles sur le terrain, et l'administration. Dépôt privé `benaja-bendo/ntanova-site`.

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
- `pnpm base:tests` : les tests pgTAP des droits et des règles de la base (`supabase/tests/`), sur la base locale (`pnpm base:demarrer`, Docker). La CI les lance aussi.

## Architecture

```text
src/
  modele/      schémas Zod, listes fermées, règles pures, ports.ts (les contrats)
  infra/       seul dossier qui connaît Supabase : supabase/, et index.ts qui branche l'adaptateur
  app/relais/  React : écrans, base locale (Dexie), file d'envoi ; n'appelle que les ports
  app/admin/   React : À valider, Relais ; n'appelle que les ports
  app/commun/  ce que partagent relais et admin : connexion Google, navigation par le dièse
  pages/       Astro : site public (lit le catalogue à la construction), coquilles /relais et /admin
  ui/          jetons (variables CSS) et composants, sans appel réseau
  worker/      le compteur /go/ (Cloudflare Worker)
supabase/      migrations SQL, règles d'accès, tests pgTAP, données fictives
tests/         unitaires (Vitest), parcours (Playwright)
outils/        contrôles maison : couleurs, poids
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
| Catalogue public (à la construction) | Lister les écoles publiées et les quartiers | `GET /public/ecoles`, `GET /public/quartiers` |
| Session | Se connecter avec le jeton Google, se déconnecter, lire l'utilisateur courant, obtenir un jeton frais | `POST /auth/google`, `GET /moi` |
| Relais | Mon profil, mon lot, mes relevés et leurs retours, les écoles qu'on me confie ; envoyer une photo, un relevé, un contact, une erreur | `GET /moi/lot`, `GET /moi/releves`, `GET /moi/ecoles-a-completer`, `PUT /photos/{chemin}`, `POST /releves`, `POST /contacts`, `POST /erreurs` |
| Administration (`PortAdministration`) | Le rôle ; les relevés à valider, leur détail, leur photo, leur contact ; accepter, demander une correction, refuser, confirmer un contact ; les relais et les lots ; activer, suspendre ; les écoles, les corriger sans repasser par le relais, les confier à un relais | `GET /admin/releves`, `GET /admin/releves/{id}`, `POST /admin/releves/{id}/decision`, `GET /admin/relais`, `POST /admin/relais/{id}/activation`, `GET /admin/ecoles`, `PATCH /admin/ecoles/{id}`, `POST /admin/ecoles/{id}/confier` |

- **Chaque envoi porte un identifiant créé sur le téléphone** et répond « reçu » ou « déjà reçu ».
- **Relevés et photos** : `.insert()` sans `.select()`, photo sans écrasement. Un second envoi du même identifiant renvoie une erreur de doublon (code `23505`, ou 409 pour la photo), que l'adaptateur traduit en « déjà reçu ». Jamais d'`upsert`.
- **Contacts** : par la fonction `envoyer_contact()`, qui répond `recu` ou `deja_recu`. La table vit dans le schéma `prive`, que l'API n'expose pas : le relais ne peut pas la relire.
- **L'ordre d'envoi d'une fiche** : le relevé, puis la photo, puis le contact.
- **Session** : le jeton expire au bout d'une heure et ne se renouvelle qu'avec du réseau. Le port fournit un jeton frais à la file d'envoi ; un relais saisit même avec une session expirée et se reconnecte sans rien perdre. Le rôle (relais actif, administrateur) vient de la base, pas de Google.
- **L'application installable se limite à `/relais/`** : son cache ne touche ni le site public ni l'administration.

### Ce qui vit dans la base (`supabase/`)

La carte des tables, des droits et des fonctions : [`supabase/schema.md`](supabase/schema.md).

- Les contraintes, les déclencheurs (doublon possible à moins de 40 m, hors du lot, heure de réception donnée par le serveur) et les vues (écoles publiées, relevés à valider, à payer par relais, dates des échanges). Ce sont les règles qui doivent survivre à un changement de serveur.
- Les règles d'accès (RLS) sur chaque table.
- **Des `grant` explicites** : en ligne, une table créée par `postgres` ne donne rien à `anon` ni à `authenticated` ; en local, Supabase leur donne tout. Chaque migration qui crée une table, une vue ou une fonction retire donc d'abord les droits, puis donne exactement ceux qu'il faut (voir `20261031010200_droits.sql`). Le relais n'a le droit d'écrire que les colonnes remplies par le téléphone.
- **Les listes fermées sont des domaines SQL**, copiés dans `src/modele/listes.ts` : un test vérifie qu'ils restent identiques. **Une liste ne bloque jamais personne** (ticket #12) : toujours une case de sortie (`autre`, `non_indique`), rien d'obligatoire ni coché d'avance si cela fausse la donnée, un texte libre facultatif (`programme`) pour ce que la liste ne sait pas encore, l'administration qui corrige sans repasser par le relais, des lectures tolérantes (`typeConnu`, `niveauxConnus` : une valeur inconnue se lit « Pas indiqué » ou se laisse de côté, jamais d'erreur). **On ne retire et on ne renomme jamais une valeur** (pour changer un mot, on change le libellé).
- **Ajouter une valeur à une liste** : 1) une migration `alter domain … drop constraint`, puis `add constraint … check (value in (…)) not valid` (**`not valid` obligatoire** : `niveaux` est un tableau, que PostgreSQL ne sait pas revalider) ; 2) `src/modele/listes.ts` ; 3) `src/modele/libelles.ts` ; 4) `pnpm verif` ; 5) `pnpm exec supabase db push` **avant** la mise en ligne. Le détail : [`supabase/schema.md`](supabase/schema.md), « Les listes ».
- Les relais sont liés à leur compte Google (l'identifiant `sub`), pas seulement à leur identifiant Supabase.
- Les photos sous des chemins neutres : `releves/<identifiant>/enseigne.jpg`.
- Des données d'exemple **fictives** seulement. Les vraies écoles connues par les entretiens entrent par `outils/importer-ecoles.ts` (voir `supabase/schema.md`, « Les écoles à situer ») : le CSV et le SQL réels ne passent jamais par git.
- **Jamais de position inventée** : une école sans position reste « à situer » jusqu'à la contre-visite d'un relais.
- Les migrations s'appliquent depuis le Mac du fondateur (`pnpm exec supabase db push`), après relecture. Jamais depuis la CI pour l'instant.

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

- **Un SVG calculé à la construction, sans JavaScript ni serveur de cartes** : `src/modele/carte/` (projection, tracés, regroupement des écoles proches, cadrages), `src/ui/Carte.astro` (le dessin). Toucher, c'est changer de page : la ville `/ecoles/`, un arrondissement `/ecoles/<arrondissement>/carte/`, un groupe vu de près `/ecoles/<arrondissement>/carte/coin-N/`, et le petit plan de la fiche.
- **Le style** : les jetons `--carte-…` de `src/ui/jetons.css` (terre, ombre, rues, avenues, maisons, drapeaux, pastilles). **Les repères** du quartier (marché, rond-point…) : `src/modele/carte/reperes.ts`, des lieux publics seulement.
- **Les tracés** (`src/modele/carte/pointe-noire.json`, ignoré par Prettier) : les six arrondissements et les rues de Tié-Tié, tirés d'OpenStreetMap (attribution obligatoire, elle est sous chaque carte). Ngoyo n'a pas encore ses rues. Le contrôle « hors du lot » lit les contours de la base, plus précis.
- **Une cible fait 54 unités du dessin** (400 de large) : 44 px sur un téléphone de 360 px. Deux marques plus proches deviennent une pastille ; ne pas réduire l'une sans l'autre.
- Une école dont l'adresse serait `carte` serait cachée par la page de la carte : le cas ne s'est pas présenté.

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

## Mise en ligne

- Cloudflare Workers, fichiers statiques de `dist/` (`wrangler.jsonc`) : production `ntanova.com` ; `--env essai` pour `essai.ntanova.com`, la seule adresse de prévisualisation déclarée chez Google pour la connexion. Les deux sites lisent et écrivent **la même base** Supabase.
- **`essai.ntanova.com`, c'est la prochaine version ; `ntanova.com`, celle que le public et les relais utilisent.** Une branche peut aller sur essai pour être essayée sur un téléphone avant d'être fusionnée ; la production ne part que de `main`.
- La mise en ligne passe par GitHub Actions (`.github/workflows/mise-en-ligne.yml`), jamais depuis un poste. **Rien ne part sans que tous les tests passent**, dans cet ordre :
  1. les contrôles d'une pull request (`verif.yml`, rappelé tel quel : `pnpm verif`, parcours Playwright, tests pgTAP) ;
  2. une seule construction, envoyée telle quelle sur essai ;
  3. les contrôles en ligne sur essai (`pnpm test:en-ligne`, `tests/en-ligne/`, en lecture seule) ;
  4. la même construction sur `ntanova.com`, puis ses contrôles en ligne.
- La première semaine, pas de bouton : une mise en ligne chaque nuit, et un lancement à la main (`gh workflow run mise-en-ligne.yml -f cible=essai`, ou `--ref <branche>` pour essayer une branche sur essai).
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
- **Phase d'essai (permission du fondateur, 31/10)** : Claude peut pousser sa branche, ouvrir et fusionner la pull request, lancer une mise en ligne, en le prévenant d'un mot juste avant. Il peut retirer cette permission quand l'enjeu montera ; s'il le fait, le fondateur fusionne de nouveau.
- Messages de commit en français, préfixe court (`site:`, `relais:`, `admin:`, `base:`, `ui:`, `outils:`, `ci:`, `docs:`), un sujet par commit.
- Un agent par dossier (`src/pages`, `src/app/relais`, `src/app/admin`, `supabase`) : jamais deux sur les mêmes fichiers.

## Pièges connus

- **Node 24** : faire `nvm use` dans chaque nouveau terminal (Astro 7 exige Node 22.23.4 au moins).
- **`alter domain … add constraint` sans `not valid` échoue pour `niveau`** (« cannot alter type "niveau" because column "ecoles.niveaux" uses it ») : les colonnes `niveaux` sont des tableaux de ce domaine. La CI le voit, puisqu'elle rejoue les migrations.
- **pnpm refuse une version publiée depuis moins de 24 h** (`minimumReleaseAge` dans `pnpm-workspace.yaml`) : c'est voulu.
- **TypeScript reste en 6.0** : `typescript-eslint` et `@astrojs/check` ne prennent pas encore la 7.
- **`astro preview` part en arrière-plan quand un agent le lance** (Astro 7) : `pnpm preview` utilise donc `wrangler dev`, qui sert le site comme Cloudflare.
- **En local, le conteneur des journaux de Supabase (`analytics`) échoue au démarrage** : il est coupé dans `supabase/config.toml`, avec le temps réel et les fonctions edge, inutilisés.
- **Le service worker de `/relais/`** est écrit à la construction (`outils/integration-relais.mjs`, modèle `outils/sw-relais.js`) avec la liste des fichiers à garder ; il n'est pas enregistré sur `localhost` (`pnpm dev`), seulement sur `127.0.0.1` (parcours) et en ligne.
- **Un parcours qui agit juste après un message de succès peut agir avant que l'écran se soit rafraîchi** : la ligne est remise à zéro et le formulaire ouvert se referme (« Publier », puis « Retirer du site »). De même, ne pas couper le réseau avant que ce que l'écran doit garder soit affiché (le lot). Attendre l'état final (« Publiée », le nom du lot) avant d'agir. Pour le vérifier : ralentir le faux serveur (`localStorage['ntanova-faux-latence']`, en millisecondes) et voir l'ancien test échouer.
- **`react-hooks` refuse un `setState` direct dans un effet** : lancer l'action dans l'effet, et changer l'état dans ses rappels (voir `lancer` dans `src/app/relais/App.tsx`).
- Les règles `no-restricted-imports` d'ESLint ne se cumulent pas : pour un fichier, seul le dernier bloc qui le vise compte. Chaque bloc de `frontiere()` donne donc la liste complète de son dossier.
