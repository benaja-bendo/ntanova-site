-- La recherche : par nom, repère, cycle, série de bac, diplôme, domaine, rythme, lieu et distance.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into public.institutions (id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'Lycée [Alpha]'), ('a1000000-0000-4000-8000-000000000002', 'Institut [Beta]'),
  ('a1000000-0000-4000-8000-000000000003', 'Université [Gamma]'), ('a1000000-0000-4000-8000-000000000004', 'École [Delta]');
insert into public.campuses (id, institution_id, label, slug, division_id, landmark, position, publication, origin) values
  ('b1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-000000000001', null, 'lycee-alpha',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'Près du marché central',
   extensions.st_setsrid(extensions.st_makepoint(11.93, -4.80), 4326), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-000000000002', null, 'institut-beta',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.loandjili'), 'Face à la gare',
   extensions.st_setsrid(extensions.st_makepoint(11.88, -4.77), 4326), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-0000000000c1', 'a1000000-0000-4000-8000-000000000003', 'Campus de Tié-Tié', 'universite-gamma-tie-tie',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), null,
   extensions.st_setsrid(extensions.st_makepoint(11.935, -4.805), 4326), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-0000000000c2', 'a1000000-0000-4000-8000-000000000003', 'Campus de Moungali', 'universite-gamma-moungali',
   (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'), null,
   extensions.st_setsrid(extensions.st_makepoint(15.24, -4.26), 4326), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-00000000000d', 'a1000000-0000-4000-8000-000000000004', null, 'ecole-delta',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), null,
   extensions.st_setsrid(extensions.st_makepoint(11.9302, -4.8002), 4326), 'brouillon', 'admin');
insert into public.campus_cycles (id, campus_id, cycle) values
  ('c1000000-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-00000000000a', 'lycee'),
  ('c1000000-0000-4000-8000-00000000000b', 'b1000000-0000-4000-8000-00000000000b', 'superieur'),
  ('c1000000-0000-4000-8000-0000000000c1', 'b1000000-0000-4000-8000-0000000000c1', 'superieur'),
  ('c1000000-0000-4000-8000-0000000000c2', 'b1000000-0000-4000-8000-0000000000c2', 'superieur'),
  ('c1000000-0000-4000-8000-00000000000d', 'b1000000-0000-4000-8000-00000000000d', 'primaire');
insert into public.campus_programs (campus_cycle_id, domain_id, title, bac_track, diploma, rhythms) values
  ('c1000000-0000-4000-8000-00000000000a', (select id from public.education_domains where slug = 'sciences-technologies'), 'Série C', 'c', 'bac', '{jour}'),
  ('c1000000-0000-4000-8000-00000000000a', (select id from public.education_domains where slug = 'gestion'), 'Série G2', 'g2', 'bac', '{jour,soir}'),
  ('c1000000-0000-4000-8000-00000000000b', (select id from public.education_domains where slug = 'informatique'), 'BTS Informatique de gestion', null, 'bts', '{soir,weekend}'),
  ('c1000000-0000-4000-8000-00000000000b', (select id from public.education_domains where slug = 'droit'), 'Licence en droit', null, 'licence', '{jour}'),
  ('c1000000-0000-4000-8000-0000000000c1', (select id from public.education_domains where slug = 'sante'), 'Master en santé publique', null, 'master', '{weekend}'),
  ('c1000000-0000-4000-8000-0000000000c2', (select id from public.education_domains where slug = 'informatique'), 'Licence en informatique', null, 'licence', '{jour}');

create function pg_temp.slugs(p_sql text) returns text language plpgsql as $$
declare r text;
begin
  execute format('select coalesce(string_agg(slug, '','' order by slug), ''-'') from (%s) s', p_sql) into r;
  return r;
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true);

-- Par le nom et le repère de rue ---------------------------------------------------------------------------------------------------------------

select is((select string_agg(name, ',') from public.search_campuses('lycee alpha')), 'Lycée [Alpha]', 'Par le nom, sans accent');
select is((select string_agg(name, ',') from public.search_campuses('lycee alpa')), 'Lycée [Alpha]', 'Par le nom, avec une faute');
select is((select string_agg(name, ',') from public.search_campuses('marche central')), 'Lycée [Alpha]', 'Par le repère de rue');
select is((select string_agg(name, ',') from public.search_campuses('gare')), 'Institut [Beta]', 'Par un mot du repère');
select is((select count(*)::int from public.search_campuses()), 4, 'Sans critère : tous les campus publiés (le brouillon reste invisible)');
select is((select count(*)::int from public.search_campuses('delta')), 0, 'Un visiteur ne trouve pas un campus en brouillon');

-- Par le cycle ---------------------------------------------------------------------------------------------------------------------------------------

