-- Qui a le droit de quoi : visiteur, relais actif, relais en attente, administrateur.
-- La séparation TERRAIN / PUBLIC : un relais n'écrit que dans `field_submissions` (et ses photos et son contact par
-- des fonctions) ; le public ne lit que le catalogue publié ; le privé n'est lisible par personne par l'API.
-- Les identités sont posées comme le fait PostgREST (réglage `request.jwt.claims`) : ce test n'utilise pas auth.users.

begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- Mise en place (rôle postgres) -----------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000c1', 'google-c1', 'Chloé');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));
-- C reste en attente.

insert into public.institutions (id, name, kind) values
  ('a1000000-0000-4000-8000-000000000001', '[École publiée]', 'privee'),
  ('a1000000-0000-4000-8000-000000000002', '[École en brouillon]', 'privee');
insert into public.campuses (id, institution_id, slug, division_id, publication, origin) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'ecole-publiee',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'ecole-en-brouillon',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'brouillon', 'admin');
insert into public.campus_cycles (id, campus_id, cycle) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'primaire'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'primaire');
insert into public.campus_programs (campus_cycle_id, title) values
  ('c1000000-0000-4000-8000-000000000001', 'Programme publié'),
  ('c1000000-0000-4000-8000-000000000002', 'Programme en brouillon');

-- Un relevé de B, déjà là, avec une photo et un contact : A ne doit jamais les voir.
insert into public.field_submissions (id, relay_id, taken_at, sign_name)
values ('51000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', now(), '[Relevé de Bastien]');
insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
values ('52000000-0000-4000-8000-0000000000b1', '51000000-0000-4000-8000-0000000000b1', 'signboard',
        '51000000-0000-4000-8000-0000000000b1/52000000-0000-4000-8000-0000000000b1.webp', 'image/webp', 100000);
insert into prive.direction_contacts (submission_id, role, name, whatsapp, contact_agreement)
values ('51000000-0000-4000-8000-0000000000b1', 'directeur', '[Nom de la direction]', '242060000000', true);

-- Un visiteur ------------------------------------------------------------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '', true);

select is((select count(*)::int from public.campuses), 1, 'Un visiteur ne voit que les campus publiés');
select is((select count(*)::int from public.institutions), 1, 'Un visiteur ne voit que les institutions qui ont un campus publié');
select is((select count(*)::int from public.campus_cycles), 1, 'Un visiteur ne voit que les cycles des campus publiés');
select is((select count(*)::int from public.campus_programs), 1, 'Un visiteur ne voit que les formations des campus publiés');
select is((select count(*)::int from public.public_campuses), 1, 'Un visiteur lit la vue des campus publiés');
select ok((select count(*) from public.geo_divisions) > 30, 'Un visiteur lit la géographie');
select ok((select count(*) from public.education_domains) > 10, 'Un visiteur lit les domaines de formation');
select throws_ok($$select * from public.field_submissions$$, '42501', null, 'Un visiteur ne lit aucun relevé');
select throws_ok($$select * from public.relais$$, '42501', null, 'Un visiteur ne lit aucun relais');
select throws_ok($$select * from public.field_submission_photos$$, '42501', null, 'Un visiteur ne lit aucune photo');
select throws_ok($$select * from prive.direction_contacts$$, '42501', null, 'Un visiteur ne lit aucun contact (schéma privé)');
select throws_ok($$select * from public.payout_lines$$, '42501', null, 'Un visiteur ne lit aucune paie');
select throws_ok($$select * from public.lots$$, '42501', null, 'Un visiteur ne lit aucun lot');
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name) values (gen_random_uuid(), now(), 'x')$$,
  '42501', null, 'Un visiteur ne peut rien envoyer');
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-0000000000b1')$$, '42501', null,
  'Un visiteur n''appelle aucune fonction de l''administration');
select lives_ok($$select * from public.search_campuses('publiée')$$, 'Un visiteur peut chercher dans le catalogue publié');
reset role;

