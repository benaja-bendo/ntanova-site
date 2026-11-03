-- La couche Supabase : l'inscription d'un relais à sa première connexion Google, et les règles du stockage des photos.
-- Ce test ne tourne QUE sur une base Supabase (ou son simulacre) : le nom en `.supabase.test.sql` l'exclut de la
-- vérification sur PostgreSQL ordinaire (supabase/portabilite/banc.sh).

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- L'inscription d'un relais ------------------------------------------------------------------------------------------------

select ok(exists (select 1 from pg_trigger where tgname = 'creer_relais' and tgrelid = 'auth.users'::regclass),
  'Un déclencheur de la couche Supabase inscrit les nouveaux comptes');
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@exemple.test', 'authenticated', 'authenticated', '{"provider":"google"}', '{"given_name":"Alice","provider_id":"google-a1"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@exemple.test', 'authenticated', 'authenticated', '{"provider":"google"}', '{"full_name":"Bastien Dupont","sub":"google-b1"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'c@exemple.test', 'authenticated', 'authenticated', '{"provider":"email"}', '{"given_name":"Chloé"}'),
  ('00000000-0000-4000-8000-0000000000d1', 'd@exemple.test', 'authenticated', 'authenticated', '{"provider":"google"}', '{"given_name":"Dominique","provider_id":"google-d1"}');
select is((select prenom || '|' || statut || '|' || google_sub from public.relais where id = '00000000-0000-4000-8000-0000000000a1'), 'Alice|en_attente|google-a1',
  'Chaque première connexion crée un relais en attente, avec son prénom et son identifiant Google');
select is((select prenom from public.relais where id = '00000000-0000-4000-8000-0000000000b1'), 'Bastien', 'Le prénom se tire aussi du nom complet');
select is((select google_sub from public.relais where id = '00000000-0000-4000-8000-0000000000b1'), 'google-b1', 'L''identifiant Google se tire de `sub` à défaut de `provider_id`');
select is((select google_sub from public.relais where id = '00000000-0000-4000-8000-0000000000c1'), null::text, 'Une connexion sans Google n''a pas d''identifiant Google');
select is(has_function_privilege('authenticated', 'supabase_layer.register_relay_from_auth()', 'execute'), false,
  'Le déclencheur d''inscription n''est appelable par aucun rôle de l''API');

insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));
insert into public.field_submissions (id, relay_id, taken_at, sign_name) values
  ('51000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', now(), '[Relevé d''Alice]'),
  ('51000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', now(), '[Relevé de Bastien]'),
  ('51000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c1', now(), '[Relevé de Chloé, en attente]');

-- Le seau de photos ------------------------------------------------------------------------------------------------------------------

select is((select public || '|' || file_size_limit || '|' || (select string_agg(m, ',' order by m) from unnest(allowed_mime_types) m)
           from storage.buckets where id = 'releves'), 'false|2097152|image/jpeg,image/webp',
  'Le seau « releves » est privé, limité à 2 Mo, en WebP ou JPEG');

-- Les règles d'envoi : <relevé>/<photo>.webp, pour un relevé déjà reçu et envoyé par ce relais -----------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.register_photo('52000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-0000000000a1', 'signboard', 'image/webp', 120000), 'recu',
  'La base calcule le chemin de la photo');
create temp table chemin as select storage_path from (select storage_path from public.field_submission_photos where false) x;
reset role;
select is((select storage_path from public.field_submission_photos where id = '52000000-0000-4000-8000-0000000000a1'),
  '51000000-0000-4000-8000-0000000000a1/52000000-0000-4000-8000-0000000000a1.webp', 'Le chemin est relatif : relevé / photo . webp');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('releves', '51000000-0000-4000-8000-0000000000a1/52000000-0000-4000-8000-0000000000a1.webp', '00000000-0000-4000-8000-0000000000a1')$$,
  'Le relais dépose le fichier au chemin que la base lui a donné');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('releves', '51000000-0000-4000-8000-0000000000a1/52000000-0000-4000-8000-0000000000a1.webp', '00000000-0000-4000-8000-0000000000a1')$$,
  '23505', null, 'Un second dépôt au même chemin est refusé : « déjà reçu » (pas d''écrasement)');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('releves', '51000000-0000-4000-8000-0000000000b1/52000000-0000-4000-8000-0000000000a2.webp', '00000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'Le relais ne dépose rien pour le relevé d''un autre');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('releves', '51000000-0000-4000-8000-0000000000a1/photo.png', '00000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'Un nom de fichier qui n''est pas « <photo>.webp » ou « .jpg » est refusé');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('releves', '51000000-0000-4000-8000-0000000000a1/enseigne.jpg', '00000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'L''ancien nom « enseigne.jpg » n''est plus accepté');
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('autre', '51000000-0000-4000-8000-0000000000a1/52000000-0000-4000-8000-0000000000a3.webp', '00000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'Un autre seau est refusé par la règle (seul le seau « releves » est ouvert aux relais)');
select is((select count(*)::int from storage.objects), 1, 'Le relais relit le fichier de son propre relevé (ticket #72), et seulement lui');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects), 0, 'Un autre relais ne relit rien : le fichier est dans le dossier du relevé d''Alice');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select throws_ok($$insert into storage.objects (bucket_id, name, owner)
    values ('releves', '51000000-0000-4000-8000-0000000000c1/52000000-0000-4000-8000-0000000000c1.webp', '00000000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'Un relais en attente ne dépose rien');
select is((select count(*)::int from storage.objects), 0, 'Un relais en attente ne relit rien');
reset role;

-- L'administration voit et efface les photos ----------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects), 1, 'L''administrateur voit les fichiers du seau');
select lives_ok($$select public.erase_photo('52000000-0000-4000-8000-0000000000a1', 'À la demande de la direction')$$, 'Il efface l''enregistrement d''une photo');
select is((select storage_path from public.field_submission_photos where id = '52000000-0000-4000-8000-0000000000a1'), null::text,
  'L''enregistrement a disparu : le chemin a été rendu à l''application, qui supprime le fichier');
-- Supabase refuse toute suppression directe dans ses tables (`storage.protect_delete`) tant que ce réglage n'est pas posé,
-- comme le fait l'API du stockage : ce que ce test éprouve est la règle d'accès de l'administration, pas ce garde-fou.
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'releves';
select is((select count(*)::int from storage.objects), 0, 'Et il peut supprimer le fichier du seau');
reset role;
select is((select what from prive.erasures where submission_id = '51000000-0000-4000-8000-0000000000a1'), 'photo', 'L''effacement est tracé (quoi, par qui, quand)');

select * from finish();
rollback;
