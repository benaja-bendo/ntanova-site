-- Une adresse publique, un seul propriétaire : sous une même division, la page d'une zone et la fiche d'un campus
-- ne partagent jamais la même adresse.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, source)
select '71000000-0000-4000-8000-000000000001', id, 4, 'quarter', 'CG', '[Quartier Mpaka]', 'mpaka', 'test'
from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie';

select is(public.unique_campus_slug((select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'Mpaka'),
  'mpaka-2', 'Un campus qui s''appellerait comme un quartier prend un suffixe');
select is(public.unique_campus_slug((select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'Groupe scolaire Exemple'),
  'groupe-scolaire-exemple', 'Sinon, l''adresse reste celle du nom');

insert into public.institutions (id, name) values ('72000000-0000-4000-8000-000000000001', '[École adresse]');
select throws_ok($$insert into public.campuses (institution_id, slug, division_id, origin)
  values ('72000000-0000-4000-8000-000000000001', 'mpaka', (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'admin')$$,
  '22023', null, 'Un campus ne prend pas l''adresse d''une zone de sa division');
select lives_ok($$insert into public.campuses (id, institution_id, slug, division_id, origin)
  values ('73000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 'ecole-adresse',
          (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'admin')$$,
  'Un campus à l''adresse libre est créé');
select throws_ok($$insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug, source)
  select id, 4, 'quarter', 'CG', '[Quartier Ecole]', 'ecole-adresse', 'test'
  from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'$$,
  '22023', null, 'Une zone ne prend pas l''adresse d''un campus de sa division');
select throws_ok($$update public.campuses set slug = 'mpaka' where id = '73000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'Renommer l''adresse d''un campus vers celle d''une zone est refusé aussi');
select lives_ok($$insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug, source)
  select id, 4, 'quarter', 'CG', '[Quartier Libre]', 'quartier-libre', 'test'
  from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'$$,
  'Une zone à l''adresse libre est ajoutée');

select * from finish();
rollback;
