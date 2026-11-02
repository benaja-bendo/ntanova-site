-- La zone ouverte, pas le lot, est la limite du relais (ticket n° 67). Le lot est un secteur conseillé : un relais
-- relève où il se trouve ; la base dit seulement, pour l'administration, dans quelle division tombe la position et si
-- cette division est ouverte aux relais. Le cache des écoles connues couvre les zones ouvertes, pas seulement le lot.
-- À cette latitude, 0,01° de longitude fait environ 1,1 km.

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

-- Mise en place : deux arrondissements d'essai sous Pointe-Noire, l'un ouvert aux relais, l'autre fermé -----------------------

insert into public.geo_divisions (id, parent_id, level, kind, country_code, name, slug, boundary, source)
select v.id::uuid, p.id, 3, 'arrondissement', 'CG', v.nom, v.slug,
       extensions.st_multi(extensions.st_makeenvelope(v.ouest, -4.90, v.est, -4.80, 4326)), 'test'
from public.geo_divisions p,
     (values ('7a000000-0000-4000-8000-000000000001', '[Zone ouverte]', 'zone-ouverte', 12.50, 12.60),
             ('7a000000-0000-4000-8000-000000000002', '[Zone fermée]', 'zone-fermee', 12.70, 12.80)) as v(id, nom, slug, ouest, est)
where p.path::text = 'congo.pointe_noire.pointe_noire';
select public.set_division_open('7a000000-0000-4000-8000-000000000001', true);

select public.register_relay('00000000-0000-4000-8000-0000000000a8', 'google-a8', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b8', 'google-b8', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000c8', 'google-c8', 'Chloé');
select public.register_relay('00000000-0000-4000-8000-0000000000d8', 'google-d8', 'Dominique');
select public.register_relay('00000000-0000-4000-8000-0000000000e8', 'google-e8', 'Emma');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d8');

-- Alice a un secteur dans la zone ouverte ; Emma, un lot d'essai dans la zone fermée ; Bastien n'a aucun secteur ;
-- Chloé attend son activation.
insert into public.lots (id, nom, geo_division_id, contour, essai) values
  ('60000000-0000-4000-8000-0000000000a8', '[Secteur d''Alice]', '7a000000-0000-4000-8000-000000000001',
   extensions.st_multi(extensions.st_makeenvelope(12.52, -4.88, 12.54, -4.86, 4326)), false),
  ('60000000-0000-4000-8000-0000000000e8', '[Essai d''Emma]', '7a000000-0000-4000-8000-000000000002',
   extensions.st_multi(extensions.st_makeenvelope(12.71, -4.88, 12.73, -4.86, 4326)), true);
select public.activer_relais('00000000-0000-4000-8000-0000000000a8', '60000000-0000-4000-8000-0000000000a8');
select public.activer_relais('00000000-0000-4000-8000-0000000000e8', '60000000-0000-4000-8000-0000000000e8');

-- Un relais peut être activé sans secteur --------------------------------------------------------------------------------------------

select lives_ok($$select public.activer_relais('00000000-0000-4000-8000-0000000000b8', null)$$,
  'L''administration active un relais sans lui donner de secteur');
select is((select statut::text || '|' || coalesce(lot_id::text, 'sans secteur') from public.relais where id = '00000000-0000-4000-8000-0000000000b8'),
  'actif|sans secteur', 'Il est actif, sans lot');

-- Ce que la base calcule à l'arrivée d'un relevé ----------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('7b000000-0000-4000-8000-000000000001', now(), 'SRID=4326;POINT(12.53 -4.87)', '[Dans le secteur]'),
  ('7b000000-0000-4000-8000-000000000002', now(), 'SRID=4326;POINT(12.58 -4.85)', '[Hors du secteur, en zone ouverte]'),
  ('7b000000-0000-4000-8000-000000000003', now(), 'SRID=4326;POINT(12.75 -4.85)', '[Dans une zone fermée]'),
  ('7b000000-0000-4000-8000-000000000004', now(), 'SRID=4326;POINT(14.00 -4.85)', '[Hors de tout contour connu]'),
  ('7b000000-0000-4000-8000-000000000005', now(), null, '[Sans position]');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b8","role":"authenticated"}', true);
