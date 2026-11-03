-- Les contours de Brazzaville (ticket 113, décision D3 du fondateur, 03/11/2026) : la commune et ses neuf arrondissements,
-- tirés d'OpenStreetMap avec leur relation et leur licence. Un contour simplifié sert à situer une école dans son
-- arrondissement, pas à mesurer. Importer un contour n'ouvre rien aux relais et ne met rien sur la carte.

begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

-- La commune et ses neuf arrondissements ont un contour ------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions
           where path::text like 'congo.brazzaville.brazzaville.%' and level = 3 and boundary is not null), 9,
  'Les neuf arrondissements de Brazzaville ont un contour');
select ok((select boundary is not null from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'),
  'La commune de Brazzaville a un contour');
select is((select count(*)::int from public.geo_divisions where boundary is not null and not extensions.st_isvalid(boundary)), 0,
  'Aucun contour n''est invalide (PostGIS)');

-- Ils disent d'où ils viennent -----------------------------------------------------------------------------------------------------

select is((select string_agg(slug || '=' || osm_relation, ',' order by slug) from public.geo_divisions
           where path::text like 'congo.brazzaville.brazzaville.%'),
  'bacongo=16357002,djiri=16370647,madibou=16370379,makelekele=16356192,mfilou=16365154,moungali=16359029,ouenze=16362075,poto-poto=16357198,talangai=16363022',
  'Chaque arrondissement a SA relation d''OpenStreetMap (le numéro d''ordre d''OpenStreetMap suit le nom)');
select is((select osm_relation from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'), 16370691::bigint,
  'La commune est la relation 16370691');
select is((select count(*)::int from public.geo_divisions
           where path::text like 'congo.brazzaville.brazzaville%' and boundary is not null
             and (source !~ 'OpenStreetMap' or source !~ 'ODbL' or source !~ ('relation ' || osm_relation))), 0,
  'Chaque contour dit d''où il vient : OpenStreetMap, sa relation, la licence ODbL');
select ok((select source ~ 'Wikipédia' from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'),
  'La source d''avant est gardée : on ajoute, on ne réécrit pas');
select is((select count(*)::int from public.geo_divisions
           where path::text like 'congo.brazzaville.brazzaville.%' and verified_on is not null), 0,
  'Un contour d''OpenStreetMap ne vaut pas confrontation à un texte officiel : les arrondissements restent « pas encore vérifiés »');

-- Importer des contours n'ouvre rien et ne met rien sur la carte --------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions
           where path::text like 'congo.brazzaville.brazzaville.%' and (open_for_fieldwork or public_status is not null)), 0,
  'Aucun arrondissement de Brazzaville n''est ouvert aux relais ni sur la carte');
select is((select public_status from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'), 'programme',
  'Brazzaville reste « programme »');

-- Des surfaces plausibles, des arrondissements qui se recouvrent sans se chevaucher ----------------------------------------------------

-- Sa limite sud est la frontière avec la RDC, au milieu du fleuve Congo (relation d'OpenStreetMap : voies « RD Congo - Congo-Brazzaville »
-- et « Congo »): la surface compte donc de l'eau, d'où une fourchette large. Elle sert à reconnaître une relation fausse ou coupée.
select ok((select extensions.st_area(boundary::extensions.geography) / 1e6 between 200 and 400
           from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'),
  'La commune a une surface plausible (200 à 400 km², fleuve compris)');
select ok((select abs(extensions.st_area(extensions.st_union(a.boundary)::extensions.geography)
                      / extensions.st_area(c.boundary::extensions.geography) - 1) < 0.05
           from public.geo_divisions a, public.geo_divisions c
           where c.path::text = 'congo.brazzaville.brazzaville' and a.path::text like 'congo.brazzaville.brazzaville.%'
           group by c.boundary),
  'Les neuf arrondissements recouvrent la commune à 5 % près');
select ok((select sum(extensions.st_area(a.boundary::extensions.geography))
                  / extensions.st_area(extensions.st_union(a.boundary)::extensions.geography) < 1.03
           from public.geo_divisions a where a.path::text like 'congo.brazzaville.brazzaville.%'),
  'Les arrondissements se chevauchent de moins de 3 % de leur surface');
select is((select count(*)::int from public.geo_divisions a, public.geo_divisions c
           where c.path::text = 'congo.brazzaville.brazzaville' and a.path::text like 'congo.brazzaville.brazzaville.%'
             and not extensions.st_covers(extensions.st_buffer(c.boundary::extensions.geography, 150)::extensions.geometry, a.boundary)), 0,
  'Chaque arrondissement est dans la commune, à 150 m près (des contours simplifiés ne se superposent pas au mètre)');

-- La base les utilise pour situer une position ------------------------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions a
           where a.path::text like 'congo.brazzaville.brazzaville.%'
             and public.division_of_position(extensions.st_y(extensions.st_pointonsurface(a.boundary)),
                                             extensions.st_x(extensions.st_pointonsurface(a.boundary)), 3::smallint) is distinct from a.id), 0,
  'Un point au cœur de chaque arrondissement retombe dans cet arrondissement');
select matches((select path::text from public.geo_divisions where id = public.division_of_position(-4.2694407, 15.2712256, 3::smallint)),
  '^congo\.brazzaville\.brazzaville\.', 'Le centre de la commune (le point de la carte) est dans un arrondissement de Brazzaville');
select is(public.division_of_position(-4.3317, 15.3139, 3::smallint), null,
  'Kinshasa, de l''autre côté du fleuve, n''est dans aucun arrondissement : les contours ne débordent pas');

select * from finish();
rollback;
