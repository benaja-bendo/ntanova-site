-- L'administration du catalogue : amorcer sans attendre le terrain.
--
--   create_catalog_entry   une école d'un coup : institution, campus, cycles, formations (formulaire ou import)
--   import_catalog         une liste d'écoles (CSV ou JSON lu par l'application), avec SIMULATION d'abord
--   create_lot             un lot sur n'importe quelle ville, arrondissement ou quartier
--   set_division_open      ouvrir ou fermer une zone aux relais
--   search_campuses        chercher par nom, repère, cycle, série de bac, diplôme, domaine, rythme, lieu, distance
--
-- Une école amorcée ainsi a pour origine `admin` ou `import` : elle ne se compte jamais comme « relevée par
-- un relais ». Jamais de position inventée : sans position, un campus reste « à situer » (brouillon).

-- Dans une fonction `security definer` : l'administrateur de l'API (jeton), ou la personne qui s'est connectée
-- à la base elle-même (`postgres`, l'éditeur SQL de Supabase Studio). Le rôle courant d'une fonction
-- `security definer` est son propriétaire : on regarde donc `session_user` (qui s'est connecté) ET le rôle
-- que la session a pris par `set role` (réglage `role`) : une session ouverte par `postgres` qui se place
-- ensuite en `authenticated` ou `anon` est traitée comme telle, jamais comme le propriétaire.
create function public.exiger_admin_session() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (
    public.est_admin()
    or (
      (session_user = 'postgres' or pg_has_role(session_user, 'pg_database_owner', 'member'))
      and coalesce(nullif(current_setting('role', true), 'none'), session_user) = session_user
    )
  ) then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
end;
$$;

-- Une école d'un coup ---------------------------------------------------------------------------------------
--
-- {
--   "ref": "ETB-012",                      (facultatif : identifiant anonyme ; une seconde importation ne dédouble pas)
--   "name": "Complexe scolaire X", "kind": "privee",
--   "campuses": [{
--     "label": "Campus de Loandjili",      (facultatif)
--     "division": "congo.pointe_noire.pointe_noire.loandjili",   (chemin ou identifiant ; sinon cherché par la position)
--     "neighbourhood": "…", "landmark": "…", "sign_phone": "242…", "latitude": -4.79, "longitude": 11.9,
--     "publication": "brouillon",          (ou « prete » ; par défaut « prete » avec une position et une division)
--     "cycles": [ "maternelle", { "cycle": "lycee", "programs": [
--        { "title": "Série C", "domain": "sciences-technologies", "bac_track": "c", "diploma": "bac", "rhythms": ["jour"] } ] } ]
--   }]
-- }
create function public.create_catalog_entry(p_entry jsonb, p_origin public.origin_kind default 'admin')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_entry ->> 'name', ''));
  v_kind public.type_ecole := coalesce(nullif(p_entry ->> 'kind', ''), 'non_indique');
  v_ref text := nullif(btrim(p_entry ->> 'ref'), '');
  v_institution uuid;
  v_campus jsonb;
  v_cycle jsonb;
  v_program jsonb;
  v_division uuid;
  v_text text;
  v_lat double precision;
  v_lon double precision;
  v_position extensions.geometry;
  v_publication public.publication;
  v_campus_id uuid;
  v_cycle_name public.niveau;
  v_programs jsonb;
  v_campus_ids uuid[] := '{}';
  v_first boolean := true;
  v_label text;
