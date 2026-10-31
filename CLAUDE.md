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
- `pnpm test:parcours` : les parcours Playwright, dans un téléphone Android de 360 px, sur le site construit servi par wrangler comme en production.
  Le site y est construit avec le **faux serveur** (`PUBLIC_ADAPTATEUR=faux`, `src/infra/faux/`) : l'espace relais tourne sans Supabase, hors ligne compris. Le parcours « trois fiches hors ligne, le réseau revient, tout est parti, le contact a disparu du téléphone » ne doit jamais être affaibli.
- `pnpm base:tests` : les tests pgTAP des droits et des règles de la base (`supabase/tests/`), sur la base locale (`pnpm base:demarrer`, Docker). La CI les lance aussi.

## Architecture

```text
src/
  modele/      schémas Zod, listes fermées, règles pures, ports.ts (les contrats)
  infra/       seul dossier qui connaît Supabase : supabase/, et index.ts qui branche l'adaptateur
  app/relais/  React : écrans, base locale (Dexie), file d'envoi ; n'appelle que les ports
  app/admin/   React : écrans ; n'appelle que les ports
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
- L'espace relais et l'administration ne dépendent pas l'un de l'autre.
- Des fonctions simples plutôt que des classes ; aucun outil d'injection de dépendances.

### Les ports, nommés d'après les routes qu'ils deviendront

Le jour où un serveur (Spring Boot) remplacera Supabase, seul `src/infra/` sera réécrit en appels REST.

| Port | Opérations | Route future |
| --- | --- | --- |
| Catalogue public (à la construction) | Lister les écoles publiées et les quartiers | `GET /public/ecoles`, `GET /public/quartiers` |
| Session | Se connecter avec le jeton Google, se déconnecter, lire l'utilisateur courant, obtenir un jeton frais | `POST /auth/google`, `GET /moi` |
| Relais | Mon profil, mon lot, mes relevés et leurs retours ; envoyer une photo, un relevé, un contact, une erreur | `GET /moi/lot`, `GET /moi/releves`, `PUT /photos/{chemin}`, `POST /releves`, `POST /contacts`, `POST /erreurs` |
| Administration | Les relevés à valider ; décider ; activer un relais | `GET /admin/releves`, `POST /admin/releves/{id}/decision`, `POST /admin/relais/{id}/activation` |

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
- **Les listes fermées sont des domaines SQL**, copiés dans `src/modele/listes.ts` : un test vérifie qu'ils restent identiques.
- Les relais sont liés à leur compte Google (l'identifiant `sub`), pas seulement à leur identifiant Supabase.
- Les photos sous des chemins neutres : `releves/<identifiant>/enseigne.jpg`.
- Des données d'exemple **fictives** seulement.
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

## Git

- **Jamais de poussée directe sur `main`** : une branche par tâche, puis une pull request ; le fondateur fusionne. (GitHub ne protège pas `main` sur un dépôt privé gratuit : cette règle n'existe qu'ici.)
- Messages de commit en français, préfixe court (`site:`, `relais:`, `admin:`, `base:`, `ui:`, `outils:`, `ci:`, `docs:`), un sujet par commit.
- Un agent par dossier (`src/pages`, `src/app/relais`, `src/app/admin`, `supabase`) : jamais deux sur les mêmes fichiers.

## Pièges connus

- **Node 24** : faire `nvm use` dans chaque nouveau terminal (Astro 7 exige Node 22.23.4 au moins).
- **pnpm refuse une version publiée depuis moins de 24 h** (`minimumReleaseAge` dans `pnpm-workspace.yaml`) : c'est voulu.
- **TypeScript reste en 6.0** : `typescript-eslint` et `@astrojs/check` ne prennent pas encore la 7.
- **`astro preview` part en arrière-plan quand un agent le lance** (Astro 7) : `pnpm preview` utilise donc `wrangler dev`, qui sert le site comme Cloudflare.
- **En local, le conteneur des journaux de Supabase (`analytics`) échoue au démarrage** : il est coupé dans `supabase/config.toml`, avec le temps réel et les fonctions edge, inutilisés.
- **Le service worker de `/relais/`** est écrit à la construction (`outils/integration-relais.mjs`, modèle `outils/sw-relais.js`) avec la liste des fichiers à garder ; il n'est pas enregistré sur `localhost` (`pnpm dev`), seulement sur `127.0.0.1` (parcours) et en ligne.
- **`react-hooks` refuse un `setState` direct dans un effet** : lancer l'action dans l'effet, et changer l'état dans ses rappels (voir `lancer` dans `src/app/relais/App.tsx`).
- Les règles `no-restricted-imports` d'ESLint ne se cumulent pas : pour un fichier, seul le dernier bloc qui le vise compte. Chaque bloc de `frontiere()` donne donc la liste complète de son dossier.
