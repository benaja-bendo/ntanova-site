-- M5 à M9 (20261113100400 à 20261113100800) : frais par classe et par formation, manques demandés, nouvelles, admission,
-- et les lectures (école connue, liste nationale, historique).
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-fm-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-fm-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
insert into public.institutions(id, name, kind) values ('ec000000-0000-4000-8000-000000000001', '[Complexe scolaire Les Palmiers]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, position)
select 'ed000000-0000-4000-8000-000000000001', 'ec000000-0000-4000-8000-000000000001', 'cs-les-palmiers', id, 'publiee', 'admin',
       extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326)
from public.geo_divisions where level = 3 limit 1;
insert into public.campus_cycles(id, campus_id, cycle) values
  ('ee000000-0000-4000-8000-000000000001', 'ed000000-0000-4000-8000-000000000001', 'primaire'),
  ('ee000000-0000-4000-8000-000000000002', 'ed000000-0000-4000-8000-000000000001', 'superieur');
insert into public.campus_programs(id, campus_cycle_id, title, diploma, rhythms, origin)
values ('ef000000-0000-4000-8000-000000000001', 'ee000000-0000-4000-8000-000000000002', 'BTS Gestion', 'bts', '{jour}', 'admin');
insert into public.field_submissions(id, relay_id, taken_at, sign_name, status, campus_id)
values ('f0000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now(), '[CS Les Palmiers]', 'accepte', 'ed000000-0000-4000-8000-000000000001');
insert into public.field_submission_photos(id, submission_id, role, storage_path, mime, bytes)
values ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'brochure', 'f0000000-0000-4000-8000-000000000001/p.webp', 'image/webp', 1000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

-- M5. Les frais par classe, par formation, et leur preuve ---------------------------------------------------------------------------------------
select lives_ok($$select public.set_school_fee('ed000000-0000-4000-8000-000000000001', null, 'primaire', 10000, 10000, 'mois', null, 5000,
    '2026-2027', current_date, null)$$, 'L''ancien appel (un tarif par cycle) marche toujours');
select lives_ok($$select public.set_school_fee('ed000000-0000-4000-8000-000000000001', null, 'primaire', 12000, 12000, 'mois', null, 5000,
    '2026-2027', current_date, null, 'CM2', null, 'prospectus', 'f1000000-0000-4000-8000-000000000001')$$,
  'Une ligne pour une classe, prouvée par le prospectus photographié');
select lives_ok($$select public.set_school_fee('ed000000-0000-4000-8000-000000000001', null, 'superieur', 350000, 350000, 'annee', null, null,
    '2026-2027', current_date, null, null, 'ef000000-0000-4000-8000-000000000001')$$, 'Les frais d''une formation du supérieur');
select throws_ok($$select public.set_school_fee('ed000000-0000-4000-8000-000000000001', null, 'primaire', 1, 1, 'mois', null, null,
    '2026-2027', current_date, null, 'CE1', 'ef000000-0000-4000-8000-000000000001')$$, '22023', null,
  'Une formation du supérieur ne se pose pas sur le primaire');
reset role;
select throws_ok($$delete from public.campus_programs where id = 'ef000000-0000-4000-8000-000000000001'$$, '22023', null,
  'Une formation qui porte des frais ne part pas en silence');
set local role anon;
select is((select count(*)::int from public.campus_fees where campus_id = 'ed000000-0000-4000-8000-000000000001'), 3,
  'Un visiteur lit les trois lignes d''une école publiée');
reset role;
select ok(not (select is_public from public.field_submission_photos where id = 'f1000000-0000-4000-8000-000000000001'),
  'La photo du prospectus reste privée : seule la ligne recopiée est publique');

-- M6. Les manques et les demandes ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select string_agg(topic, ',' order by topic) from public.campus_gaps('ed000000-0000-4000-8000-000000000001')),
  'agrement,contact,logo,photos', 'Ce qui manque : agrément, contact, logo, photos (les frais sont là)');
select lives_ok($$select public.record_campus_request('ed000000-0000-4000-8000-000000000001', 'logo', null, 'ecole')$$,
  'Au retour de WhatsApp : le logo est demandé à l''école');
select lives_ok($$select public.record_campus_request('ed000000-0000-4000-8000-000000000001', 'frais', 'Frais de la 3e, illisible sur le prospectus', 'ecole')$$,
  'Une ligne illisible devient une demande précisée');
