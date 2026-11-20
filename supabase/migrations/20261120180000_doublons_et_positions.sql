-- Doublons et positions (ticket 201, décisions du fondateur du 20/11), après la saisie des écoles du supérieur.
--
-- - A18 : une école importée sans position (souvent avec une mission ouverte) n'était jamais proposée à compléter : le
--   « doublon possible » ne se calcule qu'autour d'une école située, et `similar_schools` jugeait « autre site » une école du
--   même nom sans position. Elle est désormais « déjà dans la base » ; la base dit aussi si elle est située et si une
--   mission est ouverte pour elle. Elle propose, l'administration confirme : rien n'est fusionné.
-- - A35 : la position d'un site porte sa source (`position_source`) : un relais (elle arrive avec son relevé), l'école, une
--   carte en ligne ; nulle : pas dit. « Situer » la demande. Le site public n'en montre rien ; le manque « Visite sur
--   place » suit toujours le passage d'un relais (`surveyed_at`).

-- A35 : la source de la position ------------------------------------------------------------------------------------------------------------------
alter table public.campuses
  add column position_source text constraint campuses_position_source_check check (position_source in ('relais', 'ecole', 'carte_en_ligne')),
  add constraint campuses_source_avec_position check (position is not null or position_source is null);
comment on column public.campuses.position_source is
  'D''où vient la position : un relais (avec son relevé), l''école, une carte en ligne ; nulle : pas dit. Lue par l''administration seulement.';

-- Une nouvelle position efface l'ancienne source, sauf celle que l'appel donne (« Situer ») ; une position qui arrive avec le
-- passage d'un relais vient du relais.
create function prive.source_de_la_position() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.position is null then
    new.position_source := null;
  elsif tg_op = 'INSERT' or new.position::text is distinct from old.position::text then
    if nullif(current_setting('ntanova.source_de_position', true), '') is not null then
      new.position_source := nullif(current_setting('ntanova.source_de_position', true), 'aucune');
    elsif new.surveyed_at is not null and (tg_op = 'INSERT' or new.surveyed_at is distinct from old.surveyed_at) then
      new.position_source := 'relais';
    elsif tg_op = 'UPDATE' and new.position_source is not distinct from old.position_source then
      new.position_source := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger campuses_source_de_la_position before insert or update of position, surveyed_at, position_source on public.campuses
  for each row execute function prive.source_de_la_position();

-- Les positions d'avant : celles des écoles vues par un relais viennent du relais ; celles posées le 20/11 par
-- l'administration, sans relais, d'une carte en ligne (Google Maps, fondateur) ; les autres ne disent pas leur source.
update public.campuses set position_source = 'relais' where position is not null and surveyed_at is not null;
update public.campuses set position_source = 'carte_en_ligne'
where position is not null and surveyed_at is null and origin in ('admin', 'import')
  and (located_at at time zone 'Africa/Brazzaville')::date = date '2026-11-20';

-- « Situer » : la source en plus (le paramètre nouveau est à la fin ; l'ancienne signature disparaît).
drop function public.locate_campus(uuid, double precision, double precision, uuid);
create function public.locate_campus(
  p_campus uuid, p_latitude double precision, p_longitude double precision, p_division uuid default null, p_source text default null
)
returns text
language plpgsql set search_path = '' as $$
declare
  c public.campuses;
  v_division uuid;
  v_name text;
begin
  perform public.exiger_admin();
  if p_source is not null and p_source not in ('relais', 'ecole', 'carte_en_ligne') then
    raise exception 'La position vient d''un relais, de l''école ou d''une carte en ligne.' using errcode = '22023';
  end if;
  select k.* into c from public.campuses k where k.id = p_campus for update;
  if not found then
    raise exception 'Campus introuvable.' using errcode = 'P0002';
  end if;
  if c.publication = 'retiree' then
    raise exception 'Un campus retiré ne se modifie plus : le republier d''abord.' using errcode = '22023';
  end if;
  v_division := coalesce(
    p_division,
    public.division_of_position(p_latitude, p_longitude, 3::smallint),
    c.division_id
  );
  if v_division is null then
    raise exception 'Cette position n''est dans aucune division connue : choisis la division.' using errcode = '22023';
  end if;
  if c.publication = 'publiee' and c.division_id is distinct from v_division then
    raise exception 'Cette position est dans une autre division que la fiche : son adresse publique changerait. Retire la fiche du site d''abord.'
      using errcode = '22023';
  end if;
  if c.division_id is distinct from v_division and exists (
    select 1 from public.campuses x where x.division_id = v_division and x.slug = c.slug and x.id <> c.id
  ) then
    raise exception 'Un autre campus de cette division a déjà cette adresse : change le nom d''abord.' using errcode = '22023';
  end if;
  select d.name into v_name from public.geo_divisions d where d.id = v_division;

  perform set_config('ntanova.source_de_position', coalesce(p_source, 'aucune'), true);
  update public.campuses k set
    position = extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326),
    division_id = v_division,
    located_at = now(),
    located_by = (select public.current_user_id()),
    publication = case when k.publication = 'brouillon' then 'prete' else k.publication end
  where k.id = p_campus;
  -- La même position redite garde la ligne telle quelle : la source se pose alors seule.
  update public.campuses k set position_source = p_source where k.id = p_campus and k.position_source is distinct from p_source;
  perform set_config('ntanova.source_de_position', '', true);
  return v_name;
