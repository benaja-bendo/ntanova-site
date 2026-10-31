-- Le cycle de vie d'une école et d'un relevé (ticket #10) : `supabase test db`.
-- Personnes fictives : A relais actif (Tié-Tié), C administrateur.

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a3', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a3"}'),
  ('00000000-0000-4000-8000-0000000000c3', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c3"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000c3');
select public.activer_relais('00000000-0000-4000-8000-0000000000a3', (select id from public.lots where nom = 'Tié-Tié'));

-- A envoie cinq relevés à Tié-Tié, avec un contact sur le premier.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
insert into public.releves (id, lot_id, pris_le, position, nom_enseigne)
select ('60000000-0000-4000-8000-00000000000' || n)::uuid, (select public.mon_lot()), now(),
       extensions.st_setsrid(extensions.st_makepoint(11.92 + n * 0.002, -4.79), 4326),
       '[École ' || n || ']'
from generate_series(1, 5) n;
select public.envoyer_contact('60000000-0000-4000-8000-000000000001', 'promoteur', '[Nom]', '242060000000', true, now());
select throws_ok(
  $$select public.publier_ecole((select id from public.ecoles limit 1))$$,
  '42501', null, 'Un relais ne publie pas'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);

-- Accepter rend l'école prête, pas publiée -------------------------------------------
select public.accepter_releve(('60000000-0000-4000-8000-00000000000' || n)::uuid) from generate_series(1, 4) n;
select is(
  (select array_agg(distinct publication::text) from public.ecoles where nom like '[École %'),
  array['prete'],
  'Accepter rend l''école prête, sans la publier'
);
select is((select count(*)::int from public.ecoles_publiees), 0, 'Rien n''est publié avant le geste « Publier »');

-- Publier une école, un lot, un arrondissement ----------------------------------------
select lives_ok(
  $$select public.publier_ecole((select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000001'))$$,
  'L''administration publie une école'
);
select is((select count(*)::int from public.ecoles_publiees), 1, 'L''école publiée paraît, les autres attendent');
select is(
  public.publier_lot((select id from public.lots where nom = 'Tié-Tié')), 3,
  'Publier un lot publie les écoles prêtes relevées dans ce lot'
);
select is(
  public.publier_arrondissement((select id from public.arrondissements where slug = 'tie-tie')), 0,
  'Publier un arrondissement déjà publié ne publie rien de plus'
);
select is((select count(*)::int from public.ecoles_publiees), 4, 'Les quatre écoles acceptées sont publiées');

-- Retirer, puis republier -----------------------------------------------------------------
select lives_ok(
  $$select public.retirer_ecole((select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000002'), 'demande_ecole', 'La direction l''a demandé')$$,
  'L''administration retire une école, avec un motif'
);
select is(
  (select count(*)::int from public.ecoles_publiees where nom = '[École 2]'), 0,
  'Une école retirée disparaît du site'
);
select is(
  (select motif_retrait::text || ' · ' || (retiree_le is not null)::text from public.ecoles where nom = '[École 2]'),
  'demande_ecole · true',
  'Le retrait garde son motif et sa date'
);
select lives_ok(
  $$select public.publier_ecole((select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000002'))$$,
  'Une école retirée se republie'
);

-- Refus définitif ; une école à situer ne se publie pas -------------------------------------
select public.refuser_releve('60000000-0000-4000-8000-000000000005', 'autre');
select throws_ok(
  $$select public.accepter_releve('60000000-0000-4000-8000-000000000005')$$,
  '22023', null, 'Un relevé refusé ne s''accepte plus'
);
reset role;
insert into public.ecoles (id, slug, nom, publication) values
  ('70000000-0000-4000-8000-000000000001', 'a-situer', '[École à situer]', 'brouillon');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
select throws_ok(
  $$select public.publier_ecole('70000000-0000-4000-8000-000000000001')$$,
  '22023', null, 'Une école à situer ne se publie pas : elle attend sa contre-visite'
);

-- Jamais de suppression d'école ; les effacements sont tracés --------------------------------
select throws_ok(
  $$delete from public.ecoles where nom = '[École 3]'$$,
  '42501', null, 'Personne ne supprime une école par l''API : on la retire'
);
select lives_ok(
  $$select public.effacer_contact('60000000-0000-4000-8000-000000000001', 'Demande de la personne')$$,
  'L''administration efface le contact d''une direction'
);
select is(
  public.contact_recu('60000000-0000-4000-8000-000000000001'), false,
  'Le contact effacé n''existe plus'
);

-- Fusionner deux fiches en doublon -----------------------------------------------------------
select lives_ok(
  $$select public.fusionner_ecoles(
      (select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000004'),
      (select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000003'))$$,
  'L''administration fusionne deux fiches en doublon'
);
select is(
  (select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000004'),
  (select ecole_id from public.releves where id = '60000000-0000-4000-8000-000000000003'),
  'Les relevés du doublon renvoient à l''école gardée'
);
reset role;

select is(
  (select string_agg(quoi, ',' order by id) from prive.effacements),
  'contact,fusion',
  'Le journal garde chaque effacement, dans l''ordre'
);

-- Le visiteur voit le renvoi du doublon, pas les écoles retirées pour une autre raison ----------
set local role anon;
select is(
  (select de_slug || ' → ' || vers_slug from public.ecoles_redirections),
  'ecole-4 → ecole-3',
  'L''ancienne adresse d''un doublon renvoie vers l''école gardée'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
select throws_ok(
  $$select public.effacer_contact('60000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Un relais n''efface rien'
);
reset role;

select * from finish();
rollback;
