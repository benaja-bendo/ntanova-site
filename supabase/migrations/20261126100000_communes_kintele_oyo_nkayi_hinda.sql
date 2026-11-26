-- Quatre divisions de niveau 2 qui manquaient (ticket 232, accord du fondateur du 26/11/2026) : Kintélé, Oyo, Nkayi et le
-- district de Hinda. L'import d'établissements du supérieur du 26/11 refusait quatre écoles et un site faute de commune
-- connue : un campus se range dans une ville, une commune ou un district (niveau 2 ou plus fin), jamais dans un département.
--
-- Additive : quatre lignes, chacune avec sa source officielle, lue le 26/11/2026 (`verified_on`), et le point de sa ville
-- d'après OpenStreetMap (© les contributeurs d'OpenStreetMap, licence ODbL), consulté le 26/11/2026. Rien n'est ouvert aux
-- relais ni mis sur la carte (`open_for_fieldwork` faux, `public_status` vide) ; aucune école n'entre ici.
--
-- Ce qui reste hors de la base, faute de source :
-- - aucun contour pour Kintélé (OpenStreetMap la range encore dans le Pool, sans limite), Oyo (aucune limite ; son point tombe
--   dans la limite « Owando » d'OpenStreetMap, relation 3221351, incohérente) ni Nkayi (la relation 3224446 « Nkayi » est une
--   limite de district de 1 190 km², pas la commune). Le contour de Hinda suit, dans la migration 20261126100100 ;
-- - les deux arrondissements de Nkayi : l'arrêté lu ne donne ni leurs noms ni leurs limites ;
-- - Liambou-Néné, où se trouve une école : un hameau d'OpenStreetMap (nœud 3300966493) à l'intérieur de la limite de Hinda,
--   qu'aucun texte officiel lu ne nomme. Il reste le quartier de la fiche : un quartier se range sous un arrondissement.

insert into public.geo_divisions (
  parent_id, level, kind, country_code, name, slug, source, verified_on, position, position_source, position_verified_on
)
select p.id, 2, v.genre, 'CG', v.nom, v.slug, v.source, date '2026-11-26',
       extensions.st_setsrid(extensions.st_makepoint(v.longitude, v.latitude), 4326),
       v.point || ' ; © les contributeurs d''OpenStreetMap, licence ODbL', date '2026-11-26'
from (values
  ('congo.brazzaville', 'kintele', 'Kintélé', 'commune',
   'Loi n° 14-2017 du 16 mars 2017 (Journal officiel n° 12 du 23/03/2017, p. 334-335) : érigée en commune, alors rattachée au Pool ; loi n° 29-2024 du 8 octobre 2024 (Journal officiel n° 42-2024, p. 1306) : le département de Brazzaville comprend les communes de Brazzaville et de Kintélé et le district de l''Île Mbamou',
   -4.1358912, 15.3491989, 'OpenStreetMap, nœud 3300966218 « Kintélé » (place=town)'),
  ('congo.cuvette', 'oyo', 'Oyo', 'commune',
   'Loi n° 13-2017 du 16 mars 2017 (Journal officiel n° 12 du 23/03/2017, p. 333-334) : érigée en commune ; loi n° 30-2024 du 8 octobre 2024 (Journal officiel n° 42-2024, p. 1306) : la Cuvette comprend la commune d''Oyo, distincte du district d''Oyo',
   -1.1603788, 15.9735205, 'OpenStreetMap, nœud 922284291 « Oyo » (place=town)'),
  ('congo.bouenza', 'nkayi', 'Nkayi', 'commune',
   'Arrêté n° 1343 du 3 juin 2025 (Journal officiel n° 24-2025, p. 720) : commune de Nkayi, département de la Bouenza, deux arrondissements (non amorcés : ni noms ni limites dans ce texte)',
   -4.1840962, 13.2883675, 'OpenStreetMap, nœud 921657745 « Nkayi » (place=city)'),
  ('congo.kouilou', 'hinda', 'Hinda', 'district',
   'Arrêté n° 1415 du 6 juin 2025 (Journal officiel du 19/06/2025, n° 25-2025, p. 743) : district de Hinda, département du Kouilou',
   -4.6166294, 12.0404854, 'OpenStreetMap, nœud 3300965122 « Hinda » (place=town, centre de la relation 3223110)')
) as v (parent_path, slug, nom, genre, source, latitude, longitude, point)
join public.geo_divisions p on p.path::text = v.parent_path and p.level = 1;

-- Un département qui manque (l'amorçage a changé) ne doit pas passer sans bruit.
do $$
begin
  if (select count(*) from public.geo_divisions
      where path::text in ('congo.brazzaville.kintele', 'congo.cuvette.oyo', 'congo.bouenza.nkayi', 'congo.kouilou.hinda')
        and level = 2 and source is not null and position is not null) <> 4 then
    raise exception 'Les quatre divisions (Kintélé, Oyo, Nkayi, Hinda) ne sont pas toutes en place.';
  end if;
end
$$;
