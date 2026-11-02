-- Le contrôle des lots fins et le rattachement des relevés (reprise du ticket n° 49, sur les divisions).
--
-- Deux fonctions de maintenance dans le schéma privé : l'API ne les atteint pas, elles se lancent depuis Supabase
-- Studio, le terminal ou une migration. Pour couper une division en lots fins :
--   1. une migration insère les lots avec leur contour ;
--   2. elle appelle `prive.attach_submissions_to_fine_lots('<division>')` ;
--   3. on vérifie avec `select * from prive.lot_problems('<division>')` : aucune ligne, rien à signaler.
-- Une division est un arrondissement (ou un quartier, une ville) qui a son contour.

-- Ce qui ne va pas dans le découpage d'une division en lots fins. Les lots fins sont ceux qui ont un contour et ne
-- sont pas le lot d'entraînement ; un lot sans contour couvre toute la division et ne compte pas. Trois problèmes,
-- mesurés en mètres carrés (au-dessus de 1 000 m², pour ne pas signaler l'arrondi des coordonnées) :
--   - « trou » : une partie de la division n'est dans aucun lot fin ;
--   - « recouvrement » : deux lots fins se chevauchent ;
--   - « hors de la division » : des lots fins débordent de la division.
-- Sans lot fin, ou sans contour de la division, il n'y a rien à contrôler : aucune ligne.
create function prive.lot_problems(p_division uuid)
returns table (problem text, detail text, area_m2 numeric)
language sql stable set search_path = '' as $$
  with ar as (
    select d.id, d.boundary as contour from public.geo_divisions d where d.id = p_division and d.boundary is not null
  ),
  fines as (
    select l.id, l.nom, l.contour
    from public.lots l join ar on ar.id = l.geo_division_id
    where l.contour is not null and not l.essai
  ),
  reunion as (
    select extensions.st_union(f.contour) as geometrie from fines f
  ),
  mesures as (
    select 'trou'::text as problem, 'partie de la division sans lot'::text as detail,
           extensions.st_area(extensions.st_difference(ar.contour, r.geometrie)::extensions.geography) as aire
    from ar, reunion r where r.geometrie is not null
    union all
    select 'hors de la division', 'partie de lots hors de la division',
           extensions.st_area(extensions.st_difference(r.geometrie, ar.contour)::extensions.geography)
    from ar, reunion r where r.geometrie is not null
    union all
    select 'recouvrement', f1.nom || ' et ' || f2.nom,
           extensions.st_area(extensions.st_intersection(f1.contour, f2.contour)::extensions.geography)
    from fines f1 join fines f2 on f1.id < f2.id
  )
  select m.problem, m.detail, round(m.aire::numeric) as area_m2
  from mesures m
  where m.aire > 1000
  order by m.problem, m.detail;
$$;

-- Rattache les relevés d'un lot de division entière (sans contour) au lot fin qui contient leur position, et
-- recalcule « hors du lot » (la position est dedans). Ne bouge pas : un relevé sans position, un relevé sur la limite
-- de deux lots fins (à trancher à la main), un relevé du lot d'entraînement, un relevé d'une autre division.
-- Rend le nombre de relevés rattachés ; se rejoue sans rien changer.
create function prive.attach_submissions_to_fine_lots(p_division uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  with fines as (
    select l.id, l.contour
    from public.lots l
    where l.geo_division_id = p_division and l.contour is not null and not l.essai
  ),
  whole as (
    select l.id from public.lots l where l.geo_division_id = p_division and l.contour is null and not l.essai
  ),
  targets as (
    select s.id as submission_id, (array_agg(f.id))[1] as lot_id
    from public.field_submissions s
    join fines f on extensions.st_covers(f.contour, s.position)
    where s.batch_id in (select w.id from whole w)
    group by s.id
    having count(*) = 1
  )
  update public.field_submissions s set batch_id = t.lot_id, outside_batch = false
  from targets t
  where s.id = t.submission_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Personne n'y touche par l'API : ni un visiteur, ni un relais.
revoke all on function prive.lot_problems(uuid) from public, anon, authenticated;
revoke all on function prive.attach_submissions_to_fine_lots(uuid) from public, anon, authenticated;
