-- Les lots fins : le contrôle de leur découpage et le rattachement des relevés (ticket #49) :
-- `supabase test db`. Un arrondissement d'essai de 0,1° sur 0,1° (une dizaine de kilomètres de côté),
-- coupé en deux lots par la ligne de longitude 12,55. À cette latitude, 0,01° de longitude font environ 1,1 km.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Mise en place (rôle postgres) --------------------------------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a8', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a8"}');
insert into public.arrondissements (nom, slug, ville, contour) values
  ('[Zone d''essai]', 'zone-d-essai', '[Ville]',
   extensions.st_multi(extensions.st_makeenvelope(12.50, -4.90, 12.60, -4.80, 4326)));

-- Un lot rectangulaire de l'arrondissement d'essai (par défaut sur toute sa hauteur).
create function pg_temp.lot(identifiant uuid, nom text, ouest float8, est float8,
                            sud float8 default -4.90, nord float8 default -4.80, essai boolean default false)
returns void language sql as $$
  insert into public.lots (id, nom, arrondissement_id, contour, essai)
  values (identifiant, nom, (select id from public.arrondissements where slug = 'zone-d-essai'),
          extensions.st_multi(extensions.st_makeenvelope(ouest, sud, est, nord, 4326)), essai)
$$;

-- Ce que le contrôle dit des lots fins ---------------------------------------------------------------

select is((select count(*)::int from prive.problemes_de_lots('zone-d-essai')), 0,
  'Sans lot fin, rien à signaler');

select pg_temp.lot('62000000-0000-4000-8000-000000000001', '[Ouest]', 12.50, 12.55);
select pg_temp.lot('62000000-0000-4000-8000-000000000002', '[Est]', 12.55, 12.60);
select is((select count(*)::int from prive.problemes_de_lots('zone-d-essai')), 0,
  'Deux lots qui se partagent l''arrondissement sans trou ni recouvrement : rien à signaler');

