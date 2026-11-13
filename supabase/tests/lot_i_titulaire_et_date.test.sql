-- M13 (lot I) : le nom du titulaire Mobile Money, et la date où la mission a été confiée.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select public.register_relay('00000000-0000-4000-8000-0000000000c1', 'google-loti-relais', '[Relais I]');
select public.activer_relais('00000000-0000-4000-8000-0000000000c1', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select lives_ok($$select public.set_my_payment_details('mtn', '242060000001', '  [Titulaire   Exemple] ')$$, 'Le relais donne le nom du titulaire');
select is((select holder_name from public.my_payment_details()), '[Titulaire Exemple]', 'Il le relit, sans les espaces en trop');
select lives_ok($$select public.set_my_payment_details('airtel', '242050000001')$$, 'Changer le numéro sans redonner le nom');
select is((select operator || '|' || holder_name from public.my_payment_details()), 'airtel|[Titulaire Exemple]', 'Le nom déjà noté reste');
select throws_ok($$select public.set_my_payment_details('mtn', '242060000001', 'X')$$, '22023', null, 'Un nom d''une lettre est refusé');
select lives_ok($$select public.set_my_payment_details('mtn', '242060000001')$$, 'L''ancien appel à deux paramètres marche toujours');
reset role;

select is((select holder_name from prive.relay_payment_details where relay_id = '00000000-0000-4000-8000-0000000000c1'),
  '[Titulaire Exemple]', 'Le nom est rangé dans la partie privée');

-- La date de la mission.
insert into public.institutions(id, name) values ('c1000000-0000-4000-8000-000000000001', '[École lot I]');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin)
select 'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'ecole-lot-i', d.id, 'prete', 'admin'
from (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.missions (campus_id, relay_id, kind, created_at)
values ('c1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c1', 'verify', timestamptz '2026-11-10 09:00+01');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is((select assigned_at from public.my_missions()), timestamptz '2026-11-10 09:00+01', 'Le relais lit la date où la mission a été confiée');
reset role;

-- « On y voit ».
insert into public.field_submissions (id, relay_id, kind, sign_name, levels, taken_at)
values ('c1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000c1', 'releve', '[École vue]', '{primaire}', now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is(public.register_photo('c1000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000003', 'signboard',
  'image/webp', 1000, null, null, null, array['entrance', 'signboard', 'entrance']), 'recu', 'La photo part avec ce qu''on y voit');
select throws_ok($$select public.register_photo(gen_random_uuid(), 'c1000000-0000-4000-8000-000000000003', 'signboard', 'image/webp', 1000,
  null, null, null, array['enfant'])$$, '22023', null, 'Un autre mot est refusé');
reset role;
select is((select shows from public.field_submission_photos where id = 'c1000000-0000-4000-8000-000000000004'),
  array['entrance', 'signboard'], 'Rangé sans doublon');

select ok(has_function_privilege('authenticated', 'public.set_relay_payment_details(uuid, text, public.telephone, text)', 'execute')
          and not has_function_privilege('anon', 'public.set_my_payment_details(text, text, text)', 'execute'),
  'Les droits sont posés sur les fonctions recréées');

select * from finish();
rollback;
