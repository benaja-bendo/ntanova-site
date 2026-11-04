# Le fond de carte (ticket #114)

Fabrique, contrôle et héberge le **fichier de tuiles** de la carte interactive : un seul fichier `congo-AAAA-MM-JJ.pmtiles` (une dizaine de Mo) tiré d'OpenStreetMap, que le téléphone lit **par morceaux** depuis Cloudflare R2, sans clé ni facturation au chargement.

Décisions du fondateur (03/11/2026, [document de la carte](https://github.com/benaja-bendo/ntanova/blob/main/docs/produit/2026-11-03-carte-etat-des-lieux-et-recommandation.md), § 2.3 et § 4) : **D4** R2 et le domaine `tuiles.ntanova.com` ; **D5** MapLibre GL JS 6 ; **D6** fond sobre, **sans bâtiments même au zoom 15**, sans commerces, sans occupation du sol aux petits zooms.

## Ce que contient ce dossier

| Fichier | Rôle |
| --- | --- |
| `fabriquer.sh` | Les trois extractions, la fusion, l'allègement, les contrôles : une commande. |
| `alleger.ts` | Retire des tuiles les couches qu'on ne dessine pas et réécrit l'archive ; `--controler` la relit. |
| `servir.ts` | Sert les archives en local, avec les requêtes partielles et CORS (développement, mesures). |
| `glyphes.ts` | Dit quelles plages de glyphes les noms du fichier demandent, et si `public/polices/carte/` les a. `fabriquer.sh` le lance. |
| `cors.json` | Les règles CORS du seau R2. Le test `tests/unitaires/cors-tuiles.test.ts` les garde. |
| `verifier-hebergement.sh` | Contrôle le fichier une fois sur R2 : HTTP 206, CORS, cache. |
| `analyse-2026-11-03/` | Les scripts de mesure et les résultats de l'état des lieux de la carte. |
| `sortie/` | Là où les fichiers fabriqués sont écrits. Ignoré par git (`*.pmtiles` aussi). |

## Fabriquer le fichier

Il faut la commande officielle `pmtiles` (Node 24 est déjà dans le dépôt) :

```bash
brew install pmtiles
```

```bash
outils/fond-de-carte/fabriquer.sh
```

Sans argument, le script prend la build la plus récente de Protomaps ; `fabriquer.sh 20261103` en fixe une. Il télécharge ≈ 40 Mo, travaille une vingtaine de secondes et écrit dans `sortie/` :

- `congo-AAAA-MM-JJ.pmtiles` : **le fichier à héberger** ;
- `brut-AAAA-MM-JJ.pmtiles` : le même avant allègement (37 Mo), à effacer quand on n'en a plus besoin.

Ce que fait le script : trois `pmtiles extract` sur la build du jour (**le pays**, zooms 0 à 10 ; **Pointe-Noire** et **Brazzaville**, zooms 11 à 15), `pmtiles merge`, puis `alleger.ts`, puis les contrôles (`alleger.ts --controler` : toutes les tuiles se lisent, aucune couche retirée n'y est encore ; `pmtiles verify` : la structure de l'archive est valide). Le résultat est **reproductible** : deux exécutions sur la même build donnent le même fichier, octet pour octet.

### Pourquoi on retire des couches du fichier, et non du style

MapLibre télécharge la tuile **entière**, que le style dessine toutes ses couches ou non. Retirer les bâtiments du style ne fait rien gagner ; les retirer du fichier divise par 9 à 17 le poids d'une tuile de centre-ville au zoom 15. `alleger.ts` lit les couches au niveau du protobuf (sans décoder les géométries), recopie telles quelles celles qu'on garde, et réécrit l'archive : tuiles dans l'ordre de leur identifiant, contenus identiques rangés une fois, répertoire racine dans les 16 premiers Ko, métadonnées (`vector_layers`) mises à jour. Les règles sont dans `REGLES_SOBRES` (`alleger.ts`) : **ni `buildings` ni `pois` à aucun zoom, ni `landuse` jusqu'au zoom 10**. Les routes, l'eau, la terre, les limites, les noms de lieux et la couverture naturelle restent. Changer une règle, c'est changer une décision du fondateur : le dire, et mettre le test à jour.

### Ce que ça donne (mesuré le 03/11/2026, build 20261103)

| | Brut | Allégé |
| --- | --- | --- |
| **Le fichier** | 37,0 Mo | **10,2 Mo** |
| Le pays, zooms 0 à 10 | 12,2 Mo | 3,5 Mo |
| Pointe-Noire, zooms 11 à 15 | 6,6 Mo | 1,8 Mo |
| Brazzaville, zooms 11 à 15 | 18,2 Mo | 4,9 Mo |

Ce que coûte une vue à un téléphone (4 tuiles, Ko compressés, mesurés sur les deux fichiers) :

| | Brut | Allégé |
| --- | --- | --- |
| Voir la ville entière (zoom 10) : Pointe-Noire / Brazzaville | 98 / 127 | **18 / 43** |
| Une rue au zoom 15 (une étape) : Pointe-Noire / Brazzaville | 240 / 413 | **27 / 24** |
| Descendre de la ville à la rue, zooms 11 à 15 : Pointe-Noire / Brazzaville | 772 / 1 143 | **421 / 572** |

L'estimation du 03/11 au soir (≈ 12,9 Mo) était un peu haute, surtout pour Pointe-Noire (4,5 Mo estimés, 1,8 mesurés). Il reste ≈ 0,4 à 0,6 Mo à la descente : les routes (54 à 70 % d'une tuile allégée) et l'occupation du sol des zooms 11 à 13, à travailler dans le style ou le schéma si ce poids gêne.

## La police des étiquettes et le style

**Une seule police, Noto Sans Regular** (décision D6), servie par le site : `public/polices/carte/NotoSans-Regular/` (licence SIL OFL : `public/polices/LICENCE-noto-sans.txt`). MapLibre dessine un nom avec des **glyphes servis par plages de 256 codes** et ne télécharge une plage que si un nom y touche. Les fichiers viennent de [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets) (`fonts/Noto Sans Regular/`, commit `028c18f`, 31/10/2025) ; il y a deux plages :

| Plage | Poids | Pourquoi |
| --- | --- | --- |
| `0-255.pbf` | 74,3 Ko | Le latin : tout le français. Chargée dès qu'une étiquette s'affiche. |
| `8192-8447.pbf` | 62,7 Ko | L'apostrophe courbe (U+2019) : 78 noms de rues, au zoom 12 et plus (mesuré le 04/11/2026). Chargée seulement quand l'un d'eux est à l'écran. |

**À chaque nouvelle build**, `fabriquer.sh` lance `glyphes.ts`, qui lit les noms que la carte écrit (`name:fr`, sinon `name`) et **échoue** si une plage dont ils ont besoin n'est pas dans le dossier : copier alors le fichier depuis le dépôt ci-dessus. Sans ce contrôle, l'étiquette perdrait son caractère et la console du visiteur dirait 404.

**Le style** est écrit à la construction par `src/modele/carte/style.ts` : le style de Protomaps (`@protomaps/basemaps`, au build seulement) repeint aux jetons `--fond-de-carte-…` de `src/ui/jetons.css`, réduit aux couches que le fichier contient, sans pictogramme ni sprite, avec un nom de lieu qui vaut `name:fr`, sinon `name` (21 Ko, 2,5 Ko compressés). **Pour le voir** : `node outils/fond-de-carte/servir.ts` dans un terminal, `pnpm dev` dans un autre, puis `/dev/carte/` (des vues pour juger la ville, une rue, le pays, et un endroit sans tuiles). Cette page n'existe pas en production.

## Héberger sur Cloudflare R2 (une action du fondateur)

À faire une fois, depuis la racine du dépôt (`wrangler` est une dépendance du dépôt). Il faut un compte Cloudflare avec R2 activé (Cloudflare demande en général une carte bancaire, même pour l'offre gratuite : à voir dans le tableau de bord ; 10 Go de stockage et 10 millions de lectures par mois sont gratuits, les sorties de données aussi).

Les commandes ci-dessous ont leur syntaxe **lue dans l'aide et dans le code de `wrangler` 4.156.0**, la version du dépôt ; elles n'ont **pas** été lancées sur le compte Cloudflare du fondateur (lui seul y a accès) : ce qu'elles font sur ce compte reste à constater.

**1. Se connecter** (ouvre le navigateur), puis vérifier le compte :

```bash
pnpm exec wrangler login
```

```bash
pnpm exec wrangler whoami
```

**2. Créer le seau** (`weur` : Europe de l'Ouest, le plus proche de Paris ; c'est un indice, pas une garantie) :

```bash
pnpm exec wrangler r2 bucket create ntanova-tuiles --location weur
```

**3. Les règles CORS** (le fichier est dans ce dossier ; il ne laisse lire les tuiles qu'à `ntanova.com`, `essai.ntanova.com` et au développement local) :

```bash
pnpm exec wrangler r2 bucket cors set ntanova-tuiles --file outils/fond-de-carte/cors.json
```

**4. Le domaine public `tuiles.ntanova.com`.** L'identifiant de zone est dans le tableau de bord Cloudflare : `ntanova.com`, page « Vue d'ensemble », colonne de droite (« ID de zone », ou « Zone ID » ; le libellé peut varier).

```bash
pnpm exec wrangler r2 bucket domain add ntanova-tuiles --domain tuiles.ntanova.com --zone-id <ID_DE_ZONE> --min-tls 1.2
```

**5. Envoyer le fichier** (son nom porte la date : il ne change jamais sous un même nom, donc il se garde un an) :

```bash
pnpm exec wrangler r2 object put ntanova-tuiles/congo-2026-11-03.pmtiles --file outils/fond-de-carte/sortie/congo-2026-11-03.pmtiles --content-type application/octet-stream --cache-control "public, max-age=31536000, immutable" --remote
```

**6. Contrôler** (chaque ligne dit ce qui va et ce qui ne va pas) :

```bash
outils/fond-de-carte/verifier-hebergement.sh https://tuiles.ntanova.com/congo-2026-11-03.pmtiles
```

Il vérifie : HTTP 206 sur une requête partielle (c'est **ce que les fichiers statiques du site ne savent pas faire**), `Content-Range`, `ETag`, le fichier commence par `PMTiles` en version 3, chaque origine du site peut lire, le contrôle préalable (`OPTIONS`) passe pour `range` et `if-match`, un site inconnu n'obtient aucun accès, le cache dure un an.

**7. Recommandé : une règle de cache.** Sans elle, chaque lecture va chercher le fichier à R2, en Europe. Tableau de bord Cloudflare › `ntanova.com` › Caching › Cache Rules › créer une règle : *Nom d'hôte* égal à `tuiles.ntanova.com` → *Éligible au cache*, *Edge TTL* : utiliser l'en-tête `Cache-Control`. Le contrôle (étape 6) affiche `cf-cache-status` sur deux demandes de suite : `HIT` à la seconde dit que le cache sert le fichier. **Non essayé** : à constater après la règle.

Si `wrangler` refuse une commande (droits de la connexion, par exemple) : le tableau de bord fait la même chose. R2 › `ntanova-tuiles` › Settings › *CORS Policy* (mêmes origines, méthodes `GET` et `HEAD`, en-têtes autorisés `range` et `if-match`, en-tête exposé `etag`) et *Custom Domains* › *Connect Domain* › `tuiles.ntanova.com`.

Aucune clé n'entre dans le dépôt : `wrangler login` garde sa session sur le Mac du fondateur.

## Servir en local

Les fichiers statiques du site ne répondent pas aux requêtes partielles (HTTP 200 au lieu de 206, mesuré le 03/11) : pour lire le fond de carte avant qu'il soit sur R2, ou pour les scripts de mesure :

```bash
node outils/fond-de-carte/servir.ts
```

Il sert `sortie/` sur `http://127.0.0.1:8077/congo-AAAA-MM-JJ.pmtiles` (uniquement les `.pmtiles` du dossier, uniquement en local, CORS ouvert). `verifier-hebergement.sh http://127.0.0.1:8077/…` le contrôle comme R2.

## Mettre à jour

- **Une nouvelle build** (OpenStreetMap change tous les jours ; un trimestre suffit) : `fabriquer.sh`, envoyer le nouveau fichier (nouveau nom daté), faire pointer le site dessus, **garder l'ancien** le temps de la mise en ligne, l'effacer après (`pnpm exec wrangler r2 object delete ntanova-tuiles/congo-ancien.pmtiles --remote`).
- **Une nouvelle ville** : ajouter sa fenêtre dans `fabriquer.sh` (un `extract` de plus, et le `merge`) **et** dans `FENETRES_DES_VILLES` (`src/modele/carte/fond.ts`) : un test compare les deux. Une ville coûte de l'ordre de 5 à 20 Mo brut, 2 à 5 Mo allégé. Ajouter aussi son point, son contour et son état public dans la base (voir `CLAUDE.md`, « Les données de la carte interactive »).

## Pièges

- **Hors de Pointe-Noire et de Brazzaville, le fichier s'arrête au zoom 10.** À partir du zoom 11 il n'a de tuiles que pour ces deux villes : ailleurs, MapLibre n'afficherait rien. La carte doit donc **limiter le zoom** hors de ces deux villes (`setMaxZoom`), ou surzoomer les tuiles du zoom 10 (ticket #103, étape C).
- **Licence** : OpenStreetMap (ODbL). L'attribution « © les contributeurs d'OpenStreetMap » reste visible en permanence sous la carte et dans les métadonnées du fichier. **Rien de NTanova n'entre dans ce fichier** (ni écoles, ni zones, ni contours de la base) : elles restent dans leurs GeoJSON, ce qui garde la licence propre.
- **La build la plus récente peut manquer** (`builds.json` est mis à jour avec retard) : donner la date à `fabriquer.sh`.
- Le fichier hébergé est public : il ne contient que des données d'OpenStreetMap.
- Ces fichiers ne vont jamais dans git (`*.pmtiles` est ignoré).
