-- Les décisions de l'administration : accepter un relevé et le transformer en institution, campus ou cycle ;
-- corrections, contre-visites, lot d'essai, missions, publication, retrait, fusion, badge « Vérifié », effacements.

begin;
create extension if not exists pgtap with schema extensions;
select plan(83);

-- Mise en place -------------------------------------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));

create function pg_temp.envoyer(p_relais uuid, p_id uuid, p_nom text, p_niveaux text, p_type text default 'non_indique',
                                p_lon float8 default 11.93, p_lat float8 default -4.80, p_kind text default 'releve',
                                p_corrige uuid default null, p_campus uuid default null) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_relais, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.field_submissions (id, kind, corrects_submission_id, duplicate_of_campus_id, taken_at, position, sign_name, levels, school_kind, landmark)
  values (p_id, p_kind, p_corrige, p_campus, now() - interval '1 day', 'SRID=4326;POINT(0 0)'::extensions.geometry,
          p_nom, p_niveaux::public.niveau[], p_type, 'Près du marché');
  reset role;
  update public.field_submissions set position = extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326) where id = p_id;
end $$;

-- Mode « nouvelle institution » ---------------------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000001', 'Complexe scolaire [Étoile]', '{maternelle,primaire}', 'privee');
create temp table r1 as select public.accept_submission('51000000-0000-4000-8000-000000000001') as campus_id;
select is((select campus_id from r1), (select id from public.campuses where slug = 'complexe-scolaire-etoile'),
  'Accepter un relevé crée le campus et rend son identifiant');
select is((select i.name || '|' || i.kind from public.institutions i join public.campuses c on c.institution_id = i.id where c.slug = 'complexe-scolaire-etoile'),
  'Complexe scolaire [Étoile]|privee', 'Une nouvelle institution est créée, avec son nom et son genre');
select is((select publication || '|' || origin || '|' || division_id::text from public.campuses where slug = 'complexe-scolaire-etoile'),
  'prete|field|' || (select id::text from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'),
  'Le campus est « prêt », d''origine « field », dans l''arrondissement qui contient sa position');
select is((select string_agg(cycle, ',' order by cycle) from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.slug = 'complexe-scolaire-etoile'),
  'maternelle,primaire', 'Les niveaux du relevé deviennent les cycles du campus');
select is((select status || '|' || accepted_as from public.field_submissions where id = '51000000-0000-4000-8000-000000000001'),
  'accepte|new_institution', 'Le relevé dit comment il a été accepté');
select ok((select surveyed_at is not null and landmark = 'Près du marché' from public.campuses where slug = 'complexe-scolaire-etoile'),
  'La date de relevé et le repère viennent du relevé');
select is(public.accept_submission('51000000-0000-4000-8000-000000000001'), (select id from public.campuses where slug = 'complexe-scolaire-etoile'),
  'Accepter deux fois ne crée rien de plus');
select is((select count(*)::int from public.institutions), 1, 'Une seule institution');

-- Mode « nouveau campus d'une institution connue » -----------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000002', 'Complexe scolaire [Étoile]', '{lycee}', 'non_indique', 11.92, -4.82);
select lives_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000002', 'new_campus', null,
    (select id from public.institutions limit 1), 'Annexe du lycée')$$,
  'Un relevé devient un nouveau campus d''une institution connue');
select is((select count(*)::int from public.campuses), 2, 'L''institution a maintenant deux campus');
select is((select count(*)::int from public.institutions), 1, 'Sans nouvelle institution');
select is((select slug from public.campuses where label = 'Annexe du lycée'), 'complexe-scolaire-etoile-annexe-du-lycee',
  'Le nouveau campus a sa propre adresse (nom et implantation)');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000012', 'Autre', '{}', 'non_indique', 11.91, -4.81);
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000012', 'new_campus')$$, '22023', null,
  'Le mode « nouveau campus » exige l''institution');
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000012', 'update_campus')$$, '22023', null,
  'Le mode « mise à jour » exige le campus');
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000012', 'fusion')$$, '22023', null,
  'Un mode inconnu est refusé');

-- Mode « mise à jour » et « nouveau cycle » d'un campus connu -----------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000003', 'Complexe scolaire [Étoile]', '{college}', 'confessionnelle');
select lives_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000003', 'add_cycle',
    (select id from public.campuses where slug = 'complexe-scolaire-etoile'))$$,
  'Un relevé s''ajoute comme nouveau cycle d''un campus existant');
