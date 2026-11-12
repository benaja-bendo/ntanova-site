-- M3 (20261113100200) et M4 (20261113100300) : les médias d'une école et ses sites.
-- - `public_campus_photos` rend toujours la même chose (transition sans casse) ; les choix d'aujourd'hui deviennent des couvertures ;
-- - une photo de travail n'entre jamais dans les médias ; une image n'est publique qu'après contrôle ; douze images de galerie ;
-- - le mot de la direction est celui de l'école, lu par la même vue publique ;
-- - « C'est un site de… » garde l'adresse publique et supprime l'école quittée sans site, après lui avoir pris ce qui manquait.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-ms-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-ms-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
insert into public.institutions(id, name, acronym) values
  ('e8000000-0000-4000-8000-000000000001', '[Groupe scolaire Exemple]', null),
  ('e8000000-0000-4000-8000-000000000002', '[GS Exemple, site seul]', 'GSE');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin, verification_state, verified_on)
select x.id, x.inst, x.slug, d.id, 'publiee', 'admin', 'verifiee', current_date
from (values ('e9000000-0000-4000-8000-000000000001'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'gs-exemple-1'),
             ('e9000000-0000-4000-8000-000000000002'::uuid, 'e8000000-0000-4000-8000-000000000001'::uuid, 'gs-exemple-2'),
             ('e9000000-0000-4000-8000-000000000003'::uuid, 'e8000000-0000-4000-8000-000000000002'::uuid, 'gs-exemple-seul')) x(id, inst, slug)
cross join (select id from public.geo_divisions where level = 3 limit 1) d;
insert into public.field_submissions(id, relay_id, taken_at, sign_name, status, campus_id)
values ('ea000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now(), '[GS]', 'accepte', 'e9000000-0000-4000-8000-000000000001');
insert into public.field_submission_photos(id, submission_id, role, storage_path, mime, bytes, taken_at, child_free_checked_at)
values ('eb000000-0000-4000-8000-000000000001', 'ea000000-0000-4000-8000-000000000001', 'signboard', 'ea000000-0000-4000-8000-000000000001/e.webp', 'image/webp', 1000, now(), now()),
       ('eb000000-0000-4000-8000-000000000002', 'ea000000-0000-4000-8000-000000000001', 'courtyard', 'ea000000-0000-4000-8000-000000000001/c.webp', 'image/webp', 1000, now(), now()),
       ('eb000000-0000-4000-8000-000000000003', 'ea000000-0000-4000-8000-000000000001', 'brochure', 'ea000000-0000-4000-8000-000000000001/p.webp', 'image/webp', 1000, now(), now());

-- La transition : la photo publique d'aujourd'hui, inchangée, et sa couverture tenue à jour ---------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$select public.set_campus_public_photo('e9000000-0000-4000-8000-000000000001', 'eb000000-0000-4000-8000-000000000001', true)$$,
  'Choisir l''enseigne comme avant');
reset role;
select is((select id from public.public_campus_photos where campus_id = 'e9000000-0000-4000-8000-000000000001'), 'eb000000-0000-4000-8000-000000000001'::uuid,
  '`public_campus_photos` rend toujours l''enseigne choisie (le site en ligne ne voit pas la différence)');
select is((select source_photo_id from public.campus_media where campus_id = 'e9000000-0000-4000-8000-000000000001' and kind = 'cover'),
  'eb000000-0000-4000-8000-000000000001'::uuid, 'Le choix devient aussi la couverture de `campus_media`');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'public_campus_photos'),
  array['campus_id', 'id', 'storage_path', 'taken_at'], 'Les colonnes de `public_campus_photos` n''ont pas bougé');

-- Les médias : jamais une photo de travail, publics seulement contrôlés -------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000001', 'gallery', 'autre', 'eb000000-0000-4000-8000-000000000003')$$,
  '22023', null, 'Un prospectus n''entre jamais dans les images de l''école');
select throws_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000001', 'gallery', 'cour', 'eb000000-0000-4000-8000-000000000002', p_public => true)$$,
  '22023', null, 'Une image non contrôlée ne se publie pas');
select lives_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000001', 'gallery', 'cour', 'eb000000-0000-4000-8000-000000000002',
    p_caption => 'La cour', p_checked => true, p_public => true)$$, 'Une cour vide contrôlée entre dans la galerie, publique');
