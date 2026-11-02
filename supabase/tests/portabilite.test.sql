-- La portabilité : le cœur de la base (`public` et `prive`) ne dépend d'aucun objet Supabase, les images ne
-- gardent que des chemins relatifs, et les extensions sont celles de PostgreSQL.
-- Ce test tourne aussi sur la base restaurée SANS Supabase (supabase/portabilite/banc.sh verifier).

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Les extensions natives -----------------------------------------------------------------------------------

select ok(exists (select 1 from pg_extension where extname = 'postgis'), 'PostGIS est installé');
select ok(exists (select 1 from pg_extension where extname = 'pg_trgm'), 'pg_trgm est installé (recherche floue)');
select ok(exists (select 1 from pg_extension where extname = 'unaccent'), 'unaccent est installé (accents)');
select ok(exists (select 1 from pg_extension where extname = 'ltree'), 'ltree est installé (arbre des divisions)');

-- Aucune dépendance à Supabase dans le cœur --------------------------------------------------------------------

select is((select count(*)::int
           from (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname in ('public', 'prive') and p.prokind in ('f', 'p') offset 0) q
           where pg_get_functiondef(q.oid) ~* '\m(auth|storage)\.'), 0,
  'Aucune fonction de public ou prive ne cite auth. ni storage.');
select is((select count(*)::int
           from (select c.oid from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname in ('public', 'prive') and c.relkind = 'v' offset 0) q
           where pg_get_viewdef(q.oid) ~* '\m(auth|storage)\.'), 0,
  'Aucune vue ne cite auth. ni storage.');
select is((select count(*)::int from pg_policies
           where schemaname in ('public', 'prive') and (coalesce(qual, '') || coalesce(with_check, '')) ~* '\m(auth|storage)\.'), 0,
  'Aucune règle d''accès ne cite auth. ni storage.');
select is((select count(*)::int
           from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'prive') and pg_get_expr(d.adbin, d.adrelid) ~* '\m(auth|storage)\.'), 0,
  'Aucune valeur par défaut ne cite auth. ni storage.');
select is((select count(*)::int from pg_constraint
           where contype = 'f' and connamespace in (select oid from pg_namespace where nspname in ('public', 'prive'))
             and confrelid::regclass::text ~ '^(auth|storage)\.'), 0,
  'Aucune clé étrangère ne pointe vers auth ni storage');

-- L'identité, sans Supabase -------------------------------------------------------------------------------------

select is((select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000aa"}', true) is not null
                  and public.current_user_id() = '00000000-0000-4000-8000-0000000000aa'::uuid), true,
  'current_user_id() lit le jeton comme PostgREST le pose (request.jwt.claims)');
select is((select set_config('request.jwt.claims', '', true) is not null
                  and set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000bb', true) is not null
                  and public.current_user_id() = '00000000-0000-4000-8000-0000000000bb'::uuid), true,
  'current_user_id() lit aussi l''ancien réglage request.jwt.claim.sub');
select is((select set_config('request.jwt.claim.sub', '', true) is not null and public.current_user_id() is null), true,
  'Sans jeton, personne : un visiteur anonyme n''a pas d''identité');

select is(has_function_privilege('anon', 'public.register_relay(uuid, text, text)', 'execute'), false,
  'L''inscription d''un relais n''est pas appelable par l''API (visiteur)');
select is(has_function_privilege('authenticated', 'public.register_relay(uuid, text, text)', 'execute'), false,
  'L''inscription d''un relais n''est pas appelable par l''API (connecté)');

-- Les images : des chemins relatifs, jamais d'adresse de serveur --------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
insert into public.field_submissions (id, relay_id, taken_at, sign_name)
values ('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now(), '[École d''essai]');

select lives_ok($$insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
  values ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'signboard',
          '51000000-0000-4000-8000-000000000001/52000000-0000-4000-8000-000000000001.webp', 'image/webp', 150000)$$,
  'Un chemin relatif est accepté');
select throws_ok($$insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
  values ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 'building',
          'https://abc.supabase.co/storage/v1/object/releves/x.webp', 'image/webp', 1000)$$,
  '23514', null, 'Une adresse complète (https://…supabase.co) est refusée par la base');
select throws_ok($$insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
  values ('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', 'building',
          '../autre/x.webp', 'image/webp', 1000)$$,
  '23514', null, 'Un chemin qui remonte (..) est refusé');
select throws_ok($$insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
  values ('52000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', 'building',
          '/absolu/x.webp', 'image/webp', 1000)$$,
  '23514', null, 'Un chemin absolu est refusé');

select * from finish();
rollback;
