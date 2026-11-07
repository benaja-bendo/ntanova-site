-- Renommer une zone, dire ses autres orthographes, et supprimer une zone vide (audit de l'administration, 07/11/2026).
-- Rien ne change l'adresse, le parent ni le niveau d'une zone ; une suppression refuse tout ce qui n'est pas une erreur de
-- saisie (sous-zones, écoles, relevés, lots, contour, état sur la carte, ouverture aux relais) et laisse une trace.

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select public.register_relay('00000000-0000-4000-8000-0000000000a5', 'google-a5', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d5', 'google-d5', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d5');
select public.activer_relais('00000000-0000-4000-8000-0000000000a5', null);

-- Mise en place : sept communes d'essai sous la Sangha ---------------------------------------------------------------------------------

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug)
select v.id::uuid, p.id, 2, 'commune', 'CG', v.nom, v.slug
from public.geo_divisions p,
     (values ('7e000000-0000-4000-8000-000000000001', '[Zone vide]', 'zone-vide'),
             ('7e000000-0000-4000-8000-000000000002', '[Zone avec sous-zone]', 'zone-parente'),
             ('7e000000-0000-4000-8000-000000000003', '[Zone avec école]', 'zone-ecole'),
             ('7e000000-0000-4000-8000-000000000004', '[Zone avec lot]', 'zone-lot'),
             ('7e000000-0000-4000-8000-000000000005', '[Zone sur la carte]', 'zone-carte'),
             ('7e000000-0000-4000-8000-000000000006', '[Zone ouverte]', 'zone-ouverte'),
             ('7e000000-0000-4000-8000-000000000007', '[Zone avec relevé]', 'zone-releve')) as v(id, nom, slug)
where p.path::text = 'congo.sangha';

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug)
values ('7e000000-0000-4000-8000-000000000011', '7e000000-0000-4000-8000-000000000002', 3, 'arrondissement', 'CG',
        '[Sous-zone]', 'sous-zone');

-- Un contour, un état sur la carte, une ouverture, un lot, un relevé et une école posés sur les zones d'essai.
update public.geo_divisions set public_status = 'programme' where id = '7e000000-0000-4000-8000-000000000005';
update public.geo_divisions set open_for_fieldwork = true where id = '7e000000-0000-4000-8000-000000000006';
insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, boundary, source)
select '7e000000-0000-4000-8000-000000000008'::uuid, p.id, 2, 'commune', 'CG', '[Zone avec contour]', 'zone-contour',
       extensions.st_multi(extensions.st_makeenvelope(16.30, 1.30, 16.40, 1.40, 4326)), 'test'
from public.geo_divisions p where p.path::text = 'congo.sangha';
insert into public.lots (id, nom, geo_division_id, contour, essai)
values ('7f000000-0000-4000-8000-000000000001', '[Lot d''une zone]', '7e000000-0000-4000-8000-000000000004',
        extensions.st_multi(extensions.st_makeenvelope(16.50, 1.50, 16.51, 1.51, 4326)), false);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name, levels, school_kind, landmark) values
  ('7f000000-0000-4000-8000-000000000011', now(), 'SRID=4326;POINT(12.0 -1.0)', '[École dont la zone est choisie]', '{primaire}', 'privee', 'Près du marché'),
  ('7f000000-0000-4000-8000-000000000012', now(), 'SRID=4326;POINT(12.1 -1.1)', '[Relevé rattaché]', '{primaire}', 'privee', 'Près du marché');
reset role;
update public.field_submissions set division_id = '7e000000-0000-4000-8000-000000000007'
where id = '7f000000-0000-4000-8000-000000000012';

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d5","role":"authenticated"}', true);
set local role authenticated;
select public.accept_submission('7f000000-0000-4000-8000-000000000011', null, null, null, null, '[]'::jsonb,
                                '7e000000-0000-4000-8000-000000000003');
reset role;

-- Renommer ----------------------------------------------------------------------------------------------------------------------------

set local role authenticated;
select lives_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', '  [Zone corrigée]  ', array['  Zone corrigée  ', 'ZONE CORRIGÉE', '[zone corrigee]', '', 'Autre écriture', 'autre écriture'])$$,
  'L''administration renomme une zone');
reset role;
select is((select name from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'), '[Zone corrigée]',
  'Le nom est celui qu''elle a donné, sans les blancs autour');
select is((select aliases from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'),
  array['Zone corrigée', 'Autre écriture'],
  'Les autres écritures sont nettoyées : sans blanc, sans doublon (accents et majuscules ne comptent pas), sans le nom lui-même');
select is((select slug || '|' || path::text || '|' || level from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'),
  'zone-vide|congo.sangha.zone_vide|2', 'L''adresse, le chemin et le niveau ne changent pas');

set local role authenticated;
select lives_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', '[Zone corrigée]', array['Mvoumvou'])$$,
  'Redonner son propre nom est permis');
reset role;
select is((select aliases from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'), array['Mvoumvou'],
  'Les autres écritures remplacent la liste');
set local role authenticated;
select lives_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', '[Zone corrigée]')$$,
  'Sans autres écritures, la liste se vide');
reset role;
select is((select cardinality(aliases) from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'), 0,
  'Elle est vide');

set local role authenticated;
select throws_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', '[ZONE   AVEC SOUS-ZONE]')$$,
  '22023', null, 'Un nom déjà pris sous le même parent est refusé');
select throws_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', '[zone avec école]')$$,
  '22023', null, 'Même sans les majuscules');
select throws_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', '   ')$$,
  '22023', null, 'Un nom vide est refusé');
