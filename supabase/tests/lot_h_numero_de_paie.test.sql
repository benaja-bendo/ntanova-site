-- M12 (lot H) : le relais actif lit et modifie son propre numéro Mobile Money, jamais celui d'un autre.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-loth-relais', '[Relais H]');
select public.register_relay('00000000-0000-4000-8000-0000000000b2', 'google-loth-autre', '[Autre relais]');
select public.register_relay('00000000-0000-4000-8000-0000000000b3', 'google-loth-attente', '[En attente]');
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', null);
select public.activer_relais('00000000-0000-4000-8000-0000000000b2', null);
insert into prive.relay_payment_details (relay_id, operator, msisdn) values ('00000000-0000-4000-8000-0000000000b2', 'airtel', '242050000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_payment_details()), 0, 'Sans numéro : rien, et jamais celui d''un autre relais');
select throws_ok($$select public.set_my_payment_details('orange', '242060000001')$$, '22023', null, 'Un opérateur inconnu est refusé');
select throws_ok($$select public.set_my_payment_details('mtn', '+242 06 000 00 01')$$, '22023', null, 'Un numéro mal écrit est refusé');
select lives_ok($$select public.set_my_payment_details('mtn', '242060000001')$$, 'Le relais enregistre son numéro');
select is((select operator || '|' || msisdn from public.my_payment_details()), 'mtn|242060000001', 'Il le relit');
select lives_ok($$select public.set_my_payment_details('airtel', '242050000001')$$, 'Il le change');
select throws_ok($$select * from prive.relay_payment_details$$, '42501', null, 'La table privée reste fermée au relais');
reset role;

select is((select operator || '|' || msisdn from prive.relay_payment_details where relay_id = '00000000-0000-4000-8000-0000000000b2'),
  'airtel|242050000002', 'Le numéro de l''autre relais n''a pas bougé');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated"}', true);
select throws_ok($$select public.set_my_payment_details('mtn', '242060000003')$$, '42501', null, 'Un compte pas encore activé n''écrit rien');
reset role;

select * from finish();
rollback;