select is((select requested_to from public.campus_gaps('ed000000-0000-4000-8000-000000000001') where topic = 'logo'), 'ecole',
  '« Logo : demandé à l''école »');
select is((select detail from public.campus_gaps('ed000000-0000-4000-8000-000000000001') where topic = 'frais'), 'Frais de la 3e, illisible sur le prospectus',
  'Le manque que le calcul ne voit pas apparaît par sa demande');
select throws_ok($$select public.record_campus_request('ed000000-0000-4000-8000-000000000001', 'photos', null, 'relais')$$, '22023', null,
  'Une demande à un relais passe par sa mission');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select string_agg(topic, ',' order by topic) from public.my_submission_gaps('f0000000-0000-4000-8000-000000000001')),
  'agrement,contact,frais,logo,photos', 'Le relais lit les sujets qui manquent à sa fiche, sans date ni contact');
select throws_ok($$select * from public.campus_gaps('ed000000-0000-4000-8000-000000000001')$$, '42501', null, 'Mais pas les demandes de l''administration');

-- M7. Les nouvelles : jamais sans l'accord de l'école ----------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.set_campus_post('ed000000-0000-4000-8000-000000000001', null, 'evenement', 'Portes ouvertes', 'Visite des classes.',
    null, current_date, true, null, null, null)$$, '22023', null, 'Sans accord de l''école, rien ne paraît');
select lives_ok($$select public.set_campus_post('ed000000-0000-4000-8000-000000000001', null, 'evenement', 'Portes ouvertes', 'Visite des classes.',
    null, current_date, true, 'directeur', 'whatsapp', current_date)$$, 'Avec l''accord, la nouvelle est publiée');
reset role;
set local role anon;
select is((select title from public.public_campus_posts), 'Portes ouvertes', 'Un visiteur la lit');
reset role;

-- M8. Le supérieur : la formation, l'admission, la preuve ----------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$select public.set_program_details('ef000000-0000-4000-8000-000000000001', 2, 'Bac, toutes séries', 'dossier', 15000, '[Établissement]', current_date)$$,
  'Le détail d''une formation, avec « diplôme délivré par »');
select lives_ok($$select public.set_campus_admission('ed000000-0000-4000-8000-000000000001', '2026-2027', '{"Un acte de naissance","4 photos d''identité"}',
    'Au secrétariat', true, current_date, '[{"step":"dossiers","starts_on":"2026-06-01","ends_on":"2026-07-15"},{"step":"rentree","starts_on":"2026-10-05"}]')$$,
  'L''admission : pièces, lieu, « sur place uniquement », calendrier');
select throws_ok($$select public.set_campus_admission('ed000000-0000-4000-8000-000000000001', '2026-2027', '{}', null, false, current_date,
    '[{"step":"resultats","starts_on":"2026-07-15","ends_on":"2026-07-01"}]')$$, '22023', null, 'Une fin avant le début est refusée');
reset role;
set local role anon;
select is((select on_site_only::text || '/' || jsonb_array_length(steps) from public.public_campus_admissions), 'true/2',
  'Un visiteur lit l''admission et son calendrier');
select is((select diploma_issuer from public.public_campus_programs where program_id = 'ef000000-0000-4000-8000-000000000001'), '[Établissement]',
  'Et le détail de la formation');
reset role;

-- M9. Les lectures --------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select verdict from public.similar_schools('Complexe scolaire Les Palmiers', -4.8001, 11.8501) where id = 'ed000000-0000-4000-8000-000000000001'),
  'deja_la', 'Même nom à 15 m : le même endroit');
select is((select verdict from public.similar_schools('CS les Palmier', -4.70, 11.95) where id = 'ed000000-0000-4000-8000-000000000001'),
  'autre_site', 'Même nom (avec une faute), à 15 km : un autre site possible');
select is((select count(*)::int from public.similar_schools('Complexe scolaire', null, null)), 0,
  'Un nom fait seulement de mots génériques ne rapproche jamais');
select ok((select count(*) > 0 from public.campus_history('ed000000-0000-4000-8000-000000000001') where topic = 'frais'),
  'L''historique du site liste les gestes datés');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select sites from public.known_institutions_for_me() where id = 'ec000000-0000-4000-8000-000000000001'), 1,
  'Le relais garde la liste nationale légère des écoles');

select * from finish();
rollback;
