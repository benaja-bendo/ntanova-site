# Analyse du 03/11/2026 : la carte actuelle et le fond de carte

Les scripts et les résultats de l'état des lieux de la carte ([document de la carte](https://github.com/benaja-bendo/ntanova/blob/main/docs/produit/2026-11-03-carte-etat-des-lieux-et-recommandation.md), annexe A), rangés ici pour ne pas être perdus et pour **refaire les mesures** avec une autre build de Protomaps ou une autre ville. Ce ne sont pas des outils de production : l'outil qui fabrique le fichier de tuiles est dans le dossier parent ([`../README.md`](../README.md)).

## Les trois scripts Python

Python 3, bibliothèque standard seulement. À lancer avec `python3 -I` (jamais depuis un dossier qui contient des fichiers téléchargés). Ils lisent la build publique de Protomaps (`https://build.protomaps.com/AAAAMMJJ.pmtiles`, 139 Go le 03/11) **par requêtes partielles** (`Range`) : l'en-tête, les répertoires, puis, pour les deux derniers, quelques centaines de tuiles traitées **en mémoire**. **Rien n'est enregistré sur le disque.**

| Script | Ce qu'il fait | Lu sur le serveur (03/11) |
| --- | --- | --- |
| `mesure_pmtiles.py <url>` | Poids de l'extrait brut (tuiles distinctes) du pays (zooms 0 à 10), de Pointe-Noire et de Brazzaville (zooms 11 à 15) ; poids d'une vue (blocs de 3 × 3 tuiles autour d'un point, par zoom) | 1,12 Mo (répertoires seulement, aucune tuile) |
| `couches_tuiles.py <url>` | Décompose huit tuiles réelles par couche (protobuf MVT lu à la main) : ce qui pèse dans une tuile | répertoires + 8 tuiles |
| `echantillon_couches.py <url>` | Estime le poids de l'extrait **allégé** (sans `buildings`, `pois`, ni `landuse` aux petits zooms) par échantillon, et le coût d'une descente niveau par niveau | 8,5 Mo |

*Une particularité de `echantillon_couches.py`* : les estimations du pays (12,2 → 3,5 Mo) et de Pointe-Noire (6,6 → 4,5 Mo) y sont écrites dans le fichier (`a1, b1` et `a2, b2`), reprises des exécutions précédentes du même calcul sur ces fenêtres ; seule Brazzaville est recalculée par cette version. Pour tout refaire, appeler `estimer()` sur les trois fenêtres.

Les fenêtres sont celles du document : Congo `11,1 / −5,1 / 18,7 / 3,8` ; Pointe-Noire `11,80 / −4,95 / 11,99 / −4,65` ; Brazzaville `15,10 / −4,45 / 15,40 / −4,15`.

**Ces estimations sont remplacées par une mesure réelle** dès que l'outil du dossier parent a fabriqué le fichier (ticket [#114](https://github.com/benaja-bendo/ntanova-site/issues/114)).

## La simulation de la carte actuelle (SVG)

- `simulation-carte-actuelle.test.ts.txt` exécute **le vrai code** de `src/modele/carte/` (regroupement des écoles, cadres) sur des écoles fictives (graine fixe) pour mesurer quand la carte dessinée sature ; résultat : `resultats/simulation-carte-actuelle.txt`.
- `poids-geojson.test.ts.txt` mesure le poids de `ecoles.geojson` et de `zones.geojson` sur 1 à 3 000 écoles fictives ; résultat : `resultats/poids-geojson.txt`.

Ce sont des tests Vitest jetables, rangés avec l'extension `.txt` pour qu'aucun contrôle du dépôt ne les prenne pour du code vivant. Pour en relancer un : le copier dans `tests/unitaires/` sous le nom `_….test.ts` (sans `.txt`), lancer `SIM_OUT=/chemin/sortie.txt pnpm exec vitest run tests/unitaires/_….test.ts`, puis le supprimer. Ils dépendent du code tel qu'il était le 03/11 (`b690c16`) : la simulation décrit la carte **actuelle**, qui sera remplacée par l'îlot du ticket [#103](https://github.com/benaja-bendo/ntanova-site/issues/103).
