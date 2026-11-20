-- 20261120230000 : la saisie (ticket 205). Agrément cité par l'école sans date (A22), diplômes (A29), canal « au fondateur »
-- (A28), « En couverture » (A32), source d'une image (A34), document jamais public (A6), numéro de l'école (A8, A19),
-- plusieurs rentrées (A25), page Facebook (A21).
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select public.register_relay('00000000-0000-4000-8000-0000000005d1', 'google-sa-admin', '[Admin]');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000005d1');
insert into public.institutions (id, name, kind) values ('f5100000-0000-4000-8000-000000000001', '[Institut Saisie]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, origin, publication, position)
select 'f5200000-0000-4000-8000-000000000001', 'f5100000-0000-4000-8000-000000000001', 'institut-saisie', d.id, 'admin', 'publiee',
       extensions.st_setsrid(extensions.st_makepoint(11.86, -4.79), 4326)
from (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.campus_cycles (id, campus_id, cycle) values
  ('f5300000-0000-4000-8000-000000000001', 'f5200000-0000-4000-8000-000000000001', 'superieur');
insert into public.campus_programs (id, campus_cycle_id, title, rhythms, origin) values
  ('f5400000-0000-4000-8000-000000000001', 'f5300000-0000-4000-8000-000000000001', 'Cycle ingénieur', '{}', 'admin');
-- Une couverture et douze images de galerie (la galerie est pleine).
insert into public.campus_media (id, campus_id, kind, subject, storage_path, source, child_free_checked_at, is_public, sort_order)
values ('f5500000-0000-4000-8000-0000000000c0', 'f5200000-0000-4000-8000-000000000001', 'cover', 'batiment',
        'ecoles/f52/couverture.webp', 'administration', now(), true, 0);
insert into public.campus_media (id, campus_id, kind, subject, storage_path, source, child_free_checked_at, is_public, sort_order)
select ('f5500000-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'f5200000-0000-4000-8000-000000000001', 'gallery', 'cour',
       'ecoles/f52/galerie-' || n || '.webp', 'administration', now(), true, n
from generate_series(1, 12) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000005d1","role":"authenticated"}', true);

-- A22 : un agrément cité par l'école, sans date ------------------------------------------------------------------------------------------------
select lives_ok($$select public.set_campus_accreditation('f5200000-0000-4000-8000-000000000001', null, 'agrement', null, 'arrêté n° 0445',
    null, 'Le prospectus de l''école', null, current_date - 1, 'dit_ecole')$$,
  'Un agrément cité par l''école se note sans la date du document');
reset role;
select is((select evidence || '|' || coalesce(issued_on::text, 'sans date') from public.campus_accreditations
           where campus_id = 'f5200000-0000-4000-8000-000000000001'),
  'dit_ecole|sans date', 'Il est gardé « dit par l''école », sans date');
set local role authenticated;
select throws_ok($$select public.set_campus_accreditation('f5200000-0000-4000-8000-000000000001', null, 'agrement', null, 'arrêté n° 0445',
    null, 'Le document vu', null, current_date - 1, 'document_vu')$$, '22023', null,
  'Un document vu garde sa date obligatoire');
select lives_ok($$select public.set_campus_accreditation('f5200000-0000-4000-8000-000000000001', null, 'agrement', null, 'arrêté n° 0445',
    current_date - 400, 'Le document vu', null, current_date - 1)$$,
  'Sans dire la preuve, un agrément daté s''enregistre comme avant');
set local role anon;
select is((select evidence from public.public_campus_accreditations where campus_id = 'f5200000-0000-4000-8000-000000000001'),
  'dit_ecole', 'Le visiteur lit qu''il est cité par l''école : la preuve n''a pas changé');

-- A29 : les diplômes ------------------------------------------------------------------------------------------------------------------------------
reset role;
select lives_ok($$update public.campus_programs set diploma = 'ingenieur' where id = 'f5400000-0000-4000-8000-000000000001'$$,
  'Le diplôme d''ingénieur existe');
select lives_ok($$select 'bachelor'::public.diploma_kind, 'dut'::public.diploma_kind, 'cqp'::public.diploma_kind$$,
  'Bachelor, DUT et CQP aussi');

-- A28 : l'accord donné au fondateur --------------------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.set_campus_statement('f5200000-0000-4000-8000-000000000001', 'Bienvenue.', current_date - 1,
    'directeur', 'fondateur')$$, 'Le mot de la direction, accord donné au fondateur');
select lives_ok($$select public.set_school_public_contact('f5200000-0000-4000-8000-000000000001', '242060000001', current_date - 1,
    'directeur', 'fondateur')$$, 'Le numéro public, accord donné au fondateur');
select throws_ok($$select public.set_campus_statement('f5200000-0000-4000-8000-000000000001', 'Bienvenue.', current_date - 1,
    'directeur', 'pigeon')$$, '22023', null, 'Un canal hors liste reste refusé');
reset role;
select is((select channel from prive.campus_statement_agreements where campus_id = 'f5200000-0000-4000-8000-000000000001'
           order by recorded_at desc limit 1), 'fondateur', 'Le canal est gardé avec l''accord');

-- A32 : « En couverture », même galerie pleine ---------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.set_campus_cover('f5500000-0000-4000-8000-000000000005')$$,
  'Une image de la galerie passe en couverture, même galerie pleine');