-- Un lot sans contour (l'arrondissement entier) et le lot d'entraînement ne comptent pas. Le vrai lot
-- d'entraînement n'a pas de contour ; celui-ci en a un, pour que le contrôle prouve qu'il l'ignore.
insert into public.lots (id, nom, arrondissement_id) values
  ('62000000-0000-4000-8000-000000000008', '[Entier]', (select id from public.arrondissements where slug = 'zone-d-essai'));
insert into public.lots (id, nom, arrondissement_id, essai) values
  ('62000000-0000-4000-8000-000000000007', '[Essai entier]', (select id from public.arrondissements where slug = 'zone-d-essai'), true);
select pg_temp.lot('62000000-0000-4000-8000-000000000009', '[Essai]', 12.51, 12.52, -4.89, -4.88, true);
select is((select count(*)::int from prive.problemes_de_lots('zone-d-essai')), 0,
  'Le lot d''arrondissement entier et le lot d''essai ne comptent pas dans le contrôle');

-- Un trou : l'est est trop étroit, une bande de 0,01° reste sans lot.
delete from public.lots where id = '62000000-0000-4000-8000-000000000002';
select pg_temp.lot('62000000-0000-4000-8000-000000000003', '[Est étroit]', 12.56, 12.60);
select is((select string_agg(probleme, ',' order by probleme) from prive.problemes_de_lots('zone-d-essai')), 'trou',
  'Une bande sans lot est signalée comme un trou');
select ok((select aire_m2 from prive.problemes_de_lots('zone-d-essai') where probleme = 'trou') between 11000000 and 14000000,
  'Le trou est mesuré en mètres carrés : environ 12 km²');

-- Un recouvrement : l'est est trop large, il mord de 0,01° sur l'ouest.
delete from public.lots where id = '62000000-0000-4000-8000-000000000003';
select pg_temp.lot('62000000-0000-4000-8000-000000000004', '[Est large]', 12.54, 12.60);
select is((select string_agg(probleme, ',' order by probleme) from prive.problemes_de_lots('zone-d-essai')), 'recouvrement',
  'Deux lots qui se chevauchent sont signalés, sans trou');
select ok((select detail like '%[Est large]%' and detail like '%[Ouest]%' and aire_m2 between 11000000 and 14000000
           from prive.problemes_de_lots('zone-d-essai') where probleme = 'recouvrement'),
  'Le recouvrement dit quels lots se chevauchent, et de combien');

-- Un lot qui sort de l'arrondissement.
delete from public.lots where id in ('62000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000004');
select pg_temp.lot('62000000-0000-4000-8000-000000000005', '[Trop grand]', 12.50, 12.65);
select is((select string_agg(probleme, ',' order by probleme) from prive.problemes_de_lots('zone-d-essai')), 'hors de l''arrondissement',
  'Un lot qui déborde de l''arrondissement est signalé');
select ok((select aire_m2 from prive.problemes_de_lots('zone-d-essai') where probleme = 'hors de l''arrondissement') between 55000000 and 68000000,
  'Ce qui déborde est mesuré : environ 61 km²');

-- Un écart de quelques centaines de mètres carrés (arrondi des coordonnées) n'est pas un trou :
-- 0,0000005° de longitude font 5 cm, sur 11 km de limite, soit environ 600 m².
delete from public.lots where id = '62000000-0000-4000-8000-000000000005';
select pg_temp.lot('62000000-0000-4000-8000-000000000001', '[Ouest]', 12.50, 12.55);
select pg_temp.lot('62000000-0000-4000-8000-000000000006', '[Est ajusté]', 12.5500005, 12.60);
select is((select count(*)::int from prive.problemes_de_lots('zone-d-essai')), 0,
  'Un écart de quelques centaines de mètres carrés, dû à l''arrondi, n''est pas signalé');

-- Le rattachement des relevés d'un lot d'arrondissement entier au lot fin qui contient leur position ---

delete from public.lots where id = '62000000-0000-4000-8000-000000000006';
select pg_temp.lot('62000000-0000-4000-8000-000000000002', '[Est]', 12.55, 12.60);
select public.activer_relais('00000000-0000-4000-8000-0000000000a8', '62000000-0000-4000-8000-000000000008');

insert into public.releves (id, relais_id, lot_id, pris_le, position, nom_enseigne) values
  ('63000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a8', '62000000-0000-4000-8000-000000000008',
   now(), 'SRID=4326;POINT(12.52 -4.85)', '[À l''ouest]'),
  ('63000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a8', '62000000-0000-4000-8000-000000000008',
   now(), 'SRID=4326;POINT(12.58 -4.85)', '[À l''est]'),
  ('63000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a8', '62000000-0000-4000-8000-000000000008',
   now(), null, '[Sans position]'),
  ('63000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a8', '62000000-0000-4000-8000-000000000008',
   now(), 'SRID=4326;POINT(12.55 -4.85)', '[Sur la limite]'),
  ('63000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a8', '62000000-0000-4000-8000-000000000007',
   now(), 'SRID=4326;POINT(12.515 -4.885)', '[Au lot d''essai]'),
  ('63000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a8', (select id from public.lots where nom = 'Ngoyo'),
   now(), 'SRID=4326;POINT(12.52 -4.80)', '[Dans un autre arrondissement]');
update public.releves set hors_lot = true where id = '63000000-0000-4000-8000-000000000001';

select is(prive.rattacher_releves_aux_lots_fins('zone-d-essai'), 2,
  'Deux relevés sont rattachés : ceux dont la position est dans un seul lot fin');
select is((select lot_id from public.releves where id = '63000000-0000-4000-8000-000000000001'),
  '62000000-0000-4000-8000-000000000001'::uuid, 'Le relevé de l''ouest passe dans le lot de l''ouest');
select is((select lot_id from public.releves where id = '63000000-0000-4000-8000-000000000002'),
  '62000000-0000-4000-8000-000000000002'::uuid, 'Le relevé de l''est passe dans le lot de l''est');
select is((select hors_lot from public.releves where id = '63000000-0000-4000-8000-000000000001'), false,
  'Rattaché, il n''est plus hors du lot');
select is((select lot_id from public.releves where id = '63000000-0000-4000-8000-000000000003'),
  '62000000-0000-4000-8000-000000000008'::uuid, 'Sans position, un relevé reste où il est');
select is((select lot_id from public.releves where id = '63000000-0000-4000-8000-000000000004'),
  '62000000-0000-4000-8000-000000000008'::uuid, 'Sur la limite de deux lots, un relevé reste où il est : à trancher à la main');
select is((select lot_id from public.releves where id = '63000000-0000-4000-8000-000000000005'),
  '62000000-0000-4000-8000-000000000007'::uuid, 'Un relevé du lot d''essai ne bouge jamais, même sur un lot fin');
select is((select l.nom from public.releves r join public.lots l on l.id = r.lot_id where r.id = '63000000-0000-4000-8000-000000000006'),
  'Ngoyo', 'Le lot d''un autre arrondissement n''est pas touché');
select is(prive.rattacher_releves_aux_lots_fins('zone-d-essai'), 0, 'Le rattachement se rejoue sans rien changer');
select is(prive.rattacher_releves_aux_lots_fins('tie-tie'), 0, 'Un arrondissement sans lot fin n''a rien à rattacher');

-- Ni un visiteur, ni un relais n'y touchent ----------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a8', true);
select throws_ok($$select prive.rattacher_releves_aux_lots_fins('zone-d-essai')$$, '42501', null,
  'Un relais ne rattache pas de relevés');
reset role;
set local role anon;
select throws_ok($$select * from prive.problemes_de_lots('zone-d-essai')$$, '42501', null,
  'Un visiteur ne lit pas le contrôle des lots');
reset role;

select * from finish();
rollback;
