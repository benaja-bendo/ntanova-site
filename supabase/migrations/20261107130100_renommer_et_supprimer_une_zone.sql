-- Renommer une zone, dire ses autres orthographes, et supprimer une zone vide (audit de l'administration, 07/11/2026).
--
-- Une zone ajoutée par erreur (une faute dans le nom, un doublon) restait pour toujours : l'administration n'a que
-- « insérer » et « modifier » sur `geo_divisions`, et aucun écran ne changeait un nom. Deux gestes de plus, jamais
-- plus que cela :
--   1. `rename_division` : le nom et les autres écritures (« Mvoumvou » pour « Mvou-Mvou »). L'adresse (le slug), le
--      parent, le niveau et le pays ne changent toujours pas : ils sont dans des liens publics (le déclencheur le garde).
--      Les liens des pages d'écoles ne bougent donc pas ; le nouveau nom paraît à la prochaine mise en ligne du site.
--   2. `delete_division` : supprimer une zone qui ne contient plus rien. Elle refuse une zone qui a des sous-zones, des
--      écoles (même à la corbeille), des relevés de relais ou des lots, et, par prudence, une zone qui a un contour, un
--      état sur la carte ou qui est ouverte aux relais : ce sont des réglages à défaire d'abord, pas une erreur de saisie.
--      La suppression est définitive (la zone peut se rajouter avec la même adresse) et laisse une trace dans
--      `prive.erasures`.

-- 1. La trace d'une suppression ----------------------------------------------------------------------------------------------

alter table prive.erasures drop constraint erasures_what_check;
alter table prive.erasures
  add constraint erasures_what_check
  check (what in ('contact', 'photo', 'merge', 'campus', 'trash', 'restore', 'zone'));

-- 2. Renommer ---------------------------------------------------------------------------------------------------------------------

-- Le nom entier remplace l'ancien ; les autres écritures remplacent la liste : sans blanc, sans doublon (accents et
-- majuscules ne comptent pas), sans le nom lui-même, 20 au plus, 80 caractères chacune.
create function public.rename_division(p_division uuid, p_name text, p_aliases text[] default '{}')
returns void
language plpgsql set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_aliases text[];
  d public.geo_divisions;
begin
  perform public.exiger_admin();
  if length(v_name) not between 1 and 120 then
    raise exception 'Le nom d''une zone fait de 1 à 120 caractères.' using errcode = '22023';
  end if;

  select x.* into d from public.geo_divisions x where x.id = p_division for update;
  if not found then
    raise exception 'Zone introuvable.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.geo_divisions s
    where s.parent_id is not distinct from d.parent_id
      and s.id <> d.id
      and public.norm_text(s.name) = public.norm_text(v_name)
  ) then
    raise exception 'Une autre zone de ce parent s''appelle déjà « % ».', v_name using errcode = '22023';
  end if;

  select coalesce(array_agg(a.valeur order by a.rang), '{}') into v_aliases
  from (
    select distinct on (public.norm_text(t.valeur)) t.valeur, t.rang
    from (
      select btrim(x) as valeur, min(n) as rang
      from unnest(coalesce(p_aliases, '{}')) with ordinality as u(x, n)
      group by btrim(x)
    ) t
    where t.valeur <> '' and public.norm_text(t.valeur) <> public.norm_text(v_name)
    order by public.norm_text(t.valeur), t.rang
  ) a;
  if cardinality(v_aliases) > 20 then
    raise exception 'Vingt autres écritures au plus par zone.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_aliases) x where length(x) > 80) then
    raise exception 'Une autre écriture fait 80 caractères au plus.' using errcode = '22023';
  end if;

  update public.geo_divisions set name = v_name, aliases = v_aliases where id = p_division;
end;
$$;

-- 3. Supprimer une zone vide -----------------------------------------------------------------------------------------------------

create function public.delete_division(p_division uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  d public.geo_divisions;
  n integer;
begin
  perform public.exiger_admin_session();

  select x.* into d from public.geo_divisions x where x.id = p_division for update;
  if not found then
    raise exception 'Zone introuvable.' using errcode = 'P0002';
  end if;
  if d.level = 0 then
    raise exception 'Un pays ne se supprime pas.' using errcode = '22023';
  end if;

  select count(*)::integer into n from public.geo_divisions c where c.parent_id = p_division;
  if n > 0 then
    raise exception '« % » contient encore % zone(s) : supprime ou garde-les d''abord.', d.name, n using errcode = '22023';
  end if;
  select count(*)::integer into n from public.campuses c where c.division_id = p_division;
  if n > 0 then
    raise exception '« % » contient % école(s), à la corbeille comprise : une zone qui a des écoles ne se supprime pas.', d.name, n
      using errcode = '22023';
  end if;
  select count(*)::integer into n from public.field_submissions s where s.division_id = p_division;
  if n > 0 then
    raise exception '« % » a % relevé(s) de relais : une zone qui en a ne se supprime pas.', d.name, n using errcode = '22023';
  end if;
  select count(*)::integer into n from public.lots l where l.geo_division_id = p_division;
  if n > 0 then
    raise exception '« % » a % lot(s) : une zone qui a un lot ne se supprime pas.', d.name, n using errcode = '22023';
  end if;
  if d.boundary is not null then
    raise exception '« % » a un contour dessiné : ce n''est pas une zone saisie par erreur, elle ne se supprime pas ici.', d.name
      using errcode = '22023';
  end if;
  if d.public_status is not null then
    raise exception '« % » est sur la carte du site : retire-la de la carte d''abord (« Aucun »).', d.name using errcode = '22023';
  end if;
  if d.open_for_fieldwork then
    raise exception '« % » est ouverte aux relais : ferme-la d''abord.', d.name using errcode = '22023';
  end if;

  delete from public.geo_divisions where id = p_division;
  insert into prive.erasures (what, by_user, note)
  values ('zone', (select public.current_user_id()), left(format('Zone supprimée : %s (%s).', d.name, d.path::text), 500));
end;
$$;

revoke all on function public.rename_division(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.delete_division(uuid) from public, anon, authenticated;
grant execute on function public.rename_division(uuid, text, text[]) to authenticated;
grant execute on function public.delete_division(uuid) to authenticated;
