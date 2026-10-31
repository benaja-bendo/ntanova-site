-- Toutes les écoles : les listes (types, niveaux) et le programme (ticket #12) : `supabase test db`.
-- Personnes fictives : A relais actif (Tié-Tié), C administrateur.

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a4', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a4"}'),
  ('00000000-0000-4000-8000-0000000000c4', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c4"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000c4');
select public.activer_relais(
  '00000000-0000-4000-8000-0000000000a4', (select id from public.lots where nom = 'Tié-Tié'));

-- Les listes s'élargissent, sans rien casser (rôle postgres) -------------------------------

select lives_ok(
  $$insert into public.ecoles (slug, nom, type_ecole, niveaux) values
    ('ecole-communautaire', '[École communautaire]', 'communautaire', '{creche,maternelle}'),
    ('centre-de-formation', '[Centre de formation]', 'autre', '{technique,autre_formation}')$$,
  'Les types « communautaire » et « autre » et les niveaux « creche » et « autre_formation » entrent'
);
select throws_ok(
  $$insert into public.ecoles (slug, nom, type_ecole) values ('type-inconnu', '[École]', 'type_de_demain')$$,
  '23514', null, 'Un type que la liste ne connaît pas est refusé'
);
select throws_ok(
  $$insert into public.ecoles (slug, nom, niveaux) values ('niveau-inconnu', '[École]', '{primaire,niveau_de_demain}')$$,
  '23514', null, 'Un niveau que la liste ne connaît pas est refusé'
);
insert into public.ecoles (slug, nom) values ('sans-rien', '[École sans rien d''écrit]');
select is(
  (select type_ecole::text || '|' || cardinality(niveaux)::text from public.ecoles where slug = 'sans-rien'),
  'non_indique|0',
  'Sans rien dire, une école est « non_indique », sans niveau : le défaut de la base'
);

-- Le programme : une ligne libre de 200 signes au plus -----------------------------------------

select lives_ok(
  $$insert into public.ecoles (slug, nom, programme) values
    ('avec-programme', '[École]', 'Programme français-congolais, bilingue')$$,
  'Une école garde son programme'
);
select throws_ok(
  $$insert into public.ecoles (slug, nom, programme) values ('programme-trop-long', '[École]', repeat('a', 201))$$,
  '23514', null, 'Le programme d''une école tient en 200 signes'
);

-- Le relais envoie un type, des niveaux et un programme -------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);

select lives_ok(
  $$insert into public.releves (id, lot_id, pris_le, position, nom_enseigne, type_ecole, niveaux, programme)
    values ('80000000-0000-4000-8000-000000000001', (select public.mon_lot()), now(),
            'SRID=4326;POINT(11.93 -4.80)', '[École communautaire du quartier]', 'communautaire',
            '{creche,maternelle,primaire}', 'Programme français-congolais')$$,
  'Le relais envoie un type nouveau, des niveaux nouveaux et un programme'
);
select throws_ok(
  $$insert into public.releves (id, pris_le, nom_enseigne, programme)
    values ('80000000-0000-4000-8000-000000000002', now(), '[École]', repeat('a', 201))$$,
  '23514', null, 'Le programme d''un relevé tient en 200 signes'
);
select lives_ok(
  $$insert into public.releves (id, lot_id, pris_le, position, nom_enseigne)
    values ('80000000-0000-4000-8000-000000000003', (select public.mon_lot()), now(),
            'SRID=4326;POINT(11.95 -4.80)', '[École sans rien d''écrit]')$$,
  'Un relevé sans type, sans niveau ni programme (un téléphone d''avant le ticket 12) est reçu'
);
select is(
  (select type_ecole::text || '|' || cardinality(niveaux)::text || '|' || coalesce(programme, 'rien')
   from public.releves where id = '80000000-0000-4000-8000-000000000003'),
  'non_indique|0|rien',
  'Sans rien dire, un relevé est « non_indique », sans niveau ni programme'
);
reset role;

-- L'administration accepte : l'école reçoit tout ------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c4', true);

select public.accepter_releve('80000000-0000-4000-8000-000000000001');
select is(
  (select e.type_ecole::text || '|' || e.niveaux::text || '|' || e.programme
   from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '80000000-0000-4000-8000-000000000001'),
  'communautaire|{creche,maternelle,primaire}|Programme français-congolais',
  'Accepter un relevé donne à l''école son type, ses niveaux et son programme'
);
reset role;

-- A repasse sans rien voir d'écrit : « Pas indiqué » n'efface pas ce que l'école sait déjà --------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select lives_ok(
  $$insert into public.releves (id, lot_id, pris_le, nom_enseigne, reponse_doublon, doublon_de)
    values ('80000000-0000-4000-8000-000000000004', (select public.mon_lot()), now(),
            '[École communautaire du quartier]', 'la_meme',
            (select ecole_id from public.releves where id = '80000000-0000-4000-8000-000000000001'))$$,
  'Un second relevé de la même école, où rien n''est indiqué, est reçu'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c4', true);
select public.accepter_releve(
  '80000000-0000-4000-8000-000000000004',
  (select ecole_id from public.releves where id = '80000000-0000-4000-8000-000000000001'));
select is(
  (select e.type_ecole::text || '|' || e.niveaux::text || '|' || e.programme
   from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '80000000-0000-4000-8000-000000000001'),
  'communautaire|{creche,maternelle,primaire}|Programme français-congolais',
  'Un relevé « Pas indiqué », sans niveau ni programme, n''efface rien de ce que l''école sait déjà'
);
reset role;

-- Un relevé qui dit quelque chose de nouveau remplace -----------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a4', true);
select lives_ok(
  $$insert into public.releves (id, lot_id, pris_le, nom_enseigne, type_ecole, niveaux, programme, reponse_doublon, doublon_de)
    values ('80000000-0000-4000-8000-000000000005', (select public.mon_lot()), now(),
            '[École communautaire du quartier]', 'publique', '{primaire}', 'Programme congolais', 'la_meme',
            (select ecole_id from public.releves where id = '80000000-0000-4000-8000-000000000001'))$$,
  'Un relevé qui lit autre chose sur l''enseigne est reçu'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c4","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c4', true);
select public.accepter_releve(
  '80000000-0000-4000-8000-000000000005',
  (select ecole_id from public.releves where id = '80000000-0000-4000-8000-000000000001'));
select is(
  (select e.type_ecole::text || '|' || e.niveaux::text || '|' || e.programme
   from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '80000000-0000-4000-8000-000000000001'),
  'publique|{primaire}|Programme congolais',
  'Un relevé qui dit quelque chose remplace le type, les niveaux et le programme'
);

-- Le visiteur lit le programme dans la vue des écoles publiées --------------------------------------

select public.publier_ecole((select ecole_id from public.releves where id = '80000000-0000-4000-8000-000000000001'));
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select programme from public.ecoles_publiees
   where nom = '[École communautaire du quartier]'),
  'Programme congolais',
  'Un visiteur lit le programme dans la vue des écoles publiées'
);
reset role;

select * from finish();
rollback;
