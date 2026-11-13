-- M11 (lot G) : « Même lieu » entre deux écoles distinctes, et le signal de la semaine des relais.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select public.register_relay('00000000-0000-4000-8000-0000000000d2', 'google-lotg-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a2', 'google-lotg-relais', '[Relais]');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d2');
select public.activer_relais('00000000-0000-4000-8000-0000000000a2', null);

insert into public.institutions (id, name, kind) values
  ('94000000-0000-4000-8000-000000000001', '[École du portail]', 'privee'),
  ('94000000-0000-4000-8000-000000000002', '[École voisine]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, origin, publication)
select '95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', 'ecole-du-portail', d.id, 'admin', 'publiee'
from (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.campuses (id, institution_id, slug, division_id, origin, publication)
select '95000000-0000-4000-8000-000000000002', '94000000-0000-4000-8000-000000000002', 'ecole-voisine', d.id, 'admin', 'brouillon'
from (select id from public.geo_divisions where level = 3 limit 1) d;

-- « Même lieu » ------------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select throws_ok($$select public.set_campus_same_place('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'Un relais ne pose pas « Même lieu »');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
select throws_ok($$select public.set_campus_same_place('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'Une école n''est pas au même lieu qu''elle-même');
select lives_ok($$select public.set_campus_same_place('95000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000002')$$,
  'L''admin note l''école voisine');
reset role;

select is((select count(*)::int from public.institutions where id in ('94000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002')), 2,
  'Deux écoles distinctes : rien n''est fusionné');

set local role anon;
select is((select same_place_name from public.public_campuses where id = '95000000-0000-4000-8000-000000000001'), null,
  'La fiche publique ne nomme pas une voisine qui n''est pas publiée');
reset role;
update public.campuses set publication = 'publiee' where id = '95000000-0000-4000-8000-000000000002';
set local role anon;
select is((select same_place_name || '|' || (same_place_number = (select public_number from public.campuses where id = '95000000-0000-4000-8000-000000000002'))::text
           from public.public_campuses where id = '95000000-0000-4000-8000-000000000001'),
  '[École voisine]|true', 'Publiée, la voisine est nommée sur la fiche publique, avec son numéro (son lien court)');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
select public.set_campus_same_place('95000000-0000-4000-8000-000000000001', null);
reset role;
select is((select same_place_as_campus_id from public.campuses where id = '95000000-0000-4000-8000-000000000001'), null,
  'Avec null, la mention est retirée');

-- Le verdict : un autre nom tout près est une voisine ; le même nom, toujours « déjà dans la base » ------------------------------------------------
update public.campuses set position = extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326)
where id = '95000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);
select is((select verdict from public.similar_schools('[Institut Bambou]', -4.8001, 11.8501) where id = '95000000-0000-4000-8000-000000000001'),
  'voisine', 'Un autre nom à 15 m : une école voisine (« Même lieu » se propose)');
select is((select verdict from public.similar_schools('[École du portail]', -4.8001, 11.8501) where id = '95000000-0000-4000-8000-000000000001'),
  'deja_la', 'Le même nom à 15 m : déjà dans la base');
reset role;

-- Le signal de la semaine --------------------------------------------------------------------------------------------------------------------------
insert into public.erreurs (id, relais_id, survenue_le, ecran, code) values
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a2', now() - interval '1 day', 'ajouter-1', 'position_trop_longue'),
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a2', now() - interval '2 days', 'ajouter-1', 'position_trop_longue'),
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a2', now() - interval '10 days', 'ajouter-1', 'position_trop_longue'),
  (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a2', now() - interval '1 day', 'ajouter-1', 'position_refusee');
select is((select slow_position_week from public.relay_counters where relay_id = '00000000-0000-4000-8000-0000000000a2'), 2,
  'Position lente : seulement les « trop longue » des 7 derniers jours');
select is((select sent_week from public.relay_counters where relay_id = '00000000-0000-4000-8000-0000000000a2'), 0,
  'Aucune fiche cette semaine');
select is((select sent from public.relay_counters where relay_id = '00000000-0000-4000-8000-0000000000a2'), 0,
  'Les colonnes d''avant ne changent pas');

select * from finish();
rollback;
