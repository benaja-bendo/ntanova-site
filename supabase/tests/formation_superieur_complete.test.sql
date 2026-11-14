-- 20261114100000 : le tiroir « modifier une formation » du supérieur enregistre tous les champs de la planche en un geste.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-fs-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-fs-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
insert into public.institutions(id, name, kind) values ('ec100000-0000-4000-8000-000000000001', '[Institut supérieur Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, position)
select 'ed100000-0000-4000-8000-000000000001', 'ec100000-0000-4000-8000-000000000001', 'institut-exemple', id, 'publiee', 'admin',
       extensions.st_setsrid(extensions.st_makepoint(11.85, -4.80), 4326)
from public.geo_divisions where level = 3 limit 1;
insert into public.campus_cycles(id, campus_id, cycle) values
  ('ee100000-0000-4000-8000-000000000001', 'ed100000-0000-4000-8000-000000000001', 'superieur');
insert into public.campus_programs(id, campus_cycle_id, title, rhythms, origin) values
  ('ef100000-0000-4000-8000-000000000001', 'ee100000-0000-4000-8000-000000000001', 'Licence droit', '{}', 'admin'),
  ('ef100000-0000-4000-8000-000000000002', 'ee100000-0000-4000-8000-000000000001', 'BTS Gestion', '{}', 'admin');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

select lives_ok($$select public.save_program_sheet('ef100000-0000-4000-8000-000000000001', jsonb_build_object(
    'title', 'Licence en droit des affaires', 'diploma', 'licence', 'domain', 'droit', 'rhythms', '["jour","soir"]'::jsonb,
    'duration_years', 3, 'diploma_issuer', '[Université partenaire]', 'admission_level', 'Bac', 'selection', 'dossier_entretien',
    'application_fee_xaf', 15000, 'annual_fee_xaf', 450000, 'declared_on', current_date,
    'authorization', jsonb_build_object('reference', 'n° 123/MES', 'issued_on', '2024-09-01', 'evidence', 'document_vu')))$$,
  'Toute la planche s''enregistre d''un geste');
select is((select title || '/' || diploma || '/' || array_to_string(rhythms, ',') from public.campus_programs where id = 'ef100000-0000-4000-8000-000000000001'),
  'Licence en droit des affaires/licence/jour,soir', 'Intitulé, diplôme et rythme');
select is((select d.slug::text from public.campus_programs p join public.education_domains d on d.id = p.domain_id where p.id = 'ef100000-0000-4000-8000-000000000001'),
  'droit', 'Le domaine');
select is((select duration_years::text || '/' || admission_level || '/' || selection || '/' || application_fee_xaf || '/' || diploma_issuer
           from public.campus_programs where id = 'ef100000-0000-4000-8000-000000000001'),
  '3.0/Bac/dossier_entretien/15000/[Université partenaire]', 'Durée, admission, frais de dossier, délivré par');
select is((select minimum || '/' || period from public.campus_fees where program_id = 'ef100000-0000-4000-8000-000000000001'),
  '450000/annee', 'Les frais par an : une ligne « par an » liée à la formation');
select is((select reference || '/' || evidence || '/' || kind from public.campus_accreditations where program_id = 'ef100000-0000-4000-8000-000000000001'),
  'n° 123/MES/document_vu/autorisation_ouverture', 'L''autorisation et ce qui la prouve');

select lives_ok($$select public.save_program_sheet('ef100000-0000-4000-8000-000000000001',
    '{"annual_fee_xaf": 500000, "declared_on": "2026-11-01"}'::jsonb)$$, 'Une clé absente ne touche à rien ; les frais par an se modifient');
select is((select count(*)::int || '/' || max(minimum) from public.campus_fees where program_id = 'ef100000-0000-4000-8000-000000000001'),
  '1/500000', 'La même ligne est modifiée, pas doublée');
select is((select title from public.campus_programs where id = 'ef100000-0000-4000-8000-000000000001'), 'Licence en droit des affaires',
  'L''intitulé n''a pas bougé');

select lives_ok($$select public.save_program_sheet('ef100000-0000-4000-8000-000000000001', '{"authorization": null, "annual_fee_xaf": null}'::jsonb)$$,
  '« Pas encore vue » et des frais par an vidés');
select is((select count(*)::int from public.campus_accreditations where program_id = 'ef100000-0000-4000-8000-000000000001')
          + (select count(*)::int from public.campus_fees where program_id = 'ef100000-0000-4000-8000-000000000001'), 0,
  'L''autorisation et la ligne de frais sont retirées (avec leur historique)');

select throws_ok($$select public.save_program_sheet('ef100000-0000-4000-8000-000000000002', '{"title": "Licence en droit des affaires"}'::jsonb)$$,
  '22023', null, 'Deux formations du même cycle ne portent pas le même intitulé');
select throws_ok($$select public.save_program_sheet('ef100000-0000-4000-8000-000000000002', '{"diploma": "diplome_inconnu"}'::jsonb)$$,
  '22023', null, 'Un diplôme hors liste est refusé');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.save_program_sheet('ef100000-0000-4000-8000-000000000002', '{"title": "x"}'::jsonb)$$,
  '42501', null, 'Un relais ne modifie pas une formation');

select * from finish();
rollback;
