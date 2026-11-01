-- Couche de compatibilité : imite, sur un PostgreSQL ordinaire, ce que la plateforme Supabase
-- fournit déjà (rôles de l'API, utilisateurs, stockage). Elle sert UNIQUEMENT à rejouer l'historique
-- des migrations et les tests de la couche Supabase sur une base locale sans Docker ni Supabase.
--
-- Rien de ce fichier n'entre dans une migration : sur Supabase, ces objets existent déjà.
-- Le schéma de NTanova (`public` et `prive`) ne doit plus dépendre de rien de ce qui est ici :
-- c'est ce que vérifient `supabase/tests/portabilite.test.sql` et `supabase/portabilite/banc.sh restaurer`.

-- Les rôles de l'API (PostgREST, Supabase) : sans connexion, on s'y place avec `set role`.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- Comme sur Supabase, les extensions (PostGIS, pgTAP…) vivent dans le schéma `extensions`, qui est
-- dans le chemin de recherche par défaut : les tests appellent `plan()` sans préfixe.
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end
$$;

-- Les comptes (Supabase Auth, ici réduit aux colonnes que NTanova lit).
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_anonymous boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Comme `auth.uid()` de Supabase : l'identifiant du jeton, lu dans les réglages que pose l'API.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

-- Le stockage de fichiers (Supabase Storage, réduit à ce que NTanova lit).
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  constraint objects_bucketid_name_key unique (bucket_id, name)
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare
  parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[1:array_length(parts, 1) - 1];
end
$$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $$
declare
  parts text[];
begin
  select string_to_array(name, '/') into parts;
  return parts[array_length(parts, 1)];
end
$$;

grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant execute on function storage.foldername(text), storage.filename(text) to anon, authenticated, service_role;
