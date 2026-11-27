-- 20261120120000 : la sûreté des frais (ticket 199). Le frais de dossier d'une formation suit le OUI de l'école (A1) ; une
-- ligne de frais « à partir de » n'a pas de maximum (A23) ; les lignes gardent l'ordre de leur saisie (A14).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select public.register_relay('00000000-0000-4000-8000-0000000002d1', 'google-sf-admin', '[Admin]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000002d1');
insert into public.institutions(id, name, kind) values ('f2100000-0000-4000-8000-000000000001', '[Institut Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, position)
select 'f2200000-0000-4000-8000-000000000001', 'f2100000-0000-4000-8000-000000000001', 'institut-exemple-surete', id, 'publiee', 'admin',
       extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326)
from public.geo_divisions where level = 3 limit 1;
insert into public.campus_cycles(id, campus_id, cycle) values
  ('f2300000-0000-4000-8000-000000000001', 'f2200000-0000-4000-8000-000000000001', 'superieur');
insert into public.campus_programs(id, campus_cycle_id, title, rhythms, origin) values
  ('f2400000-0000-4000-8000-000000000001', 'f2300000-0000-4000-8000-000000000001', 'Licence Exemple', '{}', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000002d1","role":"authenticated"}', true);

-- A1 : le frais de dossier attend le OUI de l'école --------------------------------------------------------------------------------------
select lives_ok($$select public.set_program_details('f2400000-0000-4000-8000-000000000001', 3, 'Bac', null, 20000, null, current_date - 2)$$,
  'Un frais de dossier, dit par l''école');
select ok((select application_fee_confirmed_on is null from public.campus_programs where id = 'f2400000-0000-4000-8000-000000000001'),
  'Il attend le OUI de l''école');

set local role anon;
select is((select application_fee_xaf from public.public_campus_programs where program_id = 'f2400000-0000-4000-8000-000000000001'),
  null, 'Sans le OUI, le public ne lit pas le frais de dossier');
select is((select title from public.public_campus_programs where program_id = 'f2400000-0000-4000-8000-000000000001'),
  'Licence Exemple', 'Le reste de la formation reste public');
select throws_ok($$select application_fee_xaf from public.campus_programs$$, '42501', null,
  'Le visiteur ne lit pas le frais de dossier dans la table');
select lives_ok($$select title, duration_years from public.campus_programs$$, 'Le visiteur lit les autres colonnes de la table');

set local role authenticated;
select throws_ok($$select public.confirm_school_fees('f2200000-0000-4000-8000-000000000001', current_date - 5)$$, '22023', null,
  'Le OUI ne précède pas le jour où l''école a dit le frais de dossier');
select is((select public.confirm_school_fees('f2200000-0000-4000-8000-000000000001', current_date - 1)), 1,
  '« Noter le OUI » confirme le frais de dossier, même sans ligne de frais');

set local role anon;
select is((select application_fee_xaf from public.public_campus_programs where program_id = 'f2400000-0000-4000-8000-000000000001'),
  20000, 'Avec le OUI, le public lit le frais de dossier');

set local role authenticated;
select lives_ok($$select public.set_program_details('f2400000-0000-4000-8000-000000000001', 2, 'Bac', null, 20000, null, current_date - 2)$$,
  'La durée change, pas le frais');
select ok((select application_fee_confirmed_on is not null from public.campus_programs where id = 'f2400000-0000-4000-8000-000000000001'),
  'Le frais n''a pas changé : le OUI reste');
select lives_ok($$select public.save_program_sheet('f2400000-0000-4000-8000-000000000001', '{"application_fee_xaf": 25000}'::jsonb)$$,
  'Le frais change dans le tiroir de la formation');
select ok((select application_fee_confirmed_on is null from public.campus_programs where id = 'f2400000-0000-4000-8000-000000000001'),
  'Un frais modifié perd son OUI');

set local role anon;
select is((select application_fee_xaf from public.public_campus_programs where program_id = 'f2400000-0000-4000-8000-000000000001'),
  null, 'Un frais modifié quitte le site jusqu''au prochain OUI');

reset role;
select is((select count(*)::int from prive.program_detail_history
           where program_id = 'f2400000-0000-4000-8000-000000000001' and after_data ->> 'application_fee_confirmed_on' is not null
             and before_data ->> 'application_fee_confirmed_on' is null), 1,
  'Le OUI du frais de dossier est gardé dans l''historique privé');

-- A23 : « à partir de » ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001', null, 'superieur', 40000, null, 'mois', null, 70000,
    null, current_date - 2, null, 'Licence 1', null, 'declaration', null, null)$$,
  'Une ligne « à partir de 40 000 » : pas de maximum');
