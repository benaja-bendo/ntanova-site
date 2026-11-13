-- M10 (lot F du ticket 165) : la preuve d'une autorisation téléversée (jamais publique), et « Ma paie » détaillée par tarif.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-lotf-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-lotf-relais', '[Relais]');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));

insert into public.institutions (id, name, kind) values ('91000000-0000-4000-8000-000000000001', '[Institut preuve]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, origin, publication)
select '92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', 'institut-preuve', d.id, 'admin', 'publiee'
from (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.campus_accreditations (id, campus_id, kind, reference, issued_on, source_label, checked_on)
values ('93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'agrement', 'arrêté n° [référence]',
        '2024-03-12', '[Le document affiché à l’accueil]', '2026-11-10');

-- La preuve téléversée ---------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'photo', null,
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete.webp')$$, '42501', null, 'Un relais ne pose pas la preuve d''un agrément');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'document_vu', null,
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete.webp')$$, '22023', null, 'Un fichier de preuve va avec « photo du document », rien d''autre');
select throws_ok($$select public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'photo', null,
  'ecoles/00000000-0000-4000-8000-000000000999/preuves/arrete.webp')$$, '22023', null, 'Le fichier d''un autre site est refusé');
select throws_ok($$select public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'photo', null,
  'ecoles/92000000-0000-4000-8000-000000000001/galerie/arrete.webp')$$, '22023', null, 'Une preuve se range sous preuves/, pas avec les images publiques');
select is(public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'photo', null,
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-1.webp'), null, 'L''admin téléverse la photo de l''arrêté : rien à effacer la première fois');
select is((select evidence || '|' || proof_path from public.campus_accreditations where id = '93000000-0000-4000-8000-000000000001'),
  'photo|ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-1.webp', 'La preuve est enregistrée');
select is(public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'photo', null,
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-2.webp'), 'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-1.webp',
  'Remplacer la photo rend l''ancien fichier, que l''admin efface du stockage');
select is(public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'dit_ecole'),
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-2.webp', 'Passer à « dit par l''école » rend aussi le fichier à effacer');
select public.set_accreditation_evidence('93000000-0000-4000-8000-000000000001', 'photo', null,
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-3.webp');
reset role;

set local role anon;
select is((select evidence from public.public_campus_accreditations where campus_id = '92000000-0000-4000-8000-000000000001'), 'photo',
  'La page publique sait que le document a été vu');
select is((select count(*)::int from information_schema.columns
           where table_name = 'public_campus_accreditations' and column_name in ('proof_path', 'proof_photo_id', 'checked_on')), 0,
  'Mais la vue publique ne rend jamais le fichier de la preuve');
reset role;

select is((public.campus_purge_preview('92000000-0000-4000-8000-000000000001') -> 'paths')
          @> '["ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-3.webp"]'::jsonb, true,
  'La suppression définitive d''une école emporte le fichier de ses preuves');
select is(public.remove_campus_accreditation('93000000-0000-4000-8000-000000000001'),
  'ecoles/92000000-0000-4000-8000-000000000001/preuves/arrete-3.webp', 'Retirer l''agrément rend le fichier de sa preuve, à effacer');

-- « Ma paie » détaillée --------------------------------------------------------------------------------------------------------------------------
insert into public.field_submissions (id, relay_id, batch_id, kind, taken_at, sign_name, status, campus_id, decided_at, payable)
select ('95000000-0000-4000-8000-00000000000' || g)::uuid, '00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'),
       'releve', timestamptz '2026-11-16 10:00+01', '[Fiche]', 'accepte', '92000000-0000-4000-8000-000000000001',
       timestamptz '2026-11-16 10:00+01' + g * interval '1 minute', true
from generate_series(1, 3) g;
-- L'arrivée d'une fiche la remet « à valider » et la donne au compte connecté : on la rend au relais, puis on la décide.
update public.field_submissions set relay_id = '00000000-0000-4000-8000-0000000000a1', status = 'accepte', campus_id = '92000000-0000-4000-8000-000000000001', decided_at = timestamptz '2026-11-16 10:00+01', payable = true
where id::text like '95000000-%';
-- La troisième ferme une mission payée 2 000 FCFA : la mission la paie, pas le tarif de la fiche.
insert into public.missions (campus_id, relay_id, kind, status, pay_xaf, closed_by_submission_id, closed_at)
values ('92000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'verify', 'done', 2000,
        '95000000-0000-4000-8000-000000000003', timestamptz '2026-11-16 11:00+01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select total_xaf from public.my_payout(date '2026-11-20') where state = 'acquis'), 3000,
  'Le total ne change pas : deux fiches à 500 et une mission à 2 000');
select is((select jsonb_path_query_array(lines, '$[*] ? (@.kind == "submission").count') || jsonb_path_query_array(lines, '$[*] ? (@.kind == "submission").unit_xaf')
           from public.my_payout(date '2026-11-20') where state = 'acquis'), '[2, 500]'::jsonb,
  'Une ligne « 2 × 500 FCFA » pour les fiches acceptées');
select is((select jsonb_path_query_array(lines, '$[*] ? (@.kind == "mission")') -> 0 from public.my_payout(date '2026-11-20') where state = 'acquis'),
  '{"kind": "mission", "count": 1, "unit_xaf": 2000, "submissions": ["95000000-0000-4000-8000-000000000003"]}'::jsonb,
  'Une ligne pour la mission, à son montant, avec la fiche qu''elle paie');
select is((select sum((l ->> 'count')::int * (l ->> 'unit_xaf')::int)::int from public.my_payout(date '2026-11-20') m, jsonb_array_elements(m.lines) l
           where m.state = 'acquis'), 3000, 'La somme des lignes (quantité × tarif) fait le total');
reset role;

select * from finish();
rollback;
