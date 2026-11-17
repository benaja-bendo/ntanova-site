-- 20261117140000 : la visite sur place, un manque (décision du fondateur du 17/11/2026, option B). Une école ajoutée par
-- NTanova, sans passage ni confirmation, le montre dans « À compléter » ; le passage d'un relais ou la confirmation de la
-- direction le retire ; le relais ne le lit jamais pour sa propre fiche.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-vs-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-vs-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
insert into public.institutions(id, name, kind) values ('ec000000-0000-4000-8000-0000000000a1', '[École de la Colline]', 'publique');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, position)
select 'ed000000-0000-4000-8000-0000000000a1', 'ec000000-0000-4000-8000-0000000000a1', 'ecole-de-la-colline', id, 'publiee', 'admin',
       extensions.st_setsrid(extensions.st_makepoint(11.86, -4.76), 4326)
from public.geo_divisions where level = 3 limit 1;
insert into public.field_submissions(id, relay_id, taken_at, sign_name, status, campus_id)
values ('f0000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', now(), '[École de la Colline]', 'accepte',
        'ed000000-0000-4000-8000-0000000000a1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select who_can from public.campus_gaps('ed000000-0000-4000-8000-0000000000a1') where topic = 'visite'), array['relais'],
  'Ajoutée par NTanova, ni vue ni confirmée : la visite sur place manque, et un relais peut la faire');
select lives_ok($$select public.record_campus_request('ed000000-0000-4000-8000-0000000000a1', 'autre', 'visite', 'ecole')$$,
  'Le domaine des sujets accepte toujours les anciennes valeurs');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select ok(not exists (select 1 from public.my_submission_gaps('f0000000-0000-4000-8000-0000000000a1') where topic = 'visite'),
  'Le relais ne lit jamais « visite » pour sa propre fiche');

reset role;
update public.campuses set surveyed_at = now() where id = 'ed000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select ok(not exists (select 1 from public.campus_gaps('ed000000-0000-4000-8000-0000000000a1') where topic = 'visite'),
  'Vue sur place par un relais : le manque disparaît');

reset role;
update public.campuses set surveyed_at = null, verification_state = 'verifiee', verified_on = current_date
where id = 'ed000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select ok(not exists (select 1 from public.campus_gaps('ed000000-0000-4000-8000-0000000000a1') where topic = 'visite'),
  'Confirmée par la direction : le manque disparaît aussi');

reset role;
select is((select count(*)::int from pg_constraint c join pg_type t on t.oid = c.contypid
           where t.typname = 'request_topic' and pg_get_constraintdef(c.oid) like '%visite%'), 1,
  'Le sujet « visite » fait partie des sujets connus');

select * from finish();
rollback;
