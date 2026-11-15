-- 20261115200000 : lot 1 du site public à trois piliers. Mois facturés (P1), séries admises (P2), places annoncées (P3),
-- effectif en tranches (P4), demandes des familles sans nom (P5), OUI daté de l'école sur ses frais (P6).
begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

select public.register_relay('00000000-0000-4000-8000-0000000001d1', 'google-l1-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000001a1', 'google-l1-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000001d1');
insert into public.institutions(id, name, kind) values ('f1100000-0000-4000-8000-000000000001', '[École Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, position)
select 'f1200000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'ecole-exemple-lot-1', id, 'publiee', 'admin',
       extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326)
from public.geo_divisions where level = 3 limit 1;
insert into public.campus_cycles(id, campus_id, cycle) values
  ('f1300000-0000-4000-8000-000000000001', 'f1200000-0000-4000-8000-000000000001', 'primaire'),
  ('f1300000-0000-4000-8000-000000000002', 'f1200000-0000-4000-8000-000000000001', 'superieur');
insert into public.campus_programs(id, campus_cycle_id, title, rhythms, origin) values
  ('f1400000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-000000000002', 'BTS Gestion', '{}', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001d1","role":"authenticated"}', true);

-- P1 et P6 : les mois facturés, et une ligne sans OUI de l'école qui reste hors du site -----------------------------------------------------
select lives_ok($$select public.set_school_fee('f1200000-0000-4000-8000-000000000001', null, 'primaire', 15000, 20000, 'mois', null, 10000,
    null, current_date - 3, null, 'CP1 à CM2', null, 'prospectus', null, 9)$$,
  'Une ligne au mois, lue sur le prospectus, avec ses 9 mois facturés');
select is((select billed_months || '/' || coalesce(confirmed_on::text, 'sans OUI') from public.campus_fees
           where campus_id = 'f1200000-0000-4000-8000-000000000001'), '9/sans OUI', 'Les mois facturés sont gardés ; la ligne attend le OUI');
select throws_ok($$select public.set_school_fee('f1200000-0000-4000-8000-000000000001', null, 'primaire', 1, 2, 'trimestre', null, null,
    null, current_date - 3, null, 'CE1', null, 'declaration', null, 9)$$, '22023', null,
  'Des mois facturés seulement pour des frais au mois');
select throws_ok($$select public.set_school_fee('f1200000-0000-4000-8000-000000000001', null, 'primaire', 1, 2, 'mois', null, null,
    null, current_date - 3, null, 'CE2', null, 'declaration', null, 13)$$, '22023', null, 'Treize mois facturés : refusé');

set local role anon;
select is((select count(*)::int from public.campus_fees where campus_id = 'f1200000-0000-4000-8000-000000000001'), 0,
  'Sans le OUI de l''école, le public ne lit pas ses frais');

set local role authenticated;
select throws_ok($$select public.confirm_school_fees('f1200000-0000-4000-8000-000000000001', current_date + 2)$$, '22023', null,
  'Un OUI daté du futur est refusé');
select throws_ok($$select public.confirm_school_fees('f1200000-0000-4000-8000-000000000001', current_date - 10)$$, '22023', null,
  'Un OUI ne précède pas la date des frais qu''il confirme');
select is((select public.confirm_school_fees('f1200000-0000-4000-8000-000000000001', current_date - 1)), 1,
  'Le OUI daté de l''école confirme sa ligne');

set local role anon;
select is((select count(*)::int from public.campus_fees where campus_id = 'f1200000-0000-4000-8000-000000000001'), 1,
  'Avec le OUI, le public lit la ligne');

set local role authenticated;
select lives_ok($$select public.set_school_fee('f1200000-0000-4000-8000-000000000001',
    (select id from public.campus_fees where campus_id = 'f1200000-0000-4000-8000-000000000001'), 'primaire', 16000, 21000, 'mois', null, 10000,
    null, current_date - 3, null, 'CP1 à CM2', null, 'prospectus', null, 9)$$, 'Les montants changent');
select ok((select confirmed_on is null from public.campus_fees where campus_id = 'f1200000-0000-4000-8000-000000000001'),
  'Des montants modifiés attendent un nouveau OUI, et quittent le site d''ici là');
select is((select public.confirm_school_fees('f1200000-0000-4000-8000-000000000001', current_date - 1)), 1,
  'Le nouveau OUI confirme les nouveaux montants');
select lives_ok($$select public.set_school_fee('f1200000-0000-4000-8000-000000000001',
    (select id from public.campus_fees where campus_id = 'f1200000-0000-4000-8000-000000000001'), 'primaire', 16000, 21000, 'mois', null, 10000,
    null, current_date - 3, null, 'CP1 à CM2', null, 'prospectus', null, 9)$$, 'La même ligne, enregistrée de nouveau sans changement');
select ok((select confirmed_on is not null from public.campus_fees where campus_id = 'f1200000-0000-4000-8000-000000000001'),
  'Rien n''a changé : le OUI reste');

reset role;
select is((select count(*)::int from prive.campus_fee_history where campus_id = 'f1200000-0000-4000-8000-000000000001' and action = 'confirmation'),
  2, 'Chaque OUI est gardé dans l''historique privé');

-- P2 : les séries du bac admises par une formation ------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.save_program_sheet('f1400000-0000-4000-8000-000000000001', '{"accepted_bac_tracks": ["d", "c", "c"]}'::jsonb)$$,
  'Les séries admises s''enregistrent dans le tiroir de la formation');