select ok((select maximum is null from public.campus_fees where campus_id = 'f2200000-0000-4000-8000-000000000001' and level_label = 'Licence 1'),
  'Le maximum reste vide : la ligne se lit « à partir de »');
select throws_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001', null, 'superieur', 40000, 30000, 'mois', null, null,
    null, current_date - 2, null, 'Licence 2', null, 'declaration', null, null)$$, '22023', null,
  'Un maximum sous le minimum reste refusé');

-- A14 : l'ordre de la saisie ------------------------------------------------------------------------------------------------------------------
select lives_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001', null, 'superieur', 50000, 50000, 'mois', null, null,
    null, current_date - 2, null, 'Licence 2', null, 'declaration', null, null)$$, 'Une deuxième ligne');
select lives_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001', null, 'superieur', 60000, 60000, 'mois', null, null,
    null, current_date - 2, null, 'Licence 3', null, 'declaration', null, null)$$, 'Une troisième ligne');
select lives_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001',
    (select id from public.campus_fees where campus_id = 'f2200000-0000-4000-8000-000000000001' and level_label = 'Licence 1'),
    'superieur', 45000, null, 'mois', null, 70000, null, current_date - 2, null, 'Licence 1', null, 'declaration', null, null)$$,
  'La première ligne est modifiée');
select is((select string_agg(level_label, ',' order by created_at, id) from public.campus_fees
           where campus_id = 'f2200000-0000-4000-8000-000000000001'),
  'Licence 1,Licence 2,Licence 3', 'Les lignes gardent l''ordre de leur saisie, même modifiées');

-- Ticket 236 (27/11) : la réinscription et la cantine suivent la même règle que les frais --------------------------------------
select throws_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001', null, 'superieur', 70000, 70000, 'mois', null, null,
    null, current_date - 2, null, 'Master 1', p_canteen => 15000)$$, '22023', null, 'Une cantine sans sa période est refusée');
select lives_ok($$select public.set_school_fee('f2200000-0000-4000-8000-000000000001', null, 'superieur', 70000, 70000, 'mois', null, null,
    null, current_date - 2, null, 'Master 1', p_re_registration => 30000, p_canteen => 15000, p_canteen_period => 'mois')$$,
  'Une ligne avec réinscription et cantine');
set local role anon;
select is((select count(*)::int from public.campus_fees where re_registration is not null or canteen is not null), 0,
  'Sans le OUI, le public ne lit ni la réinscription ni la cantine');
set local role authenticated;
select public.confirm_school_fees('f2200000-0000-4000-8000-000000000001', current_date - 1);
set local role anon;
select is((select re_registration || '|' || canteen || '|' || canteen_period from public.campus_fees where level_label = 'Master 1'),
  '30000|15000|mois', 'Avec le OUI, le public les lit');
set local role authenticated;
select public.set_school_fee('f2200000-0000-4000-8000-000000000001',
    (select id from public.campus_fees where level_label = 'Master 1'), 'superieur', 70000, 70000, 'mois', null, null,
    null, current_date - 2, null, 'Master 1', p_re_registration => 30000, p_canteen => 16000, p_canteen_period => 'mois');
select ok((select confirmed_on is null from public.campus_fees where level_label = 'Master 1'), 'Une cantine changée perd le OUI');
set local role anon;
select is((select count(*)::int from public.campus_fees where level_label = 'Master 1'), 0,
  'Et la ligne quitte le site jusqu''au prochain OUI');

select * from finish();
rollback;
