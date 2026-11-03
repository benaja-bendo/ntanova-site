-- Plusieurs personnes à contacter par fiche (ticket #96) : le relais en envoie jusqu'à trois, l'administration en ajoute,
-- en corrige et en efface une par une. Les numéros restent privés : personne ne les lit par l'API, sauf l'administration
-- par les fonctions prévues.
-- Les téléphones d'avant continuent d'envoyer UN contact avec l'ancienne forme de l'appel : sa clé reste le numéro de la fiche.

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- Mise en place (rôle postgres) -----------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));

insert into public.field_submissions (id, relay_id, taken_at, sign_name) values
  ('51000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', now(), '[Fiche d''Alice]'),
  ('51000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a1', now(), '[Autre fiche d''Alice]'),
  ('51000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', now(), '[Fiche de Bastien]');

-- Le relais (Alice) -------------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- L'ancienne forme de l'appel (sept paramètres) : un téléphone d'avant envoie un seul contact, sans rien changer.
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'directeur', '[Directrice]', '242060000001', true, now(), null),
  'recu', 'Un téléphone d''avant envoie son contact comme avant');
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'directeur', '[Directrice]', '242060000001', true, now(), null),
  'deja_recu', 'Le même envoi rejoué répond « déjà reçu »');

-- La personne en plus, avec son identifiant : rejouable sans doublon.
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'autre', '[Propriétaire]', '242060000002', true, now(), null,
    '53000000-0000-4000-8000-0000000000a2', 'propriétaire'),
  'recu', 'Une deuxième personne part avec son identifiant');
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'autre', '[Propriétaire]', '242060000002', true, now(), null,
    '53000000-0000-4000-8000-0000000000a2', 'propriétaire'),
  'deja_recu', 'Cette deuxième personne rejouée ne fait pas de doublon');
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'directeur', '[Enseignant]', null, false, null, null,
    '53000000-0000-4000-8000-0000000000a3', 'ignoré hors « autre »'),
  'recu', 'Une troisième personne sans numéro (sans accord) est reçue');
select throws_ok($$select public.send_contact('51000000-0000-4000-8000-0000000000a1', 'autre', '[Quatrième]', null, false, null, null,
    '53000000-0000-4000-8000-0000000000a4')$$,
  '22023', null, 'Une fiche a trois personnes au plus');
select throws_ok($$select public.send_contact('51000000-0000-4000-8000-0000000000a2', 'autre', '[Volée]', null, false, null, null,
    '53000000-0000-4000-8000-0000000000a2')$$,
  '23505', null, 'Un identifiant de personne déjà pris par une autre fiche est refusé, pas avalé');
select throws_ok($$select public.send_contact('51000000-0000-4000-8000-0000000000b1', 'autre', '[Pas à moi]', null, false, null, null,
    '53000000-0000-4000-8000-0000000000e1')$$,
  'P0002', null, 'Le relais n''envoie pas de personne pour la fiche d''un autre');
select throws_ok($$select * from prive.direction_contacts$$, '42501', null, 'Le relais ne relit jamais un contact');
select throws_ok($$select public.add_contact('51000000-0000-4000-8000-0000000000a2', 'directeur', null, '[Nom]', null, false)$$,
  '42501', null, 'Le relais n''ajoute pas de personne à la manière de l''administration');
select throws_ok($$select public.erase_contact_person('51000000-0000-4000-8000-0000000000a1')$$,
  '42501', null, 'Le relais n''efface pas de personne');
reset role;

-- Ce qui est gardé (rôle postgres) ------------------------------------------------------------------------------------------------

select is((select count(*)::int from prive.direction_contacts where submission_id = '51000000-0000-4000-8000-0000000000a1'), 3,
  'Trois personnes sont gardées pour la fiche');
select is((select id from prive.direction_contacts where submission_id = '51000000-0000-4000-8000-0000000000a1' and role = 'directeur' and name = '[Directrice]'),
  '51000000-0000-4000-8000-0000000000a1'::uuid, 'La première garde le numéro de la fiche pour identifiant');
select is((select role_detail from prive.direction_contacts where id = '53000000-0000-4000-8000-0000000000a2'), 'propriétaire',
  'La précision d''une fonction « autre » est gardée');
select is((select role_detail from prive.direction_contacts where id = '53000000-0000-4000-8000-0000000000a3'), null,
  'Une précision hors « autre » n''est pas gardée');
