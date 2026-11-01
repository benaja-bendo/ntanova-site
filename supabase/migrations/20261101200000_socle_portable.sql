-- Le socle portable de la base (itération du 01/11/2026).
--
-- Le but : que le schéma `public` et `prive` s'exporte par un simple `pg_dump` vers un PostgreSQL
-- ordinaire (un conteneur Docker, un serveur à soi), sans rien qui ne vienne de Supabase.
--   * les extensions sont celles de PostgreSQL : postgis, pg_trgm, unaccent, ltree ;
--   * l'identité de la personne qui appelle ne passe plus par `auth.uid()` mais par une fonction
--     à nous, `public.current_user_id()`, qui lit les mêmes réglages que posent PostgREST et Supabase ;
--   * ce qui est propre à Supabase (déclencheur sur `auth.users`, seau de photos) est isolé dans
--     la migration `*_supabase_couche.sql`, jamais dans le cœur.
-- Les vocabulaires nouveaux (listes fermées) sont des domaines SQL, comme les précédents : on n'en
-- retire et on n'en renomme jamais une valeur (voir supabase/schema.md, « Les listes »).

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists ltree with schema extensions;

-- L'identité, sans Supabase ---------------------------------------------------------------------

-- L'identifiant de la personne qui appelle : celui du jeton, que PostgREST (et Supabase) posent dans
-- les réglages de la session. Nul pour un visiteur anonyme ou pour une connexion directe à la base.
create function public.current_user_id() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid
$$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from prive.admins a where a.id = (select public.current_user_id()));
$$;

create or replace function public.est_relais_actif() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.relais r where r.id = (select public.current_user_id()) and r.statut = 'actif'
  );
$$;

create or replace function public.mon_lot() returns uuid
language sql stable security definer set search_path = '' as $$
  select r.lot_id from public.relais r where r.id = (select public.current_user_id());
$$;

-- Dans une fonction de l'administration : refuse tout appel qui ne vient ni d'un administrateur ni du
-- propriétaire de la base (le rôle `postgres` de l'éditeur SQL de Supabase Studio, ou celui d'un
-- conteneur à soi).
create or replace function public.exiger_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (
    public.est_admin()
    or current_user = 'postgres'
    or pg_has_role(current_user, 'pg_database_owner', 'member')
  ) then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
end;
$$;

-- Plus aucun lien vers les tables de Supabase : un compte est un identifiant, rien de plus.
alter table public.relais drop constraint if exists relais_id_fkey;
alter table prive.admins drop constraint if exists admins_id_fkey;
alter table public.releves alter column relais_id set default public.current_user_id();
alter table public.erreurs alter column relais_id set default public.current_user_id();

-- Un relais naît à sa première connexion, en attente. L'inscription elle-même (le déclencheur sur
-- `auth.users`) est dans la couche Supabase ; n'importe quel autre serveur d'identité appelle cette
-- fonction. Elle n'est donnée à aucun rôle de l'API.
create function public.register_relay(p_id uuid, p_google_sub text, p_first_name text) returns void
language sql security definer set search_path = '' as $$
  insert into public.relais (id, google_sub, prenom)
  values (p_id, nullif(p_google_sub, ''), left(coalesce(p_first_name, ''), 60))
  on conflict (id) do nothing;
$$;
revoke all on function public.register_relay(uuid, text, text) from public, anon, authenticated;

-- L'ancienne fonction, et son déclencheur sur `auth.users`, partent : la couche Supabase les refait.
drop function public.creer_relais() cascade;

-- Les outils de texte ---------------------------------------------------------------------------

-- « Écoles Étoile » et « ecoles etoile » doivent se retrouver : minuscules, sans accents. `unaccent`
-- n'est pas « immuable » par défaut ; avec son dictionnaire donné, il l'est en pratique, ce qui permet
-- de l'indexer (recherche floue par trigrammes).
create function public.norm_text(texte text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(texte, '')))
$$;

-- Les vocabulaires nouveaux ---------------------------------------------------------------------

-- Les divisions du monde, du pays au quartier. Le niveau (0 à 4) est lié au genre.
create domain public.geo_kind as text
  check (value in ('country', 'department', 'region', 'city', 'commune', 'district', 'arrondissement', 'quarter', 'zone'));

-- Les séries du baccalauréat. `f` et `g` disent « série F » ou « série G » quand l'enseigne n'en
-- dit pas plus ; `autre` est la case de sortie (le titre libre du programme garde le détail).
create domain public.bac_track as text
  check (value in ('a', 'c', 'd', 'e', 'f', 'f1', 'f2', 'f3', 'f4', 'g', 'g1', 'g2', 'g3', 'h', 'autre'));

-- Les diplômes préparés.
create domain public.diploma_kind as text
  check (value in ('cepe', 'bepc', 'bac', 'bt', 'bts', 'licence', 'master', 'doctorat', 'cap', 'certificat', 'autre'));

-- Le rythme des cours.
create domain public.study_rhythm as text
  check (value in ('jour', 'soir', 'weekend'));

-- Ce que montre une photo : l'enseigne (la seule obligatoire), un panneau ou une affiche des
-- formations, un prospectus remis par l'école, une vue du bâtiment (jamais d'enfant).
create domain public.photo_role as text
  check (value in ('signboard', 'programs_board', 'brochure', 'building'));

-- D'où vient une fiche : relevée par un relais, ajoutée par l'administration, importée en masse.
create domain public.origin_kind as text
  check (value in ('field', 'admin', 'import'));

create domain public.mission_kind as text
  check (value in ('verify', 'locate', 'complete'));
create domain public.mission_status as text
  check (value in ('open', 'done', 'cancelled'));