-- Un relais en attente --------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name) values (gen_random_uuid(), now(), 'x')$$,
  '42501', null, 'Un relais en attente ne peut rien envoyer');
select is((select statut from public.relais where id = '00000000-0000-4000-8000-0000000000c1'), 'en_attente',
  'Un relais en attente lit son statut (« compte en attente »)');
select is((select count(*)::int from public.lots), 0, 'Un relais en attente ne voit aucun lot');
select throws_ok($$select public.send_contact('51000000-0000-4000-8000-0000000000b1')$$, '42501', null,
  'Un relais en attente n''envoie aucun contact');
reset role;

-- Un relais actif (Alice) ------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select lives_ok($$insert into public.field_submissions (id, taken_at, sign_name, position)
    values ('51000000-0000-4000-8000-0000000000a1', now(), '[Relevé d''Alice]', 'SRID=4326;POINT(11.93 -4.80)')$$,
  'Un relais actif envoie un relevé');
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name)
    values ('51000000-0000-4000-8000-0000000000a1', now(), 'x')$$,
  '23505', null, 'Un second envoi du même relevé est refusé : « déjà reçu »');
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name, status)
    values (gen_random_uuid(), now(), 'x', 'accepte')$$,
  '42501', null, 'Le relais ne choisit pas le statut de son relevé (colonne non accordée)');
select throws_ok($$insert into public.field_submissions (id, relay_id, taken_at, sign_name)
    values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000b1', now(), 'x')$$,
  '42501', null, 'Le relais n''écrit pas au nom d''un autre');
update public.field_submissions set status = 'accepte' where id = '51000000-0000-4000-8000-0000000000a1';
select is((select status from public.field_submissions where id = '51000000-0000-4000-8000-0000000000a1'), 'a_valider',
  'Le relais ne peut pas changer le statut de son relevé (les règles de ligne écartent sa demande)');
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-0000000000a1')$$, '42501', null,
  'Le relais ne peut pas accepter son relevé');
select is((select count(*)::int from public.field_submissions), 1, 'Le relais relit ses relevés, pas ceux des autres');
select is((select count(*)::int from public.relais), 1, 'Le relais ne voit que sa propre ligne');
select is((select count(*)::int from public.lots), 1, 'Le relais voit son lot');
select is((select count(*)::int from public.field_submission_photos), 0, 'Le relais ne relit aucune photo');
select throws_ok($$select * from prive.direction_contacts$$, '42501', null, 'Le relais ne lit jamais un contact (schéma privé)');
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'directeur', '[Nom]', '242060000001', true, now(), null), 'recu',
  'Le contact de la direction part une première fois');
select is(public.send_contact('51000000-0000-4000-8000-0000000000a1', 'directeur', '[Nom]', '242060000001', true, now(), null), 'deja_recu',
  'Un second envoi du même contact répond « déjà reçu »');
select throws_ok($$select public.send_contact('51000000-0000-4000-8000-0000000000b1')$$, 'P0002', null,
  'Le relais n''envoie pas de contact pour le relevé d''un autre');
select is(public.register_photo('52000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-0000000000a1', 'signboard', 'image/webp', 120000, 1280, 960), 'recu',
  'Le relais enregistre la photo de son relevé');
select throws_ok($$select public.register_photo(gen_random_uuid(), '51000000-0000-4000-8000-0000000000b1', 'signboard', 'image/webp', 1000)$$,
  'P0002', null, 'Le relais n''enregistre pas de photo pour le relevé d''un autre');

-- La séparation : aucun droit d'écriture sur le catalogue, la géographie, les lots, les missions ----------------------------------
select throws_ok($$insert into public.institutions (name) values ('x')$$, '42501', null, 'Le relais n''écrit pas dans les institutions');
update public.campuses set slug = 'x';
select is((select slug from public.campuses where id = 'b1000000-0000-4000-8000-000000000001'), 'ecole-publiee',
  'Le relais ne modifie aucun campus (les règles de ligne écartent sa demande)');
