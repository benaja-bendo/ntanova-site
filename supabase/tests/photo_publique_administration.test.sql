-- Le raccord de l'administration à la photo publique : lire l'état, choisir une façade, retirer sans laisser un repli
-- prendre le relais, corbeille et restauration (migration 20261107020000).
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-photo-adm-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-photo-adm-relais', '[Relais]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
insert into public.institutions(id, name) values ('a9000000-0000-4000-8000-000000000011', '[École raccord]');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin)
select 'b9000000-0000-4000-8000-000000000011', 'a9000000-0000-4000-8000-000000000011', 'ecole-raccord', id, 'brouillon', 'admin'
from public.geo_divisions where level = 3 limit 1;
insert into public.field_submissions(id, relay_id, taken_at, sign_name, status, campus_id)
values ('c9000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-0000000000a1', now(), '[École raccord]', 'accepte',
        'b9000000-0000-4000-8000-000000000011'),
       ('c9000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-0000000000a1', now(), '[École raccord]', 'accepte',
        'b9000000-0000-4000-8000-000000000011');
-- Un relevé : 01 enseigne sans date de prise de vue · 02 panneau des formations · 03 façade prise le 1er octobre.
-- Un second relevé accepté : 04 enseigne tardive (une seule enseigne par relevé).
insert into public.field_submission_photos(id, submission_id, role, storage_path, mime, bytes, taken_at)
values
  ('d9000000-0000-4000-8000-000000000011', 'c9000000-0000-4000-8000-000000000011', 'signboard', 'c9000000-0000-4000-8000-000000000011/enseigne.webp', 'image/webp', 10000, null),
  ('d9000000-0000-4000-8000-000000000012', 'c9000000-0000-4000-8000-000000000011', 'programs_board', 'c9000000-0000-4000-8000-000000000011/formations.webp', 'image/webp', 10000, null),
  ('d9000000-0000-4000-8000-000000000013', 'c9000000-0000-4000-8000-000000000011', 'building', 'c9000000-0000-4000-8000-000000000011/facade.webp', 'image/webp', 10000, '2026-10-01'),
  ('d9000000-0000-4000-8000-000000000014', 'c9000000-0000-4000-8000-000000000012', 'signboard', 'c9000000-0000-4000-8000-000000000012/enseigne.webp', 'image/webp', 10000, '2026-10-20');

create function pg_temp.choisir(p_photo uuid, p_ok boolean default true) returns void language sql as $$
  select public.set_campus_public_photo('b9000000-0000-4000-8000-000000000011', p_photo, p_ok)
$$;
create function pg_temp.etat() returns jsonb language sql as $$
  select public.campus_public_photo_state('b9000000-0000-4000-8000-000000000011')
$$;

-- Les droits : un visiteur et un relais ne lisent pas l'état -----------------------------------------------------------
set local role anon;
select throws_ok($$select pg_temp.etat()$$, '42501', null, 'Un visiteur ne lit pas l’état de la photo');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select pg_temp.etat()$$, '42501', null, 'Un relais ne lit pas l’état de la photo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.campus_public_photo_state(gen_random_uuid())$$, 'P0002', null, 'École inconnue');
select is(pg_temp.etat() ->> 'mode', 'automatique', 'Sans ligne de choix : repli automatique');
select is((pg_temp.etat() ->> 'published')::boolean, false, 'Brouillon : rien n’est public');
select is(pg_temp.etat() -> 'choice', 'null'::jsonb, 'Aucun choix en mode automatique');
select is(pg_temp.etat() -> 'retained', 'null'::jsonb, 'Aucune photo retenue tant que la fiche n’est pas publiée');
reset role;

-- Le repli : une enseigne ou une vue du bâtiment contrôlée, fiche publiée -------------------------------------------------------
update public.field_submission_photos set child_free_checked_at = now() where role in ('signboard', 'building');
update public.field_submission_photos set child_free_checked_at = now() where id = 'd9000000-0000-4000-8000-000000000012';
update public.campuses set publication = 'publiee' where id = 'b9000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is(pg_temp.etat() ->> 'retained', 'd9000000-0000-4000-8000-000000000013',
  'Le repli retient la première prise de vue contrôlée (la façade), jamais le panneau contrôlé');
select is(pg_temp.etat() ->> 'mode', 'automatique', 'Le repli ne crée aucune ligne de choix');