select is((select array_to_string(accepted_bac_tracks, ',') from public.campus_programs where id = 'f1400000-0000-4000-8000-000000000001'),
  'c,d', 'Sans doublon, dans l''ordre de la liste');
select throws_ok($$select public.save_program_sheet('f1400000-0000-4000-8000-000000000001', '{"accepted_bac_tracks": ["z9"]}'::jsonb)$$,
  '22023', null, 'Une série hors liste est refusée');
select lives_ok($$select public.save_program_sheet('f1400000-0000-4000-8000-000000000001', '{"accepted_bac_tracks": null}'::jsonb)$$,
  'Les séries peuvent redevenir « pas dit »');
select ok((select accepted_bac_tracks is null from public.campus_programs where id = 'f1400000-0000-4000-8000-000000000001'),
  'Nul : pas dit');

-- P3 : les places annoncées --------------------------------------------------------------------------------------------------------------
select lives_ok($$select public.set_campus_opening('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CP1', 'disponibles', null,
    current_date - 1)$$, 'L''école annonce des places en CP1');
select throws_ok($$select public.set_campus_opening('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CP1', 'peu', null,
    current_date - 1)$$, '22023', null, 'Une seule annonce par classe : elle se modifie');
select throws_ok($$select public.set_campus_opening('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CE1', 'disponibles', null,
    current_date - 31)$$, '22023', null, 'Une annonce de plus de 30 jours ne se publie plus');
select throws_ok($$select public.set_campus_opening('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CE2', 'autre', null,
    current_date)$$, '22023', null, '« Autre » demande une précision');

reset role;
insert into public.campus_openings (campus_id, cycle, level_label, state, said_on)
values ('f1200000-0000-4000-8000-000000000001', 'primaire', 'CM2', 'peu', current_date - 40);
set local role anon;
select is((select string_agg(level_label, ',' order by level_label) from public.campus_openings
           where campus_id = 'f1200000-0000-4000-8000-000000000001'), 'CP1',
  'Le public lit les annonces de moins de 30 jours, pas les plus anciennes');

-- P4 : l'effectif d'une classe, en tranches ---------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.set_campus_class_size('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CM1', '35_a_49', null,
    current_date - 2)$$, 'Un effectif en tranche');
select throws_ok($$select public.set_campus_class_size('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CE1', 'quarante', null,
    current_date - 2)$$, '22023', null, 'Une tranche hors liste est refusée');
set local role anon;
select is((select band::text from public.campus_class_sizes where campus_id = 'f1200000-0000-4000-8000-000000000001'), '35_a_49',
  'Le public lit la tranche d''une école publiée, jamais un nombre exact');

-- Les droits : l'administration aujourd'hui, la direction à l'étape C ----------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000001a1","role":"authenticated"}', true);
select throws_ok($$select public.set_campus_opening('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CE2', 'peu', null, current_date)$$,
  '42501', null, 'Un relais n''annonce pas de places');
select throws_ok($$select public.confirm_school_fees('f1200000-0000-4000-8000-000000000001', current_date)$$,
  '42501', null, 'Un relais ne note pas le OUI d''une école');

-- P5 : les demandes des familles, sans nom ni numéro ------------------------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select public.count_family_demand('verification', repeat('a', 64), 'f1200000-0000-4000-8000-000000000001')), 'comptee',
  'Une famille demande la vérification d''une fiche, sans nom ni numéro');
select is((select public.count_family_demand('verification', repeat('a', 64), 'f1200000-0000-4000-8000-000000000001')), 'deja_comptee',
  'Le même téléphone, le même jour, la même fiche : une seule demande');
select throws_ok($$select count(*) from public.family_demands$$, '42501', null, 'Le public ne lit pas les demandes');
select is((select count(*)::int from public.public_verification_demands where campus_id = 'f1200000-0000-4000-8000-000000000001'), 0,
  'Moins de 5 demandes : leur nombre ne se montre pas');
select is((select public.count_family_demand('verification', repeat('b', 64), 'f1200000-0000-4000-8000-000000000001')
               || public.count_family_demand('verification', repeat('c', 64), 'f1200000-0000-4000-8000-000000000001')
               || public.count_family_demand('verification', repeat('d', 64), 'f1200000-0000-4000-8000-000000000001')
               || public.count_family_demand('verification', repeat('e', 64), 'f1200000-0000-4000-8000-000000000001')),
  'compteecompteecompteecomptee', 'Quatre autres téléphones');
select is((select demands from public.public_verification_demands where campus_id = 'f1200000-0000-4000-8000-000000000001'), 5,
  'À partir de 5, le nombre se montre');
select is((select public.count_family_demand('orientation', repeat('a', 64), null, 'bac', 'sante', null, 'jour', 'd')), 'comptee',
  'Un test d''orientation sans résultat compte sa demande');
select throws_ok($$select public.count_family_demand('orientation', 'pas-une-empreinte', null, 'bac')$$, '22023', null,
  'Sans empreinte lisible, rien n''est compté');
select throws_ok($$select public.set_campus_class_size('f1200000-0000-4000-8000-000000000001', null, 'primaire', 'CE2', '20_a_34', null,
    current_date)$$, '42501', null, 'Le public n''écrit pas un effectif');

select * from finish();
rollback;