select is((select string_agg(cycle, ',' order by cycle) from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.slug = 'complexe-scolaire-etoile'),
  'college,maternelle,primaire', 'Le cycle est ajouté, les autres restent');
select is((select kind from public.institutions i join public.campuses c on c.institution_id = i.id where c.slug = 'complexe-scolaire-etoile'), 'privee',
  'Ajouter un cycle ne change pas le genre de l''institution');

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000004', 'Complexe scolaire [Étoile] Nouveau nom', '{lycee}', 'confessionnelle');
select lives_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000004', 'update_campus',
    (select id from public.campuses where slug = 'complexe-scolaire-etoile'))$$,
  'Un relevé met à jour un campus existant');
select is((select i.kind from public.institutions i join public.campuses c on c.institution_id = i.id where c.slug = 'complexe-scolaire-etoile'), 'confessionnelle',
  'Le genre dit par le relevé remplace l''ancien');
select is((select i.name from public.institutions i join public.campuses c on c.institution_id = i.id where c.slug = 'complexe-scolaire-etoile'),
  'Complexe scolaire [Étoile]', 'Le nom d''une institution à plusieurs campus ne change pas : il vaut pour tous');
select ok((select 'lycee' = any (array_agg(cycle)) from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.slug = 'complexe-scolaire-etoile'),
  'Le lycée s''ajoute aux cycles (rien n''est effacé sans correction)');

-- « Pas indiqué » et « aucun niveau » n'effacent rien -------------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000005', 'Complexe scolaire [Étoile]', '{}', 'non_indique');
select public.accept_submission('51000000-0000-4000-8000-000000000005', 'update_campus', (select id from public.campuses where slug = 'complexe-scolaire-etoile'));
select is((select i.kind from public.institutions i join public.campuses c on c.institution_id = i.id where c.slug = 'complexe-scolaire-etoile'), 'confessionnelle',
  '« Pas indiqué » n''efface pas le genre connu');
select is((select count(*)::int from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.slug = 'complexe-scolaire-etoile'), 4,
  'Un relevé muet sur les niveaux n''efface aucun cycle');

-- Les formations lues sur les photos ---------------------------------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000006', 'Institut [Horizon]', '{superieur,lycee}', 'privee', 11.94, -4.83);
select lives_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000006', null, null, null, null,
  '[{"cycle":"superieur","title":"BTS Gestion commerciale","domain":"gestion","diploma":"bts","rhythms":["soir","weekend"]},
    {"cycle":"lycee","title":"Série G2","bac_track":"g2","diploma":"bac","rhythms":["jour"]},
    {"cycle":"superieur","title":"  bts  gestion commerciale ","domain":"gestion"}]'::jsonb)$$,
  'Les formations saisies depuis les photos s''enregistrent avec l''acceptation');
select is((select count(*)::int from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id join public.campuses c on c.id = cc.campus_id
           where c.slug = 'institut-horizon'), 2, 'Deux formations (la troisième est la même que la première, à l''écriture près)');
select is((select p.diploma || '|' || array_to_string(p.rhythms, ',') || '|' || ed.slug || '|' || p.origin
           from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
           join public.campuses c on c.id = cc.campus_id join public.education_domains ed on ed.id = p.domain_id
           where c.slug = 'institut-horizon' and p.title = 'BTS Gestion commerciale'),
  'bts|soir,weekend|gestion|field', 'La formation garde son diplôme, ses rythmes, son domaine et son origine');
select is((select count(*)::int from public.campus_programs where source_submission_id = '51000000-0000-4000-8000-000000000006'), 2,
  'Chaque formation se souvient du relevé d''où elle vient');
select throws_ok($$select public.upsert_programs((select id from public.campuses where slug = 'institut-horizon'), '[{"cycle":"lycee","title":" "}]'::jsonb, 'admin')$$,
  '22023', null, 'Une formation sans titre est refusée');

