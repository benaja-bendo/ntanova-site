#!/usr/bin/env bash
# Sauvegarde chiffrée de la base et des photos (ticket #81).
#
#   outils/sauvegarder-la-base.sh <dossier-de-sortie>
#
# Produit UN fichier, `sauvegarde-AAAA-MM-JJ.tar.gz.age` : le dump des schémas `public` et `prive` (PostgreSQL 17),
# la liste des photos du seau `releves` et les photos elles-mêmes, le tout CHIFFRÉ pour la clé publique `age` donnée.
# Rien n'est jamais écrit en clair hors d'un dossier temporaire, effacé à la sortie : la base contient des contacts de
# directions et des numéros Mobile Money.
#
# Variables (des secrets GitHub en ligne ; jamais écrites dans le dépôt) :
#   SAUVEGARDE_DB_URL        la chaîne de connexion de la base (le « Session pooler » de Supabase : la connexion
#                            directe est en IPv6, les exécuteurs de GitHub n'ont que de l'IPv4)
#   SUPABASE_URL             l'adresse de l'API du projet (https://<projet>.supabase.co)
#   SUPABASE_SECRET_KEY      une clé secrète du projet (sb_secret_…), pour lire les photos ; PAS l'ancienne `service_role`
#   SAUVEGARDE_CLE_PUBLIQUE  la clé publique `age` (age1…) ; la clé privée reste chez le fondateur, hors du dépôt
# Facultatives : PG_DUMP (le pg_dump à utiliser, version 17), TAILLE_MINIMALE (octets, 20000 par défaut).
set -euo pipefail

sortie="${1:?Usage : sauvegarder-la-base.sh <dossier-de-sortie>}"
: "${SAUVEGARDE_DB_URL:?Il manque SAUVEGARDE_DB_URL}"
: "${SUPABASE_URL:?Il manque SUPABASE_URL}"
: "${SUPABASE_SECRET_KEY:?Il manque SUPABASE_SECRET_KEY}"
: "${SAUVEGARDE_CLE_PUBLIQUE:?Il manque SAUVEGARDE_CLE_PUBLIQUE}"
pg_dump_bin="${PG_DUMP:-pg_dump}"
taille_minimale="${TAILLE_MINIMALE:-20000}"

mkdir -p "$sortie"
travail="$(mktemp -d)"
trap 'rm -rf "$travail"' EXIT
mkdir -p "$travail/photos"

# 1. La base : les deux schémas du cœur, comme le dit « Sortir de Supabase » dans supabase/schema.md.
"$pg_dump_bin" "$SAUVEGARDE_DB_URL" --schema=public --schema=prive --no-owner --quote-all-identifiers \
  --format=plain --file="$travail/base.sql"

# Un dump vide ou tronqué n'est pas une sauvegarde : on s'arrête, et la nuit passe en rouge.
taille="$(wc -c <"$travail/base.sql" | tr -d ' ')"
if [ "$taille" -lt "$taille_minimale" ]; then
  echo "Le dump ne fait que $taille octets (au moins $taille_minimale attendus) : la sauvegarde est refusée." >&2
  exit 1
fi
for attendu in '"field_submissions"' '"campuses"' '"admins"'; do
  grep -q "CREATE TABLE .*$attendu" "$travail/base.sql" \
    || { echo "Le dump ne contient pas la table $attendu : la sauvegarde est refusée." >&2; exit 1; }
done

# 2. Les photos : leurs chemins viennent de la base, leur contenu du stockage.
psql "$SAUVEGARDE_DB_URL" -X -At -v ON_ERROR_STOP=1 \
  -c "select name from storage.objects where bucket_id = 'releves' order by name" >"$travail/photos.txt"
entetes=(-H "apikey: $SUPABASE_SECRET_KEY")
# Une ancienne clé (un jeton) se présente aussi en `Authorization` ; une clé « sb_secret_… » ne va que dans `apikey`.
case "$SUPABASE_SECRET_KEY" in eyJ*) entetes+=(-H "Authorization: Bearer $SUPABASE_SECRET_KEY");; esac
nombre=0
while IFS= read -r chemin; do
  [ -n "$chemin" ] || continue
  mkdir -p "$travail/photos/$(dirname "$chemin")"
  curl -fsS --retry 3 --retry-delay 2 "${entetes[@]}" \
    "${SUPABASE_URL%/}/storage/v1/object/releves/$chemin" -o "$travail/photos/$chemin"
  nombre=$((nombre + 1))
done <"$travail/photos.txt"
attendues="$(grep -c . "$travail/photos.txt" || true)"
if [ "$nombre" -ne "$attendues" ]; then
  echo "$nombre photos copiées sur $attendues : la sauvegarde est refusée." >&2
  exit 1
fi

# 3. Une archive, chiffrée. `age` n'écrit le fichier qu'en entier : jamais une demi-sauvegarde en clair.
fichier="$sortie/sauvegarde-$(date -u +%F).tar.gz.age"
tar -C "$travail" -cz base.sql photos.txt photos | age -r "$SAUVEGARDE_CLE_PUBLIQUE" -o "$fichier"
echo "Sauvegarde chiffrée : $fichier ($(wc -c <"$fichier" | tr -d ' ') octets ; base : $taille octets ; $nombre photos)."
