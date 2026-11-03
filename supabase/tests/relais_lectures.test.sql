-- Ce que le relais peut relire de lui-même (ticket #55, PR 3) : toutes ses fiches avec tout ce qu'elles contiennent,
-- et pour chaque école qu'on lui confie ce que NTanova en sait déjà. De quoi préremplir « Compléter » et « Corriger »
-- sans tout redemander. Jamais ce qui est privé : ni le chemin d'une photo, ni le contact de la direction (seulement
-- qu'il existe), ni les fiches des autres.

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000c1', 'google-c1', 'Chloé');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Tié-Tié'));
-- Chloé : en attente, sans lot. Dominique : administratrice, pas relais.

-- Alice : un relevé complet (S1) et une fiche sans photo qu'on lui renvoie (S2). Bastien : un relevé (S3) ------------------------------------

insert into public.field_submissions (id, relay_id, taken_at, position, accuracy_m, sign_name, levels, school_kind, curriculum_note,
                                      landmark, sign_phone, observed_programs, programs_photographed, direction_seen) values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now(),
   extensions.st_setsrid(extensions.st_makepoint(11.92, -4.82), 4326), 12, 'École [Étoile]', '{primaire,college}', 'privee',
   'Programme congolais', 'Face au marché', '242061234501', 'Séries C et D', true, 'vue');
insert into public.field_submissions (id, relay_id, taken_at, sign_name, direction_seen, come_back_note) values
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', now(), 'École [Sans photo]', 'absente', 'Lundi matin'),
  ('51000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b1', now(), 'École [De Bastien]', 'refus', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select public.register_photo('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'signboard', 'image/webp', 150000);
select public.register_photo('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 'programs_board', 'image/jpeg', 90000);
select public.send_contact('51000000-0000-4000-8000-000000000001', 'promoteur', '[Nom]', '242061234599', true, now(), null);
reset role;

-- L'administration renvoie S2 à Alice, accepte S1 (l'école existe alors dans le catalogue) -------------------------------------------------------
select public.request_correction('51000000-0000-4000-8000-000000000002', 'photo_floue', 'Reprenez la photo de face.');
create temp table ecole as select public.accept_submission('51000000-0000-4000-8000-000000000001') as campus_id;
grant select on pg_temp.ecole to authenticated;

-- Ce qu'Alice relit de ses fiches ------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submissions()), 2, 'Alice relit ses deux fiches');
select is((select sign_name || '|' || kind || '|' || array_to_string(levels, '+') || '|' || school_kind || '|' || landmark || '|' || sign_phone
                  || '|' || curriculum_note || '|' || observed_programs || '|' || programs_photographed::text || '|' || direction_seen
           from public.my_submissions() where id = '51000000-0000-4000-8000-000000000001'),
  'École [Étoile]|releve|primaire+college|privee|Face au marché|242061234501|Programme congolais|Séries C et D|true|vue',
  'Une fiche revient avec tout ce qu''elle contient : nom, niveaux, type, repère, numéro, programme, séries, direction');
select is((select round(latitude::numeric, 2)::text || '|' || round(longitude::numeric, 2)::text || '|' || accuracy_m::text
           from public.my_submissions() where id = '51000000-0000-4000-8000-000000000001'),
  '-4.82|11.92|12', 'La position et sa précision reviennent');
select is((select photo_roles from public.my_submissions() where id = '51000000-0000-4000-8000-000000000001'),
  array['programs_board', 'signboard'], 'Les photos reviennent par rôle : on sait qu''une enseigne existe, sans son chemin');
select is((select photo_roles from public.my_submissions() where id = '51000000-0000-4000-8000-000000000002'),
  '{}'::text[], 'Une fiche sans photo n''a aucun rôle de photo');
select is((select has_contact from public.my_submissions() where id = '51000000-0000-4000-8000-000000000001'), true,
  'On sait que le contact de la direction est arrivé');
select is((select has_contact from public.my_submissions() where id = '51000000-0000-4000-8000-000000000002'), false,
  'Et qu''il n''est pas arrivé pour une fiche où la direction était absente');
select is((select come_back_note from public.my_submissions() where id = '51000000-0000-4000-8000-000000000002'), 'Lundi matin',
  'Le « à repasser » revient');
select is((select status || '|' || reason || '|' || message_to_relay from public.my_submissions() where id = '51000000-0000-4000-8000-000000000002'),
  'a_corriger|photo_floue|Reprenez la photo de face.', 'La demande de correction revient avec son motif et son message');
select is((select status || '|' || (campus_id = (select campus_id from pg_temp.ecole))::text from public.my_submissions()
           where id = '51000000-0000-4000-8000-000000000001'), 'accepte|true', 'Une fiche acceptée dit à quelle école elle a donné lieu');
reset role;

-- Ce qu'elle ne voit pas ------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select string_agg(id::text, ',') from public.my_submissions()), '51000000-0000-4000-8000-000000000003',
  'Bastien ne relit que sa fiche, jamais celles d''Alice');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submissions()), 0, 'Un relais en attente ne relit rien');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submissions()), 0, 'Une administratrice qui n''est pas relais ne relit pas les fiches des autres par cette fonction');
