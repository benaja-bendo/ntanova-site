-- Une correction d'une fiche pas encore acceptée s'accepte (ticket #89). Un relais renvoie sa photo après un « à corriger » :
-- la correction n'a ni position ni division ; la fiche d'origine, jamais acceptée, n'a pas d'école. La base crée l'école à
-- partir de la correction, avec la position (et la division) de la fiche d'origine.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Mise en place -------------------------------------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
-- Bastien n'a pas de secteur : c'est le cas de la plupart des relais.
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', null);

-- Un relevé ; sans longitude ni latitude, il n'a pas de position (une correction « pour la photo » n'en a pas).
create function pg_temp.envoyer(p_relais uuid, p_id uuid, p_nom text, p_lon float8 default null, p_lat float8 default null,
                                p_kind text default 'releve', p_corrige uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_relais, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.field_submissions (id, kind, corrects_submission_id, taken_at, position, sign_name, levels, school_kind, landmark)
  values (p_id, p_kind, p_corrige, now() - interval '1 hour', 'SRID=4326;POINT(0 0)'::extensions.geometry, p_nom, '{primaire}'::public.niveau[],
          'privee', 'Près du marché');
  reset role;
  update public.field_submissions
    set position = case when p_lon is null then null else extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326) end
  where id = p_id;
end $$;

create function pg_temp.campus_de(p_submission uuid) returns uuid language sql as $$
  select campus_id from public.field_submissions where id = p_submission
$$;

-- 1. Le cas courant : le relais (sans secteur) reprend sa photo ; la position est celle de la fiche d'origine ----------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000001', 'École [Une]', 11.93, -4.80);
select public.request_correction('89000000-0000-4000-8000-000000000001', 'photo_floue', 'Reprenez la photo de face.');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000002', 'École [Une]', null, null,
                       'correction', '89000000-0000-4000-8000-000000000001');
select lives_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000002')$$,
  'La correction d''une fiche pas encore acceptée s''accepte : l''école est créée');
select is((select extensions.st_astext(position) from public.campuses where id = pg_temp.campus_de('89000000-0000-4000-8000-000000000002')),
  'POINT(11.93 -4.8)', 'avec la position de la fiche d''origine, que la correction n''avait pas');
select is((select division_id from public.campuses where id = pg_temp.campus_de('89000000-0000-4000-8000-000000000002')),
  public.division_of_position(-4.80, 11.93, 3::smallint), 'et la division que cette position dit');
select is((select status::text || '|' || (campus_id = pg_temp.campus_de('89000000-0000-4000-8000-000000000002'))::text
           from public.field_submissions where id = '89000000-0000-4000-8000-000000000001'),
  'accepte|true', 'La fiche d''origine est close avec sa correction, liée à la même école');
select is((select payable from public.field_submissions where id = '89000000-0000-4000-8000-000000000001'), true,
  'La paie reste celle de la fiche d''origine');
select is((select payable from public.field_submissions where id = '89000000-0000-4000-8000-000000000002'), false,
  'Une correction ne se paie pas');

-- 2. La position d'origine n'est dans aucun contour connu : l'administration choisit la division ---------------------------------------------

select is(public.division_of_position(-4.27, 15.28, 3::smallint), null,
  'La mise en place : Brazzaville n''a pas de contour connu, la division n''est pas déduite de la position');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000011', 'École [Deux]', 15.28, -4.27);
select public.request_correction('89000000-0000-4000-8000-000000000011', 'photo_floue');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000012', 'École [Deux]', null, null,
                       'correction', '89000000-0000-4000-8000-000000000011');
select throws_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000012')$$, '22023', null,
  'Sans division connue, la base le dit : « Choisissez la division de l''école »');
select lives_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000012', null, null, null, null, '[]'::jsonb,
                 (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'))$$,
  'Avec la division choisie par l''administration, elle s''accepte');
select is((select extensions.st_astext(position) from public.campuses where id = pg_temp.campus_de('89000000-0000-4000-8000-000000000012')),
  'POINT(15.28 -4.27)', 'avec la position de la fiche d''origine');
select is((select division_id from public.campuses where id = pg_temp.campus_de('89000000-0000-4000-8000-000000000012')),
  (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'),
  'et la division choisie');

-- 3. Ni la correction ni la fiche d'origine n'ont de position, et le relais n'a pas de secteur ---------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000021', 'École [Trois]');
select public.request_correction('89000000-0000-4000-8000-000000000021', 'photo_floue');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000022', 'École [Trois]', null, null,
                       'correction', '89000000-0000-4000-8000-000000000021');
select throws_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000022')$$, '22023', null,
  'Sans position ni secteur, la division se choisit');
select lives_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000022', null, null, null, null, '[]'::jsonb,
                 (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'))$$,
  'et l''école se crée « à situer », sans position inventée');

-- 4. Sans position : le secteur de la fiche d'origine donne la division (la correction n'en a plus) -----------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '89000000-0000-4000-8000-000000000031', 'École [Quatre]');
select public.request_correction('89000000-0000-4000-8000-000000000031', 'photo_floue');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '89000000-0000-4000-8000-000000000032', 'École [Quatre]', null, null,
                       'correction', '89000000-0000-4000-8000-000000000031');
update public.field_submissions set batch_id = null where id = '89000000-0000-4000-8000-000000000032';
select lives_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000032')$$,
  'Sans position, le secteur de la fiche d''origine suffit à donner la division');
select is((select division_id from public.campuses where id = pg_temp.campus_de('89000000-0000-4000-8000-000000000032')),
  (select geo_division_id from public.lots where nom = 'Tié-Tié'), 'celle du secteur');

-- 5. Une correction d'une école DÉJÀ créée ne change pas : elle met l'école à jour, qui garde sa position ------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000041', 'École [Cinq]', 11.92, -4.79);
select public.accept_submission('89000000-0000-4000-8000-000000000041');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '89000000-0000-4000-8000-000000000042', 'École [Cinq] corrigée', null, null,
                       'correction', '89000000-0000-4000-8000-000000000041');
select lives_ok($$select public.accept_submission('89000000-0000-4000-8000-000000000042')$$,
  'La correction d''une école déjà créée, par un relais sans secteur, s''accepte');
select is(pg_temp.campus_de('89000000-0000-4000-8000-000000000042'), pg_temp.campus_de('89000000-0000-4000-8000-000000000041'),
  'elle met à jour la même école : aucune école de plus');
select is((select extensions.st_astext(position) from public.campuses where id = pg_temp.campus_de('89000000-0000-4000-8000-000000000041')),
  'POINT(11.92 -4.79)', 'et l''école garde sa position');

select * from finish();
rollback;
