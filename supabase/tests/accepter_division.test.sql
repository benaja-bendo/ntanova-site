-- Accepter une fiche dont la position n'a aucune division connue : l'administration choisit la division (ticket n° 67,
-- M5), et le lot rendu à sa date. Avant, `accept_submission` retombait sur la division du lot du relais : une position à des
-- milliers de kilomètres était rattachée à Tié-Tié, et sans lot l'erreur disait « rattacher le relevé à un lot ».

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Mise en place : deux arrondissements d'essai sous Pointe-Noire, un relais avec lot, un sans lot, un administrateur -----------

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, boundary, source)
select v.id::uuid, p.id, 3, 'arrondissement', 'CG', v.nom, v.slug,
       extensions.st_multi(extensions.st_makeenvelope(v.ouest, -4.90, v.est, -4.80, 4326)), 'test'
from public.geo_divisions p,
     (values ('7c000000-0000-4000-8000-000000000001', '[Zone A]', 'zone-a', 12.50, 12.60),
             ('7c000000-0000-4000-8000-000000000002', '[Zone B]', 'zone-b', 12.70, 12.80)) as v(id, nom, slug, ouest, est)
where p.path::text = 'congo.pointe_noire.pointe_noire';

select public.register_relay('00000000-0000-4000-8000-0000000000a9', 'google-a9', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b9', 'google-b9', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d9', 'google-d9', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d9');

insert into public.lots (id, nom, geo_division_id, contour) values
  ('60000000-0000-4000-8000-0000000000a9', '[Secteur d''Alice]', '7c000000-0000-4000-8000-000000000001',
   extensions.st_multi(extensions.st_makeenvelope(12.52, -4.88, 12.54, -4.86, 4326)));
select public.activer_relais('00000000-0000-4000-8000-0000000000a9', '60000000-0000-4000-8000-0000000000a9');
select public.activer_relais('00000000-0000-4000-8000-0000000000b9', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a9","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('7d000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(12.58 -4.85)', '[Dans la zone A]'),
  ('7d000000-0000-4000-8000-000000000002', now(), 'SRID=4326;POINT(14.00 -4.85)', '[Hors de tout contour, avec lot]'),
  ('7d000000-0000-4000-8000-000000000004', now(), null, '[Sans position, avec lot]'),
  ('7d000000-0000-4000-8000-000000000006', now(), 'SRID=4326;POINT(12.55 -4.84)', '[Dans la zone A, sans choix]'),
  ('7d000000-0000-4000-8000-000000000007', now(), 'SRID=4326;POINT(14.00 -4.86)', '[Hors de tout contour, pour les erreurs]'),
  ('7d000000-0000-4000-8000-000000000008', now(), 'SRID=4326;POINT(14.01 -4.85)', '[Hors de tout contour, par l''administrateur]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b9","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('7d000000-0000-4000-8000-000000000003', now(), 'SRID=4326;POINT(14.00 -4.87)', '[Hors de tout contour, sans lot]'),
  ('7d000000-0000-4000-8000-000000000005', now(), null, '[Sans position, sans lot]');
reset role;

-- Une seule fonction, avec le nouveau paramètre ---------------------------------------------------------------------------------

select has_function('public', 'accept_submission', array['uuid', 'text', 'uuid', 'uuid', 'text', 'jsonb', 'uuid'],
  'accept_submission reçoit une division facultative');
select hasnt_function('public', 'accept_submission', array['uuid', 'text', 'uuid', 'uuid', 'text', 'jsonb'],
  'et l''ancienne signature n''existe plus : un seul chemin, pas deux fonctions');

-- Sans division choisie : plus de repli sur le lot quand la position existe -----------------------------------------------------

select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000002', 'new_institution')$$, '22023', null,
  'Une position qu''aucun contour ne contient n''est plus rattachée d''office à la division du lot');
select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000003', 'new_institution')$$, '22023', null,
  'Sans lot non plus : l''administration doit choisir la division');
select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000005', 'new_institution')$$, '22023', null,
  'Sans position et sans lot, il n''y a rien d''où déduire la division');

-- Avec la division choisie ------------------------------------------------------------------------------------------------------------------

create temp table choisies as
  select public.accept_submission('7d000000-0000-4000-8000-000000000002', 'new_institution', null, null, null, '[]'::jsonb,
                                  '7c000000-0000-4000-8000-000000000001') as avec_lot,
         public.accept_submission('7d000000-0000-4000-8000-000000000003', 'new_institution', null, null, null, '[]'::jsonb,
                                  '7c000000-0000-4000-8000-000000000002') as sans_lot;
select is((select division_id from public.campuses where id = (select avec_lot from choisies)),
  '7c000000-0000-4000-8000-000000000001'::uuid, 'La division choisie rattache l''école (relais avec lot)');
select is((select division_id from public.campuses where id = (select sans_lot from choisies)),
  '7c000000-0000-4000-8000-000000000002'::uuid, 'Elle la rattache aussi pour un relais sans lot');
