-- L'administration situe une école, ou en ajoute une (ticket #15) : `supabase test db`.
-- Personnes fictives : A relais actif (Tié-Tié), C administrateur.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a6', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a6"}'),
  ('00000000-0000-4000-8000-0000000000c6', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c6"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000c6');
select public.activer_relais(
  '00000000-0000-4000-8000-0000000000a6', (select id from public.lots where nom = 'Tié-Tié'));

-- Une école connue, à situer (comme un import), et une autre déjà publiée à Tié-Tié.
insert into public.ecoles (id, slug, nom, publication) values
  ('41000000-0000-4000-8000-000000000001', 'ecole-connue', '[École connue]', 'brouillon'),
  ('41000000-0000-4000-8000-000000000003', 'ecole-retiree', '[École retirée]', 'brouillon');
insert into public.ecoles (id, arrondissement_id, slug, nom, position, publication) values
  ('41000000-0000-4000-8000-000000000002', (select id from public.arrondissements where slug = 'tie-tie'),
   'ecole-publiee', '[École publiée]', 'SRID=4326;POINT(11.93 -4.80)', 'publiee');

-- Ni un visiteur, ni un relais ---------------------------------------------------------------------

set local role anon;
select throws_ok(
  $$select public.ajouter_ecole('[Nouvelle]', -4.80, 11.93)$$,
  '42501', null, 'Un visiteur n''ajoute pas d''école'
);
select throws_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000001', -4.80, 11.93)$$,
  '42501', null, 'Un visiteur ne situe pas d''école'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a6', true);
select throws_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000001', -4.80, 11.93)$$,
  '42501', null, 'Un relais ne situe pas une école depuis l''administration'
);
select throws_ok(
  $$select public.ajouter_ecole('[Nouvelle]', -4.80, 11.93)$$,
  '42501', null, 'Un relais n''ajoute pas d''école depuis l''administration'
);
reset role;

-- L'administration situe l'école connue -------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c6', true);

select throws_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000001', 48.85, 2.35)$$,
  '22023', null, 'Une position hors des arrondissements ouverts est refusée'
);
select throws_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000001', 200, 11.93)$$,
  '22023', null, 'Une position illisible est refusée'
);
select is(
  public.situer_ecole('41000000-0000-4000-8000-000000000001', -4.80, 11.93),
  'Tié-Tié', 'La base dit où tombe la position'
);
reset role;

select is(
  (select publication::text from public.ecoles where id = '41000000-0000-4000-8000-000000000001'),
  'prete', 'L''école à situer devient prête'
);
select is(
  (select a.slug::text from public.ecoles e join public.arrondissements a on a.id = e.arrondissement_id
   where e.id = '41000000-0000-4000-8000-000000000001'),
  'tie-tie', 'Elle reçoit l''arrondissement qui contient sa position'
);
select is(
  (select situee_par from public.ecoles where id = '41000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-0000000000c6'::uuid,
  'La base garde qui a donné la position'
);
select is(
  (select relevee_le from public.ecoles where id = '41000000-0000-4000-8000-000000000001'),
  null, 'Ce n''est pas un relevé : pas de date de relevé'
);

-- Une école publiée ne change pas d'arrondissement ; une école retirée ne se modifie plus ---------

update public.ecoles set
  arrondissement_id = (select id from public.arrondissements where slug = 'tie-tie'),
  position = 'SRID=4326;POINT(11.93 -4.80)', publication = 'retiree', retiree_le = now(),
  motif_retrait = 'erreur'
where id = '41000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c6","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c6', true);
select throws_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000002', -4.86, 11.92)$$,
  '22023', null, 'Une école publiée ne passe pas dans un autre arrondissement (son adresse changerait)'
);
select lives_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000002', -4.8005, 11.9305)$$,
  'Une école publiée se déplace dans son arrondissement'
);
select throws_ok(
  $$select public.situer_ecole('41000000-0000-4000-8000-000000000003', -4.80, 11.93)$$,
  '22023', null, 'Une école retirée ne se modifie plus'
);

-- L'administration ajoute des écoles ---------------------------------------------------------------

select lives_ok(
  $$select public.ajouter_ecole('[Nouvelle école]', -4.86, 11.92, 'privee', '{maternelle,primaire}',
    null, '[face au marché]')$$,
  'L''administration ajoute une école située'
);
select lives_ok(
  $$select public.ajouter_ecole('[Nouvelle école]', -4.861, 11.921)$$,
  'Le même nom dans le même arrondissement est accepté'
);
select lives_ok(
  $$select public.ajouter_ecole('[École pas encore située]')$$,
  'Une école sans position entre à situer'
);
reset role;

select results_eq(
  $$select e.slug::text, coalesce(a.slug::text, '-'), e.publication::text, e.situee_le is not null
    from public.ecoles e left join public.arrondissements a on a.id = e.arrondissement_id
    where e.nom in ('[Nouvelle école]', '[École pas encore située]') order by e.slug$$,
  $$values ('ecole-pas-encore-situee', '-', 'brouillon', false),
           ('nouvelle-ecole', 'ngoyo', 'prete', true),
           ('nouvelle-ecole-2', 'ngoyo', 'prete', true)$$,
  'Chaque école ajoutée a son adresse, son arrondissement et son état'
);

-- Publiée, la fiche dit qu'elle a été ajoutée par NTanova ----------------------------------------

select public.publier_ecole('41000000-0000-4000-8000-000000000001');
set local role anon;
select is(
  (select (relevee_le is null and situee_le is not null and latitude is not null)
   from public.ecoles_publiees where slug = 'ecole-connue'),
  true, 'Le site public lit la date où elle a été située, et sa position'
);
reset role;

select * from finish();
rollback;
