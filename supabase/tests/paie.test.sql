-- La paie des relais : 500 FCFA par fiche acceptée, +300 FCFA par contact de direction confirmé, essai de trois fiches
-- = 1 500 FCFA, clôture du vendredi, jamais deux fois. Le vendredi 6 novembre 2026 sert de repère.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));

insert into public.institutions (id, name) values ('a1000000-0000-4000-8000-000000000001', '[École]');
insert into public.campuses (id, institution_id, slug, publication, origin)
values ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'ecole', 'brouillon', 'field');

-- Alice : fiches acceptées du lundi au jeudi, une le samedi, une non payable, une correction ; des contacts ---------------------

create function pg_temp.fiche(p_id uuid, p_relais uuid, p_decide timestamptz, p_payable boolean default true, p_kind text default 'releve',
                              p_contact_role text default null, p_contact_le timestamptz default null, p_lot text default 'Tié-Tié',
                              p_statut text default 'accepte', p_corrige uuid default null) returns void language sql as $$
  insert into public.field_submissions (id, relay_id, batch_id, kind, corrects_submission_id, taken_at, sign_name, status, campus_id, decided_at, payable,
                                        contact_role, contact_confirmed_at)
  values (p_id, p_relais, (select id from public.lots where nom = p_lot), p_kind, p_corrige, p_decide, '[Fiche]', p_statut,
          case when p_statut = 'accepte' then 'b1000000-0000-4000-8000-000000000001'::uuid end, p_decide, p_payable,
          p_contact_role::public.fonction_direction, p_contact_le)
