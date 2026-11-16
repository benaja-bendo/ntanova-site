-- Les contacts de l'école sur sa fiche d'administration (16/11/2026) : toutes les personnes de toutes les fiches d'un site
-- (rattachées, contre-visites, et les fiches qu'elles corrigent), plus celles notées par l'administration sur le site.
-- Privées : seul l'administrateur les lit, par la fonction prévue.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- Mise en place (rôle postgres) -----------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));

insert into public.institutions(id, name, acronym) values
  ('e8000000-0000-4000-8000-0000000000c1', '[École des contacts]', null);
insert into public.campuses(id, institution_id, slug, division_id, publication, origin)
select x.id, 'e8000000-0000-4000-8000-0000000000c1', x.slug, d.id, 'publiee', 'admin'
from (values ('e9000000-0000-4000-8000-0000000000c1'::uuid, 'ecole-des-contacts-1'),
             ('e9000000-0000-4000-8000-0000000000c2'::uuid, 'ecole-des-contacts-2'),
             ('e9000000-0000-4000-8000-0000000000c3'::uuid, 'ecole-des-contacts-3')) x(id, slug)
cross join (select id from public.geo_divisions where level = 3 limit 1) d;

-- Site 1 : une fiche d'origine renvoyée en correction (sans site), sa correction acceptée sur le site 1, une contre-visite.
insert into public.field_submissions (id, relay_id, taken_at, sign_name, status) values
  ('5c000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', '2026-11-10T09:00:00Z', '[Origine]', 'a_corriger');
insert into public.field_submissions (id, relay_id, taken_at, sign_name, kind, corrects_submission_id, status, campus_id) values
  ('5c000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', '2026-11-11T09:00:00Z', '[Correction]',
   'correction', '5c000000-0000-4000-8000-000000000001', 'accepte', 'e9000000-0000-4000-8000-0000000000c1');
insert into public.field_submissions (id, relay_id, taken_at, sign_name, kind, duplicate_of_campus_id) values
  ('5c000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', '2026-11-12T09:00:00Z', '[Contre-visite]',
   'contre_visite', 'e9000000-0000-4000-8000-0000000000c1');
-- Site 2 : une fiche à lui, qui ne doit jamais apparaître sur le site 1.
insert into public.field_submissions (id, relay_id, taken_at, sign_name, status, campus_id) values
  ('5c000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', now(), '[Autre site]', 'accepte',
   'e9000000-0000-4000-8000-0000000000c2');

insert into prive.direction_contacts (id, submission_id, role, name, whatsapp, contact_agreement, agreement_at) values
  ('5d000000-0000-4000-8000-000000000001', '5c000000-0000-4000-8000-000000000001', 'directeur', '[Directrice]', '242060000001', true, now()),
  ('5d000000-0000-4000-8000-000000000003', '5c000000-0000-4000-8000-000000000003', 'secretariat', '[Secrétaire]', null, false, null),
  ('5d000000-0000-4000-8000-000000000004', '5c000000-0000-4000-8000-000000000004', 'directeur', '[Ailleurs]', '242060000004', true, now());

-- Le relais (Alice) ne lit ni n'ajoute rien ---------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select * from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'Le relais ne lit pas les contacts d''une école');
select throws_ok($$select public.add_campus_contact('e9000000-0000-4000-8000-0000000000c1', 'directeur', null, '[Nom]', null, false)$$,
  '42501', null, 'Le relais ne note pas de contact sur une école');
reset role;

set local role anon;
select throws_ok($$select * from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1')$$,
  '42501', null, 'L''API publique ne lit pas les contacts d''une école');
reset role;

-- L'administrateur (Dominique) ------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1')), 2,
  'Le site 1 rassemble la personne de la fiche d''origine (corrigée) et celle de la contre-visite');
