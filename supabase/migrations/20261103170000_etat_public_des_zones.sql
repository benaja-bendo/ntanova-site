-- L'état public d'une zone, et le point d'une ville (ticket 102, décisions du fondateur du 03/11/2026).
--
-- La carte du site dit où le relevé est en cours (« actif ») et où le déploiement est programmé (« programme »). Ce n'est PAS
-- `open_for_fieldwork` : celui-là règle ce que les relais peuvent faire (une zone ouverte reçoit leurs fiches), celui-ci règle
-- ce que la carte dit aux familles. Une zone programmée n'est pas ouverte aux relais, une zone ouverte peut ne pas encore
-- être « actif » aux yeux du public. Rien ici ne dit « complet » : rien ne le mesure.
--
-- Additive : une colonne de plus (vide = non couverte), deux colonnes pour sourcer un point, des valeurs de départ, et une
-- fonction pour l'administration. Aucun droit nouveau sur la table : les divisions sont déjà lisibles par tout le monde, et
-- seule l'administration les écrit.

alter table public.geo_divisions
  add column public_status text
    constraint geo_divisions_public_status_check check (public_status in ('actif', 'programme')),
  add column position_source text check (length(position_source) <= 500),
  add column position_verified_on date,
  add constraint geo_divisions_position_sourcee check (position is null or position_source is not null);

comment on column public.geo_divisions.public_status is
  'État public sur la carte : actif (relevé en cours), programme (déploiement programmé), vide (non couverte). Distinct de open_for_fieldwork.';
comment on column public.geo_divisions.position_source is
  'D''où vient `position` : jamais un point inventé.';

-- Les valeurs de départ ------------------------------------------------------------------------------------------------------
-- Actif : les deux arrondissements où des relais relèvent. Programmé : les quatre autres arrondissements de Pointe-Noire et
-- Brazzaville (sa ville, dont les arrondissements n'ont pas de contour).
update public.geo_divisions set public_status = 'actif'
where path::text in ('congo.pointe_noire.pointe_noire.tie_tie', 'congo.pointe_noire.pointe_noire.ngoyo');

update public.geo_divisions set public_status = 'programme'
where path::text in (
  'congo.pointe_noire.pointe_noire.lumumba',
  'congo.pointe_noire.pointe_noire.mvou_mvou',
  'congo.pointe_noire.pointe_noire.loandjili',
  'congo.pointe_noire.pointe_noire.mongo_mpoukou',
  'congo.brazzaville.brazzaville'
);

-- Les points des deux villes de la carte : OpenStreetMap (© les contributeurs d'OpenStreetMap, licence ODbL), consulté le
-- 03/11/2026 par le service de recherche Nominatim. Pointe-Noire : le nœud de la ville ; Brazzaville : le centre de la commune.
update public.geo_divisions set
  position = extensions.st_setsrid(extensions.st_makepoint(11.8503297, -4.7975373), 4326),
  position_source = 'OpenStreetMap, nœud « Pointe-Noire » (place=city) ; © les contributeurs d''OpenStreetMap, licence ODbL',
  position_verified_on = date '2026-11-03'
where path::text = 'congo.pointe_noire.pointe_noire';

update public.geo_divisions set
  position = extensions.st_setsrid(extensions.st_makepoint(15.2712256, -4.2694407), 4326),
  position_source = 'OpenStreetMap, relation 16370691 (commune de Brazzaville), centre ; © les contributeurs d''OpenStreetMap, licence ODbL',
  position_verified_on = date '2026-11-03'
where path::text = 'congo.brazzaville.brazzaville';

-- L'administration règle l'état public d'une zone ----------------------------------------------------------------------------
-- Un état inconnu est refusé ; `null` retire la zone de la carte. Ne touche jamais à `open_for_fieldwork`.
create function public.set_division_public_status(p_division uuid, p_status text) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  if p_status is not null and p_status not in ('actif', 'programme') then
    raise exception 'État public inconnu : % (actif, programme, ou rien).', p_status using errcode = '22023';
  end if;
  update public.geo_divisions set public_status = p_status where id = p_division;
  if not found then
    raise exception 'Division introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_division_public_status(uuid, text) from public, anon, authenticated;
grant execute on function public.set_division_public_status(uuid, text) to authenticated;
