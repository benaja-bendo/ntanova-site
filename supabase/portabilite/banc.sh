#!/usr/bin/env bash
# Banc de vérification de la base, sans Docker ni Supabase : un PostgreSQL 16 + PostGIS jetable.
#
#   supabase/portabilite/banc.sh demarrer     crée (une fois) et démarre le cluster jetable
#   supabase/portabilite/banc.sh rejouer      base `ntanova_supabase` : couche de compatibilité, puis TOUTES les migrations
#   supabase/portabilite/banc.sh tester       tests pgTAP sur cette base
#   supabase/portabilite/banc.sh restaurer    exporte `public` et `prive`, les restaure dans `ntanova_nu` (aucun objet Supabase)
#   supabase/portabilite/banc.sh tester-nu    tests pgTAP « cœur » sur la base restaurée
#   supabase/portabilite/banc.sh migration-donnees   la migration de données réelles : un jeu d'avant, les nouvelles migrations, des contrôles
#   supabase/portabilite/banc.sh verifier     tout, dans l'ordre : le contrôle complet de portabilité
#   supabase/portabilite/banc.sh psql [...]   un psql sur ntanova_supabase (ou NTANOVA_BASE=ntanova_nu)
#   supabase/portabilite/banc.sh arreter
#
# Le jour où le fondateur exporte sa base vers son propre conteneur, c'est `restaurer` qui le prouve :
# un `pg_dump` des schémas `public` et `prive`, rejoué sur PostgreSQL + PostGIS ordinaire.
# En CI ou sur le Mac du fondateur, `pnpm base:tests` (Docker, Supabase CLI) reste la voie normale ;
# ce banc existe pour vérifier sans Docker (session cloud) et pour prouver la portabilité.
set -euo pipefail

DIR="${NTANOVA_PG_DIR:-/var/tmp/ntanova-pg}"
PORT="${NTANOVA_PG_PORT:-54399}"
PGBIN="${NTANOVA_PG_BIN:-/usr/lib/postgresql/16/bin}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_SUPABASE="ntanova_supabase"
BASE_NUE="ntanova_nu"
export PATH="$PGBIN:$PATH"

# PostgreSQL refuse de tourner en root : dans une session cloud, on passe par l'utilisateur `postgres`.
lancer() {
  if [ "$(id -u)" = "0" ]; then runuser -u postgres -- env "PATH=$PATH" "$@"; else "$@"; fi
}
sql() { # sql <base> [options psql] : le SQL arrive par l'entrée standard
  local base="$1"; shift
  lancer psql -h "$DIR" -p "$PORT" -U postgres -d "$base" -X -q -v ON_ERROR_STOP=1 "$@"
}

demarrer() {
  if [ ! -d "$DIR/data" ]; then
    mkdir -p "$DIR"
    if [ "$(id -u)" = "0" ]; then chown postgres:postgres "$DIR"; fi
    lancer initdb -D "$DIR/data" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
  fi
  if ! lancer pg_ctl -D "$DIR/data" status >/dev/null 2>&1; then
    lancer pg_ctl -D "$DIR/data" -l "$DIR/journal.log" -w \
      -o "-p $PORT -k $DIR -c listen_addresses='' -c fsync=off -c synchronous_commit=off -c full_page_writes=off" \
      start >/dev/null
  fi
  echo "PostgreSQL prêt (port $PORT, sockets $DIR)"
}

arreter() { lancer pg_ctl -D "$DIR/data" -m fast stop >/dev/null 2>&1 || true; echo "arrêté"; }

recreer_base() {
  sql postgres -c "drop database if exists $1 with (force)" -c "create database $1"
}

