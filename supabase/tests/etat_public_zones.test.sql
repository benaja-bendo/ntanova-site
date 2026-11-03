-- L'état public d'une zone et le point d'une ville (ticket 102). La carte dit « relevé en cours » ou « déploiement
-- programmé » ; cet état n'est pas l'ouverture aux relais.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select public.register_relay('00000000-0000-4000-8000-0000000000a9', 'google-a9', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d9', 'google-d9', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d9');

-- Les valeurs de départ ---------------------------------------------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions where public_status = 'actif'), 2,
  'Deux zones sont « actif » au départ');
select is((select array_agg(slug order by slug)::text from public.geo_divisions where public_status = 'actif'),
  '{ngoyo,tie-tie}', 'Tié-Tié et Ngoyo, les deux arrondissements où des relais relèvent');
select is((select count(*)::int from public.geo_divisions where public_status = 'programme'), 5,
  'Cinq zones sont « programme » au départ');
select is((select array_agg(path::text order by path::text) from public.geo_divisions where public_status = 'programme'),
  array['congo.brazzaville.brazzaville', 'congo.pointe_noire.pointe_noire.loandjili', 'congo.pointe_noire.pointe_noire.lumumba',
        'congo.pointe_noire.pointe_noire.mongo_mpoukou', 'congo.pointe_noire.pointe_noire.mvou_mvou'],
  'Les quatre autres arrondissements de Pointe-Noire et Brazzaville');
select is((select count(*)::int from public.geo_divisions where public_status is null and level = 1), 15,
  'Un département n''a pas d''état : il est non couvert');

-- Distinct de l'ouverture aux relais -----------------------------------------------------------------------------------------------

select is((select open_for_fieldwork from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.lumumba'), false,
  'Lumumba est « programme » sans être ouverte aux relais');
select is((select open_for_fieldwork from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'), false,
  'Brazzaville aussi');
select is((select array_agg(slug order by slug)::text from public.geo_divisions where open_for_fieldwork), '{ngoyo,tie-tie}',
  'Seules Tié-Tié et Ngoyo sont ouvertes aux relais : l''état public n''a rien changé');

-- Un état inconnu est refusé -------------------------------------------------------------------------------------------------------

select throws_ok($$update public.geo_divisions set public_status = 'complet' where slug = 'tie-tie'$$,
  '23514', null, 'Une zone n''est jamais « complète » : rien ne le mesure');

-- Les points des villes, sourcés -----------------------------------------------------------------------------------------------------

select is((select count(*)::int from public.geo_divisions where position is not null and level = 2), 2,
  'Deux villes ont un point : Pointe-Noire et Brazzaville');
select ok((select position_source ~ 'OpenStreetMap' and position_verified_on = date '2026-11-03'
           from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire'),
  'Le point de Pointe-Noire dit d''où il vient et quand');
select ok((select extensions.st_y(position) between -4.9 and -4.7 and extensions.st_x(position) between 11.8 and 12.0
           from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire'),
  'Le point de Pointe-Noire est à Pointe-Noire');
select ok((select extensions.st_y(position) between -4.4 and -4.1 and extensions.st_x(position) between 15.1 and 15.4
           from public.geo_divisions where path::text = 'congo.brazzaville.brazzaville'),
  'Le point de Brazzaville est à Brazzaville');
select throws_ok($$update public.geo_divisions set position = extensions.st_setsrid(extensions.st_makepoint(12.0, -4.0), 4326)
    where path::text = 'congo.niari'$$,
  '23514', null, 'Un point sans source est refusé : jamais de point inventé');

-- La fonction de l'administration -----------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d9","role":"authenticated"}', true);
select lives_ok($$select public.set_division_public_status((select id from public.geo_divisions where slug = 'loandjili'), 'actif')$$,
  'L''administrateur passe une zone en « actif »');
select lives_ok($$select public.set_division_public_status((select id from public.geo_divisions where slug = 'loandjili'), null)$$,
  'Et la retire de la carte');
select throws_ok($$select public.set_division_public_status((select id from public.geo_divisions where slug = 'loandjili'), 'complet')$$,
  '22023', null, 'Un état inconnu est refusé par la fonction');
select throws_ok($$select public.set_division_public_status('00000000-0000-4000-8000-00000000ffff', 'actif')$$,
  'P0002', null, 'Une division inconnue aussi');
reset role;
select is((select public_status from public.geo_divisions where slug = 'loandjili'), null::text, 'Loandjili n''est plus sur la carte');
select is((select open_for_fieldwork from public.geo_divisions where slug = 'loandjili'), false,
  'Régler l''état public n''ouvre rien aux relais');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a9","role":"authenticated"}', true);
select throws_ok($$select public.set_division_public_status((select id from public.geo_divisions where slug = 'tie-tie'), null)$$,
  '42501', null, 'Un relais ne règle pas l''état public (même par la fonction)');
select lives_ok($$update public.geo_divisions set public_status = null where slug = 'tie-tie'$$,
  'Une écriture directe d''un relais ne rencontre aucune ligne : les règles d''accès la laissent sans effet');
reset role;
select is((select public_status from public.geo_divisions where slug = 'tie-tie'), 'actif',
  'Tié-Tié est toujours « actif » : un relais n''écrit pas les divisions');

-- Le public lit l'état -----------------------------------------------------------------------------------------------------------------

set local role anon;
select is((select public_status from public.geo_divisions where slug = 'tie-tie'), 'actif', 'Un visiteur lit l''état public d''une zone');
reset role;

select * from finish();
rollback;
