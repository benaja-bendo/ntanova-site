-- « Ma paie » (ticket #55, PR 5 ; ticket #24) : ce que le relais lit de sa propre paie. Les mêmes règles et les mêmes
-- montants que l'administration (`payable_items`), seulement les siens : ce qu'il a d'acquis pour le prochain vendredi,
-- ce qui est clos à payer, ce qui est payé avec la référence de l'opération. Le vendredi 6 novembre 2026 sert de repère.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000c1', 'google-c1', 'Chloé');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
select public.register_relay('00000000-0000-4000-8000-0000000000e1', 'google-e1', 'Esther');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));
select public.activer_relais('00000000-0000-4000-8000-0000000000e1', (select id from public.lots where nom = 'Tié-Tié'));
-- Chloé : en attente. Dominique : administratrice, pas relais. Esther : active, aucune fiche.

insert into public.institutions (id, name) values ('a1000000-0000-4000-8000-000000000001', '[École]');
insert into public.campuses (id, institution_id, slug, publication, origin)
values ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'ecole', 'brouillon', 'field');

create function pg_temp.fiche(p_id uuid, p_relais uuid, p_decide timestamptz, p_payable boolean default true, p_kind text default 'releve',
                              p_contact_role text default null, p_contact_le timestamptz default null, p_lot text default 'Tié-Tié',
                              p_statut text default 'accepte', p_corrige uuid default null) returns void language sql as $$
  insert into public.field_submissions (id, relay_id, batch_id, kind, corrects_submission_id, taken_at, sign_name, status, campus_id, decided_at, payable,
                                        contact_role, contact_confirmed_at)
  values (p_id, p_relais, (select id from public.lots where nom = p_lot), p_kind, p_corrige, p_decide, '[Fiche]', p_statut,
          case when p_statut = 'accepte' then 'b1000000-0000-4000-8000-000000000001'::uuid end, p_decide, p_payable,
          p_contact_role::public.fonction_direction, p_contact_le)
$$;
-- Alice : trois fiches payables (une avec le contact d'un directeur), une école déjà relevée par un autre (non payable), une fiche refusée,
-- une fiche acceptée le samedi 7 (la semaine suivante), l'essai de trois fiches
select pg_temp.fiche('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-02 10:00+01');
select pg_temp.fiche('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-03 10:00+01', true, 'releve', 'directeur', timestamptz '2026-11-03 12:00+01');
select pg_temp.fiche('51000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-04 10:00+01');
select pg_temp.fiche('51000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-05 10:00+01', false);
select pg_temp.fiche('51000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-03 09:00+01', true, 'releve', 'directeur', timestamptz '2026-11-03 09:30+01', 'Tié-Tié', 'refuse');
select pg_temp.fiche('51000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a1', timestamptz '2026-11-07 09:00+01');
insert into public.field_submissions (id, relay_id, batch_id, taken_at, sign_name, trial_validated_at)
select ('5e000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-0000000000a1',
       (select id from public.lots where essai), now(), '[Essai]', timestamptz '2026-11-03 15:00+01' from generate_series(1, 3) g;
-- Alice n'est pas sur le lot d'essai : à l'arrivée, la base remplace ce lot périmé (`lot_essai_perime.test.sql`). Ce sont
-- des fiches arrivées PENDANT l'essai : on les replace dans le lot d'essai, comme elles l'étaient.
update public.field_submissions set batch_id = (select id from public.lots where essai) where sign_name = '[Essai]';
-- Bastien : une fiche acceptée vendredi 6 à 22 h (avant la fin de journée), une le samedi à 0 h 30 (après)
select pg_temp.fiche('51000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000b1', timestamptz '2026-11-06 22:00+01', true, 'releve', null, null, 'Ngoyo');
select pg_temp.fiche('51000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-0000000000b1', timestamptz '2026-11-07 00:30+01', true, 'releve', null, null, 'Ngoyo');

-- Ce que voit l'administration, pour comparer
create temp table apercu as select * from public.payout_preview(date '2026-11-06');
grant select on pg_temp.apercu to authenticated;

-- Alice : ce qui lui est acquis pour le vendredi 6 -----------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select friday::text || '|' || state from public.my_payout(date '2026-11-06') where state = 'acquis'), '2026-11-06|acquis',
  'Alice lit une ligne « acquis » pour le vendredi demandé');
select is((select submissions || '|' || contacts || '|' || trial_bundles || '|' || total_xaf from public.my_payout(date '2026-11-06') where state = 'acquis'),
  '3|1|1|3300', 'Alice : 3 fiches, 1 contact et l''essai = 3 300 FCFA, comme l''administration le calcule');
select is((select total_xaf from public.my_payout(date '2026-11-06') where state = 'acquis'),
  (select total_xaf from pg_temp.apercu where first_name = 'Alice'), 'Le même total que l''aperçu de l''administration');