migrations() { ls "$RACINE"/supabase/migrations/*.sql | sort; }

rejouer() {
  demarrer
  recreer_base "$BASE_SUPABASE"
  sql "$BASE_SUPABASE" < "$RACINE/supabase/portabilite/shim-supabase.sql"
  local n=0
  for f in $(migrations); do
    if ! sql "$BASE_SUPABASE" < "$f" >/dev/null 2>"$DIR/erreur.log"; then
      echo "ÉCHEC : $(basename "$f")" >&2; cat "$DIR/erreur.log" >&2; exit 1
    fi
    n=$((n + 1))
  done
  echo "$n migrations rejouées sur $BASE_SUPABASE"
}

tester() { # tester [fichiers…] : par défaut tous les tests
  demarrer
  local base="${NTANOVA_BASE:-$BASE_SUPABASE}"
  local fichiers=("$@")
  [ ${#fichiers[@]} -gt 0 ] || fichiers=("$RACINE"/supabase/tests/*.test.sql)
  lancer pg_prove -h "$DIR" -p "$PORT" -U postgres -d "$base" "${fichiers[@]}"
}

restaurer() {
  demarrer
  recreer_base "$BASE_NUE"
  # Un PostgreSQL ordinaire : PostGIS et les extensions natives, les deux rôles génériques de l'API,
  # et rien d'autre. Aucun schéma `auth` ni `storage`.
  sql "$BASE_NUE" <<'SQL'
create schema extensions;
create extension postgis with schema extensions;
create extension pg_trgm with schema extensions;
create extension unaccent with schema extensions;
create extension ltree with schema extensions;
do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
-- Un export fait depuis Supabase nomme aussi ce rôle dans les droits de ses objets (les droits par défaut de la
-- plateforme) : sans lui, la restauration échouerait sur un PostgreSQL neuf. Les rôles sont ceux de tout le cluster :
-- ici le simulacre l'a déjà créé, mais le guide « Sortir de Supabase » le demande, et ce banc le dit comme lui.
do $$ begin
  create role service_role nologin noinherit;
exception when duplicate_object then null; end $$;
grant usage on schema extensions to anon, authenticated;
SQL
  # Les tests appellent `plan()` sans préfixe : `extensions` dans le chemin de recherche (le code, lui, préfixe tout).
  sql postgres -c "alter database $BASE_NUE set search_path = \"\$user\", public, extensions"
  lancer pg_dump -h "$DIR" -p "$PORT" -U postgres -d "$BASE_SUPABASE" \
    --schema=public --schema=prive --no-owner --format=plain --quote-all-identifiers \
    > "$DIR/export.sql"
  # Le schéma `public` d'une base neuve est vide : l'export le recrée avec tout son contenu.
  sql "$BASE_NUE" -c 'drop schema public cascade'
  sql "$BASE_NUE" < "$DIR/export.sql" >/dev/null
  echo "export de public et prive restauré sur $BASE_NUE ($(wc -l < "$DIR/export.sql") lignes)"
  sql "$BASE_NUE" -tA -c "select 'objets auth/storage dans la base restaurée : ' || count(*) from pg_namespace where nspname in ('auth','storage')"
}

tester_nu() {
  local fichiers=()
  for f in "$RACINE"/supabase/tests/*.test.sql; do
    case "$f" in *.supabase.test.sql) ;; *) fichiers+=("$f") ;; esac
  done
  NTANOVA_BASE="$BASE_NUE" tester "${fichiers[@]}"
}

# La migration des données réelles : un jeu de données dans l'ancien modèle, les nouvelles migrations, puis des contrôles.
migration_donnees() {
  demarrer
  local base="ntanova_migration"
  recreer_base "$base"
  sql "$base" < "$RACINE/supabase/portabilite/shim-supabase.sql"
  # Les migrations d'avant l'itération (jusqu'à la PR n° 53 comprise), puis le jeu de données d'avant.
  for f in $(migrations); do
    case "$(basename "$f")" in 202611012[0-9]*) continue ;; esac
    sql "$base" < "$f" >/dev/null
  done
  sql "$base" < "$RACINE/supabase/portabilite/fixtures/donnees-avant.sql" >/dev/null
  echo "jeu de données d'avant chargé ($(sql "$base" -tA -c 'select count(*) from public.ecoles') écoles, $(sql "$base" -tA -c 'select count(*) from public.releves') relevés)"
  # Les nouvelles migrations, dans l'ordre.
  for f in $(migrations); do
    case "$(basename "$f")" in 202611012[0-9]*) sql "$base" < "$f" >/dev/null ;; esac
  done
  sql "$base" < "$RACINE/supabase/portabilite/fixtures/donnees-apres.sql" 2>&1 | grep -E "^(psql:.*ERROR|ERROR|NOTICE:  (OK|ÉCHEC))" | sed 's/^NOTICE:  //'
}

case "${1:-}" in
  demarrer) demarrer ;;
  arreter) arreter ;;
  rejouer) rejouer ;;
  tester) shift; tester "$@" ;;
  restaurer) restaurer ;;
  tester-nu) tester_nu ;;
  migration-donnees) migration_donnees ;;
  verifier) rejouer && tester && restaurer && tester_nu && migration_donnees ;;
  psql) shift; demarrer >/dev/null; sql "${NTANOVA_BASE:-$BASE_SUPABASE}" "$@" ;;
  *) sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 2 ;;
esac
