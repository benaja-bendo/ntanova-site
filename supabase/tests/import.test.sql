-- L'amorçage depuis l'administration : créer une école d'un coup (institution, campus, cycles, formations) et en
-- importer en masse, sans relais, avec simulation d'abord. Aucune position inventée ; l'origine est gardée.

begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));

-- Une école d'un coup, par l'administrateur -------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);

create temp table e1 as select public.create_catalog_entry($j$
{ "ref": "ETB-901", "name": "Université [Horizon]", "kind": "privee",
  "campuses": [
    { "label": "Campus de Loandjili", "division": "congo.pointe_noire.pointe_noire.loandjili",
      "neighbourhood": "Loandjili centre", "landmark": "Face à la gare", "sign_phone": "242060000901",
      "latitude": -4.77, "longitude": 11.88,
      "cycles": [ { "cycle": "superieur", "programs": [
          { "title": "Licence en gestion", "domain": "gestion", "diploma": "licence", "rhythms": ["jour", "soir"] },
          { "title": "BTS Informatique de gestion", "domain": "informatique", "diploma": "bts", "rhythms": ["soir", "weekend"] } ] } ] },
    { "label": "Campus de Moungali", "division": "congo.brazzaville.brazzaville.moungali",
      "cycles": [ "superieur", { "cycle": "lycee", "programs": [ { "title": "Série D", "bac_track": "d", "diploma": "bac" } ] } ] }
  ] }
$j$::jsonb) as r;
reset role;

select is((select r ->> 'status' from e1), 'created', 'Une école se crée d''un coup');
select is((select jsonb_array_length(r -> 'campus_ids') from e1), 2, 'Avec ses deux campus');
select is((select count(*)::int from public.institutions where name = 'Université [Horizon]'), 1, 'Une seule institution pour deux implantations');
select is((select string_agg(distinct origin, ',') from public.campuses), 'admin', 'L''origine est « admin » : jamais « relevée par un relais »');
select is((select count(*)::int from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.institution_id = (select id from public.institutions limit 1)), 3,
  'Les cycles sont créés (supérieur à Loandjili ; supérieur et lycée à Moungali)');
select is((select count(*)::int from public.campus_programs), 3, 'Les formations sont créées');
select is((select p.diploma || '|' || array_to_string(p.rhythms, ',') || '|' || ed.slug || '|' || p.origin
           from public.campus_programs p join public.education_domains ed on ed.id = p.domain_id where p.title = 'BTS Informatique de gestion'),
  'bts|soir,weekend|informatique|admin', 'Une formation garde son diplôme, ses rythmes, son domaine et son origine');
select is((select publication || '|' || (position is not null)::text from public.campuses where label = 'Campus de Loandjili'), 'prete|true',
  'Avec une position et une division, le campus est prêt (jamais publié d''office)');
select is((select publication || '|' || (position is null)::text from public.campuses where label = 'Campus de Moungali'), 'brouillon|true',
  'Sans position, le campus reste en brouillon, « à situer » : aucune position inventée');
select ok((select located_at is not null and located_by is not null from public.campuses where label = 'Campus de Loandjili'),
  'Qui a donné la position, et quand, est gardé');
select is((select reference from prive.campus_sources), 'ETB-901', 'La référence anonyme va dans la partie privée');

-- La division est cherchée par la position quand elle n'est pas donnée ---------------------------------------------------------------------

select is((public.create_catalog_entry('{"name":"École [Delta]","campuses":[{"latitude":-4.80,"longitude":11.93}]}'::jsonb) ->> 'status'), 'created',
  'Sans division donnée, on la cherche par la position');
select is((select d.slug || '|' || c.publication from public.campuses c join public.geo_divisions d on d.id = c.division_id
           where c.slug like 'ecole-delta%'), 'tie-tie|prete', 'Une école située à Tié-Tié est dans Tié-Tié, prête');

-- Ce qui existe déjà n'est pas dédoublé ---------------------------------------------------------------------------------------------------

select is((public.create_catalog_entry('{"ref":"ETB-901","name":"Autre nom","campuses":[{}]}'::jsonb) ->> 'status'), 'exists',
  'Une référence déjà importée ne se dédouble pas');
select is((public.create_catalog_entry('{"name":"Université  [Horizon]","campuses":[{"label":"Campus de Loandjili","division":"congo.pointe_noire.pointe_noire.loandjili"}]}'::jsonb) ->> 'status'),
  'exists', 'La même école au même endroit n''est pas dédoublée (aux espaces et accents près)');

-- Les erreurs, dites clairement -------------------------------------------------------------------------------------------------------------------

select throws_ok($$select public.create_catalog_entry('{"campuses":[{}]}')$$, '22023', 'Le nom de l''école est obligatoire.', 'Une école a un nom');
select throws_ok($$select public.create_catalog_entry('{"name":"X"}')$$, '22023', null, 'Une école a au moins un campus');
select throws_ok($$select public.create_catalog_entry('{"name":"X","campuses":[{"division":"congo.nulle.part"}]}')$$, '22023', null, 'Une division inconnue est refusée');
select throws_ok($$select public.create_catalog_entry('{"name":"X","campuses":[{"division":"congo"}]}')$$, '22023', null, 'Un campus ne se place pas dans un pays');
select throws_ok($$select public.create_catalog_entry('{"name":"X","campuses":[{"latitude":-4.8}]}')$$, '22023', null, 'La latitude et la longitude vont ensemble');
select throws_ok($$select public.create_catalog_entry('{"name":"X","campuses":[{"publication":"publiee"}]}')$$, '22023', null, 'Publier est un geste à part : jamais à la création');
select throws_ok($$select public.create_catalog_entry('{"name":"X","kind":"magique","campuses":[{}]}')$$, '23514', null, 'Un genre d''école inconnu est refusé');
select throws_ok($$select public.create_catalog_entry('{"name":"X","campuses":[{"cycles":["cm2"]}]}')$$, '23514', null, 'Un cycle inconnu est refusé');