select throws_ok($$delete from public.campuses$$, '42501', null, 'Le relais ne supprime aucun campus');
select throws_ok($$insert into public.campus_cycles (campus_id, cycle) values ('b1000000-0000-4000-8000-000000000001', 'lycee')$$,
  '42501', null, 'Le relais n''ajoute aucun cycle');
select throws_ok($$insert into public.campus_programs (campus_cycle_id, title) values ('c1000000-0000-4000-8000-000000000001', 'x')$$,
  '42501', null, 'Le relais n''ajoute aucune formation');
update public.geo_divisions set open_for_fieldwork = true;
select is((select count(*)::int from public.geo_divisions where open_for_fieldwork), 2,
  'Le relais n''ouvre aucune zone : seules Tié-Tié et Ngoyo le sont (les règles de ligne écartent sa demande)');
select throws_ok($$insert into public.lots (nom, geo_division_id) select 'x', id from public.geo_divisions where level = 3 limit 1$$,
  '42501', null, 'Le relais ne crée aucun lot');
select throws_ok($$select public.create_catalog_entry('{}')$$, '42501', null, 'Le relais n''importe aucune école');
select is((select count(*)::int from public.missions), 0, 'Le relais ne lit pas la table des missions (il passe par my_missions)');
reset role;

-- Un administrateur (Dominique) ---------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select count(*)::int from public.field_submissions), 2, 'L''administrateur lit tous les relevés');
select is((select count(*)::int from public.relais), 4, 'L''administrateur lit tous les relais');
select is((select count(*)::int from public.campuses), 2, 'L''administrateur lit tous les campus, publiés ou non');
select is((select count(*)::int from public.field_submission_photos), 2, 'L''administrateur lit les photos');
select is((select count(*)::int from public.contact_of_submission('51000000-0000-4000-8000-0000000000b1')), 1,
  'L''administrateur lit un contact, par la fonction prévue');
select throws_ok($$select * from prive.direction_contacts$$, '42501', null,
  'Même l''administrateur ne lit pas la table privée directement : seulement par les fonctions');
select throws_ok($$delete from public.campuses$$, '42501', null, 'Personne ne supprime un campus par l''API');
select throws_ok($$delete from public.field_submissions$$, '42501', null, 'Personne ne supprime un relevé par l''API');
select throws_ok($$delete from public.institutions$$, '42501', null, 'Personne ne supprime une institution par l''API');
reset role;

-- Le tableau des droits, relu dans le catalogue de la base -------------------------------------------------------------------------

select is((select string_agg(table_name, ',' order by table_name) from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public'
             and privilege_type not in ('SELECT')),
  null, 'Un visiteur n''a que le droit de lire (jamais d''écrire)');
select is((select string_agg(table_name, ',' order by table_name) from information_schema.role_table_grants
           where grantee = 'anon' and table_schema = 'public' and privilege_type = 'SELECT'),
  'campus_cycles,campus_fees,campus_programs,campuses,education_domains,geo_divisions,institutions,public_campus_cycles,public_campus_programs,public_campus_redirects,public_campuses',
  'Le visiteur ne lit que le catalogue publié, la géographie et les domaines');
select is((select count(*)::int from information_schema.role_table_grants
           where grantee in ('anon', 'authenticated', 'public') and table_schema = 'prive'), 0,
  'Aucun rôle de l''API n''a de droit sur le schéma privé');
select is((select count(*)::int from information_schema.role_table_grants
           where grantee = 'authenticated' and table_schema = 'public' and privilege_type = 'DELETE'
             and table_name not in ('campus_cycles', 'campus_programs', 'lots', 'echanges')), 0,
  'L''API ne supprime ni institution, ni campus, ni relevé, ni photo, ni mission (seuls cycles, formations, lots et échanges)');
select ok(not has_schema_privilege('authenticated', 'prive', 'usage'), 'L''API ne peut même pas ouvrir le schéma privé');

select * from finish();
rollback;