end;
$$;
comment on function public.locate_campus(uuid, double precision, double precision, uuid, text) is
  '« Situer » : la position d''un site, sa division, et d''où vient la position (relais, école, carte en ligne ; nul : pas dit).';
revoke all on function public.locate_campus(uuid, double precision, double precision, uuid, text) from public, anon, authenticated;
grant execute on function public.locate_campus(uuid, double precision, double precision, uuid, text) to authenticated;

-- A18 : « Est-ce une école connue ? » --------------------------------------------------------------------------------------------------------------
drop function public.similar_schools(text, double precision, double precision, uuid);
create function public.similar_schools(
  p_name text, p_latitude double precision default null, p_longitude double precision default null,
  p_exclude_submission uuid default null
) returns table (
  kind text, id uuid, institution_id uuid, name text, acronym text, state text,
  distance_m integer, similarity real, verdict text, located boolean, open_mission boolean
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
                else extensions.similarity(v_core, public.school_name_core(i.name)) end as similarity,
           c.position is not null as located,
           exists (select 1 from public.missions m where m.campus_id = c.id and m.status = 'open') as open_mission
    from public.campuses c join public.institutions i on i.id = c.institution_id
    where c.publication <> 'retiree' and c.trashed_at is null
    union all
    select 'submission', s.id, null, s.sign_name, s.acronym, s.status::text,
           case when v_point is not null and s.position is not null
                then extensions.st_distance(v_point, s.position::extensions.geography)::integer end,
           case when v_core = '' or public.school_name_core(s.sign_name) = '' then 0::real
                else extensions.similarity(v_core, public.school_name_core(s.sign_name)) end,
           s.position is not null, false
    from public.field_submissions s
    where s.status in ('a_valider', 'a_corriger') and s.id is distinct from p_exclude_submission
  ),
  jugés as (
    select k.*, case
      when k.distance_m is not null and k.distance_m <= 500 and k.similarity >= 0.45 then 'deja_la'
      -- Une école connue que personne n'a encore située : le même nom, c'est d'abord elle.
      when k.kind = 'campus' and not k.located and k.similarity >= 0.45 then 'deja_la'
      when k.similarity >= 0.45 then 'autre_site'
      when k.distance_m is not null and k.distance_m <= 500 then 'voisine'
    end as verdict
    from candidats k
  )
  select j.kind, j.id, j.institution_id, j.name, j.acronym, j.state, j.distance_m, j.similarity, j.verdict, j.located, j.open_mission
  from jugés j
  where j.verdict is not null
  order by case j.verdict when 'deja_la' then 0 when 'autre_site' then 1 else 2 end, j.open_mission desc, j.distance_m nulls last,
           j.similarity desc
  limit 10;
end;
$$;
comment on function public.similar_schools(text, double precision, double precision, uuid) is
  '« Est-ce une école connue ? » (administration) : les sites et relevés en attente proches par le nom ou la distance, avec un verdict (deja_la, autre_site, voisine), s''ils sont situés et si une mission est ouverte. Ne fusionne jamais rien.';
revoke all on function public.similar_schools(text, double precision, double precision, uuid) from public, anon, authenticated;
grant execute on function public.similar_schools(text, double precision, double precision, uuid) to authenticated;
