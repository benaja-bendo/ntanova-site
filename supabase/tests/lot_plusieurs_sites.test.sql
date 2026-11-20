-- 20261120210000 : plusieurs sites (ticket 203). Copier des formations d'un site à un autre site de la même école (A3, A24).
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select public.register_relay('00000000-0000-4000-8000-0000000004d1', 'google-ps-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000004a1', 'google-ps-relais', '[Relais]');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000004d1');
insert into public.institutions (id, name, kind) values
  ('f4100000-0000-4000-8000-000000000001', '[Institut Kaba]', 'privee'),
  ('f4100000-0000-4000-8000-000000000002', '[Institut Voisin]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, origin, publication, label)
select x.id::uuid, x.inst::uuid, x.slug, d.id, 'admin', 'brouillon', x.label
from (values
  ('f4200000-0000-4000-8000-000000000001', 'f4100000-0000-4000-8000-000000000001', 'institut-kaba-1', 'Site 1'),
  ('f4200000-0000-4000-8000-000000000002', 'f4100000-0000-4000-8000-000000000001', 'institut-kaba-2', 'Site 2'),
  ('f4200000-0000-4000-8000-000000000003', 'f4100000-0000-4000-8000-000000000001', 'institut-kaba-3', 'Site 3'),
  ('f4200000-0000-4000-8000-000000000004', 'f4100000-0000-4000-8000-000000000002', 'institut-voisin', null)
) as x(id, inst, slug, label)
cross join (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.campus_cycles (id, campus_id, cycle) values
  ('f4300000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001', 'superieur'),
  ('f4300000-0000-4000-8000-000000000002', 'f4200000-0000-4000-8000-000000000002', 'superieur'),
  ('f4300000-0000-4000-8000-000000000004', 'f4200000-0000-4000-8000-000000000004', 'superieur');
-- Le site 3 n'enseigne pas le supérieur.
insert into public.campus_cycles (campus_id, cycle) values ('f4200000-0000-4000-8000-000000000003', 'lycee');
insert into public.campus_programs (id, campus_cycle_id, title, rhythms, origin, duration_years, diploma, admission_level,
                                    details_declared_on, accepted_bac_tracks, application_fee_xaf, application_fee_confirmed_on) values
  ('f4400000-0000-4000-8000-000000000001', 'f4300000-0000-4000-8000-000000000001', 'Licence Gestion', '{jour}', 'admin', 3, 'licence', 'Bac',
   current_date - 3, '{g2}', 25000, current_date - 1),
  ('f4400000-0000-4000-8000-000000000002', 'f4300000-0000-4000-8000-000000000001', 'BTS Transit', '{soir}', 'admin', 2, 'bts', 'Bac',
   current_date - 3, null, null, null),
  ('f4400000-0000-4000-8000-000000000003', 'f4300000-0000-4000-8000-000000000001', 'Master Audit', '{}', 'admin', null, null, null,
   null, null, null, null),
  ('f4400000-0000-4000-8000-000000000004', 'f4300000-0000-4000-8000-000000000004', 'Licence Voisine', '{}', 'admin', null, null, null,
   null, null, null, null);

-- Le relais ne copie rien ----------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select throws_ok($$select public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000002',
    array['f4400000-0000-4000-8000-000000000001']::uuid[])$$, '42501', null, 'Un relais ne copie pas de formations');

-- L'administration copie ---------------------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d1","role":"authenticated"}', true);
select is(public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000002',
    array['f4400000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000002']::uuid[]), 2,
  'Deux formations cochées : deux formations copiées');
reset role;
select is((select string_agg(p.title, ',' order by p.title) from public.campus_programs p
           where p.campus_cycle_id = 'f4300000-0000-4000-8000-000000000002'),
  'BTS Transit,Licence Gestion', 'Seules les formations cochées arrivent sur le site 2');
select is((select format('%s|%s|%s|%s|%s|%s', p.duration_years, p.diploma, p.admission_level, p.details_declared_on = current_date - 3,
                         p.accepted_bac_tracks, p.rhythms)
           from public.campus_programs p where p.campus_cycle_id = 'f4300000-0000-4000-8000-000000000002' and p.title = 'Licence Gestion'),
  '3.0|licence|Bac|t|{g2}|{jour}', 'Le détail de la formation est copié');
select ok((select p.application_fee_xaf is null and p.application_fee_confirmed_on is null from public.campus_programs p
           where p.campus_cycle_id = 'f4300000-0000-4000-8000-000000000002' and p.title = 'Licence Gestion'),
  'Le frais de dossier n''est pas copié : chaque site a ses frais et son OUI');
select ok((select p.application_fee_xaf = 25000 from public.campus_programs p where p.id = 'f4400000-0000-4000-8000-000000000001'),
  'Le site d''origine garde le sien');
select is((select count(*)::int from prive.program_identity_history h
           where h.campus_id = 'f4200000-0000-4000-8000-000000000002' and h.before_data is null),
  2, 'Chaque formation copiée est gardée dans l''historique');

set local role authenticated;
select is(public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000002',
    array['f4400000-0000-4000-8000-000000000001', 'f4400000-0000-4000-8000-000000000003']::uuid[]), 1,
  'Une formation déjà sur le site n''est pas copiée deux fois');
select is((select count(*)::int from public.campus_programs p where p.campus_cycle_id = 'f4300000-0000-4000-8000-000000000002'), 3,
  'Le site 2 a trois formations, sans doublon');

-- Ce qui est refusé ---------------------------------------------------------------------------------------------------------------------------------
select throws_ok($$select public.copy_campus_programs('f4200000-0000-4000-8000-000000000004', 'f4200000-0000-4000-8000-000000000002',
    array['f4400000-0000-4000-8000-000000000004']::uuid[])$$, '22023', null, 'Pas de copie entre deux écoles différentes');
select throws_ok($$select public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000002',
    array['f4400000-0000-4000-8000-000000000004']::uuid[])$$, '22023', null, 'Une formation d''un autre site est refusée');
select throws_ok($$select public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000003',
    array['f4400000-0000-4000-8000-000000000002']::uuid[])$$, '22023', null, 'Le site cible doit enseigner le cycle');
select throws_ok($$select public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000002',
    '{}'::uuid[])$$, '22023', null, 'Rien de coché : refusé');
select throws_ok($$select public.copy_campus_programs('f4200000-0000-4000-8000-000000000001', 'f4200000-0000-4000-8000-000000000001',
    array['f4400000-0000-4000-8000-000000000002']::uuid[])$$, '22023', null, 'Pas de copie d''un site sur lui-même');

select * from finish();
rollback;
