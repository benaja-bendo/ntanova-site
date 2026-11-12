-- M9. Les lectures pour l'espace relais et l'administration (cahier de code, lot 3 ; canevas « Espace relais » ; 13/11).
--
-- - `similar_schools` (administration) : « Est-ce une école connue ? ». Le nom, sans les mots génériques, et la distance,
--   contre les sites non retirés et les relevés en attente. Verdicts : `deja_la` (même endroit), `autre_site` (même nom,
--   ailleurs), `voisine` (proche, nom différent). Seuils de départ : 100 m, 500 m, ressemblance 0,45, à régler sur des cas réels.
--   **Un même nom ne prouve rien, la distance si** : un nom fait seulement de mots génériques ne rapproche jamais.
-- - `known_places_for_me` rend en plus le sigle, l'école, son nombre de sites et la vignette publique : « Vous la
--   reconnaissez ? » montre la photo « Sur NTanova » sans réseau, une fois gardée par le téléphone.
-- - `known_institutions_for_me` : la liste nationale légère (nom, sigle, ville, nombre de sites) pour « Même nom, ailleurs »
--   et « Un autre site de quelle école ? », hors ligne.
-- - `campus_history` : la rubrique « Historique » de la fiche admin, en une liste datée, sans aucun contenu privé.

-- La forme d'un nom qu'on compare : minuscules, sans accents, sans les mots que toutes les écoles portent ---------------------------------------------
create function public.school_name_core(p_name text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(
    regexp_replace(public.norm_text(coalesce(p_name, '')),
      '\m(complexe|complexes|scolaire|scolaires|ecole|ecoles|groupe|groupes|institut|instituts|prive|privee|prives|privees|centre|centres|site|sites|college|lycee|primaire|maternelle|cs|gs|le|la|les|de|du|des|d|l|et|en|a|au|aux)\M',
      ' ', 'g'),
    '\s+', ' ', 'g'))
$$;
comment on function public.school_name_core(text) is 'Le cœur d''un nom d''école, pour comparer : sans accents ni mots génériques (complexe, scolaire, école, groupe…).';
grant execute on function public.school_name_core(text) to authenticated;

