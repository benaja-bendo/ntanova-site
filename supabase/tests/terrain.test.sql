-- Le terrain : ce que le relais envoie, ce que la base calcule, le cache des écoles connues (doublon à 40 m sans
-- réseau), les photos multiples, le contact, les missions, les files de l'administration.

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000c1', 'google-c1', 'Chloé');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Tié-Tié'));
-- Chloé : en attente, sans lot.

-- Deux campus connus : l'un à Tié-Tié (11.93, -4.80), l'autre très loin, à Brazzaville ------------------------------------------------

insert into public.institutions (id, name) values
  ('a1000000-0000-4000-8000-000000000001', 'École [Près du marché]'), ('a1000000-0000-4000-8000-000000000002', 'École [Lointaine]'),
  ('a1000000-0000-4000-8000-000000000003', 'École [Fermée]');
insert into public.campuses (id, institution_id, label, slug, division_id, position, publication, origin, retirement_reason) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'Campus Nord', 'ecole-pres-du-marche',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'),
   extensions.st_setsrid(extensions.st_makepoint(11.93, -4.80), 4326), 'publiee', 'admin', null),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', null, 'ecole-lointaine',
   (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'),
   extensions.st_setsrid(extensions.st_makepoint(15.24, -4.26), 4326), 'publiee', 'admin', null),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000003', null, 'ecole-fermee',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'),
   extensions.st_setsrid(extensions.st_makepoint(11.94, -4.81), 4326), 'retiree', 'admin', 'fermeture');

-- Le doublon possible : une école ou un autre relevé à moins de 40 m ---------------------------------------------------------------

create function pg_temp.soumettre(p_id uuid, p_relais uuid, p_lon float8, p_lat float8, p_nom text default '[Relevé]',
                                  p_kind text default 'releve', p_corrige uuid default null) returns void language sql as $$
  insert into public.field_submissions (id, relay_id, kind, corrects_submission_id, taken_at, position, sign_name)
  values (p_id, p_relais, p_kind, p_corrige, now(), extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326), p_nom)
$$;
select pg_temp.soumettre('51000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 11.93020, -4.80, '[À 22 m d''une école]');
select pg_temp.soumettre('51000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a1', 11.93100, -4.80, '[À 110 m d''une école]');
select pg_temp.soumettre('51000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000b1', 11.94, -4.82, '[Premier relevé]');
select pg_temp.soumettre('51000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', 11.94020, -4.82, '[Tout près d''un autre relevé]');
select pg_temp.soumettre('51000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000a1', 11.94, -4.81, '[Au même point qu''une école retirée]');
select is((select possible_duplicate from public.field_submissions where id = '51000000-0000-4000-8000-000000000001'), true,
  'À 22 m d''un campus connu : doublon possible');
select is((select possible_duplicate from public.field_submissions where id = '51000000-0000-4000-8000-000000000002'), false,
  'À 110 m : pas de doublon');
select is((select possible_duplicate from public.field_submissions where id = '51000000-0000-4000-8000-000000000004'), true,
  'À moins de 40 m d''un relevé d''un autre relais : doublon possible');
select is((select possible_duplicate from public.field_submissions where id = '51000000-0000-4000-8000-000000000005'), false,
  'Un campus retiré ne compte plus pour les doublons');

-- Une correction n'est pas un doublon de la fiche qu'elle corrige -----------------------------------------------------------------------
select pg_temp.soumettre('51000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-0000000000a1', 11.94, -4.82, '[Correction]', 'correction', '51000000-0000-4000-8000-000000000004');
select is((select possible_duplicate from public.field_submissions where id = '51000000-0000-4000-8000-000000000006'), true,
  'Une correction est comparée aux autres fiches du secteur (ici le relevé de Bastien est à 0 m)');

-- Ce que la base impose, jamais le téléphone ------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, sign_name, observed_programs, programs_photographed, levels, school_kind)
values ('51000000-0000-4000-8000-000000000010', now(), '[Lycée technique]', 'Séries F2, F3 et G2 ; BTS en gestion', true, '{lycee,technique}', 'privee');
reset role;
select is((select relay_id::text || '|' || status || '|' || (received_at <= now())::text from public.field_submissions where id = '51000000-0000-4000-8000-000000000010'),
  '00000000-0000-4000-8000-0000000000a1|a_valider|true', 'L''auteur, le statut et l''heure de réception viennent de la base');
select is((select observed_programs || '|' || programs_photographed::text from public.field_submissions where id = '51000000-0000-4000-8000-000000000010'),
  'Séries F2, F3 et G2 ; BTS en gestion|true', 'Les séries et filières vues sur l''enseigne, et la mention « en photo », sont gardées');