-- Choisir : une enseigne, puis une façade --------------------------------------------------------------------------------
select throws_ok($$select pg_temp.choisir('d9000000-0000-4000-8000-000000000012')$$, '22023', null,
  'Un panneau des formations contrôlé ne se choisit pas : il reste privé');
select lives_ok($$select pg_temp.choisir('d9000000-0000-4000-8000-000000000011')$$, 'Une enseigne se choisit');
select is(pg_temp.etat() ->> 'mode', 'choix', 'Le choix explicite est lu comme tel');
select is(pg_temp.etat() ->> 'retained', 'd9000000-0000-4000-8000-000000000011',
  'Le choix explicite passe avant la façade, plus ancienne');
select lives_ok($$select pg_temp.choisir('d9000000-0000-4000-8000-000000000013')$$, 'Une façade se choisit aussi');
select is(pg_temp.etat() ->> 'choice', 'd9000000-0000-4000-8000-000000000013', 'Le nouveau choix est lu');
select is(pg_temp.etat() ->> 'retained', 'd9000000-0000-4000-8000-000000000013', 'Et retenu');
reset role;
select is((select is_public from public.field_submission_photos where id = 'd9000000-0000-4000-8000-000000000011'), false,
  'L’ancien choix cesse d’être public');

-- Retirer : le choix nul bloque tout repli ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$select pg_temp.choisir(null, false)$$, 'Le retrait explicite est autorisé');
select is(pg_temp.etat() ->> 'mode', 'retire', 'Le retrait se lit : mode « retire »');
select is(pg_temp.etat() -> 'retained', 'null'::jsonb, 'Plus aucune photo retenue');
reset role;
select is((select count(*)::int from public.field_submission_photos
  where role in ('signboard', 'building') and child_free_checked_at is not null), 3,
  'Les photos restent contrôlées : ce n’est pas le contrôle qui a été retiré');
set local role anon;
select is((select count(*)::int from public.public_campus_photos), 0, 'Aucune autre photo contrôlée ne prend la place');
reset role;

-- Pourquoi le retrait passe par le choix nul : retirer le seul contrôle laisse le repli choisir une autre photo ---------
delete from prive.campus_photo_choices;
update public.field_submission_photos set child_free_checked_at = null where id = 'd9000000-0000-4000-8000-000000000013';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is(pg_temp.etat() ->> 'retained', 'd9000000-0000-4000-8000-000000000014',
  'Sans retrait explicite, retirer le contrôle d’une photo en fait apparaître une autre (la plus ancienne datée restante)');
reset role;
update public.field_submission_photos set child_free_checked_at = now() where id = 'd9000000-0000-4000-8000-000000000013';

-- Corbeille et restauration : aucune photo n'est publiée, aucun choix n'est perdu ------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select pg_temp.choisir(null, false);
select public.trash_campus('b9000000-0000-4000-8000-000000000011');
select is((pg_temp.etat() ->> 'published')::boolean, false, 'À la corbeille : la fiche n’est pas publiée');
select is(pg_temp.etat() ->> 'mode', 'retire', 'À la corbeille : le retrait est gardé');
select public.restore_campus('b9000000-0000-4000-8000-000000000011');
select is((pg_temp.etat() ->> 'published')::boolean, false, 'Restaurée : la fiche repasse « prête », pas publiée');
select is(pg_temp.etat() ->> 'mode', 'retire', 'Restaurée : le retrait est toujours là');
reset role;
update public.campuses set publication = 'publiee' where id = 'b9000000-0000-4000-8000-000000000011';
set local role anon;
select is((select count(*)::int from public.public_campus_photos), 0,
  'Republiée après restauration : le retrait tient, le repli ne se réveille pas');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select pg_temp.choisir('d9000000-0000-4000-8000-000000000013');
select public.trash_campus('b9000000-0000-4000-8000-000000000011');
select public.restore_campus('b9000000-0000-4000-8000-000000000011');
select is(pg_temp.etat() ->> 'choice', 'd9000000-0000-4000-8000-000000000013', 'Le choix explicite survit à la corbeille');
select is(pg_temp.etat() -> 'retained', 'null'::jsonb, 'Restaurée mais pas republiée : aucune photo retenue');
reset role;
update public.campuses set publication = 'publiee' where id = 'b9000000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is(pg_temp.etat() ->> 'retained', 'd9000000-0000-4000-8000-000000000013', 'Republiée par l’administration : le choix reparaît');
reset role;

select * from finish();
rollback;
