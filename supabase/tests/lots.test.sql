-- Les lots : « hors du lot » à 50 m, lots fins (contrôle et rattachement), lots sur n'importe quelle division.
-- Reprise des tests du ticket n° 49 sur le nouveau modèle. À cette latitude, 0,00027° de longitude font 30 m et
-- 0,00072° font 80 m ; 0,01° de longitude font environ 1,1 km.

begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- Mise en place : une division d'essai de 0,1° sur 0,1° sous Pointe-Noire --------------------------------------------------

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, boundary, source)
select '70000000-0000-4000-8000-000000000001', id, 3, 'arrondissement', 'CG', '[Zone d''essai]', 'zone-d-essai',
       extensions.st_multi(extensions.st_makeenvelope(12.50, -4.90, 12.60, -4.80, 4326)), 'test'
from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire';

select public.register_relay('00000000-0000-4000-8000-0000000000a7', 'google-a7', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b7', 'google-b7', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d7', 'google-d7', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d7');

insert into public.lots (id, nom, geo_division_id, contour) values
  ('60000000-0000-4000-8000-000000000001', '[Lot fin]', '70000000-0000-4000-8000-000000000001',
   extensions.st_multi(extensions.st_makeenvelope(12.52, -4.88, 12.54, -4.86, 4326))),
  ('60000000-0000-4000-8000-000000000002', '[Lot entier]', '70000000-0000-4000-8000-000000000001', null);
select public.activer_relais('00000000-0000-4000-8000-0000000000a7', '60000000-0000-4000-8000-000000000001');
select public.activer_relais('00000000-0000-4000-8000-0000000000b7', '60000000-0000-4000-8000-000000000002');

-- « Hors du lot », avec une tolérance de 50 m ----------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('61000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(12.53 -4.87)', '[Dans le lot]'),
  ('61000000-0000-4000-8000-000000000002', now(), 'SRID=4326;POINT(12.54027 -4.87)', '[À 30 m du lot]'),
  ('61000000-0000-4000-8000-000000000003', now(), 'SRID=4326;POINT(12.54072 -4.87)', '[À 80 m du lot]'),
  ('61000000-0000-4000-8000-000000000004', now(), null, '[Sans position]');
reset role;
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000001'), false,
  'Une école dans le contour du lot n''est pas hors du lot');
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000002'), false,
  'À 30 m du contour, elle n''est pas hors du lot : un lot fin coupe un quartier, et un GPS se trompe de 10 à 30 m');
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000003'), true,
  'À 80 m du contour, elle est hors du lot');
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000004'), null::boolean,
  'Sans position, la base ne dit rien');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b7","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('61000000-0000-4000-8000-000000000005', now(), 'SRID=4326;POINT(12.55 -4.85)', '[Dans la division]'),
  ('61000000-0000-4000-8000-000000000006', now(), 'SRID=4326;POINT(12.60027 -4.85)', '[À 30 m de la division]'),
  ('61000000-0000-4000-8000-000000000007', now(), 'SRID=4326;POINT(12.60072 -4.85)', '[À 80 m de la division]'),
  ('61000000-0000-4000-8000-000000000008', now(), 'SRID=4326;POINT(13.50 -4.85)', '[Très loin]');
reset role;
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000005'), false,
  'Un lot sans contour : une école dans la division n''est pas hors du lot');
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000006'), false,
  'Un lot sans contour : à 30 m de la division, la tolérance vaut aussi');
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000007'), true,
  'Un lot sans contour : à 80 m de la division, elle est hors du lot');
select is((select outside_batch from public.field_submissions where id = '61000000-0000-4000-8000-000000000008'), true,
  'Très loin de la division, elle est hors du lot');

-- Le contrôle des lots fins ---------------------------------------------------------------------------------------------------------

create function pg_temp.lot(p_id uuid, p_nom text, p_ouest float8, p_est float8,
                            p_sud float8 default -4.90, p_nord float8 default -4.80, p_essai boolean default false)
returns void language sql as $$
  insert into public.lots (id, nom, geo_division_id, contour, essai)
  values (p_id, p_nom, '70000000-0000-4000-8000-000000000001',
          extensions.st_multi(extensions.st_makeenvelope(p_ouest, p_sud, p_est, p_nord, 4326)), p_essai)
$$;

-- La division d'essai a déjà « [Lot fin] » (12,52 à 12,54) : on le retire pour tester des découpages propres.
delete from public.field_submissions;
update public.relais set lot_id = null where id = '00000000-0000-4000-8000-0000000000a7';
delete from public.lots where id = '60000000-0000-4000-8000-000000000001';

