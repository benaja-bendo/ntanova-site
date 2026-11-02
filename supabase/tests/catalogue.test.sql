-- Le catalogue multi-campus et multi-cycles : institution, campus, cycles, formations, vocabulaires.

begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Mise en place (rôle postgres) : un complexe scolaire à Tié-Tié et une université à deux implantations -------

insert into public.institutions (id, name, kind) values
  ('a1000000-0000-4000-8000-000000000001', 'Complexe scolaire [Étoile]', 'privee'),
  ('a1000000-0000-4000-8000-000000000002', 'Université [Horizon]', 'privee');

insert into public.campuses (id, institution_id, label, slug, division_id, publication, origin) values
  ('b1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', null, 'complexe-scolaire-etoile',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000002', 'Campus de Loandjili', 'universite-horizon-loandjili',
   (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.loandjili'), 'publiee', 'admin'),
  ('b1000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000002', 'Campus de Moungali', 'universite-horizon-moungali',
   (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali'), 'brouillon', 'admin');

insert into public.campus_cycles (id, campus_id, cycle) values
  ('c1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'maternelle'),
  ('c1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'primaire'),
  ('c1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'lycee'),
  ('c1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002', 'superieur');

-- Une institution, plusieurs campus, plusieurs cycles ----------------------------------------------------------------

select is((select count(*)::int from public.campuses where institution_id = 'a1000000-0000-4000-8000-000000000002'), 2,
  'Une université a plusieurs implantations (deux campus)');
select is((select count(distinct division_id)::int from public.campuses where institution_id = 'a1000000-0000-4000-8000-000000000002'), 2,
  'Ses implantations sont dans des quartiers ou des villes différents');
select is((select count(*)::int from public.campus_cycles where campus_id = 'b1000000-0000-4000-8000-000000000001'), 3,
  'Un complexe scolaire a plusieurs cycles (maternelle, primaire, lycée)');
select throws_ok($$insert into public.campus_cycles (campus_id, cycle) values ('b1000000-0000-4000-8000-000000000001', 'lycee')$$,
  '23505', null, 'Un cycle n''existe qu''une fois dans un campus');
select throws_ok($$insert into public.campus_cycles (campus_id, cycle) values ('b1000000-0000-4000-8000-000000000001', 'cm2')$$,
  '23514', null, 'Un cycle inconnu est refusé : la liste est fermée');

-- Les formations : séries, diplômes, domaines, rythmes ------------------------------------------------------------------

insert into public.campus_programs (campus_cycle_id, domain_id, title, bac_track, diploma, rhythms) values
  ('c1000000-0000-4000-8000-000000000003', (select id from public.education_domains where slug = 'sciences-technologies'), 'Série C', 'c', 'bac', '{jour}'),
  ('c1000000-0000-4000-8000-000000000003', (select id from public.education_domains where slug = 'gestion'), 'Série G2', 'g2', 'bac', '{jour,soir}'),
  ('c1000000-0000-4000-8000-000000000004', (select id from public.education_domains where slug = 'informatique'), 'Licence en informatique de gestion', null, 'licence', '{soir,weekend}');

select is((select count(*)::int from public.campus_programs), 3, 'Les formations s''enregistrent avec série, diplôme, domaine et rythmes');
select throws_ok($$insert into public.campus_programs (campus_cycle_id, title) values ('c1000000-0000-4000-8000-000000000003', '  série c ')$$,
  '23505', null, 'La même formation n''entre pas deux fois dans un cycle, à la casse et aux espaces près');
select throws_ok($$insert into public.campus_programs (campus_cycle_id, title, bac_track) values ('c1000000-0000-4000-8000-000000000003', 'X', 'z9')$$,
  '23514', null, 'Une série de bac inconnue est refusée');
select throws_ok($$insert into public.campus_programs (campus_cycle_id, title, diploma) values ('c1000000-0000-4000-8000-000000000004', 'X', 'doctorat-d-etat')$$,
  '23514', null, 'Un diplôme inconnu est refusé');
select throws_ok($$insert into public.campus_programs (campus_cycle_id, title, rhythms) values ('c1000000-0000-4000-8000-000000000004', 'X', '{nuit}')$$,
  '23514', null, 'Un rythme inconnu est refusé');

select is((select count(*)::int from public.education_domains where slug in ('informatique', 'gestion', 'btp', 'sante')), 4,
  'Les domaines Informatique, Gestion, BTP et Santé sont au catalogue');
select ok((select count(*) from public.education_domains) >= 15, 'Le catalogue des domaines est fourni');
select ok(exists (select 1 from public.education_domains where slug = 'autre'), 'Il y a une case de sortie « Autre »');

select lives_ok($$select 'a'::public.bac_track, 'c'::public.bac_track, 'd'::public.bac_track, 'f'::public.bac_track, 'g'::public.bac_track,
                         'f3'::public.bac_track, 'g1'::public.bac_track, 'autre'::public.bac_track$$,
  'Les séries A, C, D, F, G et leurs variantes sont reconnues');
select lives_ok($$select 'bepc'::public.diploma_kind, 'bac'::public.diploma_kind, 'bt'::public.diploma_kind, 'bts'::public.diploma_kind,
                         'licence'::public.diploma_kind, 'master'::public.diploma_kind, 'certificat'::public.diploma_kind$$,
  'Les diplômes BEPC, BAC, BT, BTS, Licence, Master et Certificat sont reconnus');
select lives_ok($$select 'jour'::public.study_rhythm, 'soir'::public.study_rhythm, 'weekend'::public.study_rhythm$$,
  'Les rythmes Jour, Soir et Week-end sont reconnus');

-- Les règles de chaque campus ----------------------------------------------------------------------------------------------

select throws_ok($$insert into public.campuses (institution_id, slug, publication, origin)
                    values ('a1000000-0000-4000-8000-000000000001', 'sans-division', 'publiee', 'admin')$$,
  '23514', null, 'Un campus publié a une division');
select lives_ok($$insert into public.campuses (institution_id, slug, publication, origin)
                   values ('a1000000-0000-4000-8000-000000000001', 'a-situer', 'brouillon', 'admin')$$,
  'Un campus sans division reste en brouillon : « à situer »');
select throws_ok($$insert into public.campuses (institution_id, slug, division_id, publication, origin)
                   values ('a1000000-0000-4000-8000-000000000001', 'complexe-scolaire-etoile',
                           (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'brouillon', 'admin')$$,
  '23505', null, 'Deux campus d''une même division n''ont pas la même adresse');
select throws_ok($$update public.campuses set publication = 'retiree' where id = 'b1000000-0000-4000-8000-000000000003'$$,
  '23514', null, 'Un campus retiré dit pourquoi');
select throws_ok($$update public.campuses set verification_state = 'verifiee' where id = 'b1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Un campus « vérifié » porte la date de l''accord de la direction');
select throws_ok($$update public.campuses set located_at = now() where id = 'b1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'Une position donnée a son auteur');
select throws_ok($$insert into public.campuses (institution_id, slug, division_id, origin)
                    values ('a1000000-0000-4000-8000-000000000001', 'x', (select id from public.geo_divisions where path::text = 'congo'), 'rien')$$,
  '23514', null, 'L''origine d''une fiche est une liste fermée (relevée, ajoutée, importée)');

-- Les écoles sont cherchables sans accent ni faute -----------------------------------------------------------------------------

select is((select count(*)::int from public.institutions where public.norm_text(name) like '%etoile%'), 1,
  'Le nom se cherche sans accent');
select ok(exists (select 1 from public.institutions where public.norm_text(name) operator(extensions.%) public.norm_text('Complexe Etoille')),
  'Le nom se cherche avec une faute (trigrammes)');

-- Une institution voit ses campus à travers les cycles : la suppression d'un campus emporte ses cycles ---------------------------

select is((select count(*)::int from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
           where cc.campus_id = 'b1000000-0000-4000-8000-000000000001'), 2, 'Les formations du lycée sont rattachées à son cycle');
delete from public.campuses where id = 'b1000000-0000-4000-8000-000000000003';
select is((select count(*)::int from public.campuses where id = 'b1000000-0000-4000-8000-000000000003'), 0,
  'Le propriétaire de la base peut retirer un campus vide (l''API, elle, ne le peut pas)');

-- L'identifiant d'une fiche ne se confond pas avec la division ----------------------------------------------------------------------

select is(public.unique_campus_slug((select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'),
          'Complexe scolaire [Étoile]'), 'complexe-scolaire-etoile-2',
  'L''adresse d''un nouveau campus prend -2 quand elle est déjà prise dans sa division');
select throws_ok($$select public.unique_campus_slug(null, '!!!')$$, '22023', null, 'Un nom sans lettre ne donne aucune adresse');

select * from finish();
rollback;