select ok((select extensions.st_x(position) between 13.99 and 14.01 from public.campuses where id = (select avec_lot from choisies)),
  'La position du relevé reste la position du relevé : seule la division est choisie');
select is((select status::text || '|' || payable::text from public.field_submissions where id = '7d000000-0000-4000-8000-000000000002'),
  'accepte|true', 'La fiche est acceptée et payable, comme celles des zones ouvertes');

-- Le choix de l'administration l'emporte, même quand un contour existe (un contour simplifié se trompe près d'une limite) ------

create temp table forcee as
  select public.accept_submission('7d000000-0000-4000-8000-000000000001', 'new_institution', null, null, null, '[]'::jsonb,
                                  '7c000000-0000-4000-8000-000000000002') as campus;
select is((select division_id from public.campuses where id = (select campus from forcee)),
  '7c000000-0000-4000-8000-000000000002'::uuid, 'Un choix explicite l''emporte sur la division que dit la position');

-- Sans choix, ce qui marchait marche toujours ----------------------------------------------------------------------------------------

create temp table anciennes as
  select public.accept_submission('7d000000-0000-4000-8000-000000000006', 'new_institution') as dans_un_contour,
         public.accept_submission('7d000000-0000-4000-8000-000000000004', 'new_institution') as sans_position;
select is((select division_id from public.campuses where id = (select dans_un_contour from anciennes)),
  '7c000000-0000-4000-8000-000000000001'::uuid, 'Appel sans la division : la position dans un contour donne sa division');
select is((select division_id from public.campuses where id = (select sans_position from anciennes)),
  '7c000000-0000-4000-8000-000000000001'::uuid, 'Sans position, la division du lot du relais reste le repli');

-- Les divisions qu'on peut choisir -------------------------------------------------------------------------------------------------------

select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000007', 'new_institution', null, null, null, '[]'::jsonb, gen_random_uuid())$$,
  'P0002', null, 'Une division qui n''existe pas est refusée');
select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000007', 'new_institution', null, null, null, '[]'::jsonb,
                   (select id from public.geo_divisions where level = 0 limit 1))$$,
  'P0002', null, 'Un pays est trop large pour une école');
select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000007', 'new_institution', null, null, null, '[]'::jsonb,
                   (select id from public.geo_divisions where path::text = 'congo.pointe_noire'))$$,
  'P0002', null, 'Un département aussi');
select lives_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000007', 'new_institution', null, null, null, '[]'::jsonb,
                   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire'))$$,
  'Une ville est acceptée : une école peut n''avoir que sa commune quand elle n''a pas d''arrondissement dessiné');

-- Les droits de la nouvelle signature --------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d9","role":"authenticated"}', true);
select lives_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000008', 'new_institution', null, null, null, '[]'::jsonb,
                   '7c000000-0000-4000-8000-000000000001')$$,
  'L''administrateur appelle la fonction par l''API, avec la division');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a9","role":"authenticated"}', true);
select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000001', 'new_institution')$$, '42501', null,
  'Un relais ne l''appelle pas');
select throws_ok($$select public.mark_batch_returned('60000000-0000-4000-8000-0000000000a9')$$, '42501', null,
  'Un relais ne marque pas un lot rendu');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d9","role":"authenticated"}', true);
select lives_ok($$select public.mark_batch_returned('60000000-0000-4000-8000-0000000000a9', false)$$,
  'L''administrateur appelle « lot rendu » par l''API (les droits de la nouvelle fonction)');
reset role;
set local role anon;
select throws_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000001', 'new_institution', null, null, null, '[]'::jsonb,
                   '7c000000-0000-4000-8000-000000000001')$$, '42501', null, 'Un visiteur non plus');
reset role;

-- Un lot rendu à sa date ---------------------------------------------------------------------------------------------------------------

select is((select rendu_le from public.lots where id = '60000000-0000-4000-8000-0000000000a9'), null::date, 'Un lot n''est pas rendu d''office');
select lives_ok($$select public.mark_batch_returned('60000000-0000-4000-8000-0000000000a9')$$, 'L''administration marque un lot rendu');
select is((select rendu_le from public.lots where id = '60000000-0000-4000-8000-0000000000a9'),
  (now() at time zone 'Africa/Brazzaville')::date, 'Il est rendu aujourd''hui, à l''heure de Brazzaville');
select lives_ok($$select public.mark_batch_returned('60000000-0000-4000-8000-0000000000a9', false)$$, 'Et elle peut revenir dessus');
select is((select rendu_le from public.lots where id = '60000000-0000-4000-8000-0000000000a9'), null::date, 'Le lot n''est plus rendu');
select throws_ok($$select public.mark_batch_returned(gen_random_uuid())$$, 'P0002', null, 'Un lot inconnu est refusé');

select * from finish();
rollback;
