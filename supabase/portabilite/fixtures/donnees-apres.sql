-- Ce qui doit être vrai après la migration du jeu de données d'avant. Chaque contrôle lève une erreur s'il échoue.
create function pg_temp.verifier(p_ok boolean, p_message text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'ÉCHEC : %', p_message; end if;
  raise notice 'OK : %', p_message;
end $$;

select pg_temp.verifier((select count(*) from public.institutions) = 5 and (select count(*) from public.campuses) = 5,
  'cinq écoles deviennent cinq institutions et cinq campus');
select pg_temp.verifier((select count(*) from public.campuses c join public.institutions i on i.id = c.id) = 5,
  'le campus et l''institution gardent l''identifiant de l''école d''avant (liens et adresses inchangés)');
select pg_temp.verifier((select string_agg(slug, ',' order by slug) from public.campuses) = 'complexe-etoile,complexe-etoile-2,ecole-importee,ecole-ocean,institut-horizon',
  'les adresses (slugs) sont conservées');
select pg_temp.verifier((select count(*) from public.campus_cycles) = 7, 'les niveaux deviennent des cycles (2 + 2 + 0 + 2 + 1 = 7)');
select pg_temp.verifier((select d.path::text from public.campuses c join public.geo_divisions d on d.id = c.division_id where c.slug = 'complexe-etoile') = 'congo.pointe_noire.pointe_noire.tie_tie',
  'l''arrondissement d''avant devient une division de la hiérarchie universelle');
select pg_temp.verifier((select d.path::text from public.campuses c join public.geo_divisions d on d.id = c.division_id where c.slug = 'ecole-ocean') = 'congo.pointe_noire.pointe_noire.ngoyo',
  'Ngoyo aussi');
select pg_temp.verifier((select division_id is null from public.campuses where slug = 'ecole-importee'), 'une école « à situer » reste sans division (rien n''est inventé)');
select pg_temp.verifier((select string_agg(slug || ':' || origin, ',' order by slug) from public.campuses) =
  'complexe-etoile:field,complexe-etoile-2:admin,ecole-importee:import,ecole-ocean:field,institut-horizon:admin',
  'l''origine se déduit de l''histoire : relevée, importée ou ajoutée par l''administration');
select pg_temp.verifier((select publication from public.campuses where slug = 'complexe-etoile') = 'publiee' and
                        (select publication from public.campuses where slug = 'ecole-ocean') = 'prete' and
                        (select publication from public.campuses where slug = 'ecole-importee') = 'brouillon',
  'l''état de publication est conservé');
select pg_temp.verifier((select i.kind || '|' || c.neighbourhood || '|' || c.landmark || '|' || c.sign_phone from public.campuses c join public.institutions i on i.id = c.institution_id where c.slug = 'complexe-etoile')
                        = 'privee|Mayanga|Près du marché|242060000001', 'genre, quartier, repère et numéro de l''enseigne sont conservés');
select pg_temp.verifier((select curriculum_note from public.campuses where slug = 'ecole-ocean') = 'Programme congolais', 'la ligne de programme est conservée');
select pg_temp.verifier((select located_by is not null and surveyed_at is null from public.campuses where slug = 'institut-horizon')
                        and (select surveyed_at is not null from public.campuses where slug = 'complexe-etoile'),
  'qui a situé l''école, et la date de relevé, sont conservés');
select pg_temp.verifier((select count(*) from public.field_submissions) = 4, 'quatre relevés repris');
select pg_temp.verifier((select count(*) from public.field_submissions s join public.campuses c on c.id = s.campus_id) = 2, 'les relevés acceptés renvoient toujours à leur campus');
select pg_temp.verifier((select string_agg(status, ',' order by id) from public.field_submissions) = 'accepte,accepte,a_valider,refuse', 'les statuts sont conservés');
select pg_temp.verifier((select sign_name || '|' || array_to_string(levels, '+') || '|' || direction_seen || '|' || liaison_sheet_given::text || '|' || contact_role
                         from public.field_submissions where id = 'f1000000-0000-4000-8000-000000000001') = 'Complexe [Étoile]|maternelle+primaire|vue|true|directeur',
  'le contenu d''un relevé est conservé');
select pg_temp.verifier((select reason || '|' || message_to_relay from public.field_submissions where id = 'f1000000-0000-4000-8000-000000000004') = 'photo_floue|Photo floue.',
  'le motif et le message d''un refus sont conservés');
select pg_temp.verifier((select count(*) from prive.direction_contacts) = 1 and
                        (select name || '|' || whatsapp || '|' || contact_agreement::text from prive.direction_contacts) = '[Nom]|242060000099|true',
  'le contact de la direction est repris dans la partie privée');
select pg_temp.verifier((select reference from prive.campus_sources) = 'ETB-777', 'la référence anonyme de l''import est reprise dans la partie privée');
select pg_temp.verifier((select count(*) from public.missions) = 1 and (select status || '|' || kind from public.missions) = 'open|locate',
  'la mission confiée au relais est reprise (école sans position : « situer »)');
select pg_temp.verifier((select string_agg(what, ',' order by what) from prive.erasures) = 'contact,merge', 'les effacements sont repris (« fusion » devient « merge »)');
select pg_temp.verifier((select count(*) from public.echanges where campus_id = 'e1000000-0000-4000-8000-000000000001') = 1, 'les échanges suivent le campus');
select pg_temp.verifier((select count(*) from public.lots where geo_division_id is not null) = 3, 'les trois lots d''origine sont sur des divisions');
select pg_temp.verifier((select statut || '|' || (lot_id is not null)::text from public.relais where id = '00000000-0000-4000-8000-0000000000a1') = 'actif|true', 'un relais garde son statut et son lot');
select pg_temp.verifier((select count(*) from public.public_campuses) = 2, 'le site public ne voit que les deux campus publiés');
select pg_temp.verifier((select to_slug from public.public_campus_redirects where from_slug = 'complexe-etoile-2') = 'complexe-etoile', 'l''ancienne adresse du doublon renvoie vers la fiche gardée');
select pg_temp.verifier((select count(*) from public.field_submission_photos where role = 'signboard' and storage_path = 'f1000000-0000-4000-8000-000000000001/enseigne.jpg' and bytes = 180000) = 1,
  'la photo déposée à l''ancien chemin est inscrite au catalogue des photos (chemin relatif conservé)');
select pg_temp.verifier((select count(*) from pg_class where relname in ('releves', 'ecoles', 'arrondissements', 'ecoles_confiees') and relnamespace = 'public'::regnamespace) = 0,
  'les anciennes tables ont disparu');
select pg_temp.verifier((select count(*) from pg_trigger where tgname = 'creer_relais' and tgrelid = 'auth.users'::regclass) = 1,
  'l''inscription des nouveaux relais continue de fonctionner (déclencheur de la couche Supabase)');
