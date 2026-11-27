-- Ticket 236, point 10 (27/11) : publier une école dont la direction a refusé (ou laissé un mot au relais) demande une
-- confirmation explicite, par les trois publications ; rien n'est bloqué pour toujours, et le mot reste privé.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select public.register_relay('00000000-0000-4000-8000-0000000003a1', 'google-pr-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000003d1', 'google-pr-d1', 'Dominique');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000003d1');
select public.activer_relais('00000000-0000-4000-8000-0000000003a1', (select id from public.lots where nom = 'Ngoyo'));

-- Les envois du relais : un refus avec son mot, un mot sans refus, rien, un refus corrigé ensuite, un refus pas encore décidé.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.field_submissions(id, kind, taken_at, position, sign_name, levels, school_kind, direction_seen)
values ('5b000000-0000-4000-8000-00000000000a', 'releve', now() - interval '2 days', 'SRID=4326;POINT(0 0)', '[École A]', '{primaire}', 'privee', 'refus'),
       ('5b000000-0000-4000-8000-00000000000b', 'releve', now() - interval '2 days', 'SRID=4326;POINT(0 0)', '[École B]', '{primaire}', 'privee', 'vue'),
       ('5b000000-0000-4000-8000-00000000000c', 'releve', now() - interval '2 days', 'SRID=4326;POINT(0 0)', '[École C]', '{primaire}', 'privee', 'vue'),
       ('5b000000-0000-4000-8000-00000000000d', 'releve', now() - interval '2 days', 'SRID=4326;POINT(0 0)', '[École D]', '{primaire}', 'privee', 'refus'),
       ('5b000000-0000-4000-8000-00000000000e', 'releve', now() - interval '2 days', 'SRID=4326;POINT(0 0)', '[École E en attente]', '{primaire}', 'privee', 'refus');
select public.send_contact('5b000000-0000-4000-8000-00000000000a', p_note => 'La direction ne veut pas apparaître');
select public.send_contact('5b000000-0000-4000-8000-00000000000b', p_note => 'Repassez après la rentrée');
reset role;
update public.field_submissions set position = extensions.st_setsrid(extensions.st_makepoint(11.93 + (ascii(right(id::text, 1)) - 97) * 0.001, -4.80), 4326)
where id::text like '5b000000-%';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d1","role":"authenticated"}', true);
set local role authenticated;
create temp table ecoles as
select x.lettre, public.accept_submission(('5b000000-0000-4000-8000-00000000000' || x.lettre)::uuid) as campus_id
from (values ('a'), ('b'), ('c'), ('d')) x(lettre);
-- Une note de l'administration n'est pas un mot de la direction relevé sur place.
select public.add_campus_contact((select campus_id from ecoles where lettre = 'c'), null, null, '[Personne]', null, false, 'Note de NTanova');

select is((select count(*)::int from public.publication_warnings((select array_agg(campus_id) from ecoles))), 3,
  'Trois sites avertis : le refus avec son mot, le mot sans refus, le refus sans mot');
select is((select refused::text || '|' || word || '|' || relay_first_name from public.publication_warnings(array[(select campus_id from ecoles where lettre = 'a')])),
  'true|La direction ne veut pas apparaître|Alice', 'Le mot, sa rencontre et le relais');
select is((select refused::text || '|' || word from public.publication_warnings(array[(select campus_id from ecoles where lettre = 'b')])),
  'false|Repassez après la rentrée', 'Un mot sans refus avertit aussi');
select is((select count(*)::int from public.publication_warnings(array[(select campus_id from ecoles where lettre = 'c')])), 0,
  'Une note de l’administration, ou un relevé encore à décider, n’avertit pas');

select throws_ok($$select public.publish_campus((select campus_id from ecoles where lettre = 'a'))$$, '22023', null,
  'Publier après un refus demande une confirmation');
select is((select publication::text from public.campuses where id = (select campus_id from ecoles where lettre = 'a')), 'prete',
  'Rien ne s’est publié');
select lives_ok($$select public.publish_campus((select campus_id from ecoles where lettre = 'c'))$$, 'Sans mot, la publication ne demande rien');

select is(public.publish_batch((select id from public.lots where nom = 'Ngoyo')), 0,
  'Publier un lot laisse de côté les écoles averties');
select is(public.publish_batch((select id from public.lots where nom = 'Ngoyo'), array[(select campus_id from ecoles where lettre = 'b')]), 1,
  'Sauf celle que la confirmation nomme');
select is((select publication::text from public.campuses where id = (select campus_id from ecoles where lettre = 'b')), 'publiee', 'L’école B est publiée');
select is(public.publish_division((select id from public.geo_divisions where path::text = 'congo.pointe_noire')), 0,
  'Publier une zone laisse aussi de côté les écoles averties');
select is(public.publish_division((select id from public.geo_divisions where path::text = 'congo.pointe_noire'),
  array[(select campus_id from ecoles where lettre = 'd')]), 1, 'Sauf celle que la confirmation nomme');
select lives_ok($$select public.publish_campus((select campus_id from ecoles where lettre = 'a'), true)$$,
  'Confirmée, la publication a lieu : rien n’est bloqué pour toujours');
select lives_ok($$select public.retire_campus((select campus_id from ecoles where lettre = 'a'), 'demande_ecole', null)$$, 'Retirée');
select throws_ok($$select public.publish_campus((select campus_id from ecoles where lettre = 'a'))$$, '22023', null,
  'Republier une école retirée redemande la confirmation');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
select throws_ok($$select * from public.publication_warnings(array[gen_random_uuid()])$$, '42501', null,
  'Un relais ne lit pas les mots de la direction');
reset role;
set local role anon;
select throws_ok($$select * from public.publication_warnings(array[gen_random_uuid()])$$, '42501', null,
  'Le public non plus');
reset role;

select * from finish();
rollback;