insert into public.field_submissions (id, taken_at, position, sign_name) values
  ('7b000000-0000-4000-8000-000000000006', now(), 'SRID=4326;POINT(12.55 -4.84)', '[Relais sans secteur]');
reset role;

select is((select division_id from public.field_submissions where id = '7b000000-0000-4000-8000-000000000001'),
  '7a000000-0000-4000-8000-000000000001'::uuid, 'La base rattache le relevé à la division qui contient sa position');
select is((select in_open_zone from public.field_submissions where id = '7b000000-0000-4000-8000-000000000001'), true,
  'Dans une zone ouverte : vrai');
select is((select outside_batch from public.field_submissions where id = '7b000000-0000-4000-8000-000000000002'), true,
  'À plus de 50 m du secteur, la base garde son drapeau « hors du lot » (une information)');
select is((select in_open_zone from public.field_submissions where id = '7b000000-0000-4000-8000-000000000002'), true,
  'Mais la position est en zone ouverte : le relais travaille là où NTanova l''attend');
select is((select division_id from public.field_submissions where id = '7b000000-0000-4000-8000-000000000003'),
  '7a000000-0000-4000-8000-000000000002'::uuid, 'Une position dans une zone fermée est rattachée à cette zone');
select is((select in_open_zone from public.field_submissions where id = '7b000000-0000-4000-8000-000000000003'), false,
  'Dans une division connue mais fermée : faux');
select is((select division_id from public.field_submissions where id = '7b000000-0000-4000-8000-000000000004'), null::uuid,
  'Aucun contour connu ne contient la position : pas de division');
select is((select in_open_zone from public.field_submissions where id = '7b000000-0000-4000-8000-000000000004'), null::boolean,
  'Aucune division connue n''est pas « hors zone » : la base ne dit rien');
select is((select in_open_zone from public.field_submissions where id = '7b000000-0000-4000-8000-000000000005'), null::boolean,
  'Sans position, la base ne dit rien');
select is((select coalesce(batch_id::text, 'sans secteur') || '|' || coalesce(outside_batch::text, 'nul') || '|' || in_open_zone::text
           from public.field_submissions where id = '7b000000-0000-4000-8000-000000000006'),
  'sans secteur|nul|true', 'Un relais sans secteur envoie : pas de « hors du lot », la zone ouverte suffit');

-- Le téléphone ne dicte ni la division ni la zone ---------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
select throws_ok($$insert into public.field_submissions (id, taken_at, position, sign_name, in_open_zone)
                   values (gen_random_uuid(), now(), 'SRID=4326;POINT(12.75 -4.85)', 'x', true)$$,
  '42501', null, 'Un relais n''écrit pas « en zone ouverte »');