select is((select not_payable from public.my_payout(date '2026-11-06') where state = 'acquis'), 1,
  'Une fiche acceptée mais non payable (école déjà relevée par un autre) est comptée à part, pour que le relais comprenne');
select is((select count(*)::int from public.my_payout(date '2026-11-06')), 1, 'Rien d''autre : pas encore de semaine close');
reset role;

-- Bastien : la fin de journée à Brazzaville ----------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select submissions || '|' || contacts || '|' || trial_bundles || '|' || total_xaf from public.my_payout(date '2026-11-06') where state = 'acquis'),
  '1|0|0|500', 'Bastien : la fiche acceptée vendredi soir compte, pas celle de samedi 0 h 30 ; pas d''essai');
select is((select total_xaf from public.my_payout(date '2026-11-06') where state = 'acquis'),
  (select total_xaf from pg_temp.apercu where first_name = 'Bastien'), 'Le même total que l''aperçu de l''administration');
reset role;

-- Esther : active, rien à payer ----------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
select is((select submissions || '|' || contacts || '|' || trial_bundles || '|' || total_xaf || '|' || not_payable from public.my_payout(date '2026-11-06') where state = 'acquis'),
  '0|0|0|0|0', 'Un relais actif sans fiche lit « 0 FCFA », pas une page vide');
reset role;

-- Ceux qui ne lisent rien ---------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_payout(date '2026-11-06')), 0, 'Un relais en attente ne lit aucune paie');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_payout(date '2026-11-06')), 0, 'Une administratrice qui n''est pas relais ne lit pas la paie des autres par cette fonction');
reset role;
set local role anon;
select throws_ok($$select * from public.my_payout()$$, '42501', null, 'Un visiteur n''appelle pas my_payout');
reset role;
select is(has_function_privilege('authenticated', 'public.my_payout(date)', 'execute')
          and not has_function_privilege('anon', 'public.my_payout(date)', 'execute')
          and not has_function_privilege('authenticated', 'prive.payable_items_for(date)', 'execute')
          and not has_function_privilege('anon', 'prive.payable_items_for(date)', 'execute'), true,
  'Les connectés lisent leur paie ; personne n''appelle le calcul commun (il est privé) ; les visiteurs rien');
select is(pg_get_function_result('public.my_payout(date)'::regprocedure) ~* 'msisdn|operator|whatsapp', false,
  'my_payout ne rend ni numéro Mobile Money, ni opérateur : seulement si NTanova l''a');

-- La semaine close, puis payée -----------------------------------------------------------------------------------------------------------------------
select public.close_payout_week(date '2026-11-06');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select friday::text || '|' || submissions || '|' || contacts || '|' || trial_bundles || '|' || total_xaf from public.my_payout(date '2026-11-06') where state = 'a_payer'),
  '2026-11-06|3|1|1|3300', 'La semaine close : Alice lit ce qui lui est à payer, avec le détail');
select is((select total_xaf from public.my_payout(date '2026-11-06') where state = 'acquis'), 0,
  'Ce qui est clos n''est plus « acquis » : jamais compté deux fois');
select is((select submissions || '|' || total_xaf from public.my_payout(date '2026-11-13') where state = 'acquis'), '1|500',
  'La fiche acceptée le samedi passe à la semaine suivante');
reset role;
select public.mark_statement_paid((select id from public.payout_batches where friday = date '2026-11-06'), '00000000-0000-4000-8000-0000000000a1', 'MTN-OP-12345');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select state || '|' || reference || '|' || (paid_at is not null)::text from public.my_payout(date '2026-11-06') where friday = date '2026-11-06' and state <> 'acquis'),
  'paye|MTN-OP-12345|true', 'Une fois payée : la semaine est « payée », avec la référence de l''opération');
select is((select count(*)::int from public.my_payout(date '2026-11-13') where state in ('a_payer', 'paye')), 1,
  'Une seule semaine close dans l''historique d''Alice');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select string_agg(state || ':' || total_xaf, ',' order by (state = 'acquis')) from public.my_payout(date '2026-11-13')), 'a_payer:500,acquis:500',
  'Bastien lit sa propre semaine close (500, à payer) et son acquis (la fiche du samedi), jamais ceux d''Alice');
reset role;

-- Le numéro Mobile Money : NTanova l'a, ou non --------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select has_payment_details from public.my_payout(date '2026-11-06') where state = 'acquis'), false, 'NTanova n''a pas encore le numéro Mobile Money d''Alice : elle le sait');
reset role;
select public.set_relay_payment_details('00000000-0000-4000-8000-0000000000a1', 'mtn', '242061234501');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select has_payment_details from public.my_payout(date '2026-11-06') where state = 'acquis'), true, 'Une fois enregistré, elle lit que NTanova l''a (sans le numéro)');
reset role;

-- Le calcul de l'administration n'a pas bougé ------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.payable_items(date '2026-11-13')), 2,
  'L''administration calcule toujours la semaine suivante : une fiche pour Alice, une pour Bastien (celles du samedi)');

select * from finish();
rollback;
