-- La géographie universelle : une seule table qui se référence elle-même, du pays au quartier.
--
--   niveau 0  pays                       (country)
--   niveau 1  département ou région      (department, region)
--   niveau 2  ville, commune, district   (city, commune, district)
--   niveau 3  arrondissement             (arrondissement)
--   niveau 4  quartier ou zone           (quarter, zone)
--
-- Pointe-Noire est à la fois un département (niveau 1) et une ville (niveau 2) : deux lignes de
-- même nom, l'une sous l'autre. L'adresse publique saute les répétitions (voir src/modele/geo-divisions.ts).
-- Le chemin (`path`, un `ltree`) donne les sous-arbres en une comparaison : « tout ce qui est sous
-- Pointe-Noire » est `path <@ 'congo.pointe_noire'`. Les amorçages (Congo, contours) sont dans les
-- migrations suivantes ; l'ouverture aux relais est un réglage par division (`open_for_fieldwork`).

create table public.geo_divisions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid,
  level smallint not null check (level between 0 and 4),
  kind public.geo_kind not null,
  -- Le pays (ISO 3166-1 alpha-2), recopié du parent : on filtre un pays sans remonter l'arbre.
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  -- Le code ISO de la division quand il existe (CG, CG-BZV, CG-5…). Vide : pas de code connu.
  iso_code text check (iso_code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  slug public.slug not null,
  -- Le chemin dans l'arbre, tiré des adresses (slugs) des ancêtres : congo.pointe_noire.pointe_noire.tie_tie
  path extensions.ltree not null,
  -- Un point d'étiquette (le centre) et le contour, quand on les connaît : jamais inventés.
  position extensions.geometry(Point, 4326),
  boundary extensions.geometry(MultiPolygon, 4326),
  osm_relation bigint,
  -- Le numéro d'ordre officiel quand il existe (« arrondissement 3 »).
  ordinal smallint check (ordinal > 0),
  -- D'autres écritures (« Mvoumvou »), pour la recherche.
  aliases text[] not null default '{}',
  -- Les relais peuvent-ils relever ici ? Vaut aussi pour tout le sous-arbre.
  open_for_fieldwork boolean not null default false,
  -- D'où vient la ligne, et quand elle a été confrontée à une source (vide : pas encore vérifiée).
  source text check (length(source) <= 500),
  verified_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Le niveau du parent, calculé : la clé étrangère composite garantit qu'un enfant est toujours
  -- exactement un niveau sous son parent (pas de quartier directement sous un pays).
  parent_level smallint generated always as (level - 1) stored,
  constraint geo_divisions_id_level_key unique (id, level),
  constraint geo_divisions_parent_fkey
    foreign key (parent_id, parent_level) references public.geo_divisions (id, level),
  constraint geo_divisions_racine_sans_parent check ((level = 0) = (parent_id is null)),
  constraint geo_divisions_genre_du_niveau check (
    (level = 0 and kind = 'country')
    or (level = 1 and kind in ('department', 'region'))
    or (level = 2 and kind in ('city', 'commune', 'district'))
    or (level = 3 and kind = 'arrondissement')
    or (level = 4 and kind in ('quarter', 'zone'))
  ),
  constraint geo_divisions_path_key unique (path),
  -- Deux enfants d'un même parent n'ont pas la même adresse ; les pays non plus entre eux.
  constraint geo_divisions_adresse_unique unique nulls not distinct (parent_id, slug)
);

create index geo_divisions_parent on public.geo_divisions (parent_id);
create index geo_divisions_path_gist on public.geo_divisions using gist (path);
create index geo_divisions_boundary_gist on public.geo_divisions using gist (boundary);
create index geo_divisions_nom_trgm on public.geo_divisions
  using gin (public.norm_text(name) extensions.gin_trgm_ops);

-- Le chemin se calcule ; l'adresse d'une division ne bouge plus (elle est dans des liens publics).
create function public.geo_divisions_avant_ecriture() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent public.geo_divisions;
begin
  if tg_op = 'UPDATE' then
    if new.parent_id is distinct from old.parent_id or new.slug is distinct from old.slug
       or new.level <> old.level or new.country_code <> old.country_code then
      raise exception 'Une division ne change ni de parent, ni d''adresse, ni de pays : son chemin est public.'
        using errcode = '22023';
    end if;
    new.path := old.path;
    new.updated_at := now();
    return new;
  end if;

  if new.parent_id is null then
    new.path := replace(new.slug, '-', '_')::extensions.ltree;
  else
    select d.* into parent from public.geo_divisions d where d.id = new.parent_id;
    if not found then
      raise exception 'Division parente introuvable.' using errcode = 'P0002';
    end if;
    new.country_code := parent.country_code;
    new.path := extensions.ltree_addltree(parent.path, replace(new.slug, '-', '_')::extensions.ltree);
  end if;
  return new;
end;
$$;

create trigger geo_divisions_avant_ecriture
before insert or update on public.geo_divisions
for each row execute function public.geo_divisions_avant_ecriture();

-- Une division est-elle ouverte aux relais ? Elle l'est si elle-même, ou l'un de ses ancêtres, l'est.
create function public.is_open_for_fieldwork(p_division uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from public.geo_divisions d
    join public.geo_divisions a on d.path operator(extensions.<@) a.path
    where d.id = p_division and a.open_for_fieldwork
  );
$$;

-- La division la plus fine, d'un niveau donné au moins, dont le contour contient la position.
-- Rend nul quand aucun contour connu ne la contient (la plupart du Congo, pour l'instant).
create function public.division_of_position(p_latitude double precision, p_longitude double precision, p_min_level smallint default 3)
returns uuid
language plpgsql stable set search_path = '' as $$
declare
  trouve uuid;
begin
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Position illisible : colle la latitude puis la longitude, par exemple -4.79105, 11.92500.'
      using errcode = '22023';
  end if;
  select d.id into trouve
  from public.geo_divisions d
  where d.level >= p_min_level
    and d.boundary is not null
    and extensions.st_covers(d.boundary, extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326))
  order by d.level desc
  limit 1;
  return trouve;
end;
$$;