begin
  perform public.exiger_admin_session();

  if v_name = '' then
    raise exception 'Le nom de l''école est obligatoire.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_entry -> 'campuses') is distinct from 'array' or jsonb_array_length(p_entry -> 'campuses') = 0 then
    raise exception 'Il faut au moins un campus (une implantation) : « % ».', v_name using errcode = '22023';
  end if;

  -- Une référence déjà importée : on ne dédouble pas.
  if v_ref is not null and exists (select 1 from prive.campus_sources s where s.reference = v_ref) then
    return jsonb_build_object('status', 'exists', 'message', 'Référence déjà importée : ' || v_ref);
  end if;

  for v_campus in select * from jsonb_array_elements(p_entry -> 'campuses') loop
    -- La division : un chemin (congo.pointe_noire…), un identifiant, ou la plus fine qui contient la position.
    v_text := nullif(btrim(v_campus ->> 'division'), '');
    v_division := case
      when v_text is null then null
      when v_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v_text::uuid
      else (select d.id from public.geo_divisions d where d.path::text = v_text)
    end;
    if v_text is not null and not exists (select 1 from public.geo_divisions d where d.id = v_division) then
      raise exception 'Division inconnue : « % » (école « % »).', v_text, v_name using errcode = '22023';
    end if;
    if v_division is not null and (select d.level from public.geo_divisions d where d.id = v_division) < 2 then
      raise exception 'Un campus se place dans une ville, un arrondissement ou un quartier (école « % »).', v_name using errcode = '22023';
    end if;

    v_lat := nullif(v_campus ->> 'latitude', '')::double precision;
    v_lon := nullif(v_campus ->> 'longitude', '')::double precision;
    if (v_lat is null) <> (v_lon is null) then
      raise exception 'La latitude et la longitude vont ensemble (école « % »).', v_name using errcode = '22023';
    end if;
    v_position := null;
    if v_lat is not null then
      v_position := extensions.st_setsrid(extensions.st_makepoint(v_lon, v_lat), 4326);
      v_division := coalesce(v_division, public.division_of_position(v_lat, v_lon, 3::smallint));
    end if;

    v_publication := coalesce(
      nullif(v_campus ->> 'publication', '')::public.publication,
      case when v_position is not null and v_division is not null then 'prete' else 'brouillon' end
    );
    if v_publication not in ('brouillon', 'prete') then
      raise exception 'Une école se crée en brouillon ou prête : la publication est un geste à part (école « % »).', v_name
        using errcode = '22023';
    end if;
    if v_publication = 'prete' and v_division is null then
      raise exception 'Une école prête a une division (école « % »).', v_name using errcode = '22023';
    end if;

    -- Une école déjà là, au même endroit : on ne la dédouble pas.
    if v_first and v_division is not null and exists (
      select 1 from public.campuses c join public.institutions i on i.id = c.institution_id
      where c.division_id = v_division and public.norm_text(i.name) = public.norm_text(v_name)
        and coalesce(public.norm_text(c.label), '') = coalesce(public.norm_text(v_campus ->> 'label'), '')
    ) then
      return jsonb_build_object('status', 'exists', 'message', 'Déjà enregistrée : ' || v_name);
    end if;

    if v_first then
      insert into public.institutions (name, kind) values (v_name, v_kind) returning id into v_institution;
    end if;

    v_label := nullif(btrim(v_campus ->> 'label'), '');
    insert into public.campuses (
      institution_id, label, slug, division_id, neighbourhood, landmark, sign_phone, position,
      publication, origin, curriculum_note, located_at, located_by
    ) values (
      v_institution, v_label,
      public.unique_campus_slug(v_division, v_name || ' ' || coalesce(v_label, '')),
      v_division, nullif(btrim(v_campus ->> 'neighbourhood'), ''), nullif(btrim(v_campus ->> 'landmark'), ''),
      nullif(btrim(v_campus ->> 'sign_phone'), ''), v_position,
      v_publication, p_origin, nullif(btrim(v_campus ->> 'curriculum_note'), ''),
      case when v_position is not null and (select public.current_user_id()) is not null then now() end,
      case when v_position is not null then (select public.current_user_id()) end
    ) returning id into v_campus_id;
    v_campus_ids := v_campus_ids || v_campus_id;

    if v_first and v_ref is not null then
      insert into prive.campus_sources (campus_id, reference) values (v_campus_id, v_ref);
    end if;
    v_first := false;

    -- Les cycles : « lycee », ou { "cycle": "lycee", "programs": [ … ] }.
    if jsonb_typeof(v_campus -> 'cycles') = 'array' then
      v_programs := '[]'::jsonb;
      for v_cycle in select * from jsonb_array_elements(v_campus -> 'cycles') loop
        v_cycle_name := case when jsonb_typeof(v_cycle) = 'string' then v_cycle #>> '{}' else v_cycle ->> 'cycle' end;
        insert into public.campus_cycles (campus_id, cycle) values (v_campus_id, v_cycle_name)
        on conflict on constraint campus_cycles_un_par_cycle do nothing;
        if jsonb_typeof(v_cycle) = 'object' and jsonb_typeof(v_cycle -> 'programs') = 'array' then
          for v_program in select * from jsonb_array_elements(v_cycle -> 'programs') loop
            v_programs := v_programs || jsonb_build_array(v_program || jsonb_build_object('cycle', v_cycle_name));
          end loop;
        end if;
      end loop;
      perform public.upsert_programs(v_campus_id, v_programs, p_origin);
    end if;
  end loop;

  return jsonb_build_object('status', 'created', 'institution_id', v_institution, 'campus_ids', to_jsonb(v_campus_ids));
