-- Un lot d'essai périmé ne se pose plus sur un relevé. Le téléphone envoie le lot qu'il a lu un jour (`batch_id`) ;
-- si l'administration a sorti le relais de l'essai entre la prise de la fiche et son envoi, la fiche arrivait quand
-- même « du lot d'essai » : l'administration ne pouvait ni l'accepter ni la publier (05/11/2026, fiche d'un relais sorti
-- de l'essai le 02/11 et envoyée le 05/11). La base remplace alors le lot d'essai par le lot actuel du relais, qui peut
-- être nul. Un autre lot, lui, reste ce que le téléphone a envoyé : le lot est un secteur conseillé, jamais une barrière.

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- Mise en place : une division d'essai, un lot ordinaire pour Alice, un autre lot ordinaire, un lot d'essai pour Emma ----------

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, boundary, source)
select '7c000000-0000-4000-8000-000000000001'::uuid, p.id, 3, 'arrondissement', 'CG', '[Zone du lot d''essai périmé]',
       'zone-lot-essai-perime',
       extensions.st_multi(extensions.st_makeenvelope(12.50, -4.90, 12.60, -4.80, 4326)), 'test'
from public.geo_divisions p
where p.path::text = 'congo.pointe_noire.pointe_noire';

select public.register_relay('00000000-0000-4000-8000-0000000000a9', 'google-a9', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b9', 'google-b9', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000e9', 'google-e9', 'Emma');

insert into public.lots (id, nom, geo_division_id, essai) values
  ('60000000-0000-4000-8000-0000000000a9', '[Secteur d''Alice]', '7c000000-0000-4000-8000-000000000001', false),
  ('60000000-0000-4000-8000-0000000000b9', '[Un autre secteur]', '7c000000-0000-4000-8000-000000000001', false),
  ('60000000-0000-4000-8000-0000000000e9', '[Essai d''Emma]', '7c000000-0000-4000-8000-000000000001', true);
select public.activer_relais('00000000-0000-4000-8000-0000000000a9', '60000000-0000-4000-8000-0000000000a9');
select public.activer_relais('00000000-0000-4000-8000-0000000000b9', null);
select public.activer_relais('00000000-0000-4000-8000-0000000000e9', '60000000-0000-4000-8000-0000000000e9');

-- Les relevés arrivent -------------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a9","role":"authenticated"}', true);
insert into public.field_submissions (id, batch_id, taken_at, sign_name) values
  ('7d000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-0000000000e9', now(), '[Alice, lot d''essai périmé]'),
  ('7d000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-0000000000b9', now(), '[Alice, un autre lot ordinaire]');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b9","role":"authenticated"}', true);
insert into public.field_submissions (id, batch_id, taken_at, sign_name) values
  ('7d000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-0000000000e9', now(), '[Bastien, lot d''essai périmé]');
insert into public.field_submissions (id, taken_at, sign_name) values
  ('7d000000-0000-4000-8000-000000000004', now(), '[Bastien, aucun lot]');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
insert into public.field_submissions (id, batch_id, taken_at, sign_name) values
  ('7d000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-0000000000e9', now(), '[Emma, toujours en essai]');
insert into public.field_submissions (id, taken_at, sign_name) values
  ('7d000000-0000-4000-8000-000000000006', now(), '[Emma, lot de la base]');
reset role;

select is((select batch_id from public.field_submissions where id = '7d000000-0000-4000-8000-000000000001'),
  '60000000-0000-4000-8000-0000000000a9'::uuid,
  'Alice n''est plus en essai : le lot d''essai que son téléphone envoie devient son lot actuel');
select is((select batch_id from public.field_submissions where id = '7d000000-0000-4000-8000-000000000003'),
  null::uuid,
  'Bastien n''a aucun lot : le lot d''essai périmé disparaît, la fiche arrive sans lot');
select is((select count(*)::int from public.field_submissions s join public.lots l on l.id = s.batch_id
           where l.essai and s.relay_id in ('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-0000000000b9')),
  0, 'Aucune fiche d''un relais sorti de l''essai ne reste dans le lot d''essai');

select is((select batch_id from public.field_submissions where id = '7d000000-0000-4000-8000-000000000005'),
  '60000000-0000-4000-8000-0000000000e9'::uuid,
  'Emma est encore en essai : sa fiche reste du lot d''essai');
select is((select batch_id from public.field_submissions where id = '7d000000-0000-4000-8000-000000000006'),
  '60000000-0000-4000-8000-0000000000e9'::uuid,
  'Sans lot envoyé, la fiche prend le lot actuel de la relais, ici l''essai');

select is((select batch_id from public.field_submissions where id = '7d000000-0000-4000-8000-000000000002'),
  '60000000-0000-4000-8000-0000000000b9'::uuid,
  'Un lot ordinaire envoyé par le téléphone reste tel quel : le lot est un secteur conseillé, jamais une barrière');
select is((select batch_id from public.field_submissions where id = '7d000000-0000-4000-8000-000000000004'),
  null::uuid, 'Un relais sans lot qui n''envoie pas de lot : la fiche arrive sans lot');

-- La conséquence qui comptait : une fiche sortie du lot d'essai peut être acceptée -----------------------------------------------
select lives_ok($$select public.accept_submission('7d000000-0000-4000-8000-000000000001', 'new_institution', null, null, null,
                  '[]'::jsonb, '7c000000-0000-4000-8000-000000000001')$$,
  'La fiche d''Alice, sortie du lot d''essai, n''est plus refusée comme « fiche d''entraînement »');

select * from finish();
rollback;
