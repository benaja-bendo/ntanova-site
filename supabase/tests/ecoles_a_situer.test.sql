-- Les écoles à situer, confiées à un relais, et la contre-visite (`supabase test db`).
-- Personnes fictives : A et B relais actifs, C administrateur.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- Mise en place (rôle postgres, comme l'import lancé dans Supabase Studio) -----

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a2', 'a@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[A]","provider_id":"google-a2"}'),
  ('00000000-0000-4000-8000-0000000000b2', 'b@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[B]","provider_id":"google-b2"}'),
  ('00000000-0000-4000-8000-0000000000c2', 'c@exemple.test', 'authenticated', 'authenticated',
   '{"provider":"google"}', '{"given_name":"[C]","provider_id":"google-c2"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000c2');
select public.activer_relais(id, (select id from public.lots where nom = 'Ngoyo'))
from public.relais where id in ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000b2');

select lives_ok(
  $$insert into public.ecoles (id, slug, nom, quartier, niveaux, publication) values
    ('40000000-0000-4000-8000-000000000001', 'ecole-a-situer', '[École à situer]', '[Quartier]', '{primaire}', 'brouillon')$$,
  'Une école entre en brouillon sans arrondissement ni position'
);
insert into prive.ecoles_sources (ecole_id, reference) values ('40000000-0000-4000-8000-000000000001', 'ETB-000');
insert into public.ecoles (id, slug, nom, publication) values
  ('40000000-0000-4000-8000-000000000002', 'autre-ecole-a-situer', '[Autre école à situer]', 'brouillon');
select throws_ok(
  $$update public.ecoles set publication = 'publiee' where id = '40000000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'Une école sans arrondissement ne se publie pas'
);

-- Le visiteur ne voit ni les écoles à situer, ni leur source ---------------------

set local role anon;
select is((select count(*)::int from public.ecoles where publication <> 'publiee'), 0,
  'Un visiteur ne voit pas les écoles à situer');
select throws_ok('select * from prive.ecoles_sources', '42501', null,
  'Personne ne lit par l''API d''où vient une école');
reset role;

-- L'administration confie une école à A ------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select throws_ok(
  $$select public.confier_ecole('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2')$$,
  '42501', null, 'Un relais ne se confie pas une école'
);
select is((select count(*)::int from public.ecoles where publication = 'brouillon'), 0,
  'Un relais ne voit pas les écoles qu''on ne lui confie pas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c2', true);
select lives_ok(
  $$select public.confier_ecole('40000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2', 'Repère à vérifier')$$,
  'L''administration confie une école à un relais'
);
select throws_ok(
  $$select public.confier_ecole('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000c2')$$,
  '22023', null, 'Une école ne se confie qu''à un relais actif'
);
reset role;

-- A la voit, B non ; A envoie une contre-visite ----------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
select is((select count(*)::int from public.ecoles_confiees), 0, 'B ne voit pas les écoles confiées à A');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
select is(
  (select e.nom || ' · ' || c.note from public.ecoles_confiees c join public.ecoles e on e.id = c.ecole_id),
  '[École à situer] · Repère à vérifier',
  'A lit l''école qu''on lui confie, même en brouillon, avec la note'
);
select throws_ok(
  $$insert into public.releves (id, lot_id, type, pris_le, nom_enseigne)
    values ('50000000-0000-4000-8000-000000000009', (select public.mon_lot()), 'contre_visite', now(), '[École]')$$,
  '23514', null,
  'Une contre-visite dit quelle école elle visite'
);
select lives_ok(
  $$insert into public.releves (id, lot_id, type, pris_le, position, precision_m, nom_enseigne, niveaux, type_ecole, reponse_doublon, doublon_de)
    values ('50000000-0000-4000-8000-000000000001', (select public.mon_lot()), 'contre_visite', now(),
            'SRID=4326;POINT(11.915 -4.86)', 9, '[École à situer, nom exact]', '{primaire,college}', 'privee',
            'la_meme', '40000000-0000-4000-8000-000000000001')$$,
  'A envoie une contre-visite de l''école confiée'
);
reset role;

-- L'administration l'accepte : l'école est située, publiée, et la mission finie ---

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c2', true);
select is(
  public.accepter_releve('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001'),
  '40000000-0000-4000-8000-000000000001'::uuid,
  'Accepter la contre-visite met à jour l''école visitée'
);
select is(
  (select a.slug || ' · ' || e.publication || ' · ' || (e.position is not null)::text
   from public.ecoles e join public.arrondissements a on a.id = e.arrondissement_id
   where e.id = '40000000-0000-4000-8000-000000000001'),
  'ngoyo · publiee · true',
  'L''école prend la position et l''arrondissement du relevé, et elle est publiée'
);
select is((select nom from public.ecoles_publiees where id = '40000000-0000-4000-8000-000000000001'),
  '[École à situer, nom exact]', 'Le public voit l''école avec le nom relevé sur place');
select is((select count(*)::int from public.ecoles_confiees), 0, 'La mission du relais est terminée');
select public.confier_ecole('40000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000a2');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
insert into public.releves (id, type, pris_le, nom_enseigne, reponse_doublon, doublon_de)
values ('50000000-0000-4000-8000-000000000002', 'contre_visite', now(), '[Autre école]',
        'la_meme', '40000000-0000-4000-8000-000000000002');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c2', true);
select public.accepter_releve('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002');
select is(
  (select a.slug from public.ecoles e join public.arrondissements a on a.id = e.arrondissement_id
   where e.id = '40000000-0000-4000-8000-000000000002'),
  'ngoyo',
  'Sans position, l''école prend l''arrondissement du lot du relais (la base rattache chaque relevé à son lot)'
);
reset role;

select * from finish();
rollback;
