-- 20261120180000 : doublons et positions (ticket 201). Une école du même nom sans position est « déjà dans la base » (A18) ;
-- la position d'un site porte sa source : un relais, l'école, une carte en ligne (A35).
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

select public.register_relay('00000000-0000-4000-8000-0000000003d1', 'google-dp-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000003a1', 'google-dp-relais', '[Relais]');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000003d1');
insert into public.institutions (id, name, kind) values
  ('f3100000-0000-4000-8000-000000000001', '[Institut Kalala]', 'privee'),
  ('f3100000-0000-4000-8000-000000000002', '[Lycée Mbemba]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, origin, publication)
select 'f3200000-0000-4000-8000-000000000001', 'f3100000-0000-4000-8000-000000000001', 'institut-kalala', d.id, 'import', 'brouillon'
from (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.campuses (id, institution_id, slug, division_id, origin, publication, position)
select 'f3200000-0000-4000-8000-000000000002', 'f3100000-0000-4000-8000-000000000002', 'lycee-mbemba', d.id, 'admin', 'brouillon',
       extensions.st_setsrid(extensions.st_makepoint(11.86, -4.79), 4326)
from (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.missions (campus_id, relay_id, kind) values
  ('f3200000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000003a1', 'verify');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d1","role":"authenticated"}', true);

-- A18 : une école connue sans position --------------------------------------------------------------------------------------------------------------
select is((select verdict from public.similar_schools('Institut Kalala', -4.80, 11.85) where id = 'f3200000-0000-4000-8000-000000000001'),
  'deja_la', 'Une école du même nom, sans position : « déjà dans la base », même si le relevé a une position');
select is((select verdict from public.similar_schools('Institut Kalala') where id = 'f3200000-0000-4000-8000-000000000001'),
  'deja_la', 'Et sans position des deux côtés');
select is((select located::text || '|' || open_mission::text from public.similar_schools('Institut Kalala')
           where id = 'f3200000-0000-4000-8000-000000000001'),
  'false|true', 'La base dit qu''elle n''est pas située et qu''une mission est ouverte pour elle');
select is((select verdict from public.similar_schools('Lycée Mbemba', -4.70, 11.95) where id = 'f3200000-0000-4000-8000-000000000002'),
  'autre_site', 'Une école du même nom, située loin : toujours un autre site possible');

-- A35 : la source de la position ------------------------------------------------------------------------------------------------------------------
select is((select position_source from public.campuses where id = 'f3200000-0000-4000-8000-000000000002'), null,
  'Une position posée sans dire d''où elle vient : pas de source');
select lives_ok($$select public.locate_campus('f3200000-0000-4000-8000-000000000001', -4.80, 11.85, null, 'carte_en_ligne')$$,
  '« Situer » d''après une carte en ligne');
select is((select position_source from public.campuses where id = 'f3200000-0000-4000-8000-000000000001'), 'carte_en_ligne',
  'La source est gardée');
select lives_ok($$select public.locate_campus('f3200000-0000-4000-8000-000000000001', -4.801, 11.851, null, 'ecole')$$,
  '« Situer » d''après l''école');
select is((select position_source from public.campuses where id = 'f3200000-0000-4000-8000-000000000001'), 'ecole',
  'Une nouvelle position prend sa nouvelle source');
select lives_ok($$select public.locate_campus('f3200000-0000-4000-8000-000000000001', -4.802, 11.852)$$,
  '« Situer » sans dire d''où vient la position');
select is((select position_source from public.campuses where id = 'f3200000-0000-4000-8000-000000000001'), null,
  'Une position sans source n''en garde pas une ancienne');
select throws_ok($$select public.locate_campus('f3200000-0000-4000-8000-000000000001', -4.80, 11.85, null, 'satellite')$$, '22023', null,
  'Une source hors liste est refusée');

reset role;
-- Comme `accept_reviewed_submission` : la position d'un relevé arrive avec le passage du relais.
update public.campuses set position = extensions.st_setsrid(extensions.st_makepoint(11.853, -4.803), 4326),
                           surveyed_at = now() - interval '1 day'
where id = 'f3200000-0000-4000-8000-000000000001';
select is((select position_source from public.campuses where id = 'f3200000-0000-4000-8000-000000000001'), 'relais',
  'Une position arrivée avec le relevé d''un relais vient du relais');

select * from finish();
rollback;