-- Corrections --------------------------------------------------------------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '51000000-0000-4000-8000-0000000000b1', 'École [Océan]', '{primaire,college}', 'publique', 11.90, -4.86);
select public.accept_submission('51000000-0000-4000-8000-0000000000b1');
select public.accept_submission('51000000-0000-4000-8000-0000000000b1');
insert into public.campus_programs (campus_cycle_id, title)
select cc.id, 'Option musique' from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.slug = 'ecole-ocean' and cc.cycle = 'college';
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '51000000-0000-4000-8000-0000000000b2', 'École [Océan]', '{primaire}', 'publique', 11.90, -4.86, 'correction', '51000000-0000-4000-8000-0000000000b1');
select is(public.accept_submission('51000000-0000-4000-8000-0000000000b2'), (select id from public.campuses where slug = 'ecole-ocean'),
  'Une correction reprend le campus de la fiche corrigée');
select is((select string_agg(cycle, ',' order by cycle) from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id where c.slug = 'ecole-ocean'),
  'college,primaire', 'Une correction retire un cycle coché à tort, sauf s''il a des formations : ici le collège garde « Option musique »');
select is((select count(*)::int from public.campuses where slug like 'ecole-ocean%'), 1, 'Une correction ne crée pas de second campus');
select is((select payable from public.field_submissions where id = '51000000-0000-4000-8000-0000000000b2'), false,
  'Une correction ne se paie pas : la fiche qu''elle corrige porte la paie');

-- Un autre relais relève la même école : pas payé deux fois ----------------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000007', 'École Océan', '{primaire}', 'publique', 11.9001, -4.8601);
select public.accept_submission('51000000-0000-4000-8000-000000000007', 'update_campus', (select id from public.campuses where slug = 'ecole-ocean'));
select is((select payable from public.field_submissions where id = '51000000-0000-4000-8000-000000000007'), false,
  'Une école déjà relevée par un autre relais ne se paie pas une seconde fois');
select is((select payable from public.field_submissions where id = '51000000-0000-4000-8000-000000000001'), true, 'La première fiche d''une école se paie');

-- Refus, correction demandée ------------------------------------------------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000008', 'École [Floue]', '{primaire}');
select lives_ok($$select public.request_correction('51000000-0000-4000-8000-000000000008', 'photo_floue', 'Reprenez la photo de face.')$$,
  'L''administration demande une correction au relais');
select is((select status || ' · ' || message_to_relay from public.field_submissions where id = '51000000-0000-4000-8000-000000000008'),
  'a_corriger · Reprenez la photo de face.', 'Le relais lira le motif et le message');
select lives_ok($$select public.refuse_submission('51000000-0000-4000-8000-000000000008', 'doublon', 'Déjà relevée.')$$, 'L''administration refuse');
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000008')$$, '22023', null,
  'Un refus est définitif : on n''accepte plus un relevé refusé');
select throws_ok($$select public.request_correction('51000000-0000-4000-8000-000000000008', 'photo_floue')$$, 'P0002', null,
  'On ne demande pas de correction sur un relevé déjà décidé');

-- Avec le motif « autre », le message est obligatoire (ticket #80) ---------------------------------------------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-00000000000a', 'École [Autre]', '{primaire}');
select throws_ok($$select public.request_correction('51000000-0000-4000-8000-00000000000a', 'autre')$$, '22023',
  'Avec le motif « autre », écris un message : le relais doit savoir quoi faire.',
  'Une correction « autre » sans message est refusée, avec sa phrase');
select throws_ok($$select public.request_correction('51000000-0000-4000-8000-00000000000a', 'autre', E'  \n ')$$, '22023', null,
  'Des espaces ne sont pas un message');
select throws_ok($$select public.refuse_submission('51000000-0000-4000-8000-00000000000a', 'autre')$$, '22023', null,
  'Un refus « autre » sans message est refusé : un refus est définitif, il dit pourquoi');
select is((select status from public.field_submissions where id = '51000000-0000-4000-8000-00000000000a'), 'a_valider',
  'Rien n''a été écrit : la fiche attend toujours');
select lives_ok($$select public.request_correction('51000000-0000-4000-8000-00000000000a', 'photo_floue')$$,
  'Un autre motif garde son message facultatif (sa phrase automatique suffit)');
select lives_ok($$select public.request_correction('51000000-0000-4000-8000-00000000000a', 'autre', 'Le nom du portail diffère.')$$,
  'Avec un message, « autre » passe');
select is((select message_to_relay from public.field_submissions where id = '51000000-0000-4000-8000-00000000000a'),
  'Le nom du portail diffère.', 'Le relais lira ce message');
select lives_ok($$select public.refuse_submission('51000000-0000-4000-8000-00000000000a', 'autre', 'Hors du périmètre.')$$,
  'Un refus « autre » avec un message passe');
select is((select status from public.field_submissions where id = '51000000-0000-4000-8000-00000000000a'), 'refuse',
  'La fiche est refusée');

-- Le lot d'essai ne se publie jamais, mais se valide pour la paie ------------------------------------------------------------------------------------------

select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where essai));
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '51000000-0000-4000-8000-000000000009', 'École [Essai]', '{primaire}');
select throws_ok($$select public.accept_submission('51000000-0000-4000-8000-000000000009')$$, '22023', null,
  'Un relevé du lot d''essai ne se publie jamais');