create function public.similar_schools(
  p_name text, p_latitude double precision default null, p_longitude double precision default null,
  p_exclude_submission uuid default null
) returns table (
  kind text, id uuid, institution_id uuid, name text, acronym text, state text,
  distance_m integer, similarity real, verdict text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_core text := public.school_name_core(p_name);
  v_point extensions.geography;
begin
  perform public.exiger_admin_session();
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Une position se donne avec sa latitude et sa longitude.' using errcode = '22023';
  end if;
  if p_latitude is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  end if;

  return query
  with candidats as (
    select 'campus'::text as kind, c.id, c.institution_id, i.name || coalesce(' — ' || c.label, '') as name, i.acronym,
           c.publication::text as state,
           case when v_point is not null and c.position is not null
                then extensions.st_distance(v_point, c.position::extensions.geography)::integer end as distance_m,
           case when v_core = '' or public.school_name_core(i.name) = '' then 0::real
                else extensions.similarity(v_core, public.school_name_core(i.name)) end as similarity
    from public.campuses c join public.institutions i on i.id = c.institution_id
    where c.publication <> 'retiree' and c.trashed_at is null
    union all
    select 'submission', s.id, null, s.sign_name, s.acronym, s.status::text,
           case when v_point is not null and s.position is not null
                then extensions.st_distance(v_point, s.position::extensions.geography)::integer end,
           case when v_core = '' or public.school_name_core(s.sign_name) = '' then 0::real
                else extensions.similarity(v_core, public.school_name_core(s.sign_name)) end
    from public.field_submissions s
    where s.status in ('a_valider', 'a_corriger') and s.id is distinct from p_exclude_submission
  ),
  jugés as (
    select k.*, case
      when k.distance_m is not null and (k.distance_m <= 100 or (k.distance_m <= 500 and k.similarity >= 0.45)) then 'deja_la'
      when k.similarity >= 0.45 then 'autre_site'
      when k.distance_m is not null and k.distance_m <= 500 then 'voisine'
    end as verdict
    from candidats k
  )
  select j.kind, j.id, j.institution_id, j.name, j.acronym, j.state, j.distance_m, j.similarity, j.verdict
  from jugés j
  where j.verdict is not null
  order by case j.verdict when 'deja_la' then 0 when 'autre_site' then 1 else 2 end, j.distance_m nulls last, j.similarity desc
  limit 10;
end;
$$;
comment on function public.similar_schools(text, double precision, double precision, uuid) is
  '« Est-ce une école connue ? » (administration) : les sites et relevés en attente proches par le nom ou la distance, avec un verdict (deja_la, autre_site, voisine). Ne fusionne jamais rien.';
revoke all on function public.similar_schools(text, double precision, double precision, uuid) from public, anon, authenticated;
grant execute on function public.similar_schools(text, double precision, double precision, uuid) to authenticated;

-- Ce que le téléphone garde pour « Déjà sur NTanova ? » --------------------------------------------------------------------------------------------
drop function public.known_places_for_me();
create function public.known_places_for_me()
returns table (
  kind text, id uuid, name text, latitude double precision, longitude double precision,
  acronym text, institution_id uuid, sites integer, photo_path text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batch uuid;
  v_division uuid;
  v_area extensions.geometry;
  v_path extensions.ltree;
begin
  if not public.est_relais_actif() then
    return;
  end if;
  v_batch := public.mon_lot();
  select l.geo_division_id into v_division from public.lots l where l.id = v_batch;
  v_area := public.batch_area(v_batch);
  select d.path into v_path from public.geo_divisions d where d.id = v_division;

  return query
  with open_divisions as (
    select d.id
    from public.geo_divisions d
    join public.geo_divisions a on d.path operator(extensions.<@) a.path
    where a.open_for_fieldwork
  )
  select 'campus'::text, c.id,
         i.name || coalesce(' — ' || c.label, ''),
         extensions.st_y(c.position), extensions.st_x(c.position),
         i.acronym, i.id,
         (select count(*)::integer from public.campuses k where k.institution_id = i.id and k.publication <> 'retiree' and k.trashed_at is null),
         -- La vignette publique seulement (jamais une photo privée) : la couverture de `campus_media`, sinon la photo d'aujourd'hui.
         coalesce(
           (select coalesce(m.thumb_path, m.storage_path) from public.public_campus_media m where m.campus_id = c.id and m.kind = 'cover' limit 1),
           (select p.storage_path from public.public_campus_photos p where p.campus_id = c.id limit 1))
  from public.campuses c
  join public.institutions i on i.id = c.institution_id
  left join public.geo_divisions d on d.id = c.division_id
  where c.publication <> 'retiree'
    and c.position is not null
    and (
      c.division_id in (select o.id from open_divisions o)
      or (v_area is not null and extensions.st_dwithin(v_area::extensions.geography, c.position::extensions.geography, 100))
      or (v_area is null and v_path is not null and d.path operator(extensions.<@) v_path)
    )
  union all
  select 'submission'::text, s.id, s.sign_name, extensions.st_y(s.position), extensions.st_x(s.position),
         s.acronym, null::uuid, null::integer, null::text
  from public.field_submissions s
  where s.status in ('a_valider', 'a_corriger')
    and s.position is not null
    and (
      s.division_id in (select o.id from open_divisions o)
      or s.batch_id = v_batch
      or (v_area is not null and extensions.st_dwithin(v_area::extensions.geography, s.position::extensions.geography, 100))
    )
  limit 5000;
end;
$$;
comment on function public.known_places_for_me() is
  'Les écoles et relevés en attente que le téléphone garde pour l''alerte « déjà relevée » et « Déjà sur NTanova ? », hors ligne : nom, position, sigle, école, nombre de sites, vignette publique.';
revoke all on function public.known_places_for_me() from public, anon, authenticated;
grant execute on function public.known_places_for_me() to authenticated;

create function public.known_institutions_for_me()
returns table (id uuid, name text, acronym text, city text, sites integer)
language sql stable security definer set search_path = '' as $$
  select i.id, i.name, i.acronym,
         (select a.name from public.campuses c
          join public.geo_divisions d on d.id = c.division_id
          join public.geo_divisions a on d.path operator(extensions.<@) a.path and a.level = 2
          where c.institution_id = i.id and c.publication <> 'retiree' and c.trashed_at is null
          order by c.created_at limit 1),
         (select count(*)::integer from public.campuses c
          where c.institution_id = i.id and c.publication <> 'retiree' and c.trashed_at is null)
  from public.institutions i
  where public.est_relais_actif()
    and exists (select 1 from public.campuses c where c.institution_id = i.id and c.publication <> 'retiree' and c.trashed_at is null)
  order by i.name
  limit 20000;
$$;
comment on function public.known_institutions_for_me() is
  'La liste nationale légère des écoles (nom, sigle, ville, nombre de sites), gardée par le téléphone pour « Même nom, ailleurs » et « Un autre site de quelle école ? ».';
revoke all on function public.known_institutions_for_me() from public, anon, authenticated;
grant execute on function public.known_institutions_for_me() to authenticated;

-- L'historique d'un site, pour la fiche admin : quoi, quand, qui ; jamais le contenu privé --------------------------------------------------------
create function public.campus_history(p_campus uuid)
returns table (at timestamptz, topic text, action text, by_user uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_institution uuid;
begin
  perform public.exiger_gestion_site(p_campus);
  select c.institution_id into v_institution from public.campuses c where c.id = p_campus;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  return query
  select x.at, x.topic, x.action, x.by_user from (
    select h.recorded_at as at, 'frais'::text as topic, h.action, h.recorded_by as by_user from prive.campus_fee_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'equipements', h.action, h.recorded_by from prive.campus_fact_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'images', h.action, h.recorded_by from prive.campus_media_history h
              where h.campus_id = p_campus or (h.institution_id = v_institution and h.campus_id is null)
    union all select h.recorded_at, 'photo_publique', case when h.photo_id is null then 'retrait' else 'choix' end, h.recorded_by
              from prive.public_photo_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'mot_de_la_direction', case when h.body is null then 'retrait' else 'enregistrement' end, h.recorded_by
              from prive.campus_statement_agreements h where h.campus_id = p_campus or h.institution_id = v_institution
    union all select h.recorded_at, 'contact_public', case when h.phone is null then 'retrait' else 'enregistrement' end, h.recorded_by
              from prive.public_contact_agreements h where h.campus_id = p_campus
    union all select h.recorded_at, 'agrement', h.action, h.recorded_by from prive.campus_accreditation_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'inscriptions', h.action, h.recorded_by from prive.campus_enrollment_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'admission', h.action, h.recorded_by from prive.campus_admission_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'nouvelles', h.action, h.recorded_by from prive.post_agreements h where h.campus_id = p_campus
    union all select h.recorded_at, case h.action when 'ecole' then 'ecole' when 'site' then 'rythme_et_langues' else 'rattachement' end,
              'modification', h.recorded_by
              from prive.school_profile_history h where h.campus_id = p_campus or (h.action = 'ecole' and h.institution_id = v_institution)
    union all select h.recorded_at, 'formations', 'modification', h.recorded_by from prive.program_detail_history h where h.campus_id = p_campus
    union all select h.recorded_at, 'declaration_de_l_ecole', 'enregistrement', h.recorded_by from prive.school_declarations h where h.campus_id = p_campus
    union all select h.recorded_at, 'verification', 'accord', h.recorded_by from prive.verification_agreements h where h.campus_id = p_campus
    union all select m.created_at, 'mission', 'confiee', m.created_by from public.missions m where m.campus_id = p_campus
    union all select m.closed_at, 'mission', m.status::text, null::uuid from public.missions m where m.campus_id = p_campus and m.closed_at is not null
    union all select r.created_at, 'demande', r.topic::text, r.created_by from public.campus_requests r where r.campus_id = p_campus
    union all select s.decided_at, 'releve', s.status::text, null::uuid from public.field_submissions s
              where s.campus_id = p_campus and s.decided_at is not null
  ) x
  order by x.at desc
  limit 200;
end;
$$;
comment on function public.campus_history(uuid) is
  'L''historique d''un site pour la fiche admin : chaque geste daté (frais, équipements, images, mot, contact, agrément, missions, demandes, relevés…), sans contenu privé.';
revoke all on function public.campus_history(uuid) from public, anon, authenticated;
grant execute on function public.campus_history(uuid) to authenticated;