select throws_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000001', 'logo', 'logo', p_storage_path => 'releves/x.webp')$$,
  '22023', null, 'Un fichier ajouté se range sous ecoles/');
select lives_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000001', 'logo', 'logo',
    p_storage_path => 'ecoles/e9000000-0000-4000-8000-000000000001/logo.png', p_mime => 'image/png', p_checked => true, p_public => true)$$,
  'Le logo, un fichier remis par l''école, va à l''école');
select throws_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000002', 'logo', 'logo',
    p_storage_path => 'ecoles/e9000000-0000-4000-8000-000000000002/logo.png')$$, '22023', null, 'Un logo par école : le second site n''en ajoute pas un autre');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.add_campus_media('e9000000-0000-4000-8000-000000000001', 'gallery', 'cour', 'eb000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'Un relais n''ajoute pas d''image à une école');
select is((select count(*)::int from public.campus_media), 0, 'Un relais ne lit pas la table des médias');
reset role;
update public.field_submission_photos set is_public = false;
select throws_ok($$insert into public.campus_media (campus_id, kind, subject, storage_path, source, source_photo_id, is_public)
    values ('e9000000-0000-4000-8000-000000000001', 'gallery', 'autre', 'ea000000-0000-4000-8000-000000000001/p.webp', 'terrain',
            'eb000000-0000-4000-8000-000000000003', false)$$, '22023', null, 'Même en écrivant la table, une photo de travail est refusée');

set local role anon;
select is((select string_agg(kind, ',' order by kind) from public.public_campus_media), 'cover,gallery,logo',
  'Un visiteur lit le logo, la couverture et la galerie publiques');
select is((select caption from public.public_campus_media where kind = 'gallery'), 'La cour', 'Avec la légende');
reset role;

-- Le mot de la direction, à l'école, lu par la même vue ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$select public.set_campus_statement('e9000000-0000-4000-8000-000000000001', 'Bienvenue.', current_date, 'directeur', 'whatsapp')$$,
  'Le mot s''enregistre depuis un site');
reset role;
set local role anon;
select is((select count(*)::int from public.public_campus_statements where body = 'Bienvenue.'), 2,
  'Les deux sites de l''école le montrent, par la même vue publique');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
           where table_schema = 'public' and table_name = 'public_campus_statements'),
  array['campus_id', 'body', 'stated_on'], 'Les colonnes de la vue publique n''ont pas bougé');
select is((select count(*)::int from public.public_institution_sites where institution_id = 'e8000000-0000-4000-8000-000000000001'), 2,
  '« Les 2 sites de l''école »');
reset role;

-- Le rythme et les langues : qui le dit et quand ---------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select throws_ok($$select public.set_campus_profile('e9000000-0000-4000-8000-000000000001', '{matin}', '{francais}', null, null)$$,
  '22023', null, 'Sans source ni date, le rythme ne s''écrit pas');
select lives_ok($$select public.set_campus_profile('e9000000-0000-4000-8000-000000000001', '{matin}', '{francais}', current_date, 'ecole')$$,
  'Le rythme et la langue, dits par l''école');
select lives_ok($$select public.set_institution_profile('e9000000-0000-4000-8000-000000000001', null, 2012, 'https://exemple.cg')$$,
  'L''année et le site web de l''école');

-- « C'est un site de… » : le site seul rejoint le groupe ; son école sans site part, en donnant son sigle -------------------------------------------
select lives_ok($$select public.attach_campus_to_institution('e9000000-0000-4000-8000-000000000003', 'e8000000-0000-4000-8000-000000000001')$$,
  'Le site rejoint l''école');
reset role;
select is((select slug::text from public.campuses where id = 'e9000000-0000-4000-8000-000000000003'), 'gs-exemple-seul', 'Son adresse publique ne change pas');
select ok(not exists (select 1 from public.institutions where id = 'e8000000-0000-4000-8000-000000000002'), 'L''école quittée, sans site, est supprimée');
select is((select acronym from public.institutions where id = 'e8000000-0000-4000-8000-000000000001'), 'GSE',
  'Son sigle est passé à l''école qui n''en avait pas');

select * from finish();
rollback;
