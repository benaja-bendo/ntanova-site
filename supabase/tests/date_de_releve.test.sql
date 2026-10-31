-- La date « Fiche relevée le … » est celle du relevé, et l'administration corrige une fiche
-- sans repasser par le relais (ticket #12) : `supabase test db`.
-- Personnes fictives : A relais actif (Tié-Tié), C administrateur.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a5', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a5"}'),
  ('00000000-0000-4000-8000-0000000000c5', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c5"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000c5');
select public.activer_relais(
  '00000000-0000-4000-8000-0000000000a5', (select id from public.lots where nom = 'Tié-Tié'));

-- A relève une école il y a trente jours ---------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
insert into public.releves (id, lot_id, pris_le, position, nom_enseigne, type_ecole, niveaux)
values ('90000000-0000-4000-8000-000000000001', (select public.mon_lot()), now() - interval '30 days',
        'SRID=4326;POINT(11.93 -4.80)', '[École relevée]', 'privee', '{primaire}');
reset role;

-- L'administration l'accepte, puis la publie ------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c5', true);
select public.accepter_releve('90000000-0000-4000-8000-000000000001');
select is(
  (select e.relevee_le from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  (select pris_le from public.releves where id = '90000000-0000-4000-8000-000000000001'),
  'La date de relevé d''une école est celle de la photo du relevé accepté'
);

select public.publier_ecole((select ecole_id from public.releves where id = '90000000-0000-4000-8000-000000000001'));
select is(
  (select e.relevee_le from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  (select pris_le from public.releves where id = '90000000-0000-4000-8000-000000000001'),
  'Publier une école ne rajeunit pas sa date de relevé'
);
select ok(
  (select e.mis_a_jour_le > e.relevee_le from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  'Publier remet à jour mis_a_jour_le : c''est lui que la fiche affichait, à tort, comme date de relevé'
);

-- L'administration corrige la fiche, sans relais ----------------------------------------------------

select lives_ok(
  $$update public.ecoles set
      nom = '[École renommée]', type_ecole = 'publique', niveaux = '{primaire,college}',
      programme = 'Programme congolais', repere = '[Repère]', numero_enseigne = '242060000009'
    where id = (select ecole_id from public.releves where id = '90000000-0000-4000-8000-000000000001')$$,
  'L''administration corrige le nom, le type, les niveaux, le programme, le repère et le numéro'
);
select is(
  (select e.nom || '|' || e.type_ecole || '|' || e.niveaux::text || '|' || e.programme || '|' || e.repere || '|' || e.numero_enseigne
   from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  '[École renommée]|publique|{primaire,college}|Programme congolais|[Repère]|242060000009',
  'La correction est enregistrée'
);
select is(
  (select e.relevee_le from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  (select pris_le from public.releves where id = '90000000-0000-4000-8000-000000000001'),
  'Corriger une fiche à la main ne rajeunit pas sa date de relevé'
);
reset role;

-- Un relais ne corrige aucune fiche ---------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
update public.ecoles set nom = '[Piratée]', type_ecole = 'privee' where publication = 'publiee';
reset role;
select is(
  (select e.nom || '|' || e.type_ecole from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  '[École renommée]|publique',
  'Un relais ne corrige aucune fiche'
);

-- Un nouveau relevé avance la date ; un relevé plus ancien ne la fait pas reculer -----------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
insert into public.releves (id, lot_id, pris_le, nom_enseigne, reponse_doublon, doublon_de) values
  ('90000000-0000-4000-8000-000000000002', (select public.mon_lot()), now() - interval '10 days',
   '[École renommée]', 'la_meme', (select ecole_id from public.releves where id = '90000000-0000-4000-8000-000000000001')),
  ('90000000-0000-4000-8000-000000000003', (select public.mon_lot()), now() - interval '60 days',
   '[École renommée]', 'la_meme', (select ecole_id from public.releves where id = '90000000-0000-4000-8000-000000000001'));
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c5","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c5', true);
select public.accepter_releve('90000000-0000-4000-8000-000000000002',
  (select ecole_id from public.releves where id = '90000000-0000-4000-8000-000000000001'));
select is(
  (select e.relevee_le from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  (select pris_le from public.releves where id = '90000000-0000-4000-8000-000000000002'),
  'Un relevé plus récent, une fois accepté, avance la date de relevé'
);
select public.accepter_releve('90000000-0000-4000-8000-000000000003',
  (select ecole_id from public.releves where id = '90000000-0000-4000-8000-000000000001'));
select is(
  (select e.relevee_le from public.ecoles e join public.releves r on r.ecole_id = e.id
   where r.id = '90000000-0000-4000-8000-000000000001'),
  (select pris_le from public.releves where id = '90000000-0000-4000-8000-000000000002'),
  'Un relevé plus ancien ne fait pas reculer la date de relevé'
);
reset role;

-- Le site public lit la date de relevé -------------------------------------------------------------

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
-- (le relevé le plus récent, accepté plus haut, date d'il y a dix jours ; un visiteur ne lit aucun relevé)
select is(
  (select relevee_le from public.ecoles_publiees where slug = 'ecole-relevee'),
  now() - interval '10 days',
  'La vue des écoles publiées donne la date de relevé'
);
reset role;

select * from finish();
rollback;
