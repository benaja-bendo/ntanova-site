-- Une école se range dans sa ville quand aucun arrondissement ne la contient (audit de l'administration, 07/11/2026).
--
-- `division_of_position` ne cherchait qu'au niveau 3 (arrondissement) et plus fin. Une ville, une commune ou un district
-- sans arrondissement (Ouesso, Dolisie, Impfondo…) ne rangeait donc jamais une école toute seule : chaque fiche demandait
-- « Division de l'école ». Elle ne rangeait pas non plus une école de Brazzaville qui tombe entre les contours simplifiés
-- de deux arrondissements, ou sur le fleuve, alors que le contour de la commune la contient.
--
-- La règle devient : la division la plus fine dont le contour contient la position, en préférant le niveau demandé ou plus
-- fin (arrondissement, quartier) ; à défaut, la plus fine des villes, communes et districts (niveau 2). Un département ou
-- un pays ne range jamais une école. Le deuxième paramètre reste le niveau préféré ; plus bas que 2, il vaut 2.
-- La signature ne change pas : les droits et tous les appels (réception d'un relevé, acceptation, corrections) sont gardés.

create or replace function public.division_of_position(
  p_latitude double precision,
  p_longitude double precision,
  p_min_level smallint default 3
) returns uuid
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
  where d.level >= 2
    and d.boundary is not null
    and extensions.st_covers(d.boundary, extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326))
  order by (d.level >= p_min_level) desc, d.level desc
  limit 1;
  return trouve;
end;
$$;

-- Les relevés déjà reçus sans division reçoivent celle que dit leur position, et leur zone (se rejoue sans rien changer).
update public.field_submissions s set
  division_id = public.division_of_position(extensions.st_y(s.position), extensions.st_x(s.position), 3::smallint)
where s.position is not null
  and s.division_id is null
  and extensions.st_y(s.position) between -90 and 90
  and extensions.st_x(s.position) between -180 and 180;
update public.field_submissions s set in_open_zone = public.is_open_for_fieldwork(s.division_id)
where s.division_id is not null and s.in_open_zone is null;
