-- La géographie universelle : hiérarchie 0 à 4 garantie par la base, amorçage du Congo, zones ouvertes aux relais.

begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- L'amorçage du Congo -------------------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions where level = 0 and country_code = 'CG'), 1, 'Un pays : le Congo');
select is((select count(*)::int from public.geo_divisions where level = 1 and country_code = 'CG'), 15,
  'Quinze départements (douze historiques et les trois créés en octobre 2024)');
select is((select string_agg(name, ',' order by name) from public.geo_divisions
           where level = 1 and iso_code is null and country_code = 'CG'), 'Congo-Oubangui,Djoué-Léfini,Nkéni-Alima',
  'Les trois départements de 2024 n''ont pas encore de code ISO');
select is((select count(*)::int from public.geo_divisions where level = 1 and iso_code is not null), 12,
  'Les douze départements historiques portent leur code ISO 3166-2');
select is((select iso_code from public.geo_divisions where path::text = 'congo.brazzaville'), 'CG-BZV', 'Brazzaville : CG-BZV');
select is((select iso_code from public.geo_divisions where path::text = 'congo.pointe_noire'), 'CG-16', 'Pointe-Noire : CG-16');

select is((select count(*)::int from public.geo_divisions where path::text like 'congo.brazzaville.brazzaville.%' and level = 3), 9,
  'Brazzaville a neuf arrondissements');
select is((select string_agg(name, ',' order by ordinal) from public.geo_divisions
           where path::text like 'congo.pointe_noire.pointe_noire.%' and level = 3),
  'Lumumba,Mvou-Mvou,Tié-Tié,Loandjili,Mongo-Mpoukou,Ngoyo', 'Pointe-Noire a six arrondissements, dans l''ordre officiel');
select is((select count(*)::int from public.geo_divisions where path::text like 'congo.niari.dolisie.%'), 0,
  'Les arrondissements de Dolisie ne sont pas amorcés : ils ne sont pas confirmés');
select ok(exists (select 1 from public.geo_divisions where path::text = 'congo.niari.dolisie' and level = 2),
  'Dolisie est une commune du Niari');
select is((select count(*)::int from public.geo_divisions where source is null), 0, 'Chaque ligne amorcée dit d''où elle vient');
select is((select count(*)::int from public.geo_divisions where level = 3 and path::text like 'congo.pointe_noire.%' and boundary is not null),
  6, 'Les six arrondissements de Pointe-Noire ont un contour (OpenStreetMap)');
select is((select count(*)::int from public.geo_divisions where level = 3 and path::text like 'congo.brazzaville.%' and boundary is not null),
  0, 'Aucun contour n''est inventé pour Brazzaville');

-- Les zones ouvertes aux relais -----------------------------------------------------------------------------

select is((select string_agg(slug, ',' order by slug) from public.geo_divisions where open_for_fieldwork), 'ngoyo,tie-tie',
  'Seuls Tié-Tié et Ngoyo sont ouverts aux relais');
select is(public.is_open_for_fieldwork((select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie')), true,
  'Tié-Tié est ouverte');
select is(public.is_open_for_fieldwork((select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.loandjili')), false,
  'Loandjili est fermée');
insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug, source)
select id, 4, 'quarter', 'CG', '[Quartier d''essai]', 'quartier-d-essai', 'test'
from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie';
select is(public.is_open_for_fieldwork((select id from public.geo_divisions where slug = 'quartier-d-essai')), true,
  'Un quartier d''une zone ouverte est ouvert (vaut pour tout le sous-arbre)');

-- La hiérarchie, garantie par la base ------------------------------------------------------------------------------

select is((select path::text from public.geo_divisions where slug = 'quartier-d-essai'),
  'congo.pointe_noire.pointe_noire.tie_tie.quartier_d_essai', 'Le chemin se calcule depuis les ancêtres');
select is((select country_code from public.geo_divisions where slug = 'quartier-d-essai'), 'CG', 'Le pays est hérité du parent');
select is((select count(*)::int from public.geo_divisions d where d.path operator(extensions.<@) 'congo.pointe_noire'::extensions.ltree
                                                                  and d.level = 3), 6,
  'Tout ce qui est sous Pointe-Noire se trouve en une comparaison de chemin');

select throws_ok($$insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug)
    select id, 4, 'quarter', 'CG', 'X', 'x' from public.geo_divisions where path::text = 'congo'$$,
  '23503', null, 'Un quartier ne se place pas directement sous un pays : un niveau ne se saute pas');
select throws_ok($$insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug)
    select id, 3, 'quarter', 'CG', 'X', 'x' from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'$$,
  '23514', null, 'Le genre doit correspondre au niveau (un « quartier » n''est pas de niveau 3)');
select throws_ok($$insert into public.geo_divisions (level, kind, country_code, name, slug) values (0, 'country', 'XX', 'Autre', 'autre-racine')
    ; insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug)
      select id, 0, 'country', 'XX', 'Faux enfant', 'faux' from public.geo_divisions where slug = 'autre-racine'$$,
  '23514', null, 'Un pays n''a pas de parent');
select throws_ok($$update public.geo_divisions set slug = 'autre-adresse' where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'$$,
  '22023', null, 'L''adresse d''une division ne change plus : elle est dans des liens publics');
select throws_ok($$insert into public.geo_divisions (parent_id, level, kind, country_code, name, slug)
    select id, 3, 'arrondissement', 'CG', 'Doublon', 'tie-tie' from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire'$$,
  '23505', null, 'Deux divisions d''un même parent n''ont pas la même adresse');
select throws_ok($$insert into public.geo_divisions (level, kind, country_code, name, slug) values (0, 'country', 'CG', 'Autre Congo', 'congo')$$,
  '23505', null, 'Deux pays n''ont pas la même adresse');

-- Chercher, situer ---------------------------------------------------------------------------------------------------

select is(public.division_of_position(-4.80, 11.93), (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'),
  'Un point dans Tié-Tié donne l''arrondissement Tié-Tié');
select is(public.division_of_position(-4.60, 11.60), null::uuid,
  'Un point hors de tout contour connu ne donne rien : jamais de division devinée');
select throws_ok($$select public.division_of_position(95, 11.9)$$, '22023', null, 'Une latitude impossible est refusée');
select is(public.norm_text('Tié-Tié'), 'tie-tie', 'Les accents ne comptent pas dans la recherche');
select ok(exists (select 1 from public.geo_divisions where public.norm_text(name) operator(extensions.%) public.norm_text('Mongo Mpouko')),
  'La recherche floue retrouve « Mongo-Mpoukou » malgré une faute');

select * from finish();
rollback;
