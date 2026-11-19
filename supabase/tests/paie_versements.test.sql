-- Paie des relais, 19/11/2026 : un solde (gagné − versé), des versements notés à tout moment, tout ou partie, jamais plus.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-vers-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-vers-relais-a', '[Relais A]');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-vers-relais-b', '[Relais B]');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Tié-Tié'));

insert into public.institutions (id, name, kind) values ('91000000-0000-4000-8000-0000000000f1', '[École versements]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, origin, publication)
select '92000000-0000-4000-8000-0000000000f1', '91000000-0000-4000-8000-0000000000f1', 'ecole-versements', d.id, 'admin', 'publiee'
from (select id from public.geo_divisions where level = 3 limit 1) d;

-- Relais A : quatre fiches acceptées (2 000 FCFA), de la plus ancienne (…f1) à la plus récente (…f4). Relais B : une (500).
insert into public.field_submissions (id, relay_id, batch_id, kind, taken_at, sign_name, status, campus_id, decided_at, payable)
select ('96000000-0000-4000-8000-0000000000f' || g)::uuid, '00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'),
       'releve', timestamptz '2026-11-10 10:00+01', '[Fiche]', 'accepte', '92000000-0000-4000-8000-0000000000f1',
       timestamptz '2026-11-10 10:00+01' + g * interval '1 day', true
from generate_series(1, 4) g;
insert into public.field_submissions (id, relay_id, batch_id, kind, taken_at, sign_name, status, campus_id, decided_at, payable)
values ('96000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Tié-Tié'),
        'releve', timestamptz '2026-11-10 10:00+01', '[Fiche B]', 'accepte', '92000000-0000-4000-8000-0000000000f1',
        timestamptz '2026-11-12 10:00+01', true);
-- L'arrivée d'une fiche la donne au compte connecté et la remet « à valider » : on la rend à son relais, décidée.
update public.field_submissions s set relay_id = case when s.id::text like '%e1' then '00000000-0000-4000-8000-0000000000b1'::uuid
                                                      else '00000000-0000-4000-8000-0000000000a1'::uuid end,
       status = 'accepte', payable = true, campus_id = '92000000-0000-4000-8000-0000000000f1',
       decided_at = case when s.id::text like '%e1' then timestamptz '2026-11-12 10:00+01'
                         else timestamptz '2026-11-10 10:00+01' + right(s.id::text, 1)::int * interval '1 day' end
where s.id::text like '96000000-%';

-- Les droits ----------------------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 500)$$, '42501', null,
  'Un relais ne note pas un versement, même à lui-même');
select throws_ok($$select * from public.payout_balances()$$, '42501', null, 'Un relais ne lit pas les soldes des autres');
select throws_ok($$select * from public.payout_transfers$$, '42501', null, 'Aucune lecture directe de la table des versements');
select is((select balance_xaf from public.my_payout() where state = 'acquis'), 2000, 'Avant tout versement, le relais lit 2 000 FCFA dus');
select is((select transfers from public.my_payout() where state = 'acquis'), '[]'::jsonb, 'Et rien de reçu');
reset role;

-- L'administration note les versements ------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select earned_xaf || '|' || paid_xaf || '|' || balance_xaf from public.payout_balances()
           where relay_id = '00000000-0000-4000-8000-0000000000a1'), '2000|0|2000', 'L''admin lit gagné, versé, reste dû');
select is((select array_agg(first_name order by balance_xaf desc) from public.payout_balances()), array['[Relais A]', '[Relais B]'],
  'Le plus grand reste dû d''abord');
select throws_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 2500)$$, '22023', null,
  'Plus que le reste dû est refusé : pas d''avance');
select throws_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 0)$$, '22023', null, 'Un versement de 0 est refusé');
select throws_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 500, current_date + 3)$$, '22023', null,
  'Un versement daté dans le futur est refusé');
select throws_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-000000000999', 500)$$, 'P0002', null, 'Un relais inconnu est refusé');

select lives_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 1200, date '2026-11-18', '  MP261118.1  ')$$,
  'Un versement partiel (1 200 sur 2 000), avec sa référence');
select is((select balance_xaf from public.payout_balances() where relay_id = '00000000-0000-4000-8000-0000000000a1'), 800,
  'Le reste dû baisse d''autant');
select is((select reference from public.payout_transfers_list() limit 1), 'MP261118.1', 'La référence est gardée sans espaces autour');
select throws_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 900)$$, '22023', null,
  'Le plafond suit le solde : 900 dépasse les 800 qui restent');
select lives_ok($$select public.record_payout_transfer('00000000-0000-4000-8000-0000000000a1', 300)$$, 'Un versement sans référence, daté du jour');
reset role;

-- Ce que lit le relais ---------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select earned_xaf || '|' || received_xaf || '|' || balance_xaf from public.my_payout() where state = 'acquis'), '2000|1500|500',
  'Le relais lit le nouveau montant : 2 000 gagnés, 1 500 reçus, 500 dus');
select is((select jsonb_array_length(transfers) from public.my_payout() where state = 'acquis'), 2, 'Il voit ses deux versements');
select is((select paid_submissions from public.my_payout() where state = 'acquis'),
  '["96000000-0000-4000-8000-0000000000f1", "96000000-0000-4000-8000-0000000000f2", "96000000-0000-4000-8000-0000000000f3"]'::jsonb,
  '1 500 reçus couvrent les trois fiches les plus anciennes, pas la quatrième');
select is((select total_xaf from public.my_payout() where state = 'acquis'), 2000, 'Les colonnes d''avant ne changent pas (ancien téléphone)');
reset role;

-- Annuler une erreur ------------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.cancel_payout_transfer((select id from public.payout_transfers_list() where amount_xaf = 1200), ' ')$$,
  '22023', null, 'Une annulation dit pourquoi');
select public.cancel_payout_transfer((select id from public.payout_transfers_list() where amount_xaf = 1200), '[erreur de montant]');
select is((select balance_xaf from public.payout_balances() where relay_id = '00000000-0000-4000-8000-0000000000a1'), 1700,
  'Annuler remonte le reste dû, et le versement reste lisible');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select jsonb_array_length(transfers) from public.my_payout() where state = 'acquis'), 1, 'Le relais ne voit pas le versement annulé');
reset role;

-- L'ancien geste (clôture du vendredi, puis « payé ») compte comme reçu, et ne change pas ce qui est gagné -----------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select public.close_payout_week(((now() at time zone 'Africa/Brazzaville')::date + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7)));
select is((select earned_xaf || '|' || balance_xaf from public.payout_balances() where relay_id = '00000000-0000-4000-8000-0000000000a1'), '2000|1700',
  'Clore la semaine ne change ni le gagné ni le reste dû');
select public.mark_statement_paid((select id from public.payout_batches limit 1), '00000000-0000-4000-8000-0000000000b1', 'MM-B');
select is((select balance_xaf from public.payout_balances() where relay_id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'Une semaine notée « payée » compte comme reçue');
reset role;

select * from finish();
rollback;