-- L'importation en masse, avec simulation ---------------------------------------------------------------------------------------------------------

select is((select count(*)::int from public.institutions), 2, 'Avant l''importation : deux institutions');
create temp table simulation as select public.import_catalog($j$[
  { "ref": "ETB-902", "name": "Lycée [Alpha]", "kind": "publique", "campuses": [ { "division": "congo.pointe_noire.pointe_noire.tie_tie", "latitude": -4.81, "longitude": 11.94, "cycles": ["lycee"] } ] },
  { "ref": "ETB-903", "name": "Collège [Beta]", "campuses": [ { "division": "congo.niari.dolisie", "cycles": ["college"] } ] },
  { "name": "", "campuses": [ { } ] },
  { "ref": "ETB-904", "name": "École [Gamma]", "campuses": [ { "division": "congo.inconnue" } ] },
  { "ref": "ETB-901", "name": "Déjà là", "campuses": [ {} ] }
]$j$::jsonb) as r;
select is((select r ->> 'dry_run' from simulation), 'true', 'Par défaut, l''importation est une simulation');
select is((select (r ->> 'created') || '|' || (r ->> 'exists') || '|' || jsonb_array_length(r -> 'errors') from simulation), '2|1|2',
  'La simulation dit : 2 à créer, 1 déjà là, 2 en erreur');
select is((select r -> 'errors' -> 0 ->> 'line' from simulation), '3', 'Une erreur dit le numéro de la ligne');
select is((select r -> 'errors' -> 1 ->> 'message' from simulation), 'Division inconnue : « congo.inconnue » (école « École [Gamma] »).',
  'Et le message, avec le nom de l''école');
select is((select count(*)::int from public.institutions), 2, 'La simulation n''a rien changé dans la base');

create temp table vrai as select public.import_catalog(
  '[ { "ref": "ETB-902", "name": "Lycée [Alpha]", "kind": "publique", "campuses": [ { "division": "congo.pointe_noire.pointe_noire.tie_tie", "latitude": -4.81, "longitude": 11.94, "cycles": ["lycee"] } ] },
     { "ref": "ETB-903", "name": "Collège [Beta]", "campuses": [ { "division": "congo.niari.dolisie", "cycles": ["college"] } ] },
     { "name": "", "campuses": [ { } ] } ]'::jsonb, false) as r;
select is((select (r ->> 'created') || '|' || jsonb_array_length(r -> 'errors') from vrai), '2|1', 'L''importation réelle crée les écoles valides, et rapporte l''erreur sans s''arrêter');
select is((select count(*)::int from public.institutions), 4, 'Deux institutions de plus');
select is((select count(*)::int from public.campuses where origin = 'import'), 2, 'Leur origine est « import »');
select is((select count(*)::int from prive.campus_sources), 3, 'Les références sont gardées dans la partie privée');
create temp table relance as select public.import_catalog(
  '[ { "ref": "ETB-902", "name": "Lycée [Alpha]", "campuses": [ { } ] }, { "ref": "ETB-903", "name": "Collège [Beta]", "campuses": [ { } ] } ]'::jsonb, false) as r;
select is((select (r ->> 'created') || '|' || (r ->> 'exists') from relance), '0|2', 'Relancer la même liste ne crée rien de plus');

-- La répartition par division dit d'où viennent les écoles ---------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select from_import || '|' || from_admin || '|' || from_field from public.division_stats where path = 'congo.niari.dolisie'), '1|0|0',
  'Les écoles importées ne se comptent pas comme relevées par un relais');
select is((select from_admin::text from public.division_stats where path = 'congo.pointe_noire.pointe_noire.tie_tie'), '1',
  'Ni celles ajoutées depuis l''administration');
reset role;

-- Les droits ---------------------------------------------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select throws_ok($$select public.import_catalog('[]'::jsonb)$$, '42501', null, 'Un relais n''importe rien');
reset role;
set local role anon;
select throws_ok($$select public.import_catalog('[]'::jsonb)$$, '42501', null, 'Un visiteur n''importe rien');
reset role;
select is((public.import_catalog('[]'::jsonb) ->> 'total'), '0', 'Le propriétaire de la base (éditeur SQL de Supabase Studio) peut importer sans jeton');
select throws_ok($$select public.import_catalog('{}'::jsonb)$$, '22023', null, 'Une liste d''écoles est attendue');
select throws_ok(format('select public.import_catalog(%L::jsonb)', (select jsonb_agg(jsonb_build_object('name', 'x' || g, 'campuses', jsonb_build_array(jsonb_build_object()))) from generate_series(1, 1001) g)),
  '22023', null, 'Au plus mille écoles par importation');

select * from finish();
rollback;
