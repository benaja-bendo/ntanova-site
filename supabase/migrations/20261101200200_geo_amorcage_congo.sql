-- L'amorçage du Congo (République du Congo, Congo-Brazzaville, pas la RDC) : pays, départements,
-- chefs-lieux, arrondissements de Brazzaville et de Pointe-Noire. Rien d'autre : aucune école,
-- aucun quartier, aucune position inventée. Les autres villes et leurs subdivisions s'ajoutent depuis
-- l'administration, une fois confrontées à une source.
--
-- Chaque ligne dit d'où elle vient (`source`) et quand elle a été confrontée à cette source
-- (`verified_on`) ; une ligne dont `verified_on` est vide n'a pas encore été vérifiée.
-- Sources consultées le 01/11/2026 : Wikipédia, « Departments of the Republic of the Congo »
-- (page modifiée le 04/10/2026) et « ISO 3166-2:CG » (modifiée le 26/01/2024).
--
-- Fait à retenir : depuis les lois n° 25-2024, 26-2024 et 27-2024 du 8 octobre 2024 (Journal officiel
-- n° 42-2024), le Congo a QUINZE départements. Trois ont été créés : Nkéni-Alima (chef-lieu Gamboma),
-- Djoué-Léfini (chef-lieu Odziba) et Congo-Oubangui (chef-lieu Mossaka). La norme ISO 3166-2:CG, qui
-- n'en liste que douze, n'en donne pas encore le code (colonne `iso_code` vide).

-- Le pays ----------------------------------------------------------------------------------------

insert into public.geo_divisions (level, kind, country_code, iso_code, name, slug, aliases, source, verified_on)
values (0, 'country', 'CG', 'CG', 'Congo', 'congo', '{"République du Congo","Congo-Brazzaville"}',
        'ISO 3166-1 ; Wikipédia, « Departments of the Republic of the Congo » (04/10/2026)', date '2026-11-01');

-- Les quinze départements -------------------------------------------------------------------------

insert into public.geo_divisions (parent_id, level, kind, country_code, iso_code, name, slug, source, verified_on)
select p.id, 1, 'department', 'CG', d.iso, d.nom, d.slug,
       'ISO 3166-2:CG ; Wikipédia, liste des départements (04/10/2026)', date '2026-11-01'
from (values
  ('bouenza',        'Bouenza',        'CG-11'),
  ('brazzaville',    'Brazzaville',    'CG-BZV'),
  ('cuvette',        'Cuvette',        'CG-8'),
  ('cuvette-ouest',  'Cuvette-Ouest',  'CG-15'),
  ('kouilou',        'Kouilou',        'CG-5'),
  ('lekoumou',       'Lékoumou',       'CG-2'),
  ('likouala',       'Likouala',       'CG-7'),
  ('niari',          'Niari',          'CG-9'),
  ('plateaux',       'Plateaux',       'CG-14'),
  ('pointe-noire',   'Pointe-Noire',   'CG-16'),
  ('pool',           'Pool',           'CG-12'),
  ('sangha',         'Sangha',         'CG-13')
) as d (slug, nom, iso)
join public.geo_divisions p on p.path::text = 'congo';

insert into public.geo_divisions (parent_id, level, kind, country_code, iso_code, name, slug, source, verified_on)
select p.id, 1, 'department', 'CG', null, d.nom, d.slug,
       'Créé par la loi n° ' || d.loi || '-2024 du 8 octobre 2024 (Journal officiel n° 42-2024), d''après Wikipédia (04/10/2026) ; pas de code ISO 3166-2 sur la page ISO consultée (modifiée le 26/01/2024)',
       date '2026-11-01'
from (values
  ('congo-oubangui', 'Congo-Oubangui', '27'),
  ('nkeni-alima',    'Nkéni-Alima',    '26'),
  ('djoue-lefini',   'Djoué-Léfini',   '25')
) as d (slug, nom, loi)
join public.geo_divisions p on p.path::text = 'congo';

-- Les villes, communes et districts : les deux grandes villes, les chefs-lieux, deux districts ----
-- Brazzaville et Pointe-Noire sont à la fois département (niveau 1) et ville (niveau 2).
-- Le statut (commune ou district) des chefs-lieux n'est pas confronté à une source : `verified_on`
-- ne couvre que le nom et le rôle de chef-lieu, vus sur la page des départements.

insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug, source, verified_on)
select p.id, 2, v.genre, 'CG', v.nom, v.slug, v.source, v.verifie
from (values
  ('congo.brazzaville',    'brazzaville',     'Brazzaville',      'city',     'Wikipédia : Brazzaville est à la fois département et commune', date '2026-11-01'),
  ('congo.brazzaville',    'ile-mbamou',      'Île Mbamou',       'district', 'Wikipédia, bandeau des départements (04/10/2026) : district de Brazzaville hors des neuf arrondissements', date '2026-11-01'),
  ('congo.pointe_noire',   'pointe-noire',    'Pointe-Noire',     'city',     'Wikipédia : Pointe-Noire est à la fois département et commune', date '2026-11-01'),
  ('congo.pointe_noire',   'tchiamba-nzassi', 'Tchiamba-Nzassi',  'district', 'Wikipédia, bandeau des départements (04/10/2026) : district de Pointe-Noire hors des six arrondissements', date '2026-11-01'),
  ('congo.sangha',         'ouesso',          'Ouesso',           'commune',  'Chef-lieu de la Sangha (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.likouala',       'impfondo',        'Impfondo',         'commune',  'Chef-lieu de la Likouala (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.congo_oubangui', 'mossaka',         'Mossaka',          'district', 'Chef-lieu du Congo-Oubangui (Wikipédia, 04/10/2026) ; statut non vérifié', date '2026-11-01'),
  ('congo.cuvette',        'owando',          'Owando',           'commune',  'Chef-lieu de la Cuvette (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.cuvette_ouest',  'ewo',             'Ewo',              'commune',  'Chef-lieu de la Cuvette-Ouest (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.nkeni_alima',    'gamboma',         'Gamboma',          'district', 'Chef-lieu du Nkéni-Alima (Wikipédia, 04/10/2026) ; statut non vérifié', date '2026-11-01'),
  ('congo.plateaux',       'djambala',        'Djambala',         'commune',  'Chef-lieu des Plateaux (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.djoue_lefini',   'odziba',          'Odziba',           'district', 'Chef-lieu du Djoué-Léfini (Wikipédia, 04/10/2026) ; statut non vérifié', date '2026-11-01'),
  ('congo.pool',           'kinkala',         'Kinkala',          'commune',  'Chef-lieu du Pool (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.bouenza',        'madingou',        'Madingou',         'commune',  'Chef-lieu de la Bouenza (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.lekoumou',       'sibiti',          'Sibiti',           'commune',  'Chef-lieu de la Lékoumou (Wikipédia, 04/10/2026) ; statut de commune non vérifié', date '2026-11-01'),
  ('congo.niari',          'dolisie',         'Dolisie',          'commune',  'Chef-lieu du Niari (Wikipédia, 04/10/2026) ; statut de commune non vérifié. Ses arrondissements ne sont pas confirmés : aucun n''est amorcé.', date '2026-11-01'),
  ('congo.kouilou',        'loango',          'Loango',           'district', 'Chef-lieu du Kouilou selon Wikipédia (04/10/2026) ; des sources plus anciennes donnent Hinda. Statut non vérifié.', date '2026-11-01')
) as v (parent_path, slug, nom, genre, source, verifie)
join public.geo_divisions p on p.path::text = v.parent_path;

-- Les arrondissements -----------------------------------------------------------------------------

-- Brazzaville : neuf arrondissements (Wikipédia, 04/10/2026, donne le décompte ; les noms viennent
-- des articles de chaque arrondissement et de statoids.com : Madibou et Djiri créés en 2005).
-- Aucun texte officiel n'a été lu pour les noms : `verified_on` reste vide.
insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug, source)
select p.id, 3, 'arrondissement', 'CG', v.nom, v.slug,
       'Wikipédia : Brazzaville compte neuf arrondissements ; noms non confrontés à un texte officiel'
from (values
  ('makelekele', 'Makélékélé'), ('bacongo', 'Bacongo'), ('poto-poto', 'Poto-Poto'),
  ('moungali', 'Moungali'), ('ouenze', 'Ouenzé'), ('talangai', 'Talangaï'),
  ('mfilou', 'Mfilou'), ('madibou', 'Madibou'), ('djiri', 'Djiri')
) as v (slug, nom)
join public.geo_divisions p on p.path::text = 'congo.brazzaville.brazzaville';

-- Pointe-Noire : six arrondissements, numérotés comme on les dit sur place (« arrondissement 3 »).
-- Mongo-Mpoukou (5) et Ngoyo (6) ont été créés par la loi n° 15-2011 ; le recensement de 2023 en compte six.
insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug, ordinal, aliases, source, verified_on)
select p.id, 3, 'arrondissement', 'CG', v.nom, v.slug, v.numero, v.aliases,
       'Six arrondissements : usage du projet (src/modele/pointe-noire.ts), loi n° 15-2011, recensement de 2023 (citypopulation.de), consultés le 01/11/2026',
       date '2026-11-01'
from (values
  ('lumumba',       'Lumumba',       1, '{}'::text[]),
  ('mvou-mvou',     'Mvou-Mvou',     2, '{Mvoumvou}'::text[]),
  ('tie-tie',       'Tié-Tié',       3, '{}'::text[]),
  ('loandjili',     'Loandjili',     4, '{}'::text[]),
  ('mongo-mpoukou', 'Mongo-Mpoukou', 5, '{Mongo-Poukou}'::text[]),
  ('ngoyo',         'Ngoyo',         6, '{}'::text[])
) as v (slug, nom, numero, aliases)
join public.geo_divisions p on p.path::text = 'congo.pointe_noire.pointe_noire';

-- Les zones ouvertes aux relais : Tié-Tié et Ngoyo, seuls arrondissements où l'on relève pour l'instant.
update public.geo_divisions set open_for_fieldwork = true
where path::text in ('congo.pointe_noire.pointe_noire.tie_tie', 'congo.pointe_noire.pointe_noire.ngoyo');

-- Les contours de Tié-Tié et de Ngoyo : ceux de la table d'avant (OpenStreetMap, extraits le 30/10/2026).
update public.geo_divisions g set
  boundary = a.contour,
  osm_relation = a.osm_relation,
  source = g.source || ' ; contour OpenStreetMap extrait le 30/10/2026 (© les contributeurs d''OpenStreetMap, licence ODbL)'
from public.arrondissements a
where g.level = 3 and g.slug = a.slug and g.path::text like 'congo.pointe_noire.pointe_noire.%';