select lives_ok($$select public.validate_trial_submission('51000000-0000-4000-8000-000000000009')$$, 'Il se valide avec le relais pour la paie d''essai');
select ok((select trial_validated_at is not null from public.field_submissions where id = '51000000-0000-4000-8000-000000000009'), 'La validation est datée');
select throws_ok($$select public.validate_trial_submission('51000000-0000-4000-8000-000000000001')$$, '22023', null,
  'Seul un relevé du lot d''essai se valide ainsi');

-- Contre-visite et missions ----------------------------------------------------------------------------------------------------------------------------------

select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));
insert into public.institutions (id, name, kind) values ('a1000000-0000-4000-8000-000000000077', '[École connue]', 'privee');
insert into public.campuses (id, institution_id, slug, publication, origin)
values ('b1000000-0000-4000-8000-000000000077', 'a1000000-0000-4000-8000-000000000077', 'ecole-connue', 'brouillon', 'import');
select lives_ok($$select public.assign_mission('b1000000-0000-4000-8000-000000000077', '00000000-0000-4000-8000-0000000000a1', 'locate', 'Vérifier le nom et situer l''entrée.')$$,
  'L''administration confie une école pré-enregistrée à un relais');
select throws_ok($$select public.assign_mission('b1000000-0000-4000-8000-000000000077', '00000000-0000-4000-8000-0000000000c1')$$, '22023', null,
  'On ne confie rien à un relais qui n''est pas actif');
select is((select count(*)::int from public.missions where status = 'open'), 1, 'Une mission est ouverte');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000010', 'École [Connue]', '{primaire}', 'privee',
                        11.95, -4.84, 'contre_visite', null, 'b1000000-0000-4000-8000-000000000077');
select throws_ok($$select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '51000000-0000-4000-8000-000000000011', 'x', '{}', 'privee', 11.95, -4.84, 'contre_visite')$$,
  '23514', null, 'Une contre-visite dit quelle école elle visite');
select is(public.accept_submission('51000000-0000-4000-8000-000000000010'), 'b1000000-0000-4000-8000-000000000077'::uuid,
  'Accepter une contre-visite met à jour l''école visitée');
select is((select publication || '|' || (position is not null)::text || '|' || (division_id is not null)::text from public.campuses where slug = 'ecole-connue'),
  'prete|true|true', 'Elle donne sa position et sa division à l''école, qui devient prête');
select is((select status from public.missions where campus_id = 'b1000000-0000-4000-8000-000000000077' order by created_at desc limit 1), 'done',
  'La mission du relais est terminée');
select lives_ok($$select public.assign_mission('b1000000-0000-4000-8000-000000000077', '00000000-0000-4000-8000-0000000000a1')$$, 'On peut confier de nouveau une école');
select lives_ok($$select public.cancel_mission('b1000000-0000-4000-8000-000000000077')$$, 'L''administration reprend une mission');
select is((select count(*)::int from public.missions where status = 'open'), 0, 'Plus de mission ouverte');

-- Publier, retirer, republier --------------------------------------------------------------------------------------------------------------------------------------

select is((select count(*)::int from public.campuses where publication = 'prete'), 5, 'Cinq campus sont prêts');
select is(public.publish_batch((select id from public.lots where nom = 'Ngoyo')), 1, 'Publier un lot publie les campus prêts relevés dans ce lot');
select lives_ok($$select public.publish_campus((select id from public.campuses where slug = 'institut-horizon'))$$, 'Publier un campus');
select is(public.publish_division((select id from public.geo_divisions where path::text = 'congo.pointe_noire')), 3,
  'Publier une division publie les campus prêts de tout son sous-arbre');