end;
$$;

-- Une liste d'écoles, d'un coup. `p_dry_run` (par défaut oui) : tout est essayé puis annulé, et le rapport dit ce
-- qui serait créé, ce qui existe déjà et ce qui est en erreur (avec le numéro de la ligne). Une école en erreur
-- n'empêche pas les autres. Au plus mille écoles par appel.
create function public.import_catalog(
  p_entries jsonb, p_dry_run boolean default true, p_origin public.origin_kind default 'import'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_entry jsonb;
  v_index integer := 0;
  v_result jsonb;
  v_created integer := 0;
  v_exists integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  perform public.exiger_admin_session();
  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'Une liste d''écoles est attendue.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_entries) > 1000 then
    raise exception 'Au plus mille écoles par importation : couper la liste.' using errcode = '22023';
  end if;

  begin
    for v_entry in select * from jsonb_array_elements(p_entries) loop
      v_index := v_index + 1;
      begin
        v_result := public.create_catalog_entry(v_entry, p_origin);
        if v_result ->> 'status' = 'created' then
          v_created := v_created + 1;
        else
          v_exists := v_exists + 1;
        end if;
      exception when others then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object(
          'line', v_index, 'name', v_entry ->> 'name', 'message', sqlerrm));
      end;
    end loop;
    -- La simulation annule tout ; les compteurs, eux, restent (ce ne sont pas des données de la base).
    if p_dry_run then
      raise exception 'simulation' using errcode = 'NT001';
    end if;
  exception when sqlstate 'NT001' then
    null;
  end;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'total', v_index, 'created', v_created, 'exists', v_exists, 'errors', v_errors
  );
end;
$$;

-- Les lots et les zones ------------------------------------------------------------------------------------------

-- Un lot sur n'importe quelle ville, arrondissement ou quartier (un pays ou un département : refusé).
-- Sans contour, le lot couvre toute sa division. Les relais y sont affectés par `activer_relais`.
create function public.create_lot(p_name text, p_division uuid, p_due date default null, p_trial boolean default false)
returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.exiger_admin();
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'Le lot a besoin d''un nom.' using errcode = '22023';
  end if;
  insert into public.lots (nom, geo_division_id, a_rendre_le, essai)
  values (btrim(p_name), p_division, p_due, coalesce(p_trial, false))
  returning id into v_id;
  return v_id;
end;
$$;

-- Ouvre ou ferme une zone aux relais (vaut pour tout son sous-arbre). Fermée par défaut partout.
create function public.set_division_open(p_division uuid, p_open boolean) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.geo_divisions set open_for_fieldwork = coalesce(p_open, false) where id = p_division;
  if not found then
    raise exception 'Division introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- La recherche -------------------------------------------------------------------------------------------------------
