-- « Hors du lot », avec une tolérance de 50 m (ticket #49) : `supabase test db`.
-- Un arrondissement d'essai ; A relais actif dans un lot fin, B dans un lot sans contour (tout l'arrondissement).
-- Les distances : à cette latitude, 0,00027° de longitude font 30 m et 0,00072° font 80 m.
-- Les mêmes positions servent au test du téléphone (`tests/unitaires/geo.test.ts`) : le téléphone prévient, la base tranche.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Mise en place (rôle postgres) --------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a7', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a7"}'),
  ('00000000-0000-4000-8000-0000000000b7', 'b@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[B]","provider_id":"google-b7"}');

insert into public.arrondissements (nom, slug, ville, contour) values
  ('[Zone d''essai]', 'zone-d-essai', '[Ville]',
   extensions.st_multi(extensions.st_makeenvelope(12.50, -4.90, 12.60, -4.80, 4326)));
insert into public.lots (id, nom, arrondissement_id, contour) values
  ('60000000-0000-4000-8000-000000000001', '[Lot fin]',
   (select id from public.arrondissements where slug = 'zone-d-essai'),
   extensions.st_multi(extensions.st_makeenvelope(12.52, -4.88, 12.54, -4.86, 4326))),
  ('60000000-0000-4000-8000-000000000002', '[Lot entier]',
   (select id from public.arrondissements where slug = 'zone-d-essai'), null);
select public.activer_relais('00000000-0000-4000-8000-0000000000a7', '60000000-0000-4000-8000-000000000001');
select public.activer_relais('00000000-0000-4000-8000-0000000000b7', '60000000-0000-4000-8000-000000000002');

-- A envoie quatre relevés : dans le lot, à 30 m, à 80 m, et sans position -----------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a7', true);
insert into public.releves (id, pris_le, position, nom_enseigne) values
  ('61000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(12.53 -4.87)', '[Dans le lot]'),
  ('61000000-0000-4000-8000-000000000002', now(), 'SRID=4326;POINT(12.54027 -4.87)', '[À 30 m du lot]'),
  ('61000000-0000-4000-8000-000000000003', now(), 'SRID=4326;POINT(12.54072 -4.87)', '[À 80 m du lot]'),
  ('61000000-0000-4000-8000-000000000004', now(), null, '[Sans position]');
reset role;

select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000001'), false,
  'Une école dans le contour du lot n''est pas hors du lot');
select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000002'), false,
  'À 30 m du contour, elle n''est pas hors du lot : un lot fin coupe un quartier, et un GPS se trompe de 10 à 30 m');
select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000003'), true,
  'À 80 m du contour, elle est hors du lot');
select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000004'), null::boolean,
  'Sans position, la base ne dit rien');

-- B, dont le lot n'a pas de contour, est jugé sur celui de l'arrondissement -----------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b7","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b7', true);
insert into public.releves (id, pris_le, position, nom_enseigne) values
  ('61000000-0000-4000-8000-000000000005', now(), 'SRID=4326;POINT(12.55 -4.85)', '[Dans l''arrondissement]'),
  ('61000000-0000-4000-8000-000000000006', now(), 'SRID=4326;POINT(12.60027 -4.85)', '[À 30 m de l''arrondissement]'),
  ('61000000-0000-4000-8000-000000000007', now(), 'SRID=4326;POINT(12.60072 -4.85)', '[À 80 m de l''arrondissement]'),
  ('61000000-0000-4000-8000-000000000008', now(), 'SRID=4326;POINT(13.50 -4.85)', '[Très loin]');
reset role;

select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000005'), false,
  'Un lot sans contour : une école dans l''arrondissement n''est pas hors du lot');
select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000006'), false,
  'Un lot sans contour : à 30 m de l''arrondissement, la tolérance vaut aussi');
select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000007'), true,
  'Un lot sans contour : à 80 m de l''arrondissement, elle est hors du lot');
select is((select hors_lot from public.releves where id = '61000000-0000-4000-8000-000000000008'), true,
  'Très loin de l''arrondissement, elle est hors du lot');

select * from finish();
rollback;
