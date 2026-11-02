-- Une adresse publique, un seul propriétaire.
--
-- Sous une même division, ntanova.com/ecoles/<...>/<adresse>/ peut être la page d'une zone (un quartier) ou la
-- fiche d'un campus : jamais les deux. `unique_campus_slug` évite déjà l'adresse d'une zone quand elle nomme un
-- campus ; ces deux règles sont le filet pour tous les autres chemins (importation, relevé accepté, déplacement
-- d'un campus, zone ajoutée après coup).

create function public.campuses_adresse_libre() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.division_id is not null and exists (
    select 1 from public.geo_divisions g where g.parent_id = new.division_id and g.slug = new.slug
  ) then
    raise exception 'Cette adresse (%) est déjà celle d''une zone de la division : change le nom de l''école.', new.slug
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger campuses_adresse_libre before insert or update of division_id, slug on public.campuses
for each row execute function public.campuses_adresse_libre();

create function public.geo_divisions_adresse_libre() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.campuses c where c.division_id = new.parent_id and c.slug = new.slug
  ) then
    raise exception 'Un campus de la zone parente a déjà l''adresse « % » : choisis une autre adresse pour la zone.', new.slug
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger geo_divisions_adresse_libre before insert on public.geo_divisions
for each row execute function public.geo_divisions_adresse_libre();

-- Des fonctions de déclencheur : l'API n'a pas à les connaître.
revoke execute on function public.campuses_adresse_libre(), public.geo_divisions_adresse_libre()
  from public, anon, authenticated;