select is((select id from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1') limit 1),
  '5d000000-0000-4000-8000-000000000001'::uuid, 'Celle qui a un numéro vient d''abord');
select is((select relay_first_name from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1') limit 1),
  'Alice', 'Chaque personne dit quel relais l''a rencontrée');
select is((select submission_taken_at from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1') limit 1),
  '2026-11-10T09:00:00Z'::timestamptz, 'et le jour de la fiche');
select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1') where name = '[Ailleurs]'), 0,
  'Une personne d''un autre site n''apparaît jamais');
select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c3')), 0,
  'Un site sans fiche n''a aucun contact');

-- Noter une personne sur un site sans fiche (école importée, numéro reçu par WhatsApp).
create temp table notees (n int, id uuid);
grant all on notees to authenticated;
insert into notees select 1, public.add_campus_contact('e9000000-0000-4000-8000-0000000000c3', 'autre', 'propriétaire', ' [Propriétaire] ', '242060000009', true, 'reçu sur WhatsApp');
select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c3')), 1,
  'L''administration note un contact sur un site sans fiche');
select is((select name || '|' || role_detail || '|' || source || '|' || coalesce(submission_id::text, 'sans fiche')
           from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c3')),
  '[Propriétaire]|propriétaire|administration|sans fiche', 'Il est gardé tel quel, marqué « administration », sans fiche');
select isnt((select agreement_at from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c3')), null,
  'Son accord est daté');
select throws_ok($$select public.add_campus_contact('e9000000-0000-4000-8000-0000000000c3', 'directeur', null, '[Sans accord]', '242060000008', false)$$,
  '22023', null, 'Pas de numéro sans l''accord de la personne');
select throws_ok($$select public.add_campus_contact('e9000000-0000-4000-8000-0000000000ff', 'directeur', null, '[Nom]', null, false)$$,
  'P0002', null, 'Un site inconnu est refusé');
select lives_ok($$select public.add_campus_contact('e9000000-0000-4000-8000-0000000000c1', 'directeur', null, '[Sans numéro]', null, false)$$,
  'Une personne sans numéro se note sans accord');
select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c1')), 3,
  'Sur un site qui a des fiches, la personne notée s''ajoute aux leurs');

-- Corriger une personne notée sur le site : la même fonction que pour une fiche.
select lives_ok($$select public.update_contact((select id from notees where n = 1), 'directeur', null, '[Directeur]', '242060000007', true, null, null)$$,
  'L''administration corrige une personne notée sur le site');
select is((select name || '|' || whatsapp from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c3')),
  '[Directeur]|242060000007', 'La correction est gardée');
reset role;

select throws_ok($$insert into prive.direction_contacts (role, name) values ('directeur', '[Orpheline]')$$,
  '23514', null, 'Une personne a une fiche ou un site, jamais aucun des deux');

-- Fusion : les contacts notés sur le doublon passent sur le site gardé.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$select public.merge_campuses('e9000000-0000-4000-8000-0000000000c3', 'e9000000-0000-4000-8000-0000000000c2')$$,
  'Le site 3 est fusionné dans le site 2');
select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c2') where name = '[Directeur]'), 1,
  'Le contact noté sur le doublon se lit sur le site gardé');

-- Effacer (droit d'effacement) : le registre garde le site.
select lives_ok($$select public.erase_contact_person((select id from notees where n = 1), 'demande de la personne')$$,
  'L''administration efface une personne notée sur le site');
select is((select count(*)::int from public.contacts_of_campus('e9000000-0000-4000-8000-0000000000c2') where name = '[Directeur]'), 0,
  'Elle n''apparaît plus');
reset role;
select is((select count(*)::int from prive.erasures where what = 'contact' and campus_id = 'e9000000-0000-4000-8000-0000000000c2'), 1,
  'L''effacement est tracé avec son site');
select is((select count(*)::int from prive.erasures where what = 'contact' and submission_id is null and campus_id is null), 0,
  'Aucun effacement sans fiche ni site');

select * from finish();
rollback;
