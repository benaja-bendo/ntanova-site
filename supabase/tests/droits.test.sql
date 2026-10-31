-- Les droits et les règles de la base, vérifiés à chaque version (`supabase test db`).
-- Personnes fictives : A relais actif, B relais en attente, C administrateur,
-- D relais actif. Toutes les valeurs entre crochets sont des exemples.

begin;
create extension if not exists pgtap with schema extensions;
select plan(39);

-- Mise en place (rôle postgres) ---------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a"}'),
  ('00000000-0000-4000-8000-00000000000b', 'b@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"full_name":"[B] [Nom]","provider_id":"google-b"}'),
  ('00000000-0000-4000-8000-00000000000c', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c"}'),
  ('00000000-0000-4000-8000-00000000000d', 'd@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[D]","provider_id":"google-d"}');

select is(
  (select count(*)::int from public.relais where statut = 'en_attente'), 4,
  'Chaque première connexion crée un relais en attente'
);
select is(
  (select google_sub || ' ' || prenom from public.relais where id = '00000000-0000-4000-8000-00000000000b'),
  'google-b [B]',
  'Le relais garde son identifiant Google et son prénom'
);

select public.activer_relais(id, (select id from public.lots where nom = 'Tié-Tié'))
from public.relais
where id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000d');
insert into prive.admins (id) values ('00000000-0000-4000-8000-00000000000c');

insert into public.ecoles (id, arrondissement_id, slug, nom, position, publication) values
  ('20000000-0000-4000-8000-000000000001', (select id from public.arrondissements where slug = 'tie-tie'),
   'ecole-exemple-publiee', '[École exemple publiée]', 'SRID=4326;POINT(11.924994 -4.791049)', 'publiee'),
  ('20000000-0000-4000-8000-000000000002', (select id from public.arrondissements where slug = 'ngoyo'),
   'ecole-exemple-brouillon', '[École exemple brouillon]', 'SRID=4326;POINT(11.936842 -4.864314)', 'brouillon');

insert into public.releves (id, relais_id, pris_le, nom_enseigne, position)
values ('10000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-00000000000d', now(),
        '[École D]', 'SRID=4326;POINT(11.93 -4.80)');

-- Le visiteur ---------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

select is((select count(*)::int from public.ecoles_publiees), 1, 'Un visiteur ne voit que les écoles publiées');
select is((select count(*)::int from public.arrondissements), 2, 'Un visiteur lit les arrondissements');
select throws_ok('select * from public.releves', '42501', null, 'Un visiteur ne lit aucun relevé');
select throws_ok('select * from public.relais', '42501', null, 'Un visiteur ne lit aucun relais');
select throws_ok('select * from prive.contacts_direction', '42501', null, 'Un visiteur ne lit aucun contact');
select throws_ok(
  $$select public.envoyer_contact('10000000-0000-4000-8000-0000000000d1')$$, '42501', null,
  'Un visiteur ne peut rien envoyer'
);

reset role;

-- Le relais actif A ---------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

select lives_ok(
  $$insert into public.releves (id, pris_le, position, precision_m, nom_enseigne, niveaux, type_ecole)
    values ('10000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(11.925 -4.79113)', 12,
            '[Complexe scolaire Exemple]', '{maternelle,primaire}', 'privee')$$,
  'Un relais actif envoie un relevé'
);
select throws_ok(
  $$insert into public.releves (id, pris_le, nom_enseigne)
    values ('10000000-0000-4000-8000-000000000001', now(), '[Complexe scolaire Exemple]')$$,
  '23505', null,
  'Un second envoi du même relevé est refusé : « déjà reçu »'
);
select is(
  public.envoyer_contact('10000000-0000-4000-8000-000000000001', 'promoteur', '[Nom]', '242060000000', true, now(), null),
  'recu',
  'Le contact de la direction part une première fois'
);
select is(
  public.envoyer_contact('10000000-0000-4000-8000-000000000001', 'promoteur', '[Nom]', '242060000000', true, now(), null),
  'deja_recu',
  'Un second envoi du même contact répond « déjà reçu »'
);
select throws_ok(
  'select * from prive.contacts_direction', '42501', null,
  'Le relais ne relit jamais un contact, même le sien'
);
select throws_ok(
  $$select * from public.contact_du_releve('10000000-0000-4000-8000-000000000001')$$, '42501', null,
  'Le relais ne lit pas le contact par la fonction de l''administration'
);
select throws_ok(
  $$select public.envoyer_contact('10000000-0000-4000-8000-0000000000d1', 'directeur')$$, 'P0002', null,
  'Le relais n''envoie pas de contact pour le relevé d''un autre'
);
select throws_ok(
  $$insert into public.releves (id, pris_le, nom_enseigne, statut)
    values ('10000000-0000-4000-8000-000000000002', now(), '[École]', 'accepte')$$,
  '42501', null,
  'Le relais ne choisit pas le statut de son relevé'
);

update public.releves set statut = 'accepte' where id = '10000000-0000-4000-8000-000000000001';
select is(
  (select statut::text from public.releves where id = '10000000-0000-4000-8000-000000000001'), 'a_valider',
  'Le relais ne peut pas changer le statut de son relevé'
);
select throws_ok(
  $$select public.accepter_releve('10000000-0000-4000-8000-000000000001')$$, '42501', null,
  'Le relais ne peut pas accepter son relevé'
);

select lives_ok(
  $$insert into public.releves (id, pris_le, position, nom_enseigne)
    values ('10000000-0000-4000-8000-000000000003', now(), 'SRID=4326;POINT(11.926842 -4.864314)', '[École loin]')$$,
  'Un relevé hors du lot est reçu quand même'
);
select throws_ok(
  $$select public.envoyer_contact('10000000-0000-4000-8000-000000000003', 'directeur', null, '242060000001', false)$$,
  '23514', null,
  'Sans l''accord de la personne, son numéro est refusé'
);
select lives_ok(
  $$insert into public.releves (id, lot_id, pris_le, position, nom_enseigne)
    values ('10000000-0000-4000-8000-00000000000e', (select public.mon_lot()), now(),
            'SRID=4326;POINT(11.92 -4.785)', '[École d''entraînement]')$$,
  'Un relais envoie un relevé d''entraînement'
);

select is((select count(*)::int from public.releves), 3, 'Le relais relit ses relevés, pas ceux des autres');
select is((select count(*)::int from public.relais), 1, 'Le relais ne voit que sa propre ligne');
select is((select nom from public.lots), 'Tié-Tié', 'Le relais voit son lot');

select lives_ok(
  $$insert into storage.objects (bucket_id, name) values ('releves', '10000000-0000-4000-8000-000000000001/enseigne.jpg')$$,
  'Le relais envoie la photo de son relevé'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('releves', '10000000-0000-4000-8000-000000000001/enseigne.jpg')$$,
  '23505', null,
  'Une seconde photo pour le même relevé est refusée : « déjà reçu »'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name) values ('releves', '10000000-0000-4000-8000-0000000000d1/enseigne.jpg')$$,
  '42501', null,
  'Le relais n''envoie pas de photo pour le relevé d''un autre'
);

