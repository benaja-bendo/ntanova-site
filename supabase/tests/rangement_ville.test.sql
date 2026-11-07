-- Une école se range dans sa ville quand aucun arrondissement ne la contient (audit de l'administration, 07/11/2026).
-- Avant, `division_of_position` ne cherchait qu'au niveau 3 : une commune sans arrondissement (Ouesso) ne rangeait jamais une
-- école, et chaque fiche demandait « Division de l'école ». Maintenant : la division la plus fine, l'arrondissement d'abord,
-- à défaut la ville, la commune ou le district. Un département ou un pays ne range jamais.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Mise en place : Ouesso (commune, sans arrondissement) a un contour ; un arrondissement d'essai, plus petit, est dedans -------

update public.geo_divisions set
  boundary = extensions.st_multi(extensions.st_makeenvelope(16.00, 1.55, 16.10, 1.65, 4326)),
  source = 'test'
where path::text = 'congo.sangha.ouesso';

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, boundary, source)
select '7c000000-0000-4000-8000-000000000001'::uuid, p.id, 3, 'arrondissement', 'CG', '[Arrondissement d''essai]', 'arrondissement-essai',
       extensions.st_multi(extensions.st_makeenvelope(16.04, 1.60, 16.06, 1.62, 4326)), 'test'
from public.geo_divisions p
where p.path::text = 'congo.sangha.ouesso';

-- La fonction ------------------------------------------------------------------------------------------------------------------------

select is(public.division_of_position(1.61, 16.05, 3::smallint), '7c000000-0000-4000-8000-000000000001'::uuid,
  'Une position dans un arrondissement va à l''arrondissement : la division la plus fine l''emporte');
select is((select slug from public.geo_divisions where id = public.division_of_position(1.58, 16.02, 3::smallint)), 'ouesso',
  'Une position dans la commune mais hors de l''arrondissement va à la commune (avant : aucune division)');
select is(public.division_of_position(1.58, 16.02), public.division_of_position(1.58, 16.02, 3::smallint),
  'Sans deuxième paramètre, c''est le niveau 3 préféré, comme avant');
select is(public.division_of_position(1.58, 16.02, 2::smallint), public.division_of_position(1.58, 16.02, 3::smallint),
  'Demander le niveau 2 donne la même commune');
select is(public.division_of_position(1.61, 16.05, 2::smallint), '7c000000-0000-4000-8000-000000000001'::uuid,
  'Demander le niveau 2 n''écarte pas l''arrondissement : la plus fine d''abord');
select is(public.division_of_position(1.61, 16.05, 4::smallint), '7c000000-0000-4000-8000-000000000001'::uuid,
  'Un niveau préféré que rien ne contient redescend à la plus fine division qui contient la position');
select is(public.division_of_position(-1.0, 12.0, 3::smallint), null::uuid,
  'Une position qu''aucun contour ne contient n''a toujours aucune division : l''administration la choisit');
select is(public.division_of_position(1.58, 16.02, 0::smallint), public.division_of_position(1.58, 16.02, 3::smallint),
  'Un niveau préféré trop bas vaut 2 : un département ou un pays ne range jamais une école');

-- Ce qui existait ne change pas ---------------------------------------------------------------------------------------------------

select ok((select d.level >= 3 from public.geo_divisions d where d.id = public.division_of_position(-4.80, 11.93, 3::smallint)),
  'Pointe-Noire : une position range encore dans un arrondissement');
select ok((select d.level >= 3 from public.geo_divisions d where d.id = public.division_of_position(-4.27, 15.27, 3::smallint)),
  'Brazzaville : une position du centre range encore dans un arrondissement, pas dans la commune entière');
select throws_ok($$select public.division_of_position(95, 12.0, 3::smallint)$$, '22023', null,
  'Une latitude impossible est refusée comme avant');

-- Une fiche de relais reçoit sa division à l'arrivée ----------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a6', 'google-a6', 'Alice');
select public.activer_relais('00000000-0000-4000-8000-0000000000a6', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a6","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('7d000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(16.02 1.58)', '[Dans la commune]'),
  ('7d000000-0000-4000-8000-000000000002', now(), 'SRID=4326;POINT(12.0 -1.0)', '[Nulle part]');
reset role;

select is((select s.division_id from public.field_submissions s where s.id = '7d000000-0000-4000-8000-000000000001'),
  (select d.id from public.geo_divisions d where d.path::text = 'congo.sangha.ouesso'),
  'Une fiche reçue dans la commune porte sa division : plus de « Division à choisir »');
select is((select s.division_id from public.field_submissions s where s.id = '7d000000-0000-4000-8000-000000000002'), null::uuid,
  'Une fiche hors de tout contour n''en porte toujours pas');

select * from finish();
rollback;
