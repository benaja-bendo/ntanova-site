#!/usr/bin/env bash
# Fabrique le fond de carte du Congo : l'extrait de la build du jour de Protomaps, allégé, contrôlé, prêt à héberger
# (ticket 114 ; décisions D4, D5 et D6 du fondateur, 03/11/2026).
#
#   outils/fond-de-carte/fabriquer.sh [AAAAMMJJ]
#
# AAAAMMJJ : la build de Protomaps à prendre. Par défaut la plus récente de https://build-metadata.protomaps.dev/builds.json.
# Résultat, dans outils/fond-de-carte/sortie/ (ignoré par git) :
#   congo-AAAA-MM-JJ.pmtiles   le fichier à héberger (une dizaine de Mo)
#   brut-AAAA-MM-JJ.pmtiles    le même avant allègement (37 Mo) : à effacer quand on n'en a plus besoin
#
# Il faut : la commande officielle `pmtiles` (brew install pmtiles, ou protomaps/go-pmtiles sur GitHub ; la variable PMTILES
# en donne le chemin), Node 24, et une connexion (≈ 40 Mo téléchargés, quelques secondes).
set -euo pipefail

PMTILES="${PMTILES:-pmtiles}"
DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SORTIE="${SORTIE:-$DOSSIER/sortie}"

# Les trois fenêtres (ouest,sud,est,nord). Le pays déborde sur les voisins : c'est voulu, Kinshasa est en face de Brazzaville.
PAYS="11.1,-5.1,18.7,3.8"                # zooms 0 à 10
POINTE_NOIRE="11.80,-4.95,11.99,-4.65"   # les six arrondissements et un peu d'air, zooms 11 à 15
BRAZZAVILLE="15.10,-4.45,15.40,-4.15"    # la commune et ses abords, zooms 11 à 15

if ! command -v "$PMTILES" >/dev/null 2>&1; then
  echo "La commande « pmtiles » manque : brew install pmtiles (ou https://github.com/protomaps/go-pmtiles/releases)." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  echo "Node 24 est nécessaire (nvm use dans le dépôt)." >&2
  exit 1
fi

build="${1:-}"
if [ -z "$build" ]; then
  build="$(curl -fsS https://build-metadata.protomaps.dev/builds.json |
    node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{const l=JSON.parse(t).map(b=>b.key.replace(".pmtiles","")).sort();console.log(l[l.length-1])})')"
fi
if ! [[ "$build" =~ ^[0-9]{8}$ ]]; then
  echo "La build doit s'écrire AAAAMMJJ (par exemple 20261103), pas « $build »." >&2
  exit 1
fi
date_iso="${build:0:4}-${build:4:2}-${build:6:2}"
source_url="https://build.protomaps.com/${build}.pmtiles"
brut="$SORTIE/brut-${date_iso}.pmtiles"
final="$SORTIE/congo-${date_iso}.pmtiles"

mkdir -p "$SORTIE"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "== Build Protomaps du ${date_iso} (${source_url})"
echo "== 1/4  Le pays, zooms 0 à 10"
"$PMTILES" extract -q "$source_url" "$tmp/pays.pmtiles" --bbox="$PAYS" --maxzoom=10
echo "== 2/4  Pointe-Noire, zooms 11 à 15"
"$PMTILES" extract -q "$source_url" "$tmp/pointe-noire.pmtiles" --bbox="$POINTE_NOIRE" --minzoom=11 --maxzoom=15
echo "== 3/4  Brazzaville, zooms 11 à 15"
"$PMTILES" extract -q "$source_url" "$tmp/brazzaville.pmtiles" --bbox="$BRAZZAVILLE" --minzoom=11 --maxzoom=15
echo "== 4/4  Fusion et allègement"
rm -f "$brut" "$final"
"$PMTILES" merge -q "$tmp/pays.pmtiles" "$tmp/pointe-noire.pmtiles" "$tmp/brazzaville.pmtiles" "$brut"
node "$DOSSIER/alleger.ts" "$brut" "$final"

echo
echo "== Contrôles"
node "$DOSSIER/alleger.ts" --controler "$final"
"$PMTILES" verify -q "$final" && echo "✓ pmtiles verify : la structure de l'archive est valide."
"$PMTILES" show "$final" | grep -E 'osmosisreplicationtime|tile contents count|addressed tiles count|max zoom'
echo
echo "== Glyphes (les plages dont les noms ont besoin sont-elles servies ?)"
node "$DOSSIER/glyphes.ts" "$final"

echo
ls -l "$final" | awk '{ printf "Fichier : %s (%.2f Mo)\n", $9, $5 / 1e6 }'
echo "Suite : héberger ce fichier (README.md, « Héberger sur R2 »), ou le servir en local : node outils/fond-de-carte/servir.ts"
