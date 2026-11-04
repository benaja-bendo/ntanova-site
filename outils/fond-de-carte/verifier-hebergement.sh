#!/usr/bin/env bash
# Contrôle un fond de carte hébergé (Cloudflare R2 + tuiles.ntanova.com) : requêtes partielles, CORS, archive valide, cache
# (ticket 114). À lancer APRÈS l'envoi du fichier ; chaque ligne dit ce qui va et ce qui ne va pas.
#
#   outils/fond-de-carte/verifier-hebergement.sh https://tuiles.ntanova.com/congo-2026-11-03.pmtiles [origine ...]
#
# Les origines à tester (par défaut : https://ntanova.com et https://essai.ntanova.com). Sur une adresse locale
# (127.0.0.1, localhost) les contrôles de politique (CORS fermé aux inconnus, cache d'un an) sont sautés : le serveur de
# développement est volontairement ouvert.
set -uo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Usage : $0 <adresse du fichier .pmtiles> [origine ...]" >&2
  exit 2
fi
shift
ORIGINES=("$@")
[ "${#ORIGINES[@]}" -gt 0 ] || ORIGINES=(https://ntanova.com https://essai.ntanova.com)
LOCAL=0
[[ "$URL" =~ ^http://(127\.0\.0\.1|localhost)[:/] ]] && LOCAL=1

echecs=0
ok() { printf '  ✓ %s\n' "$1"; }
ko() { printf '  ✗ %s\n' "$1"; echecs=$((echecs + 1)); }
# La valeur d'un en-tête de réponse (insensible à la casse), dans un fichier d'en-têtes.
valeur() { grep -i "^$1:" "$2" | tail -1 | sed -E "s/^[^:]+:[[:space:]]*//" | tr -d '\r'; }
statut() { head -1 "$1" | awk '{print $2}'; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Contrôle de $URL"
echo "1. Requête partielle (les 16 premiers Ko, comme un lecteur de PMTiles)"
curl -sS -D "$tmp/h1" -o "$tmp/corps" -H 'Range: bytes=0-16383' "$URL" || { ko "le fichier ne répond pas"; exit 1; }
case "$(statut "$tmp/h1")" in
  206) ok "HTTP 206 : le serveur sait répondre à une plage" ;;
  200) ko "HTTP 200 au lieu de 206 : le serveur renvoie le fichier entier (il ne sait pas répondre à une plage)" ;;
  404) ko "HTTP 404 : fichier introuvable (le nom du fichier est faux, ou il n'a pas été envoyé)" ;;
  403|401) ko "HTTP $(statut "$tmp/h1") : accès refusé (le domaine n'est pas public ?)" ;;
  *) ko "HTTP $(statut "$tmp/h1") au lieu de 206" ;;
esac
total="$(valeur content-range "$tmp/h1" | sed -E 's#.*/##')"
if [[ "$(valeur content-range "$tmp/h1")" =~ ^bytes\ 0-16383/[0-9]+$ ]]; then ok "Content-Range : $(valeur content-range "$tmp/h1")"; else ko "Content-Range absent ou faux : « $(valeur content-range "$tmp/h1") »"; fi
[ "$(valeur accept-ranges "$tmp/h1")" = "bytes" ] && ok "Accept-Ranges : bytes" || ko "Accept-Ranges : bytes manque"
[ -n "$(valeur etag "$tmp/h1")" ] && ok "ETag présent (le lecteur s'en sert pour détecter un fichier remplacé)" || ko "ETag manque"
if [ "$(head -c 7 "$tmp/corps")" = "PMTiles" ] && [ "$(dd if="$tmp/corps" bs=1 skip=7 count=1 2>/dev/null | od -An -tu1 | tr -d ' ')" = "3" ]; then
  ok "le fichier commence par « PMTiles » et la version 3"
else
  ko "ce n'est pas une archive PMTiles version 3 (mauvaise adresse, ou page d'erreur ?)"
fi

echo "2. CORS : le navigateur d'un visiteur de nos pages peut lire les tuiles"
for origine in "${ORIGINES[@]}"; do
  curl -sS -D "$tmp/h2" -o /dev/null -H 'Range: bytes=0-6' -H "Origin: $origine" "$URL"
  permis="$(valeur access-control-allow-origin "$tmp/h2")"
  if [ "$permis" = "$origine" ] || [ "$permis" = "*" ]; then ok "$origine peut lire (Access-Control-Allow-Origin : $permis)"; else ko "$origine ne peut PAS lire (Access-Control-Allow-Origin : « $permis »)"; fi
done
curl -sS -D "$tmp/h3" -o /dev/null -X OPTIONS -H "Origin: ${ORIGINES[0]}" -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: range,if-match' "$URL"
perm="$(valeur access-control-allow-headers "$tmp/h3" | tr 'A-Z' 'a-z')"
if [[ "$(statut "$tmp/h3")" =~ ^(200|204)$ ]] && [[ "$perm" == *range* ]] && [[ "$perm" == *if-match* ]]; then ok "contrôle préalable (OPTIONS) accepté pour range et if-match"; else ko "contrôle préalable (OPTIONS) refusé : HTTP $(statut "$tmp/h3"), en-têtes permis « $perm »"; fi
expose="$(valeur access-control-expose-headers "$tmp/h2" | tr 'A-Z' 'a-z')"
[[ "$expose" == *etag* ]] && ok "l'ETag est lisible par la page (Access-Control-Expose-Headers)" || ko "l'ETag n'est pas exposé à la page"

if [ "$LOCAL" = "0" ]; then
  echo "3. Politique : fermé aux autres sites, gardé un an"
  curl -sS -D "$tmp/h4" -o /dev/null -H 'Range: bytes=0-6' -H 'Origin: https://exemple.invalid' "$URL"
  autre="$(valeur access-control-allow-origin "$tmp/h4")"
  if [ -z "$autre" ]; then ok "un site inconnu n'obtient aucun accès CORS"; else ko "un site inconnu obtient « $autre » : les règles CORS sont trop larges"; fi
  cache="$(valeur cache-control "$tmp/h1")"
  if [[ "$cache" == *max-age=31536000* ]]; then ok "Cache-Control : $cache"; else ko "Cache-Control « $cache » : le fichier daté doit se garder un an (--cache-control à l'envoi)"; fi
  echo "4. Cache de Cloudflare (information, deux demandes de suite)"
  for i in 1 2; do
    curl -sS -D "$tmp/h5" -o /dev/null -H 'Range: bytes=0-16383' "$URL"
    printf '  . demande %s : cf-cache-status = %s\n' "$i" "$(valeur cf-cache-status "$tmp/h5")"
  done
  echo "  (HIT à la 2e demande : le cache de Cloudflare sert le fichier. DYNAMIC : aucune règle de cache, voir README.md.)"
fi

echo
if [ "$echecs" -eq 0 ]; then echo "Tout va bien."; else echo "$echecs contrôle(s) en échec."; fi
[ -n "${total:-}" ] && echo "Taille du fichier : $total octets."
exit "$([ "$echecs" -eq 0 ] && echo 0 || echo 1)"