reset role;

-- Le relais en attente B ----------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);

select throws_ok(
  $$insert into public.releves (id, pris_le, nom_enseigne)
    values ('10000000-0000-4000-8000-0000000000b1', now(), '[École]')$$,
  '42501', null,
  'Un relais en attente ne peut rien envoyer'
);
select is(
  (select statut::text from public.relais), 'en_attente',
  'Un relais en attente lit son statut (« compte en attente »)'
);
select is((select count(*)::int from public.lots), 0, 'Un relais en attente ne voit aucun lot');

reset role;

-- L'administrateur C ---------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000c', true);

select is((select count(*)::int from public.releves_a_valider), 4, 'L''administration voit tous les relevés à valider');
select is(
  (select nom from public.contact_du_releve('10000000-0000-4000-8000-000000000001')), '[Nom]',
  'L''administration lit le contact de la direction'
);
select isnt(
  public.accepter_releve('10000000-0000-4000-8000-000000000001'), null,
  'L''administration accepte un relevé'
);
select public.publier_ecole((select ecole_id from public.releves where id = '10000000-0000-4000-8000-000000000001'));
select is(
  (select slug::text from public.ecoles_publiees where nom = '[Complexe scolaire Exemple]'), 'complexe-scolaire-exemple',
  'La fiche acceptée puis publiée paraît, à une adresse tirée de son nom'
);

reset role;

-- Les calculs de la base (rôle postgres) ------------------------------------

select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

update public.releves set lot_id = (select id from public.lots where essai)
where id = '10000000-0000-4000-8000-00000000000e';
select throws_ok(
  $$select public.accepter_releve('10000000-0000-4000-8000-00000000000e')$$, '22023', null,
  'Un relevé du lot d''essai ne se publie jamais'
);

select ok(
  (select doublon_possible from public.releves where id = '10000000-0000-4000-8000-000000000001'),
  'Un relevé à moins de 40 m d''une école est un doublon possible'
);
select ok(
  not (select doublon_possible from public.releves where id = '10000000-0000-4000-8000-000000000003'),
  'Un relevé isolé n''est pas un doublon'
);
select ok(
  (select hors_lot from public.releves where id = '10000000-0000-4000-8000-000000000003'),
  'Un relevé hors du contour du lot est signalé'
);

-- Les droits, vus d'ensemble -------------------------------------------------

select is_empty(
  $$select table_name from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public'
      and (privilege_type <> 'SELECT' or table_name not in ('arrondissements', 'ecoles', 'ecoles_publiees', 'ecoles_redirections'))$$,
  'Le visiteur ne fait que lire les arrondissements, les écoles et les renvois des doublons'
);

select * from finish();
rollback;