select throws_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', 'x', array(select 'écriture ' || g from generate_series(1, 21) g))$$,
  '22023', null, 'Vingt autres écritures au plus');
select throws_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', 'x', array[repeat('a', 81)])$$,
  '22023', null, 'Quatre-vingts caractères au plus par écriture');
select throws_ok($$select public.rename_division('00000000-0000-4000-8000-00000000ffff', 'x')$$,
  'P0002', null, 'Une zone inconnue est refusée');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}', true);
select throws_ok($$select public.rename_division('7e000000-0000-4000-8000-000000000001', 'Pirate')$$,
  '42501', null, 'Un relais ne renomme pas une zone');
select throws_ok($$select public.delete_division('7e000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Un relais ne supprime pas une zone');
reset role;
select is((select name from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'), '[Zone corrigée]',
  'Le nom n''a pas bougé');

-- Supprimer : tout ce qui n'est pas une erreur de saisie est refusé ------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d5","role":"authenticated"}', true);
set local role authenticated;
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000002')$$, '%contient encore 1 zone%',
  'Une zone qui a une sous-zone ne se supprime pas');
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000003')$$, '%1 école%',
  'Une zone qui a une école ne se supprime pas');
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000004')$$, '%1 lot%',
  'Une zone qui a un lot ne se supprime pas');
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000007')$$, '%1 relevé%',
  'Une zone qui a un relevé de relais ne se supprime pas');
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000008')$$, '%contour dessiné%',
  'Une zone qui a un contour ne se supprime pas');
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000005')$$, '%retire-la de la carte%',
  'Une zone sur la carte du site ne se supprime pas');
select throws_like($$select public.delete_division('7e000000-0000-4000-8000-000000000006')$$, '%ferme-la d%',
  'Une zone ouverte aux relais ne se supprime pas');
select throws_like($$select public.delete_division((select id from public.geo_divisions where level = 0 limit 1))$$, '%pays ne se supprime pas%',
  'Un pays ne se supprime pas');
select throws_ok($$select public.delete_division('00000000-0000-4000-8000-00000000ffff')$$,
  'P0002', null, 'Une zone inconnue est refusée');
reset role;
select is((select count(*)::int from public.geo_divisions where id in (
    '7e000000-0000-4000-8000-000000000002', '7e000000-0000-4000-8000-000000000003', '7e000000-0000-4000-8000-000000000004',
    '7e000000-0000-4000-8000-000000000005', '7e000000-0000-4000-8000-000000000006', '7e000000-0000-4000-8000-000000000007',
    '7e000000-0000-4000-8000-000000000008')), 7, 'Les sept zones refusées sont toutes là');

-- Supprimer une zone vide ----------------------------------------------------------------------------------------------------------------

select is((select count(*)::int from prive.erasures where what = 'zone'), 0, 'Aucune trace de zone avant la suppression');
set local role authenticated;
select lives_ok($$select public.delete_division('7e000000-0000-4000-8000-000000000001')$$,
  'L''administration supprime une zone vide');
reset role;
select is((select count(*)::int from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000001'), 0, 'Elle n''existe plus');
select is((select count(*)::int from prive.erasures where what = 'zone' and note like '%[Zone corrigée]%congo.sangha.zone_vide%'), 1,
  'Une trace dit quelle zone a été supprimée et où');
select is((select count(*)::int from prive.erasures where what = 'zone' and by_user = '00000000-0000-4000-8000-0000000000d5'), 1,
  'Elle dit qui l''a supprimée');

-- La même adresse se rajoute ---------------------------------------------------------------------------------------------------------------

select lives_ok($$insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug)
    select p.id, 2, 'commune', 'CG', '[Zone vide, bien écrite]', 'zone-vide' from public.geo_divisions p where p.path::text = 'congo.sangha'$$,
  'Une zone supprimée libère son adresse : elle se rajoute, bien écrite');

-- Retirer la cause rend la suppression possible -----------------------------------------------------------------------------------------

update public.geo_divisions set public_status = null where id = '7e000000-0000-4000-8000-000000000005';
set local role authenticated;
select lives_ok($$select public.delete_division('7e000000-0000-4000-8000-000000000005')$$, 'Retirée de la carte, la zone se supprime');
reset role;
update public.geo_divisions set open_for_fieldwork = false where id = '7e000000-0000-4000-8000-000000000006';
set local role authenticated;
select lives_ok($$select public.delete_division('7e000000-0000-4000-8000-000000000006')$$, 'Fermée aux relais, la zone se supprime');
reset role;

-- Les droits n'ont pas changé : pas de suppression directe -------------------------------------------------------------------------------

set local role authenticated;
select throws_ok($$delete from public.geo_divisions where id = '7e000000-0000-4000-8000-000000000002'$$,
  '42501', null, 'Aucun droit de suppression sur la table : la seule porte est la fonction');
reset role;

select * from finish();
rollback;