select is(public.publish_division((select id from public.geo_divisions where path::text = 'congo.pointe_noire')), 0,
  'Publier une division déjà publiée ne publie rien de plus');
select lives_ok($$select public.retire_campus((select id from public.campuses where slug = 'institut-horizon'), 'fermeture', 'Fermé.')$$, 'Retirer du site');
select is((select count(*)::int from public.public_campuses where slug = 'institut-horizon'), 0, 'Un campus retiré disparaît du site');
select is((select retirement_reason || '|' || (retired_at is not null)::text from public.campuses where slug = 'institut-horizon'), 'fermeture|true',
  'Le retrait garde son motif et sa date');
select lives_ok($$select public.publish_campus((select id from public.campuses where slug = 'institut-horizon'))$$, 'Un campus retiré se republie');

-- Fusion de deux doublons ----------------------------------------------------------------------------------------------------------------------------------------

select lives_ok($$select public.merge_campuses((select id from public.campuses where slug = 'ecole-ocean'), (select id from public.campuses where slug = 'complexe-scolaire-etoile'))$$,
  'Deux fiches du même campus se fusionnent');
select is((select publication || '|' || retirement_reason from public.campuses where slug = 'ecole-ocean'), 'retiree|doublon', 'Le doublon est retiré, motif « doublon »');
select is((select from_slug || ' → ' || to_slug from public.public_campus_redirects), 'ecole-ocean → complexe-scolaire-etoile',
  'Son ancienne adresse renvoie vers la fiche gardée');
select is((select string_agg(what, ',' order by what) from prive.erasures), 'merge', 'La fusion est tracée');
select throws_ok($$select public.merge_campuses((select id from public.campuses where slug = 'ecole-ocean'), (select id from public.campuses where slug = 'ecole-ocean'))$$,
  '22023', null, 'Un campus ne se fusionne pas avec lui-même');

-- Situer un campus ----------------------------------------------------------------------------------------------------------------------------------------------------

insert into public.institutions (id, name) values ('a1000000-0000-4000-8000-000000000088', '[École à situer]');
insert into public.campuses (id, institution_id, slug, publication, origin)
values ('b1000000-0000-4000-8000-000000000088', 'a1000000-0000-4000-8000-000000000088', 'ecole-a-situer', 'brouillon', 'admin');
select throws_ok($$select public.publish_campus('b1000000-0000-4000-8000-000000000088')$$, '22023', null, 'Un campus à situer ne se publie pas');
select is(public.locate_campus('b1000000-0000-4000-8000-000000000088', -4.80, 11.93), 'Tié-Tié', 'Situer un campus rend la division où il tombe');
select is((select publication from public.campuses where slug = 'ecole-a-situer'), 'prete', 'Un campus à situer devient prêt');
insert into public.institutions (id, name) values ('a1000000-0000-4000-8000-000000000089', '[École lointaine]');
insert into public.campuses (id, institution_id, slug, publication, origin)
values ('b1000000-0000-4000-8000-000000000089', 'a1000000-0000-4000-8000-000000000089', 'ecole-lointaine', 'brouillon', 'admin');
select throws_ok($$select public.locate_campus('b1000000-0000-4000-8000-000000000089', -4.60, 11.60)$$, '22023', null,
  'Une position hors de toute division connue demande de choisir la division : jamais de division devinée');
select is(public.locate_campus('b1000000-0000-4000-8000-000000000089', -4.60, 11.60,
          (select id from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville.moungali')), 'Moungali',
  'Avec la division choisie, la position est acceptée même sans contour connu');
select throws_ok(
  format('select public.locate_campus(%L, %s, %s)',
         (select id from public.campuses where slug = 'complexe-scolaire-etoile'),
         (select extensions.st_y(extensions.st_pointonsurface(boundary)) from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.ngoyo'),
         (select extensions.st_x(extensions.st_pointonsurface(boundary)) from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.ngoyo')),
  '22023', null, 'Un campus publié ne change pas de division : son adresse publique changerait');

select * from finish();
rollback;
