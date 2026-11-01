-- Le contrôle des lots fins, et le rattachement des relevés déjà reçus (ticket #49).
--
-- Deux fonctions de maintenance, dans le schéma privé : l'API ne les atteint pas, elles se lancent
-- depuis Supabase Studio, le terminal ou une migration. Pour couper un arrondissement en lots fins :
--   1. une migration insère les lots avec leur contour ;
--   2. elle appelle `prive.rattacher_releves_aux_lots_fins('<arrondissement>')` ;
--   3. on vérifie avec `select * from prive.problemes_de_lots('<arrondissement>')` : aucune ligne,
--      rien à signaler.

-- Ce qui ne va pas dans le découpage d'un arrondissement en lots fins. Les lots fins sont ceux qui
-- ont un contour et ne sont pas le lot d'entraînement ; un lot sans contour couvre tout
-- l'arrondissement et ne compte pas. Trois problèmes, mesurés en mètres carrés (au-dessus de 1 000 m²,
-- pour ne pas signaler l'arrondi des coordonnées : 5 cm d'écart sur une limite de 10 km font 500 m²) :
--   - « trou » : une partie de l'arrondissement n'est dans aucun lot fin ;
--   - « recouvrement » : deux lots fins se chevauchent ;
--   - « hors de l'arrondissement » : des lots fins débordent de l'arrondissement.
-- Sans lot fin, il n'y a rien à contrôler : aucune ligne.
create function prive.problemes_de_lots(slug_arrondissement text)
returns table (probleme text, detail text, aire_m2 numeric)
language sql stable set search_path = '' as $$
  with ar as (
    select a.id, a.contour from public.arrondissements a where a.slug = slug_arrondissement
  ),
  fins as (
    select l.id, l.nom, l.contour
    from public.lots l join ar on ar.id = l.arrondissement_id
    where l.contour is not null and not l.essai
  ),
  reunion as (
    select extensions.st_union(f.contour) as geometrie from fins f
  ),
  mesures as (
    select 'trou'::text as probleme, 'partie de l''arrondissement sans lot'::text as detail,
           extensions.st_area(extensions.st_difference(ar.contour, r.geometrie)::extensions.geography) as aire
    from ar, reunion r where r.geometrie is not null
    union all
    select 'hors de l''arrondissement', 'partie de lots hors de l''arrondissement',
           extensions.st_area(extensions.st_difference(r.geometrie, ar.contour)::extensions.geography)
    from ar, reunion r where r.geometrie is not null
    union all
    select 'recouvrement', f1.nom || ' et ' || f2.nom,
           extensions.st_area(extensions.st_intersection(f1.contour, f2.contour)::extensions.geography)
    from fins f1 join fins f2 on f1.id < f2.id
  )
  select m.probleme, m.detail, round(m.aire::numeric) as aire_m2
  from mesures m
  where m.aire > 1000
  order by m.probleme, m.detail;
$$;

-- Rattache les relevés d'un lot d'arrondissement entier (sans contour) au lot fin qui contient leur
-- position, et recalcule « hors du lot » (la position est dedans). Ne bouge pas : un relevé sans
-- position, un relevé sur la limite de deux lots fins (à trancher à la main), un relevé du lot
-- d'entraînement, un relevé d'un autre arrondissement. Rend le nombre de relevés rattachés ; se
-- rejoue sans rien changer. Les relais, eux, passent dans leur lot par l'écran « Relais ».
create function prive.rattacher_releves_aux_lots_fins(slug_arrondissement text) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  with ar as (
    select a.id from public.arrondissements a where a.slug = slug_arrondissement
  ),
  fins as (
    select l.id, l.contour
    from public.lots l join ar on ar.id = l.arrondissement_id
    where l.contour is not null and not l.essai
  ),
  entiers as (
    select l.id
    from public.lots l join ar on ar.id = l.arrondissement_id
    where l.contour is null and not l.essai
  ),
  cibles as (
    select r.id as releve_id, (array_agg(f.id))[1] as lot_id
    from public.releves r
    join fins f on extensions.st_covers(f.contour, r.position)
    where r.lot_id in (select e.id from entiers e)
    group by r.id
    having count(*) = 1
  )
  update public.releves r set lot_id = c.lot_id, hors_lot = false
  from cibles c
  where r.id = c.releve_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function prive.problemes_de_lots(text) from public;
revoke execute on function prive.rattacher_releves_aux_lots_fins(text) from public;
