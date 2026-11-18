-- 20261118180000 : une formation s'ajoute depuis la fiche, dans un cycle que le site enseigne déjà.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select public.register_relay('00000000-0000-4000-8000-0000000000d2', 'google-af-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a2', 'google-af-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d2');
insert into public.institutions(id, name, kind) values ('ec200000-0000-4000-8000-000000000001', '[Université Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, position)
select 'ed200000-0000-4000-8000-000000000001', 'ec200000-0000-4000-8000-000000000001', 'universite-exemple', id, 'prete', 'admin',
       extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326)
from public.geo_divisions where level = 3 limit 1;
insert into public.campus_cycles(id, campus_id, cycle) values
  ('ee200000-0000-4000-8000-000000000001', 'ed200000-0000-4000-8000-000000000001', 'superieur');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d2","role":"authenticated"}', true);

select isnt(public.add_campus_program('ed200000-0000-4000-8000-000000000001', 'superieur', '  Licence en droit  '), null,
  'Une école sans formation en reçoit une, et l''identifiant revient');
select is((select title || '/' || origin from public.campus_programs where campus_cycle_id = 'ee200000-0000-4000-8000-000000000001'),
  'Licence en droit/admin', 'L''intitulé est nettoyé ; l''origine est l''administration');
select lives_ok($$select public.save_program_sheet(
    (select id from public.campus_programs where title = 'Licence en droit'), '{"diploma": "licence"}'::jsonb)$$,
  'La formation ajoutée se détaille ensuite comme les autres');

select throws_ok($$select public.add_campus_program('ed200000-0000-4000-8000-000000000001', 'superieur', 'licence EN DROIT')$$,
  '23505', null, 'Deux formations du même cycle ne portent pas le même intitulé');
select throws_ok($$select public.add_campus_program('ed200000-0000-4000-8000-000000000001', 'superieur', '   ')$$,
  '22023', null, 'Un intitulé vide est refusé');
select throws_ok($$select public.add_campus_program('ed200000-0000-4000-8000-000000000001', 'technique', 'BTS')$$,
  '22023', null, 'Un cycle que le site n''enseigne pas est refusé (il s''ajoute dans « En bref »)');
select throws_ok($$select public.add_campus_program('ed200000-0000-4000-8000-000000000001', 'primaire', 'CP1')$$,
  '22023', null, 'Le primaire n''a pas de formations à détailler');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select throws_ok($$select public.add_campus_program('ed200000-0000-4000-8000-000000000001', 'superieur', 'BTS')$$,
  '42501', null, 'Un relais n''ajoute pas de formation');

reset role;
select is((select count(*)::int from prive.program_identity_history h
           join public.campus_programs p on p.id = h.program_id where h.before_data is null and h.campus_id = 'ed200000-0000-4000-8000-000000000001'),
  1, 'L''ajout est gardé dans l''historique');
select is((select count(*)::int from public.campus_programs where campus_cycle_id = 'ee200000-0000-4000-8000-000000000001'),
  1, 'Rien d''autre n''a été ajouté');

select * from finish();
rollback;
