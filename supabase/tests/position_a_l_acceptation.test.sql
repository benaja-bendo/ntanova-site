-- Ticket 144 : l'administration peut saisir la position d'une école sur la fiche « À valider », quand le téléphone du relais
-- n'a pas pu la mesurer. La position entre dans la même décision que l'acceptation ; l'original du relais reste intact ; la
-- base garde qui l'a posée et quand (règle « jamais de position inventée »).

begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select public.register_relay('00000000-0000-4000-8000-0000000000a4', 'google-a4', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d4', 'google-d4', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d4');
select public.activer_relais('00000000-0000-4000-8000-0000000000a4', null);

-- Des écoles déjà connues : une à situer, une vérifiée par la direction, une retirée.
insert into public.institutions (id, name) values
  ('a4000000-0000-4000-8000-000000000001', '[École à situer]'),
  ('a4000000-0000-4000-8000-000000000002', '[École vérifiée]'),
  ('a4000000-0000-4000-8000-000000000003', '[École retirée]');
insert into public.campuses (id, institution_id, slug, publication, origin) values
  ('b4000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'ecole-a-situer-144', 'brouillon', 'admin');
insert into public.campuses (id, institution_id, slug, publication, origin, verification_state, verified_on) values
  ('b4000000-0000-4000-8000-000000000002', 'a4000000-0000-4000-8000-000000000002', 'ecole-verifiee-144', 'brouillon', 'admin', 'verifiee', current_date);
insert into public.campuses (id, institution_id, slug, publication, origin, retirement_reason) values
  ('b4000000-0000-4000-8000-000000000003', 'a4000000-0000-4000-8000-000000000003', 'ecole-retiree-144', 'retiree', 'admin', 'erreur');

-- Des fiches de relais : la plupart sans position (le téléphone ne l'a pas mesurée), une avec.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}', true);
set local role authenticated;
insert into public.field_submissions (id, kind, taken_at, position, sign_name, levels, school_kind) values
  ('d4000000-0000-4000-8000-000000000001', 'releve', now() - interval '1 day', null, '[Sans position, dans un contour]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000002', 'releve', now() - interval '1 day', null, '[Sans position, hors contour]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000003', 'releve', now() - interval '1 day', 'SRID=4326;POINT(11.93 -4.80)', '[Avec la position du relais]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000004', 'releve', now() - interval '1 day', null, '[Sans position, ajout de niveaux]', '{college}', 'privee'),
  ('d4000000-0000-4000-8000-000000000005', 'releve', now() - interval '1 day', null, '[Sans position, école à situer]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000006', 'releve', now() - interval '1 day', null, '[Sans position, école vérifiée]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000007', 'releve', now() - interval '1 day', null, '[Sans position, école retirée]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000008', 'releve', now() - interval '1 day', null, '[Sans position, sans position saisie]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-000000000009', 'releve', now() - interval '1 day', null, '[Mal écrite]', '{primaire}', 'privee'),
  ('d4000000-0000-4000-8000-00000000000a', 'releve', now() - interval '1 day', null, '[Position à valeurs impossibles]', '{primaire}', 'privee');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000001', p_latitude => -4.80, p_longitude => 11.93)$$,
  '42501', null, 'Un relais ne peut pas accepter, même avec une position');
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d4","role":"authenticated"}', true);
set local role authenticated;

-- Une seule fonction, avec la position en plus -----------------------------------------------------------------------------------

select has_function('public', 'accept_reviewed_submission',
  array['uuid', 'text', 'uuid', 'uuid', 'text', 'jsonb', 'uuid', 'jsonb', 'double precision', 'double precision', 'jsonb'],
  'accept_reviewed_submission reçoit une latitude et une longitude facultatives (et, depuis le 13/11, les équipements gardés)');
select hasnt_function('public', 'accept_reviewed_submission',
  array['uuid', 'text', 'uuid', 'uuid', 'text', 'jsonb', 'uuid', 'jsonb'],
  'et l''ancienne signature n''existe plus : un seul chemin, pas deux fonctions');

-- Ce qui est refusé, sans rien écrire -----------------------------------------------------------------------------------------------

select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000001', p_latitude => -4.80)$$,
  '22023', null, 'Une latitude sans longitude est refusée');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000001', p_longitude => 11.93)$$,
  '22023', null, 'Une longitude sans latitude est refusée');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-00000000000a', p_latitude => 95, p_longitude => 11.93)$$,
  '22023', null, 'Une latitude impossible est refusée');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-00000000000a', p_latitude => -4.80, p_longitude => 181)$$,
  '22023', null, 'Une longitude impossible est refusée');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000003', p_latitude => -4.81, p_longitude => 11.94)$$,
  '22023', null, 'La position mesurée par le relais n''est pas remplacée à l''acceptation');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000004', 'add_cycle',
  p_campus => 'b4000000-0000-4000-8000-000000000001', p_latitude => -4.80, p_longitude => 11.93)$$,
  '22023', null, 'Ajouter des niveaux ne change pas la position de l''école');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000002', p_latitude => -4.85, p_longitude => 14.00)$$,
  '22023', null, 'Une position qu''aucun contour ne contient demande que l''administration choisisse la division');
select ok((select status = 'a_valider' and campus_id is null from public.field_submissions where id = 'd4000000-0000-4000-8000-000000000002'),
  'Un échec ne crée ni école ni décision');
select is((select count(*)::int from public.submission_reviews), 0, 'Un échec n''écrit aucune révision');