select is((select source from prive.direction_contacts where id = '53000000-0000-4000-8000-0000000000a2'), 'relais',
  'Ce que le relais envoie est marqué « relais »');
select is(public.contact_received('51000000-0000-4000-8000-0000000000a1'), true, 'La fiche a un contact reçu');
select throws_ok($$insert into prive.direction_contacts (submission_id, role, whatsapp, contact_agreement)
    values ('51000000-0000-4000-8000-0000000000a2', 'directeur', '242060000009', false)$$,
  '23514', null, 'Pas de numéro sans l''accord de la personne');

-- L'administrateur (Dominique) ------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

select is((select count(*)::int from public.contact_of_submission('51000000-0000-4000-8000-0000000000a1')), 3,
  'L''administrateur lit les trois personnes');
select is((select id from public.contact_of_submission('51000000-0000-4000-8000-0000000000a1') limit 1),
  '51000000-0000-4000-8000-0000000000a1'::uuid, 'La première lue est la première reçue');
select is((select string_agg(source, ',') from public.contact_of_submission('51000000-0000-4000-8000-0000000000a1')), 'relais,relais,relais',
  'Chaque personne dit d''où elle vient');

-- Il en ajoute sur l'autre fiche, qui n'en a aucune (le cas d'une fiche arrivée sans contact).
create temp table ajoutees (n int, id uuid);
grant all on ajoutees to authenticated;
insert into ajoutees select 1, public.add_contact('51000000-0000-4000-8000-0000000000a2', 'directeur', null, '[Directeur ajouté]', '242060000003', true);
select is((select count(*)::int from public.contact_of_submission('51000000-0000-4000-8000-0000000000a2')), 1,
  'L''administration ajoute une personne à une fiche arrivée sans contact');
select is((select source from public.contact_of_submission('51000000-0000-4000-8000-0000000000a2')), 'administration',
  'Elle est marquée « administration »');
select throws_ok($$select public.add_contact('51000000-0000-4000-8000-0000000000a2', 'directeur', null, '[Sans accord]', '242060000004', false)$$,
  '22023', null, 'Pas de numéro sans l''accord de la personne, même pour l''administration');
select throws_ok($$select public.add_contact('51000000-0000-4000-8000-0000000000ff', 'directeur', null, '[Nom]', null, false)$$,
  'P0002', null, 'Une fiche inconnue est refusée');

-- Elle corrige.
select lives_ok($$select public.update_contact((select id from ajoutees where n = 1), 'autre', 'comptable externe', '[Nom corrigé]', '242060000005', true, null, null)$$,
  'L''administration corrige une personne');
select is((select name || '|' || whatsapp || '|' || role::text || '|' || role_detail from public.contact_of_submission('51000000-0000-4000-8000-0000000000a2')),
  '[Nom corrigé]|242060000005|autre|comptable externe', 'La correction est gardée');
select throws_ok($$select public.update_contact((select id from ajoutees where n = 1), 'autre', null, '[Nom]', '242060000005', false, null, null)$$,
  '22023', null, 'Retirer l''accord sans retirer le numéro est refusé');

-- Elle efface une personne : les autres restent, la confirmation de la fonction aussi.
select public.confirm_contact('51000000-0000-4000-8000-0000000000a1', 'directeur');
select lives_ok($$select public.erase_contact_person('53000000-0000-4000-8000-0000000000a2', 'demande de la personne')$$,
  'L''administration efface une personne');
select is((select count(*)::int from public.contact_of_submission('51000000-0000-4000-8000-0000000000a1')), 2,
  'Les autres personnes de la fiche restent');
select throws_ok($$select public.erase_contact_person('53000000-0000-4000-8000-0000000000a2')$$,
  'P0002', null, 'Une personne déjà effacée n''existe plus');
reset role;

select isnt((select contact_confirmed_at from public.field_submissions where id = '51000000-0000-4000-8000-0000000000a1'), null,
  'La fonction confirmée reste tant qu''il reste une personne');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select public.erase_contact_person('53000000-0000-4000-8000-0000000000a3');
select public.erase_contact_person('51000000-0000-4000-8000-0000000000a1');
reset role;
select is((select contact_confirmed_at from public.field_submissions where id = '51000000-0000-4000-8000-0000000000a1'), null,
  'La confirmation tombe avec la dernière personne effacée');
select is((select count(*)::int from prive.erasures where what = 'contact' and submission_id = '51000000-0000-4000-8000-0000000000a1'), 3,
  'Chaque effacement est tracé');

select * from finish();
rollback;
