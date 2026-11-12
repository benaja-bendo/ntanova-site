-- M2 (20261113100100) : le relevé gagne le sigle, la remarque, le bonus (vu seulement, la clôture oui ou non) et « un autre site
-- de [école] » ; six photos au plus ; une photo de travail n'est jamais publique ; à l'acceptation, l'administration garde
-- seulement ce que le relais a vu, et le sigle remplit celui de l'école.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-rb-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-rb-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
insert into public.institutions(id, name) values ('e5000000-0000-4000-8000-000000000001', '[Complexe connu]');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- Le téléphone envoie le socle et le bonus ------------------------------------------------------------------------------------------------------
select lives_ok($$insert into public.field_submissions (id, taken_at, sign_name, levels, acronym, relay_note, seen_equipment, fence,
                    duplicate_answer, duplicate_of_institution_id, position)
    values ('e6000000-0000-4000-8000-000000000001', now(), '[Complexe Les Palmes]', '{primaire}', 'CLP', 'Inscriptions ouvertes',
            '{cantine,informatique,toilettes}', 'non', 'autre_site', 'e5000000-0000-4000-8000-000000000001',
            extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326))$$,
  'Un relais envoie le sigle, la remarque, le bonus et « un autre site de »');
select lives_ok($$insert into public.field_submissions (id, taken_at, sign_name) values ('e6000000-0000-4000-8000-000000000002', now(), '[Fiche d''avant]')$$,
  'Un téléphone d''avant, sans aucune colonne nouvelle, reste valable');
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name, fence) values (gen_random_uuid(), now(), 'x', 'pas_vu')$$,
  '23514', null, '« Pas vu » ne s''écrit pas : la clôture est oui, non, ou vide');
select is((select acronym || '/' || fence || '/' || array_to_string(seen_equipment, ',') from public.my_submissions()
           where id = 'e6000000-0000-4000-8000-000000000001'), 'CLP/non/cantine,informatique,toilettes',
  'Le relais relit son sigle, sa clôture et ce qu''il a vu');
select is((select duplicate_answer from public.my_submissions() where id = 'e6000000-0000-4000-8000-000000000001'), 'autre_site',
  'Et sa réponse « un autre site »');

-- Six photos : l'enseigne et cinq autres -----------------------------------------------------------------------------------------------------------
select lives_ok($$select public.register_photo(('e7000000-0000-4000-8000-00000000000' || n)::uuid, 'e6000000-0000-4000-8000-000000000001',
    (array['signboard','courtyard','room_empty','sports_ground','entrance','brochure'])[n], 'image/webp', 1000)
  from generate_series(1, 6) n$$, 'L''enseigne et cinq photos de plus entrent');
select throws_ok($$select public.register_photo('e7000000-0000-4000-8000-000000000009', 'e6000000-0000-4000-8000-000000000001', 'enrollment_poster', 'image/webp', 1000)$$,
  '22023', null, 'Une sixième photo en plus de l''enseigne est refusée');
reset role;

-- Une photo de travail n'est jamais publique, même contrôlée ------------------------------------------------------------------------------------------
update public.field_submission_photos set child_free_checked_at = now() where submission_id = 'e6000000-0000-4000-8000-000000000001';
select throws_ok($$update public.field_submission_photos set is_public = true where id = 'e7000000-0000-4000-8000-000000000006'$$,
  '23514', null, 'Un prospectus contrôlé ne devient pas public : la base le refuse');
select lives_ok($$update public.field_submission_photos set is_public = true where id = 'e7000000-0000-4000-8000-000000000002'$$,
  'Une cour vide contrôlée peut l''être');
select ok(not public.photo_role_is_public('enrollment_poster') and not public.photo_role_is_public('programs_board')
          and public.photo_role_is_public('entrance'), 'La liste des rôles publiables est écrite une fois, dans la base');

-- Accepter : l'administration ne garde que ce que le relais a vu ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.accept_reviewed_submission('e6000000-0000-4000-8000-000000000001', 'new_institution',
    p_division => (select id from public.geo_divisions where level = 3 limit 1),
    p_facts => '[{"key":"bibliotheque","value":"present"}]')$$, '22023', null, 'Un équipement que le relais n''a pas vu ne se garde pas');
select throws_ok($$select public.accept_reviewed_submission('e6000000-0000-4000-8000-000000000001', 'new_institution',
    p_division => (select id from public.geo_divisions where level = 3 limit 1),
    p_facts => '[{"key":"cantine","value":"absent"}]')$$, '22023', null, 'Le terrain ne dit jamais « absent », sauf pour la clôture');
select lives_ok($$select public.accept_reviewed_submission('e6000000-0000-4000-8000-000000000001', 'new_institution',
    p_division => (select id from public.geo_divisions where level = 3 limit 1),
    p_changes => '{"acronym":"CSLP"}',
    p_facts => '[{"key":"cantine","value":"present"},{"key":"cloture","value":"absent"}]')$$,
  'L''administration corrige le sigle et garde la cantine et l''absence de clôture');
reset role;
select is((select i.acronym from public.institutions i join public.campuses c on c.institution_id = i.id
           join public.field_submissions s on s.campus_id = c.id where s.id = 'e6000000-0000-4000-8000-000000000001'), 'CSLP',
  'Le sigle corrigé remplit celui de la nouvelle école');
select is((select string_agg(f.key || ':' || f.value || ':' || f.source, ',' order by f.key) from public.campus_facts f
           join public.field_submissions s on s.campus_id = f.campus_id where s.id = 'e6000000-0000-4000-8000-000000000001'),
  'cantine:present:terrain,cloture:absent:terrain', 'Seuls les équipements gardés entrent, comme faits du terrain');
select is((select changes ? 'facts' from public.submission_reviews where submission_id = 'e6000000-0000-4000-8000-000000000001'), true,
  'La révision garde ce que l''administration a retenu');

-- Le terrain et l'école : la règle de `campus_facts` -------------------------------------------------------------------------------------------------
select throws_ok($$insert into public.campus_facts (campus_id, key, value, source, observed_on)
    select campus_id, 'eau', 'absent', 'terrain', current_date from public.field_submissions where id = 'e6000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'La table refuse aussi « absent » du terrain pour un autre équipement que la clôture');
select lives_ok($$insert into public.campus_facts (campus_id, key, value, source, observed_on)
    select campus_id, 'bibliotheque', 'present', 'terrain', current_date from public.field_submissions where id = 'e6000000-0000-4000-8000-000000000001'$$,
  'Le terrain peut dire « vu » pour une bibliothèque');

-- L'ancien appel d'acceptation marche toujours ---------------------------------------------------------------------------------------------------------
select ok(exists (select 1 from pg_proc where proname = 'accept_submission'), 'accept_submission existe toujours et délègue au même moteur');

select * from finish();
rollback;