select is((select count(*)::int from public.search_campuses(p_cycle => 'superieur')), 3, 'Par le cycle : trois campus du supérieur');
select is((select count(*)::int from public.search_campuses(p_cycle => 'lycee')), 1, 'Par le cycle : un lycée');
select is((select count(*)::int from public.search_campuses(p_cycle => 'primaire')), 0, 'Le primaire du brouillon ne se trouve pas');

-- Par la série de bac ---------------------------------------------------------------------------------------------------------------------------------

select is((select string_agg(name, ',') from public.search_campuses(p_bac_track => 'c')), 'Lycée [Alpha]', 'Par la série C');
select is((select string_agg(name, ',') from public.search_campuses(p_bac_track => 'g2')), 'Lycée [Alpha]', 'Par la série G2');
select is((select string_agg(name, ',') from public.search_campuses(p_bac_track => 'g')), 'Lycée [Alpha]', '« Série G » trouve aussi G2');
select is((select count(*)::int from public.search_campuses(p_bac_track => 'f')), 0, 'Aucune série F au catalogue : rien');

-- Par le diplôme --------------------------------------------------------------------------------------------------------------------------------------

select is((select string_agg(name, ',' order by name) from public.search_campuses(p_diploma => 'licence')), 'Institut [Beta],Université [Gamma]', 'Par la licence');
select is((select string_agg(name, ',') from public.search_campuses(p_diploma => 'bts')), 'Institut [Beta]', 'Par le BTS');
select is((select string_agg(name, ',') from public.search_campuses(p_diploma => 'master')), 'Université [Gamma]', 'Par le master');
select is((select string_agg(name, ',') from public.search_campuses(p_diploma => 'bac')), 'Lycée [Alpha]', 'Par le baccalauréat');

-- Par le domaine et le rythme --------------------------------------------------------------------------------------------------------------------------

select is((select string_agg(name, ',' order by name) from public.search_campuses(p_domain => 'informatique')), 'Institut [Beta],Université [Gamma]', 'Par le domaine Informatique');
select is((select string_agg(name, ',') from public.search_campuses(p_domain => 'gestion')), 'Lycée [Alpha]', 'Par le domaine Gestion');
select is((select string_agg(name, ',') from public.search_campuses(p_domain => 'sante')), 'Université [Gamma]', 'Par le domaine Santé');
select is((select string_agg(name, ',' order by name) from public.search_campuses(p_rhythm => 'soir')), 'Institut [Beta],Lycée [Alpha]', 'Par le rythme du soir');
select is((select string_agg(name, ',' order by name) from public.search_campuses(p_rhythm => 'weekend')), 'Institut [Beta],Université [Gamma]', 'Par le rythme du week-end');

-- Les critères de formation portent sur UNE MÊME formation --------------------------------------------------------------------------------------

select is((select string_agg(name, ',') from public.search_campuses(p_bac_track => 'g2', p_rhythm => 'soir')), 'Lycée [Alpha]', 'Série G2 du soir : la même formation');
select is((select count(*)::int from public.search_campuses(p_bac_track => 'c', p_rhythm => 'soir')), 0,
  'Série C du soir : le lycée a une série C (le jour) et une formation du soir (G2), pas une série C du soir');
select is((select string_agg(name, ',') from public.search_campuses(p_domain => 'informatique', p_rhythm => 'weekend')), 'Institut [Beta]',
  'Informatique le week-end : un seul campus (l''autre n''a que des cours du jour)');

-- Par le lieu -------------------------------------------------------------------------------------------------------------------------------------------

select is((select string_agg(name, ',' order by name) from public.search_campuses(p_division_path => 'congo.pointe_noire')), 'Institut [Beta],Lycée [Alpha],Université [Gamma]',
  'Tout ce qui est sous Pointe-Noire');
select is((select string_agg(label, ',') from public.search_campuses(p_division_path => 'congo.brazzaville')), 'Campus de Moungali', 'Tout ce qui est sous Brazzaville');
select is((select string_agg(name, ',') from public.search_campuses(p_division_path => 'congo.pointe_noire.pointe_noire.loandjili')), 'Institut [Beta]', 'Un arrondissement');

-- Autour de moi -----------------------------------------------------------------------------------------------------------------------------------------------

select is((select string_agg(coalesce(label, name), ',') from public.search_campuses(p_near_latitude => -4.80, p_near_longitude => 11.93, p_radius_m => 1500)),
  'Lycée [Alpha],Campus de Tié-Tié', 'Autour de moi : les campus à moins de 1,5 km, du plus proche au plus lointain');
select ok((select distance_m < 5 from public.search_campuses(p_near_latitude => -4.80, p_near_longitude => 11.93, p_radius_m => 1500) limit 1),
  'La distance est rendue en mètres');
select throws_ok($$select * from public.search_campuses(p_near_latitude => -4.8)$$, '22023', null, 'La latitude et la longitude vont ensemble');
reset role;

select * from finish();
rollback;