-- Une nouvelle école : la position saisie entre dans la même décision --------------------------------------------------------------

create temp table acceptee as
  select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000001', p_latitude => -4.80, p_longitude => 11.93) as campus;
select ok((select extensions.st_x(c.position)::numeric = 11.93 and extensions.st_y(c.position)::numeric = -4.80
  from public.campuses c where c.id = (select campus from acceptee)), 'La position saisie devient celle de l''école');
select is((select d.name from public.campuses c join public.geo_divisions d on d.id = c.division_id where c.id = (select campus from acceptee)),
  'Tié-Tié', 'La division est celle du contour qui contient la position, sans la choisir à la main');
select ok((select c.publication = 'prete' from public.campuses c where c.id = (select campus from acceptee)),
  'L''école est prête, jamais publiée d''office');
select ok((select c.located_by = public.current_user_id() and c.located_at = now() from public.campuses c where c.id = (select campus from acceptee)),
  'La base garde qui a posé la position, et quand');
select ok((select s.position is null and s.status = 'accepte' from public.field_submissions s where s.id = 'd4000000-0000-4000-8000-000000000001'),
  'Le relevé du relais reste intact : il n''avait pas de position');
select ok((select (changes -> 'position' ->> 'latitude')::numeric = -4.80 and (changes -> 'position' ->> 'longitude')::numeric = 11.93
    and reviewed_by = public.current_user_id()
  from public.submission_reviews where submission_id = 'd4000000-0000-4000-8000-000000000001'),
  'La révision garde la position saisie, son auteur et sa date');
select is(public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000001', p_latitude => -4.81, p_longitude => 11.94),
  (select campus from acceptee), 'Une répétition de l''acceptation reste idempotente');
select ok((select extensions.st_y(c.position)::numeric = -4.80 from public.campuses c where c.id = (select campus from acceptee)),
  'Une répétition ne déplace pas l''école');

-- Hors de tout contour : l'administration choisit la division, la position reste celle qu'elle a saisie --------------------------

select lives_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000002', p_latitude => -4.85, p_longitude => 14.00,
  p_division => (select id from public.geo_divisions where name = 'Tié-Tié' limit 1))$$,
  'Avec la division choisie, une position hors de tout contour est acceptée');
select ok((select extensions.st_x(c.position)::numeric = 14.00 and d.name = 'Tié-Tié'
  from public.field_submissions s join public.campuses c on c.id = s.campus_id join public.geo_divisions d on d.id = c.division_id
  where s.id = 'd4000000-0000-4000-8000-000000000002'), 'La division choisie rattache l''école, la position saisie reste la position');

-- Les corrections de valeurs et la position se décident ensemble -------------------------------------------------------------------

select lives_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000009',
  p_changes => '{"sign_name":"[Bien écrite]"}', p_latitude => -4.80, p_longitude => 11.93)$$,
  'Les corrections et la position s''acceptent ensemble');
select ok((select changes ->> 'sign_name' = '[Bien écrite]' and changes ? 'position'
  from public.submission_reviews where submission_id = 'd4000000-0000-4000-8000-000000000009'),
  'La révision garde le nom corrigé et la position');

-- Une école connue : la décision passe par « Situer », avec ses règles --------------------------------------------------------------

select lives_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000005', 'update_campus',
  p_campus => 'b4000000-0000-4000-8000-000000000001', p_latitude => -4.80, p_longitude => 11.93)$$,
  'La mise à jour d''une école à situer reçoit la position saisie');
select ok((select c.publication = 'prete' and extensions.st_y(c.position)::numeric = -4.80 and c.located_by = public.current_user_id()
    and d.name = 'Tié-Tié'
  from public.campuses c join public.geo_divisions d on d.id = c.division_id where c.id = 'b4000000-0000-4000-8000-000000000001'),
  'L''école à situer est située et prête, avec qui l''a située');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000006', 'update_campus',
  p_campus => 'b4000000-0000-4000-8000-000000000002', p_latitude => -4.80, p_longitude => 11.93)$$,
  '22023', null, 'Une école vérifiée par la direction ne se déplace pas par un relevé');
select throws_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000007', 'update_campus',
  p_campus => 'b4000000-0000-4000-8000-000000000003', p_latitude => -4.80, p_longitude => 11.93)$$,
  '22023', null, 'Une école retirée ne se modifie plus : la règle de « Situer » vaut aussi ici');
select ok((select s.status = 'a_valider' from public.field_submissions s where s.id = 'd4000000-0000-4000-8000-000000000007')
    and (select position is null from public.campuses where id = 'b4000000-0000-4000-8000-000000000003'),
  'Les deux refus n''ont rien écrit');

-- Sans position saisie, rien ne change ------------------------------------------------------------------------------------------------

select lives_ok($$select public.accept_reviewed_submission('d4000000-0000-4000-8000-000000000008',
  p_division => (select id from public.geo_divisions where name = 'Tié-Tié' limit 1))$$,
  'Sans position saisie, l''acceptation reste ce qu''elle était');
select ok((select c.position is null and c.located_by is null and c.located_at is null
  from public.field_submissions s join public.campuses c on c.id = s.campus_id where s.id = 'd4000000-0000-4000-8000-000000000008'),
  'Aucune position inventée : l''école reste à situer, sans « située par » personne');
select is((select count(*)::int from public.submission_reviews), 4, 'Seules les décisions avec corrections ou position écrivent une révision');

reset role;
select * from finish();
rollback;