$$;
-- lundi 2, mardi 3, mercredi 4 : trois fiches payables (la deuxième avec un contact de directeur, la troisième avec le secrétariat)
select pg_temp.fiche('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-02 10:00+01');
select pg_temp.fiche('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-03 10:00+01', true, 'releve', 'directeur', timestamptz '2026-11-04 12:00+01');
select pg_temp.fiche('51000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-04 10:00+01', true, 'releve', 'secretariat', timestamptz '2026-11-05 12:00+01');
-- une école déjà relevée par un autre relais : non payable ; une correction : non payable
select pg_temp.fiche('51000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-05 10:00+01', false);
select pg_temp.fiche('51000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-05 11:00+01', false, 'correction', null, null, 'Tié-Tié', 'accepte', '51000000-0000-4000-8000-000000000001');
-- acceptée le samedi 7 : la semaine suivante
select pg_temp.fiche('51000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-07 09:00+01');
-- fiche refusée, avec un contact confirmé : rien
select pg_temp.fiche('51000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-03 09:00+01', true, 'releve', 'directeur', timestamptz '2026-11-04 09:00+01', 'Tié-Tié', 'refuse');
-- Bastien : une fiche acceptée vendredi 6 à 22 h (avant la fin de journée) ; une le samedi à 0 h 30 (après)
select pg_temp.fiche('51000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000b1', timestamptz '2026-11-06 22:00+01', true, 'releve', null, null, 'Ngoyo');
select pg_temp.fiche('51000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-0000000000b1', timestamptz '2026-11-07 00:30+01', true, 'releve', null, null, 'Ngoyo');
-- Alice, lot d'essai : trois fiches validées avec NTanova (sans publication) ; Bastien : deux seulement
insert into public.field_submissions (id, relay_id, batch_id, taken_at, sign_name, trial_validated_at)
select ('5e000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000000a1',
       (select id from public.lots where essai), now(), '[Essai]', timestamptz '2026-11-03 15:00+01' from generate_series(1, 3) g;
insert into public.field_submissions (id, relay_id, batch_id, taken_at, sign_name, trial_validated_at)
select ('5f000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000000b1',
       (select id from public.lots where essai), now(), '[Essai]', timestamptz '2026-11-03 15:00+01' from generate_series(1, 2) g;
-- Ces relais ne sont pas sur le lot d'essai : à l'arrivée, la base remplace ce lot périmé (`lot_essai_perime.test.sql`).
-- Ce sont des fiches arrivées PENDANT l'essai : on les replace dans le lot d'essai, comme elles l'étaient.
update public.field_submissions set batch_id = (select id from public.lots where essai) where sign_name = '[Essai]';

-- Les tarifs ---------------------------------------------------------------------------------------------------------------------------------------------

select is((select per_submission_xaf || '|' || per_contact_xaf || '|' || trial_size || '|' || trial_total_xaf from public.payout_rates where valid_from = date '2026-11-01'),
  '500|300|3|1500', 'Les tarifs du 01/11 : 500 par fiche, 300 par contact, essai de 3 fiches = 1 500');
select throws_ok($$insert into public.payout_rates (valid_from, per_submission_xaf, per_contact_xaf) values (date '2026-11-01', 1, 1)$$,
  '23505', null, 'Un tarif est daté : une seule ligne par date');

-- Le calcul du vendredi 6 novembre ---------------------------------------------------------------------------------------------------------------------

create temp table apercu as select * from public.payout_preview(date '2026-11-06');
select is((select submissions || '|' || contacts || '|' || trial_bundles || '|' || total_xaf from apercu where first_name = 'Alice'), '3|1|1|3300',
  'Alice : 3 fiches (1 500) + 1 contact (300) + l''essai (1 500) = 3 300 FCFA');
select is((select submissions || '|' || contacts || '|' || trial_bundles || '|' || total_xaf from apercu where first_name = 'Bastien'), '1|0|0|500',
  'Bastien : une fiche acceptée vendredi soir (500), pas celle de samedi 0 h 30, pas d''essai (deux fiches seulement)');
select is((select count(*)::int from public.payable_items(date '2026-11-06') where kind = 'contact' and submission_id = '51000000-0000-4000-8000-000000000003'), 0,
  'Un contact du secrétariat ne se paie pas');
select is((select count(*)::int from public.payable_items(date '2026-11-06') where submission_id in ('51000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000005')), 0,
  'Ni une école déjà relevée par un autre relais, ni une correction');
select is((select count(*)::int from public.payable_items(date '2026-11-06') where submission_id = '51000000-0000-4000-8000-000000000007'), 0,
  'Ni une fiche refusée, même avec un contact');
select is((select count(*)::int from public.payable_items(date '2026-11-06') where kind = 'submission' and submission_id::text like '5e%'), 0,
  'Les fiches d''essai ne se paient jamais une par une : seulement par l''essai');
select is((select amount_xaf from public.payable_items(date '2026-11-06') where kind = 'trial_bundle'), 1500, 'L''essai vaut 1 500 FCFA');

-- La clôture ------------------------------------------------------------------------------------------------------------------------------------------------

select throws_ok($$select public.close_payout_week(date '2026-11-05')$$, '22023', null, 'La semaine se clôt un vendredi');
create temp table semaine as select public.close_payout_week(date '2026-11-06') as batch_id;
select is((select count(*)::int from public.payout_lines where batch_id = (select batch_id from semaine)), 6, 'La clôture écrit une ligne par fiche, par contact et par essai');
select is((select string_agg(first_name || ':' || total_xaf, ',' order by first_name) from public.payout_statements_of((select batch_id from semaine))),
  'Alice:3300,Bastien:500', 'Un total par relais');
select throws_ok($$select public.close_payout_week(date '2026-11-06')$$, '22023', null, 'Une semaine ne se clôt qu''une fois');
select is((select count(*)::int from public.payable_items(date '2026-11-06')), 0, 'Ce qui est dans une ligne n''est plus dû : jamais deux fois');
select throws_ok($$insert into public.payout_lines (batch_id, relay_id, kind, submission_id, amount_xaf)
                    values ((select batch_id from semaine), '00000000-0000-4000-8000-0000000000a1', 'submission', '51000000-0000-4000-8000-000000000001', 500)$$,
  '23505', null, 'La base elle-même refuse de payer deux fois la même fiche');
select throws_ok($$insert into public.payout_lines (batch_id, relay_id, kind, amount_xaf)
                    values ((select batch_id from semaine), '00000000-0000-4000-8000-0000000000a1', 'trial_bundle', 1500)$$,
  '23505', null, 'Ni l''essai deux fois');

-- La semaine suivante : ce qui est arrivé après -----------------------------------------------------------------------------------------------------------

create temp table suivante as select * from public.payout_preview(date '2026-11-13');
select is((select first_name || ':' || total_xaf from suivante where first_name = 'Alice'), 'Alice:500', 'Vendredi 13 : la fiche acceptée samedi pour Alice (500)');
select is((select first_name || ':' || total_xaf from suivante where first_name = 'Bastien'), 'Bastien:500', 'Et celle de samedi 0 h 30 pour Bastien');
select is((select count(*)::int from suivante where trial_bundles > 0), 0, 'L''essai ne revient pas');

-- Un nouveau tarif remplace l'ancien à sa date -------------------------------------------------------------------------------------------------------------

insert into public.payout_rates (valid_from, per_submission_xaf, per_contact_xaf, note) values (date '2026-11-10', 600, 350, 'Essai de tarif');
select is((select total_xaf from public.payout_preview(date '2026-11-13') where first_name = 'Alice'), 600, 'À partir du 10/11, 600 FCFA par fiche');
select is((select total_xaf from public.payout_preview(date '2026-11-06') where first_name = 'Alice'), null::int,
  'Une semaine déjà clôturée ne change pas (et rien n''y est dû)');

-- Le paiement -----------------------------------------------------------------------------------------------------------------------------------------------

select throws_ok($$select public.mark_statement_paid((select batch_id from semaine), '00000000-0000-4000-8000-0000000000a1', ' ')$$, '22023', null,
  'Une opération Mobile Money se note avec sa référence');
select lives_ok($$select public.set_relay_payment_details('00000000-0000-4000-8000-0000000000a1', 'mtn', '242060000111')$$, 'Le numéro Mobile Money d''un relais se note');
select lives_ok($$select public.mark_statement_paid((select batch_id from semaine), '00000000-0000-4000-8000-0000000000a1', 'MM-2026-11-06-001')$$, 'Le paiement se note avec sa référence');
select throws_ok($$select public.mark_statement_paid((select batch_id from semaine), '00000000-0000-4000-8000-0000000000a1', 'MM-2')$$, 'P0002', null, 'Un paiement noté ne se note pas deux fois');
select is((select msisdn || '|' || operator || '|' || reference from public.payout_statements_of((select batch_id from semaine)) where first_name = 'Alice'),
  '242060000111|mtn|MM-2026-11-06-001', 'L''administration lit le numéro à créditer et la référence, par la fonction prévue');
select is((select count(*)::int from public.payout_statements_of((select batch_id from semaine)) where paid_at is not null), 1, 'Un paiement noté, l''autre en attente');

-- Les droits -----------------------------------------------------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.payout_lines), 0, 'Un relais ne lit aucune ligne de paie, pas même la sienne');
select throws_ok($$select * from public.payout_preview()$$, '42501', null, 'Un relais ne calcule pas la paie');
select throws_ok($$select * from prive.relay_payment_details$$, '42501', null, 'Ni ne lit les numéros Mobile Money');
reset role;
select is((select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_name like 'payout%'), 0, 'Un visiteur n''a aucun droit sur la paie');

select * from finish();
rollback;
