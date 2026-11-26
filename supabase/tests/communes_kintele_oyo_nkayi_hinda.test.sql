-- Kintélé, Oyo, Nkayi et le district de Hinda (ticket 232, accord du fondateur du 26/11/2026) : quatre divisions de niveau 2,
-- chacune avec son texte officiel et le point de sa ville ; Hinda a aussi son contour d'OpenStreetMap. Rien n'est ouvert aux
-- relais ni mis sur la carte.

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Les quatre divisions, à leur place -------------------------------------------------------------------------------------------

select is((select string_agg(path::text || '=' || kind, ',' order by path::text) from public.geo_divisions
           where path::text in ('congo.brazzaville.kintele', 'congo.cuvette.oyo', 'congo.bouenza.nkayi', 'congo.kouilou.hinda')
             and level = 2),
  'congo.bouenza.nkayi=commune,congo.brazzaville.kintele=commune,congo.cuvette.oyo=commune,congo.kouilou.hinda=district',
  'Trois communes et un district, chacun sous son département');
select ok((select source ~ 'loi n° 29-2024' and source ~ 'département de Brazzaville'
           from public.geo_divisions where path::text = 'congo.brazzaville.kintele'),
  'Kintélé est dans le département de Brazzaville par la loi n° 29-2024, et la source le dit');

-- Elles disent d'où elles viennent ----------------------------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions
           where path::text in ('congo.brazzaville.kintele', 'congo.cuvette.oyo', 'congo.bouenza.nkayi', 'congo.kouilou.hinda')
             and (source !~ '^(Loi|Arrêté) n° ' or source !~ 'Journal officiel' or verified_on is distinct from date '2026-11-26')), 0,
  'Chacune cite son texte officiel et la date où il a été lu');
select is((select count(*)::int from public.geo_divisions
           where path::text in ('congo.brazzaville.kintele', 'congo.cuvette.oyo', 'congo.bouenza.nkayi', 'congo.kouilou.hinda')
             and (position is null or position_source !~ '^OpenStreetMap, nœud [0-9]+ ' or position_source !~ 'ODbL'
                  or position_verified_on is distinct from date '2026-11-26')), 0,
  'Chacune a le point de sa ville, tiré d''un nœud d''OpenStreetMap, avec sa licence et sa date');

-- Rien n'est ouvert ni sur la carte -----------------------------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions
           where path::text in ('congo.brazzaville.kintele', 'congo.cuvette.oyo', 'congo.bouenza.nkayi', 'congo.kouilou.hinda')
             and (open_for_fieldwork or public_status is not null)), 0,
  'Aucune n''est ouverte aux relais ni sur la carte');

-- Seul Hinda a un contour, et il dit d'où il vient ------------------------------------------------------------------------------------

select is((select string_agg(slug, ',') from public.geo_divisions
           where path::text in ('congo.brazzaville.kintele', 'congo.cuvette.oyo', 'congo.bouenza.nkayi', 'congo.kouilou.hinda')
             and boundary is not null),
  'hinda', 'Seul Hinda a un contour : OpenStreetMap n''en a pas d''autre qui soit le bon');
select ok((select osm_relation = 3223110 and source ~ 'relation 3223110' and source ~ 'ODbL' and source ~ '^Arrêté n° 1415'
           from public.geo_divisions where path::text = 'congo.kouilou.hinda'),
  'Le contour de Hinda dit sa relation et sa licence ; le texte officiel reste en tête de la source');
select ok((select extensions.st_isvalid(boundary)
                  and extensions.st_area(boundary::extensions.geography) / 1e6 between 400 and 900
           from public.geo_divisions where path::text = 'congo.kouilou.hinda'),
  'Le contour de Hinda est valide et d''une surface plausible (763 km² selon Wikipédia, 583 dans OpenStreetMap)');
select ok((select extensions.st_covers(boundary, position) from public.geo_divisions where path::text = 'congo.kouilou.hinda'),
  'Le point de Hinda est dans son contour');
select is((select count(*)::int from public.geo_divisions a, public.geo_divisions h
           where h.path::text = 'congo.kouilou.hinda' and a.path::text like 'congo.pointe_noire.%' and a.boundary is not null
             and extensions.st_intersects(a.boundary, h.boundary)), 0,
  'Le contour de Hinda ne touche aucun arrondissement de Pointe-Noire');

-- La base range une position ---------------------------------------------------------------------------------------------------------

select is((select path::text from public.geo_divisions where id = public.division_of_position(-4.6422254, 11.9867295, 3::smallint)),
  'congo.kouilou.hinda', 'Liambou-Néné (le hameau d''OpenStreetMap) se range dans le district de Hinda');
select is(public.division_of_position(-4.1358912, 15.3491989, 3::smallint), null,
  'Kintélé n''a pas de contour : son point ne tombe ni dans Brazzaville ni ailleurs (« zone inconnue », une information)');
select ok((select not extensions.st_covers(b.boundary, k.position) from public.geo_divisions b, public.geo_divisions k
           where b.path::text = 'congo.brazzaville.brazzaville' and k.path::text = 'congo.brazzaville.kintele'),
  'Le point de Kintélé est hors du contour de la commune de Brazzaville : deux communes distinctes');

select * from finish();
rollback;
