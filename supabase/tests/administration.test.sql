-- Les décisions de l'administration (`supabase test db`).
-- Personnes fictives : A relais actif, C administrateur qui est aussi relais (lot Essai).

begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

-- Mise en place (rôle postgres) ---------------------------------------------

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a1"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c1"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000c1');

-- Le relais A envoie trois relevés -------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);

select lives_ok(
  $$select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'))$$,
  'L''administration active un relais sur un lot'
);
select lives_ok(
  $$select public.activer_relais('00000000-0000-4000-8000-0000000000c1', (select id from public.lots where essai))$$,
  'L''administrateur peut aussi être relais, sur le lot Essai'
);
select is(
  (select count(*)::int from public.lots), 3,
  'Un administrateur voit tous les lots : l''application doit filtrer sur le sien'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

insert into public.releves (id, lot_id, pris_le, position, nom_enseigne, niveaux, type_ecole) values
  ('30000000-0000-4000-8000-000000000001', (select public.mon_lot()), now(),
   'SRID=4326;POINT(11.925 -4.79)', '[École floue]', '{primaire}', 'privee'),
  ('30000000-0000-4000-8000-000000000002', (select public.mon_lot()), now(),
   'SRID=4326;POINT(11.93 -4.80)', '[École refusée]', '{primaire}', 'privee'),
  ('30000000-0000-4000-8000-000000000003', (select public.mon_lot()), now(),
   'SRID=4326;POINT(11.935 -4.795)', '[École publiée]', '{college}', 'privee');

select throws_ok(
  $$select public.demander_correction('30000000-0000-4000-8000-000000000001', 'photo_floue')$$,
  '42501', null, 'Un relais ne demande pas de correction'
);
select throws_ok(
  $$select public.refuser_releve('30000000-0000-4000-8000-000000000002', 'autre')$$,
  '42501', null, 'Un relais ne refuse pas un relevé'
);
select throws_ok(
  $$select public.confirmer_contact('30000000-0000-4000-8000-000000000001', 'promoteur')$$,
  '42501', null, 'Un relais ne confirme pas un contact'
);
select throws_ok(
  $$select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select public.mon_lot()))$$,
  '42501', null, 'Un relais ne s''active pas lui-même'
);
update public.relais set statut = 'actif', lot_id = null where id = '00000000-0000-4000-8000-0000000000c1';
reset role;
select is(
  (select statut::text from public.relais where id = '00000000-0000-4000-8000-0000000000c1'), 'actif',
  'Un relais ne modifie pas la ligne d''un autre'
);

-- L'administration décide -------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);

select lives_ok(
  $$select public.demander_correction('30000000-0000-4000-8000-000000000001', 'photo_floue', 'Reprenez la photo de face.')$$,
  'L''administration demande une correction'
);
select lives_ok(
  $$select public.refuser_releve('30000000-0000-4000-8000-000000000002', 'autre', 'Ce n''est pas une école.')$$,
  'L''administration refuse un relevé'
);
select isnt(
  public.accepter_releve('30000000-0000-4000-8000-000000000003'), null,
  'L''administration accepte un relevé'
);
select throws_ok(
  $$select public.refuser_releve('30000000-0000-4000-8000-000000000003', 'autre')$$,
  'P0002', null, 'Un relevé accepté ne se refuse plus'
);
select lives_ok(
  $$select public.confirmer_contact('30000000-0000-4000-8000-000000000003', 'promoteur')$$,
  'L''administration confirme la fonction du contact'
);

reset role;

-- Le relais lit les décisions et corrige ----------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

select is(
  (select statut || ' · ' || message_au_relais from public.releves where id = '30000000-0000-4000-8000-000000000001'),
  'a_corriger · Reprenez la photo de face.',
  'Le relais lit la demande de correction et son message'
);
select is(
  (select contact_fonction::text from public.releves where id = '30000000-0000-4000-8000-000000000003'),
  'promoteur',
  'Le relais voit « Confirmé · promoteur », sans rien du contact'
);

insert into public.releves (id, lot_id, type, corrige_releve_id, pris_le, position, nom_enseigne) values
  ('30000000-0000-4000-8000-000000000011', (select public.mon_lot()), 'correction',
   '30000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(11.925 -4.79)', '[École nette]'),
  ('30000000-0000-4000-8000-000000000013', (select public.mon_lot()), 'correction',
   '30000000-0000-4000-8000-000000000003', now(), 'SRID=4326;POINT(11.935 -4.795)', '[École publiée, nom exact]');

reset role;

-- Accepter une correction -----------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);

select public.accepter_releve('30000000-0000-4000-8000-000000000011');
select is(
  (select statut::text from public.releves where id = '30000000-0000-4000-8000-000000000001'), 'accepte',
  'Accepter la correction clôt la fiche d''origine'
);
select is(
  (select o.ecole_id = c.ecole_id from public.releves o, public.releves c
   where o.id = '30000000-0000-4000-8000-000000000001' and c.id = '30000000-0000-4000-8000-000000000011'),
  true,
  'La fiche d''origine et sa correction pointent vers la même école'
);

select public.accepter_releve('30000000-0000-4000-8000-000000000013');
select is(
  (select ecole_id from public.releves where id = '30000000-0000-4000-8000-000000000013'),
  (select ecole_id from public.releves where id = '30000000-0000-4000-8000-000000000003'),
  'La correction d''une fiche publiée met à jour son école'
);
select is(
  (select nom from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '30000000-0000-4000-8000-000000000003'),
  '[École publiée, nom exact]',
  'L''école publiée prend le nom corrigé'
);
select is(
  (select count(*)::int from public.ecoles where nom like '[École publiée%'), 1,
  'Aucune seconde école n''est créée par une correction'
);

reset role;
select * from finish();
rollback;