reset role;
set local role anon;
select throws_ok($$select * from public.my_submissions()$$, '42501', null, 'Un visiteur n''appelle pas my_submissions');
select throws_ok($$select * from public.my_missions()$$, '42501', null, 'Un visiteur n''appelle pas my_missions');
reset role;
select is(pg_get_function_result('public.my_submissions()'::regprocedure) ~* 'storage_path|whatsapp|msisdn|said_note|agreement', false,
  'my_submissions ne rend aucun champ privé (chemin de photo, numéro, ce qu''a dit la direction)');
select is(has_function_privilege('authenticated', 'public.my_submissions()', 'execute')
          and has_function_privilege('authenticated', 'public.my_missions()', 'execute')
          and not has_function_privilege('anon', 'public.my_submissions()', 'execute')
          and not has_function_privilege('anon', 'public.my_missions()', 'execute'), true,
  'Les connectés appellent les deux fonctions, les visiteurs aucune (les droits survivent à la recréation de my_missions)');

-- Ce que NTanova sait déjà de l'école qu'elle confie ------------------------------------------------------------------------------------------
insert into public.institutions (id, name) values ('a1000000-0000-4000-8000-000000000009', 'École [Sans position]');
insert into public.campuses (id, institution_id, slug, publication, origin)
values ('b1000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000009', 'ecole-sans-position', 'brouillon', 'admin');
select public.assign_mission((select campus_id from pg_temp.ecole), '00000000-0000-4000-8000-0000000000b1', 'complete', 'Confirmer les séries.');
select public.assign_mission('b1000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-0000000000b1', 'locate', 'La situer.');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_missions()), 2, 'Bastien lit ses deux missions');
select is((select name || '|' || kind || '|' || note from public.my_missions() where campus_id = (select campus_id from pg_temp.ecole)),
  'École [Étoile]|complete|Confirmer les séries.', 'Les anciennes colonnes sont inchangées : nom, genre de mission, consigne');
select is((select photo_roles from public.my_missions() where campus_id = (select campus_id from pg_temp.ecole)),
  array['programs_board', 'signboard'], 'Une école relevée avec une enseigne le dit : le relais n''a pas à la reprendre en photo');
select is((select round(latitude::numeric, 2)::text || '|' || round(longitude::numeric, 2)::text
           from public.my_missions() where campus_id = (select campus_id from pg_temp.ecole)), '-4.82|11.92',
  'La position connue de l''école revient');
select is((select verification_state || '|' || contact_confirmed::text from public.my_missions() where campus_id = (select campus_id from pg_temp.ecole)),
  'relevee|false', 'L''école est relevée, et le contact de la direction n''est pas encore confirmé');
select is((select photo_roles from public.my_missions() where campus_id = 'b1000000-0000-4000-8000-000000000009'),
  '{}'::text[], 'Une école sans photo le dit : aucun rôle de photo');
select ok((select latitude is null and longitude is null from public.my_missions() where campus_id = 'b1000000-0000-4000-8000-000000000009'),
  'Une école à situer n''a pas de position : le relais sait qu''il doit la prendre');
reset role;

-- Une fois le contact confirmé et la direction d'accord, le relais le sait ----------------------------------------------------------------------
select public.confirm_contact('51000000-0000-4000-8000-000000000001', 'promoteur');
update public.campuses set verification_state = 'verifiee', verified_on = current_date - 1, verified_role = 'directeur'
where id = (select campus_id from pg_temp.ecole);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select verification_state || '|' || contact_confirmed::text from public.my_missions() where campus_id = (select campus_id from pg_temp.ecole)),
  'verifiee|true', 'Une école vérifiée par la direction, au contact confirmé, le dit : un relevé ne la modifie plus');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_missions()), 0, 'Un autre relais ne voit pas les missions de Bastien');
reset role;
select is((select count(*)::int from public.my_missions()), 0, 'Hors de tout compte, my_missions ne rend rien');

-- Les photos de ses fiches (ticket #72) : identifiant, rôle, chemin relatif ; jamais celles d'un autre ------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select public.register_photo('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000003', 'signboard', 'image/webp', 100000);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submission_photos('51000000-0000-4000-8000-000000000001')), 2,
  'Alice relit les deux photos de sa fiche');
select is((select string_agg(role, ',' order by role) from public.my_submission_photos('51000000-0000-4000-8000-000000000001')),
  'programs_board,signboard', 'avec leur rôle');
select is((select storage_path from public.my_submission_photos('51000000-0000-4000-8000-000000000001') where role = 'signboard'),
  '51000000-0000-4000-8000-000000000001/52000000-0000-4000-8000-000000000001.webp',
  'et leur chemin relatif, celui que le stockage connaît');
select is((select count(*)::int from public.my_submission_photos('51000000-0000-4000-8000-000000000002')), 0,
  'Une fiche sans photo n''en rend aucune : le relais voit qu''il n''en est rien arrivé');
select is((select count(*)::int from public.my_submission_photos('51000000-0000-4000-8000-000000000003')), 0,
  'Alice ne relit pas la photo de la fiche de Bastien');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submission_photos('51000000-0000-4000-8000-000000000003')), 1,
  'Bastien relit la photo de sa fiche');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submission_photos('51000000-0000-4000-8000-000000000001')), 0,
  'Un relais en attente ne relit rien');
reset role;
select is((select count(*)::int from public.my_submission_photos('51000000-0000-4000-8000-000000000001')), 0,
  'Hors de tout compte, rien non plus');
select is(has_function_privilege('anon', 'public.my_submission_photos(uuid)', 'execute'), false,
  'Un visiteur ne peut pas appeler la fonction');

select * from finish();
rollback;