select throws_ok($$insert into public.field_submissions (id, relay_id, taken_at, sign_name, observed_programs)
                   values (gen_random_uuid(), '00000000-0000-4000-8000-0000000000a1', now(), 'x', repeat('x', 601))$$,
  '23514', null, 'Les formations notées ont une limite (600 signes)');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name, kind, corrects_submission_id)
                   values (gen_random_uuid(), now(), 'x', 'correction', '51000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'Un relais ne corrige pas la fiche d''un autre');
reset role;

-- Le cache hors ligne : les écoles connues autour du lot du relais ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
create temp table cache_a as select * from public.known_places_in_my_batch();
reset role;
select is((select count(*)::int from cache_a where kind = 'campus'), 1,
  'Le cache contient le campus connu du lot (ni le lointain, ni le retiré)');
select is((select name from cache_a where kind = 'campus'), 'École [Près du marché] — Campus Nord',
  'Le nom du campus porte son implantation');
select ok((select count(*) from cache_a where kind = 'submission') >= 4,
  'Il contient aussi les relevés pas encore acceptés du lot, de tous les relais');
select ok(not exists (select 1 from cache_a where name = 'École [Lointaine]' or name = 'École [Fermée]'), 'Rien de lointain ni de retiré');
select ok((select latitude between -4.81 and -4.79 and longitude between 11.92 and 11.94 from cache_a where kind = 'campus'),
  'Chaque ligne donne le nom et la position (latitude, longitude), rien d''autre');
update public.field_submissions set status = 'accepte', campus_id = 'b1000000-0000-4000-8000-000000000001' where id = '51000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.known_places_in_my_batch() where name = '[À 22 m d''une école]'), 0,
  'Un relevé accepté n''est plus listé : le campus qui le porte suffit');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select is((select count(*)::int from public.known_places_in_my_batch()), 0, 'Un relais en attente ne reçoit aucune école');
reset role;

-- Le lot et les missions du relais ---------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select nom from public.my_batch()), 'Tié-Tié', 'Le relais lit son lot');
select ok((select contour_geojson like '{"type":"MultiPolygon"%' from public.my_batch()), 'Il reçoit son contour (celui de son arrondissement quand le lot n''en a pas)');
select is((select count(*)::int from public.my_missions()), 0, 'Aucune mission pour l''instant');
reset role;
select public.assign_mission('b1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'verify', 'Vérifier l''enseigne.');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select name || '|' || note || '|' || kind from public.my_missions()), 'École [Près du marché]|Vérifier l''enseigne.|verify',
  'Le relais lit ses missions, avec la consigne');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_missions()), 0, 'Un autre relais ne voit pas les missions de ce relais');
reset role;

-- Les photos : une enseigne, au plus trois autres ---------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is(public.register_photo('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'signboard', 'image/webp', 150000, 1280, 960), 'recu',
  'L''enseigne s''enregistre');
select is(public.register_photo('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000010', 'signboard', 'image/webp', 150000, 1280, 960), 'deja_recu',
  'Un second envoi de la même photo répond « déjà reçu » (rejouable)');
select is(public.register_photo('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000010', 'programs_board', 'image/jpeg', 90000), 'recu',
  'Le panneau des formations s''enregistre');
select is(public.register_photo('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000010', 'brochure', 'image/webp', 80000), 'recu',
  'Le prospectus s''enregistre');
select is(public.register_photo('52000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000010', 'building', 'image/webp', 70000), 'recu',
  'Une vue du bâtiment s''enregistre');
select is(public.register_photo('52000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000010', 'building', 'image/webp', 70000), 'recu',
  'Une quatrième photo en plus de l''enseigne entre (cinq au plus depuis le 13/11 : voir releve_bonus.test.sql)');
select throws_ok($$select public.register_photo('52000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000010', 'signboard', 'image/webp', 70000)$$,
  '23505', null, 'Une fiche n''a qu''une photo d''enseigne');
select throws_ok($$select public.register_photo(gen_random_uuid(), '51000000-0000-4000-8000-000000000001', 'building', 'image/gif', 70000)$$,
  '23514', null, 'Seuls le WebP et le JPEG sont acceptés');
reset role;
select is((select storage_path from public.field_submission_photos where id = '52000000-0000-4000-8000-000000000002'),
  '51000000-0000-4000-8000-000000000010/52000000-0000-4000-8000-000000000002.jpg',
  'Le chemin est calculé par la base (relevé/photo.extension), relatif, jamais choisi par le relais');
select is((select count(*)::int from public.field_submission_photos where submission_id = '51000000-0000-4000-8000-000000000010' and is_public), 0,
  'Aucune photo n''est publique d''office');
select throws_ok($$update public.field_submission_photos set is_public = true where id = '52000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Une photo ne devient publique qu''après la vérification « sans enfant » par l''administration');
select lives_ok($$update public.field_submission_photos set child_free_checked_at = now(), is_public = true where id = '52000000-0000-4000-8000-000000000001'$$,
  'Avec cette vérification datée, l''administration peut la rendre publique');

-- Le contact : un numéro n'est gardé qu'avec l'accord de la personne ----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.send_contact('51000000-0000-4000-8000-000000000010', 'directeur', '[Nom]', '242060000009', false)$$,
  '23514', null, 'Sans l''accord de la personne, le numéro n''est pas gardé');
select is(public.send_contact('51000000-0000-4000-8000-000000000010', 'directeur', '[Nom]', null, false, null, 'Repasser mardi'), 'recu',
  'Sans accord, la fonction et la note passent, sans numéro');
reset role;

-- Les files de l'administration ---------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select photos || '|' || signboard_received::text || '|' || has_programs_hint::text || '|' || contact_received::text
           from public.submissions_to_review where id = '51000000-0000-4000-8000-000000000010'), '5|true|true|true',
  'La file « À valider » dit combien de photos, si l''enseigne est là, si des formations sont signalées, si un contact est reçu');
select is((select sent || '|' || accepted from public.relay_counters where first_name = 'Alice'), '6|1',
  'Les compteurs de chaque relais : fiches envoyées et acceptées');
select is((select to_review::text from public.relay_counters where first_name = 'Alice'), '5', 'Et celles à valider');
reset role;

select * from finish();
rollback;