--
-- Tous les critères sont facultatifs et se combinent. Les critères de formation (série, diplôme, domaine,
-- rythme) portent sur UNE MÊME formation : « série C » et « soir » = une formation du soir en série C.
-- « f » ou « g » trouvent aussi F1 à F4 et G1 à G3. `p_division_path` : tout un sous-arbre (« congo.pointe_noire »).
-- La fonction s'exécute avec les droits de l'appelant : un visiteur ne trouve que des campus publiés.
create function public.search_campuses(
  p_query text default null,
  p_cycle public.niveau default null,
  p_bac_track public.bac_track default null,
  p_diploma public.diploma_kind default null,
  p_domain text default null,
  p_rhythm public.study_rhythm default null,
  p_division_path text default null,
  p_near_latitude double precision default null,
  p_near_longitude double precision default null,
  p_radius_m integer default null,
  p_limit integer default 50
) returns table (
  campus_id uuid, institution_id uuid, name text, label text, kind text, division_path text,
  neighbourhood text, landmark text, latitude double precision, longitude double precision,
  distance_m double precision, score real
)
language plpgsql stable set search_path = '' as $$
declare
  v_query text := public.norm_text(nullif(btrim(p_query), ''));
  v_near extensions.geography;
  v_root extensions.ltree := nullif(btrim(p_division_path), '')::extensions.ltree;
  v_with_program boolean := (p_bac_track is not null or p_diploma is not null or p_domain is not null or p_rhythm is not null);
begin
  if (p_near_latitude is null) <> (p_near_longitude is null) then
    raise exception 'La latitude et la longitude vont ensemble.' using errcode = '22023';
  end if;
  if p_near_latitude is not null then
    v_near := extensions.st_setsrid(extensions.st_makepoint(p_near_longitude, p_near_latitude), 4326)::extensions.geography;
  end if;

  return query
  select c.id, i.id, i.name, c.label, i.kind::text, d.path::text, c.neighbourhood, c.landmark,
         extensions.st_y(c.position), extensions.st_x(c.position),
         case when v_near is not null and c.position is not null
              then extensions.st_distance(c.position::extensions.geography, v_near) end,
         case when v_query is not null then greatest(
           extensions.similarity(public.norm_text(i.name), v_query),
           extensions.similarity(public.norm_text(coalesce(c.landmark, '')), v_query),
           extensions.similarity(public.norm_text(coalesce(c.neighbourhood, '')), v_query)
         ) end
  from public.campuses c
  join public.institutions i on i.id = c.institution_id
  left join public.geo_divisions d on d.id = c.division_id
  where (v_query is null
         or public.norm_text(i.name) like '%' || v_query || '%'
         or public.norm_text(coalesce(c.landmark, '')) like '%' || v_query || '%'
         or public.norm_text(coalesce(c.neighbourhood, '')) like '%' || v_query || '%'
         or public.norm_text(i.name) operator(extensions.%) v_query)
    and (p_cycle is null or exists (
          select 1 from public.campus_cycles cc where cc.campus_id = c.id and cc.cycle = p_cycle))
    and (not v_with_program or exists (
          select 1
          from public.campus_cycles cc
          join public.campus_programs p on p.campus_cycle_id = cc.id
          left join public.education_domains ed on ed.id = p.domain_id
          where cc.campus_id = c.id
            and (p_cycle is null or cc.cycle = p_cycle)
            and (p_bac_track is null or p.bac_track = p_bac_track
                 or (length(p_bac_track) = 1 and p.bac_track like p_bac_track || '%'))
            and (p_diploma is null or p.diploma = p_diploma)
            and (p_domain is null or ed.slug = p_domain)
            and (p_rhythm is null or p_rhythm = any (p.rhythms))))
    and (v_root is null or d.path operator(extensions.<@) v_root)
    and (v_near is null or p_radius_m is null
         or (c.position is not null and extensions.st_dwithin(c.position::extensions.geography, v_near, p_radius_m)))
  order by
    case when v_near is not null and c.position is not null
         then extensions.st_distance(c.position::extensions.geography, v_near) end nulls last,
    case when v_query is not null then
      greatest(extensions.similarity(public.norm_text(i.name), v_query),
               extensions.similarity(public.norm_text(coalesce(c.landmark, '')), v_query)) end desc nulls last,
    i.name
  limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;