select throws_ok($$insert into public.field_submissions (id, taken_at, position, sign_name, division_id)
                   values (gen_random_uuid(), now(), 'SRID=4326;POINT(12.75 -4.85)', 'x', '7a000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'Un relais n''écrit pas la division');
select throws_ok($$update public.field_submissions set in_open_zone = true where id = '7b000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'Il ne la modifie pas non plus');
reset role;

-- L'administration le voit, en information -------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d8","role":"authenticated"}', true);
create temp table file_admin as select id, in_open_zone, outside_batch from public.submissions_to_review;
reset role;
select is((select in_open_zone from file_admin where id = '7b000000-0000-4000-8000-000000000002'), true,
  'La file « À valider » dit que la position est en zone ouverte');
select is((select in_open_zone from file_admin where id = '7b000000-0000-4000-8000-000000000003'), false,
  'Elle dit qu''une division connue est fermée');
select is((select in_open_zone from file_admin where id = '7b000000-0000-4000-8000-000000000004'), null::boolean,
  'Et qu''elle ne connaît pas la zone quand aucun contour ne contient la position');

-- Demander de reprendre la position : le motif a son vrai nom, l'ancien reste valide -------------------------------------------------

select lives_ok($$select public.request_correction('7b000000-0000-4000-8000-000000000001', 'position_imprecise', 'Placez-vous devant l''entrée.')$$,
  'L''administration demande de reprendre la position');
select is((select reason from public.field_submissions where id = '7b000000-0000-4000-8000-000000000001'), 'position_imprecise',
  'Le motif est gardé tel quel');
select lives_ok($$select public.request_correction('7b000000-0000-4000-8000-000000000004', 'hors_lot', 'Une ancienne demande.')$$,
  'Une demande déjà faite avec « hors du lot » reste valable : on ne retire jamais une valeur d''une liste');
select is((select status::text from public.field_submissions where id = '7b000000-0000-4000-8000-000000000004'), 'a_corriger',
  'Elle est bien renvoyée au relais');

-- Un relevé hors secteur est un relevé comme un autre : accepté, rattaché à sa division, payable ----------------------------------------

create temp table acceptees as
  select public.accept_submission('7b000000-0000-4000-8000-000000000002') as campus_ouvert,
         public.accept_submission('7b000000-0000-4000-8000-000000000003') as campus_ferme;
select is((select status::text || '|' || payable::text from public.field_submissions where id = '7b000000-0000-4000-8000-000000000002'),
  'accepte|true', 'Hors du secteur, mais en zone ouverte : accepté et payable');
select is((select status::text || '|' || payable::text from public.field_submissions where id = '7b000000-0000-4000-8000-000000000003'),
  'accepte|true', 'Dans une zone fermée : accepté et payable aussi, la position ne change pas la paie');
select is((select division_id from public.campuses where id = (select campus_ferme from acceptees)),
  '7a000000-0000-4000-8000-000000000002'::uuid, 'Le campus est rattaché à la division de la position, pas à celle du secteur du relais');
select is((select count(*)::int from prive.payable_items_for(current_date + 7)
           where submission_id in ('7b000000-0000-4000-8000-000000000002', '7b000000-0000-4000-8000-000000000003')), 2,
  'Les deux fiches figurent dans la paie du vendredi');

-- Le cache des écoles connues couvre les zones ouvertes ---------------------------------------------------------------------------------

insert into public.institutions (id, name) values
  ('a7000000-0000-4000-8000-000000000001', 'École [En zone ouverte]'), ('a7000000-0000-4000-8000-000000000002', 'École [En zone fermée]'),
  ('a7000000-0000-4000-8000-000000000003', 'École [Retirée]'), ('a7000000-0000-4000-8000-000000000004', 'École [À situer]'),
  ('a7000000-0000-4000-8000-000000000005', 'École [Dans l''essai]');
insert into public.campuses (id, institution_id, slug, division_id, position, publication, origin, retirement_reason) values
  ('b7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'ecole-en-zone-ouverte',
   '7a000000-0000-4000-8000-000000000001', extensions.st_setsrid(extensions.st_makepoint(12.59, -4.85), 4326), 'publiee', 'admin', null),
  ('b7000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002', 'ecole-en-zone-fermee',
   '7a000000-0000-4000-8000-000000000002', extensions.st_setsrid(extensions.st_makepoint(12.78, -4.85), 4326), 'publiee', 'admin', null),
  ('b7000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000003', 'ecole-retiree',
   '7a000000-0000-4000-8000-000000000001', extensions.st_setsrid(extensions.st_makepoint(12.57, -4.85), 4326), 'retiree', 'admin', 'fermeture'),
  ('b7000000-0000-4000-8000-000000000004', 'a7000000-0000-4000-8000-000000000004', 'ecole-a-situer',
   '7a000000-0000-4000-8000-000000000001', null, 'prete', 'admin', null),
  ('b7000000-0000-4000-8000-000000000005', 'a7000000-0000-4000-8000-000000000005', 'ecole-dans-l-essai',
   '7a000000-0000-4000-8000-000000000002', extensions.st_setsrid(extensions.st_makepoint(12.72, -4.87), 4326), 'prete', 'admin', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
create temp table cache_alice as select * from public.known_places_for_me();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b8","role":"authenticated"}', true);
create temp table cache_bastien as select * from public.known_places_for_me();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e8","role":"authenticated"}', true);
create temp table cache_emma as select * from public.known_places_for_me();
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c8","role":"authenticated"}', true);
create temp table cache_chloe as select * from public.known_places_for_me();
reset role;

select ok(exists (select 1 from cache_alice where id = 'b7000000-0000-4000-8000-000000000001'),
  'Alice reçoit une école de la zone ouverte à 2 km de son secteur : elle ne s''arrête plus au secteur');
select ok(exists (select 1 from cache_bastien where id = 'b7000000-0000-4000-8000-000000000001'),
  'Bastien, sans secteur, reçoit la même école');
select ok(not exists (select 1 from cache_alice where id = 'b7000000-0000-4000-8000-000000000002'),
  'Une école d''une zone fermée, hors de son secteur, n''y est pas');
select ok(not exists (select 1 from cache_alice where id = 'b7000000-0000-4000-8000-000000000003'),
  'Une école retirée n''y est pas');
select ok(not exists (select 1 from cache_alice where id = 'b7000000-0000-4000-8000-000000000004'),
  'Une école sans position (« à situer ») n''y est pas : il n''y a rien à comparer');
select ok(exists (select 1 from cache_emma where id = 'b7000000-0000-4000-8000-000000000005'),
  'Un secteur hors des zones ouvertes (le lot d''essai d''Emma) reste couvert, à 100 m près');
select ok(not exists (select 1 from cache_emma where id = 'b7000000-0000-4000-8000-000000000002'),
  'Mais pas ce qui est plus loin dans la même zone fermée');
select ok(exists (select 1 from cache_emma where id = 'b7000000-0000-4000-8000-000000000001'),
  'Emma reçoit aussi les écoles des zones ouvertes');
select is((select kind from cache_alice where id = 'b7000000-0000-4000-8000-000000000001'), 'campus', 'Un campus est donné comme campus');
select is((select name from cache_alice where id = 'b7000000-0000-4000-8000-000000000001'), 'École [En zone ouverte]',
  'Chaque ligne porte le nom de l''école');
select ok(exists (select 1 from cache_bastien where kind = 'submission' and id = '7b000000-0000-4000-8000-000000000001'),
  'Bastien reçoit les relevés pas encore acceptés de la zone ouverte, de tous les relais');
select ok(not exists (select 1 from cache_bastien where id = '7b000000-0000-4000-8000-000000000002'),
  'Un relevé accepté n''est plus listé : le campus qui le porte suffit');
select is((select count(*)::int from cache_chloe), 0, 'Un relais en attente ne reçoit aucune école');

set local role anon;
select throws_ok($$select * from public.known_places_for_me()$$, '42501', null, 'Un visiteur ne l''appelle pas');
reset role;

-- Rien n'est retiré : un téléphone déjà installé continue de lire son lot et son cache -------------------------------------------------

select has_function('public', 'my_batch', 'my_batch() existe encore');
select has_function('public', 'known_places_in_my_batch', 'known_places_in_my_batch() existe encore');
select has_function('public', 'known_places_for_me', 'known_places_for_me() existe');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a8","role":"authenticated"}', true);
select is((select nom from public.my_batch()), '[Secteur d''Alice]', 'L''ancien téléphone lit toujours son lot');
select is((select count(*)::int from public.known_places_in_my_batch() where name = '[Dans le secteur]'), 1,
  'Et l''ancien cache répond encore : le relevé de son secteur y est');
reset role;

select * from finish();
rollback;