reset role;
select is((select kind::text from public.campus_media where id = 'f5500000-0000-4000-8000-000000000005'), 'cover',
  'Elle est la couverture');
select is((select kind::text from public.campus_media where id = 'f5500000-0000-4000-8000-0000000000c0'), 'gallery',
  'L''ancienne couverture repasse dans la galerie');
select is((select count(*)::int from public.campus_media where campus_id = 'f5200000-0000-4000-8000-000000000001' and kind = 'gallery'),
  12, 'La galerie garde douze images');

-- A34 : d'où vient une image ---------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.set_campus_media_source('f5500000-0000-4000-8000-000000000001', 'Page Facebook de l''école, 20/11')$$,
  'On note d''où vient une image');
reset role;
select is((select source_note from public.campus_media where id = 'f5500000-0000-4000-8000-000000000001'),
  'Page Facebook de l''école, 20/11', 'La source est gardée, en privé');

-- A6 : un document, jamais public ----------------------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.add_campus_media('f5200000-0000-4000-8000-000000000001', 'document', 'prospectus', null,
    'ecoles/f52/prospectus.webp', null, 'image/webp', 800, 1200, 'Prospectus 2026')$$, 'Un prospectus s''ajoute comme document');
select throws_ok($$select public.set_campus_media((select id from public.campus_media where kind = 'document'
    and campus_id = 'f5200000-0000-4000-8000-000000000001'), null, null, true, true)$$, null, null,
  'Un document ne se publie jamais');
set local role anon;
select is((select count(*)::int from public.public_campus_media where kind = 'document'), 0, 'Aucun document n''est public');

-- A8 et A19 : le numéro de l'école ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select lives_ok($$select public.add_school_number('f5200000-0000-4000-8000-000000000001', '242060000009', 'prospectus', false, null)$$,
  'Le numéro de l''école lu sur un prospectus se note sans accord de personne');
select lives_ok($$select public.add_school_number('f5200000-0000-4000-8000-000000000001', null, 'enseigne', true, '06 506 ou 508 40 46')$$,
  'Un numéro illisible en partie se garde en mots');
select throws_ok($$select public.add_school_number('f5200000-0000-4000-8000-000000000001', null, 'enseigne', false, null)$$, '22023', null,
  'Sans numéro ni lecture, rien n''est noté');
select is((select string_agg(kind || ':' || coalesce(read_on, '-') || ':' || illegible::text, ',' order by illegible)
           from public.contacts_of_campus('f5200000-0000-4000-8000-000000000001') where kind = 'numero_ecole'),
  'numero_ecole:prospectus:false,numero_ecole:enseigne:true', 'L''admin lit les deux numéros, où ils ont été lus');

-- A25 : plusieurs rentrées -----------------------------------------------------------------------------------------------------------------------
select lives_ok($$select public.set_campus_admission('f5200000-0000-4000-8000-000000000001', '2026-2027', '{}', null, false, current_date - 1,
    jsonb_build_array(
      jsonb_build_object('step', 'dossiers', 'starts_on', '2026-08-01'),
      jsonb_build_object('step', 'rentree', 'starts_on', '2026-10-12'),
      jsonb_build_object('step', 'rentree', 'starts_on', '2027-01-04', 'label', '2e rentrée')))$$,
  'Deux rentrées dans la même année, la seconde avec son libellé');
set local role anon;
select is((select jsonb_array_length(steps) from public.public_campus_admissions where campus_id = 'f5200000-0000-4000-8000-000000000001'),
  3, 'Le visiteur lit les trois dates');
set local role authenticated;
select throws_ok($$select public.set_campus_admission('f5200000-0000-4000-8000-000000000001', '2026-2027', '{}', null, false, current_date - 1,
    jsonb_build_array(jsonb_build_object('step', 'rentree', 'starts_on', '2026-10-12'),
                      jsonb_build_object('step', 'rentree', 'starts_on', '2027-01-04')))$$, '22023', null,
  'Deux rentrées sans libellé pour les distinguer : refusé');

-- A11 : l'import d'une formation, avec son détail ------------------------------------------------------------------------------------------------
reset role;
select is(public.upsert_programs('f5200000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object(
    'cycle', 'superieur', 'title', 'Licence Import', 'duration_years', 3, 'admission_level', 'Bac', 'declared_on', current_date - 2)),
  'admin'), 1, 'Une formation importée garde sa durée, son niveau et le jour où l''école l''a dit');
select is((select format('%s|%s|%s', duration_years, admission_level, details_declared_on = current_date - 2) from public.campus_programs
           where title = 'Licence Import'), '3.0|Bac|t', 'Le détail est gardé');
select throws_ok($$select public.upsert_programs('f5200000-0000-4000-8000-000000000001', jsonb_build_array(jsonb_build_object(
    'cycle', 'superieur', 'title', 'Master Import', 'duration_years', 2)), 'admin')$$, '22023', null,
  'Une durée sans le jour où l''école l''a dit est refusée');

select * from finish();
rollback;