select is((select count(*)::int from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 0, 'Sans lot fin, rien à signaler');

select pg_temp.lot('62000000-0000-4000-8000-000000000001', '[Ouest]', 12.50, 12.55);
select pg_temp.lot('62000000-0000-4000-8000-000000000002', '[Est]', 12.55, 12.60);
select is((select count(*)::int from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 0,
  'Deux lots qui se partagent la division sans trou ni recouvrement : rien à signaler');

insert into public.lots (id, nom, geo_division_id, essai) values
  ('62000000-0000-4000-8000-000000000007', '[Essai entier]', '70000000-0000-4000-8000-000000000001', true);
select pg_temp.lot('62000000-0000-4000-8000-000000000009', '[Essai]', 12.51, 12.52, -4.89, -4.88, true);
select is((select count(*)::int from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 0,
  'Le lot d''arrondissement entier et le lot d''essai ne comptent pas dans le contrôle');

delete from public.lots where id = '62000000-0000-4000-8000-000000000002';
select pg_temp.lot('62000000-0000-4000-8000-000000000003', '[Est étroit]', 12.56, 12.60);
select is((select string_agg(problem, ',' order by problem) from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 'trou',
  'Une bande sans lot est signalée comme un trou');
select ok((select area_m2 from prive.lot_problems('70000000-0000-4000-8000-000000000001') where problem = 'trou') between 11000000 and 14000000,
  'Le trou est mesuré en mètres carrés : environ 12 km²');

delete from public.lots where id = '62000000-0000-4000-8000-000000000003';
select pg_temp.lot('62000000-0000-4000-8000-000000000004', '[Est large]', 12.54, 12.60);
select is((select string_agg(problem, ',' order by problem) from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 'recouvrement',
  'Deux lots qui se chevauchent sont signalés, sans trou');
select ok((select detail like '%[Est large]%' and detail like '%[Ouest]%' and area_m2 between 11000000 and 14000000
           from prive.lot_problems('70000000-0000-4000-8000-000000000001') where problem = 'recouvrement'),
  'Le recouvrement dit quels lots se chevauchent, et de combien');

delete from public.lots where id in ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000004');
select pg_temp.lot('62000000-0000-4000-8000-000000000005', '[Trop grand]', 12.50, 12.65);
select is((select string_agg(problem, ',' order by problem) from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 'hors de la division',
  'Un lot qui déborde de la division est signalé');
select ok((select area_m2 from prive.lot_problems('70000000-0000-4000-8000-000000000001') where problem = 'hors de la division') between 55000000 and 68000000,
  'Ce qui déborde est mesuré : environ 61 km²');

delete from public.lots where id = '62000000-0000-4000-8000-000000000005';
select pg_temp.lot('62000000-0000-4000-8000-000000000001', '[Ouest]', 12.50, 12.55);
select pg_temp.lot('62000000-0000-4000-8000-000000000006', '[Est ajusté]', 12.5500005, 12.60);
select is((select count(*)::int from prive.lot_problems('70000000-0000-4000-8000-000000000001')), 0,
  'Un écart de quelques centaines de mètres carrés, dû à l''arrondi, n''est pas signalé');

-- Le rattachement des relevés d'un lot de division entière au lot fin qui contient leur position ----------------------------------

delete from public.lots where id = '62000000-0000-4000-8000-000000000006';
select pg_temp.lot('62000000-0000-4000-8000-000000000002', '[Est]', 12.55, 12.60);
insert into public.lots (id, nom, geo_division_id) values
  ('62000000-0000-4000-8000-000000000008', '[Entier]', '70000000-0000-4000-8000-000000000001');
insert into public.field_submissions (id, relay_id, batch_id, taken_at, position, sign_name) values
  ('63000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a7', '62000000-0000-4000-8000-000000000008', now(), 'SRID=4326;POINT(12.52 -4.85)', '[À l''ouest]'),
  ('63000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a7', '62000000-0000-4000-8000-000000000008', now(), 'SRID=4326;POINT(12.58 -4.85)', '[À l''est]'),
  ('63000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a7', '62000000-0000-4000-8000-000000000008', now(), null, '[Sans position]'),
  ('63000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a7', '62000000-0000-4000-8000-000000000008', now(), 'SRID=4326;POINT(12.55 -4.85)', '[Sur la limite]'),
  ('63000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a7', '62000000-0000-4000-8000-000000000007', now(), 'SRID=4326;POINT(12.515 -4.885)', '[Au lot d''essai]');
update public.field_submissions set outside_batch = true where id = '63000000-0000-4000-8000-000000000001';
-- Alice n'est pas sur le lot d'essai : à l'arrivée, la base remplace ce lot périmé (`lot_essai_perime.test.sql`). Cette
-- fiche est arrivée PENDANT l'essai : on la replace dans le lot d'essai, comme elle l'était.
update public.field_submissions set batch_id = '62000000-0000-4000-8000-000000000007' where id = '63000000-0000-4000-8000-000000000005';

select is(prive.attach_submissions_to_fine_lots('70000000-0000-4000-8000-000000000001'), 2,
  'Deux relevés sont rattachés : ceux dont la position est dans un seul lot fin');
select is((select batch_id from public.field_submissions where id = '63000000-0000-4000-8000-000000000001'),
  '62000000-0000-4000-8000-000000000001'::uuid, 'Le relevé de l''ouest passe dans le lot de l''ouest');
select is((select batch_id from public.field_submissions where id = '63000000-0000-4000-8000-000000000002'),
  '62000000-0000-4000-8000-000000000002'::uuid, 'Le relevé de l''est passe dans le lot de l''est');
select is((select outside_batch from public.field_submissions where id = '63000000-0000-4000-8000-000000000001'), false,
  'Rattaché, il n''est plus hors du lot');
select is((select batch_id from public.field_submissions where id = '63000000-0000-4000-8000-000000000003'),
  '62000000-0000-4000-8000-000000000008'::uuid, 'Sans position, un relevé reste où il est');
select is((select batch_id from public.field_submissions where id = '63000000-0000-4000-8000-000000000004'),
  '62000000-0000-4000-8000-000000000008'::uuid, 'Sur la limite de deux lots, un relevé reste où il est : à trancher à la main');
select is((select batch_id from public.field_submissions where id = '63000000-0000-4000-8000-000000000005'),
  '62000000-0000-4000-8000-000000000007'::uuid, 'Un relevé du lot d''essai ne bouge jamais, même sur un lot fin');
select is(prive.attach_submissions_to_fine_lots('70000000-0000-4000-8000-000000000001'), 0, 'Le rattachement se rejoue sans rien changer');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
select throws_ok($$select prive.attach_submissions_to_fine_lots('70000000-0000-4000-8000-000000000001')$$, '42501', null,
  'Un relais ne rattache pas de relevés');
reset role;
set local role anon;
select throws_ok($$select * from prive.lot_problems('70000000-0000-4000-8000-000000000001')$$, '42501', null,
  'Un visiteur ne lit pas le contrôle des lots');
reset role;

-- Des lots sur n'importe quelle division : ville, arrondissement, quartier ---------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d7","role":"authenticated"}', true);
select throws_ok($$select public.create_lot('[Lot de Moungali]', (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'))$$,
  '22023', null, 'Un lot ne se pose pas sur une zone fermée au relevé');
select lives_ok($$select public.create_lot('[Entraînement de Moungali]', (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'), null, true)$$,
  'Un lot d''entraînement se pose sur n''importe quelle zone');
select lives_ok($$select public.set_division_open((select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'), true)$$,
  'L''administrateur ouvre Moungali');
select lives_ok($$select public.create_lot('[Lot de Moungali]', (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'))$$,
  'Il crée alors un lot sur un arrondissement de Brazzaville');
select lives_ok($$select public.set_division_open((select id from public.geo_divisions where path::text = 'congo.niari'), true)$$,
  'Il ouvre un département : tout ce qu''il contient est ouvert');
select lives_ok($$select public.create_lot('[Lot de Dolisie]', (select id from public.geo_divisions where path::text = 'congo.niari.dolisie'))$$,
  'Il crée un lot sur une ville sans arrondissement (Dolisie)');
reset role;
insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, source)
select '70000000-0000-4000-8000-000000000002', id, 4, 'quarter', 'CG', '[Quartier d''essai]', 'quartier-d-essai', 'test'
from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d7","role":"authenticated"}', true);
select lives_ok($$select public.create_lot('[Lot du quartier]', '70000000-0000-4000-8000-000000000002', date '2026-12-01')$$,
  'Il crée un lot sur un quartier');
select throws_ok($$select public.create_lot('[Lot du pays]', (select id from public.geo_divisions where path::text = 'congo'))$$,
  '22023', null, 'Un lot ne se pose pas sur un pays');
select throws_ok($$select public.create_lot('[Lot du département]', (select id from public.geo_divisions where path::text = 'congo.niari'))$$,
  '22023', null, 'Ni sur un département');
select throws_ok($$select public.create_lot('[Lot du quartier]', '70000000-0000-4000-8000-000000000002')$$,
  '23505', null, 'Le nom d''un lot est unique');
select lives_ok($$select public.set_division_open('70000000-0000-4000-8000-000000000002', true)$$, 'L''administrateur ouvre une zone aux relais');
reset role;
select is(public.is_open_for_fieldwork('70000000-0000-4000-8000-000000000002'), true, 'La zone ouverte l''est');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
select throws_ok($$select public.create_lot('[Lot pirate]', '70000000-0000-4000-8000-000000000002')$$, '42501', null,
  'Un relais ne crée pas de lot (même par la fonction)');
select throws_ok($$select public.set_division_open('70000000-0000-4000-8000-000000000002', false)$$, '42501', null,
  'Un relais n''ouvre ni ne ferme une zone (même par la fonction)');
reset role;

-- Un lot sur un quartier sans contour hérite du contour de l'arrondissement qui le contient --------------------------------------

select ok(public.batch_area((select id from public.lots where nom = '[Lot du quartier]')) is not null,
  'Un lot sans contour, sur un quartier sans contour, hérite du contour de l''arrondissement au-dessus (Tié-Tié)');
select is(public.batch_area((select id from public.lots where nom = '[Lot de Dolisie]')), null::extensions.geometry,
  'Sans aucun contour connu au-dessus, le lot n''a pas de contour : « hors du lot » ne dit rien');

select * from finish();
rollback;
