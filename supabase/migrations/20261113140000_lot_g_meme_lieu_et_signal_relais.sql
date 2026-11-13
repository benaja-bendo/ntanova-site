-- M11. Lot G (13/11/2026) : « Même lieu », et le signal des relais.
--
-- 1. **« Même lieu »** (décision du fondateur, 13/11) : deux écoles distinctes partagent un portail ou un bâtiment. Choisir
--    « Même lieu » dans « Est-ce une école connue ? » crée bien une **nouvelle école** (`new_institution`), jamais une fusion, et
--    note sur son site `same_place_as_campus_id`, le site voisin. La fiche publique dit « Même lieu que [l'école voisine] »
--    quand celle-ci est publiée ; la liste des écoles de l'admin le dit toujours. `set_campus_same_place` le pose ou le retire.
--    Le verdict de `similar_schools` suit la planche « Est-ce une école connue ? » : un **autre nom** à moins de 100 m est
--    « une école voisine » (et non plus « déjà dans la base ») ; c'est là que « Même lieu » se propose. Un nom proche à
--    moins de 500 m reste « déjà dans la base » (l'imprécision du GPS).
-- 2. **Le signal des relais** : `relay_counters` gagne, à la fin (les colonnes d'avant ne changent pas), les fiches envoyées
--    depuis 7 jours et les « position trop longue » du journal des téléphones sur la même semaine. L'écran Relais met en avant
--    les actifs de la semaine et replie les autres.

-- 1. « Même lieu » -----------------------------------------------------------------------------------------------------------------------------------
alter table public.campuses
  add column same_place_as_campus_id uuid references public.campuses (id) on delete set null,
  add constraint campuses_meme_lieu_pas_soi_meme check (same_place_as_campus_id is distinct from id);
comment on column public.campuses.same_place_as_campus_id is
  'Une autre école au même endroit (même portail, même bâtiment) : deux écoles distinctes, jamais fusionnées (lot G, 13/11).';

create function public.set_campus_same_place(p_campus uuid, p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_other is not null and p_other = p_campus then
    raise exception 'Une école n''est pas « au même lieu » qu''elle-même.' using errcode = '22023';
  end if;
  if p_other is not null and not exists (select 1 from public.campuses c where c.id = p_other) then
    raise exception 'L''école voisine est introuvable.' using errcode = 'P0002';
  end if;
  update public.campuses set same_place_as_campus_id = p_other, updated_at = now() where id = p_campus;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
end;
$$;
comment on function public.set_campus_same_place(uuid, uuid) is
  'Note (ou retire, avec null) l''école voisine au même lieu. Réservée à l''administration.';
revoke all on function public.set_campus_same_place(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_campus_same_place(uuid, uuid) to authenticated;

-- La fiche publique : le nom et le numéro (son lien court) de l'école voisine, seulement si elle est publiée (colonnes ajoutées à la fin).
create or replace view public.public_campuses with (security_invoker = true) as
select
  c.id,
  c.institution_id,
  i.name as institution_name,
  c.label,
  i.kind,
  c.slug,
  c.division_id,
  d.path::text as division_path,
  (select array_agg(a.slug::text order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_slugs,
  (select array_agg(a.name order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_names,
  c.neighbourhood,
  c.landmark,
  c.sign_phone,
  extensions.st_y(c.position) as latitude,
  extensions.st_x(c.position) as longitude,
  c.verification_state,
  c.verified_on,
  c.curriculum_note,
  c.surveyed_at,
  c.located_at,
  c.origin,
  c.updated_at,
  c.public_phone,
  c.public_phone_agreed_on,
  c.school_declared_on,
  c.public_number,
  i.acronym as institution_acronym,
  i.founded_year,
  i.website_url,
  c.shifts::text[] as shifts,
  c.teaching_languages::text[] as teaching_languages,
  c.profile_declared_on,
  c.profile_source,
  sp.public_number as same_place_number,
  case when sp.id is not null then coalesce(spi.name || ' — ' || sp.label, spi.name) end as same_place_name
from public.campuses c
join public.institutions i on i.id = c.institution_id
join public.geo_divisions d on d.id = c.division_id
left join public.campuses sp
  on sp.id = c.same_place_as_campus_id and sp.publication = 'publiee' and sp.trashed_at is null
left join public.institutions spi on spi.id = sp.institution_id
where c.publication = 'publiee';

-- Le verdict : un autre nom tout près est une voisine, plus « déjà dans la base » (la planche du canevas).
create or replace function public.similar_schools(
  p_name text, p_latitude double precision default null, p_longitude double precision default null,
  p_exclude_submission uuid default null
) returns table (
  kind text, id uuid, institution_id uuid, name text, acronym text, state text,
  distance_m integer, similarity real, verdict text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_core text := public.school_name_core(p_name);
  v_point extensions.geography;
begin
  perform public.exiger_admin_session();
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Une position se donne avec sa latitude et sa longitude.' using errcode = '22023';
  end if;
  if p_latitude is not null then
    v_point := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  end if;

  return query
  with candidats as (
    select 'campus'::text as kind, c.id, c.institution_id, i.name || coalesce(' — ' || c.label, '') as name, i.acronym,
           c.publication::text as state,
           case when v_point is not null and c.position is not null
                then extensions.st_distance(v_point, c.position::extensions.geography)::integer end as distance_m,
           case when v_core = '' or public.school_name_core(i.name) = '' then 0::real
                else extensions.similarity(v_core, public.school_name_core(i.name)) end as similarity
    from public.campuses c join public.institutions i on i.id = c.institution_id
    where c.publication <> 'retiree' and c.trashed_at is null
    union all
    select 'submission', s.id, null, s.sign_name, s.acronym, s.status::text,
           case when v_point is not null and s.position is not null
                then extensions.st_distance(v_point, s.position::extensions.geography)::integer end,
           case when v_core = '' or public.school_name_core(s.sign_name) = '' then 0::real
                else extensions.similarity(v_core, public.school_name_core(s.sign_name)) end
    from public.field_submissions s
    where s.status in ('a_valider', 'a_corriger') and s.id is distinct from p_exclude_submission
  ),
  jugés as (
    select k.*, case
      when k.distance_m is not null and k.distance_m <= 500 and k.similarity >= 0.45 then 'deja_la'
      when k.similarity >= 0.45 then 'autre_site'
      when k.distance_m is not null and k.distance_m <= 500 then 'voisine'
    end as verdict
    from candidats k
  )
  select j.kind, j.id, j.institution_id, j.name, j.acronym, j.state, j.distance_m, j.similarity, j.verdict
  from jugés j
  where j.verdict is not null
  order by case j.verdict when 'deja_la' then 0 when 'autre_site' then 1 else 2 end, j.distance_m nulls last, j.similarity desc
  limit 10;
end;
$$;

-- 2. Le signal des relais ------------------------------------------------------------------------------------------------------------------------------
create or replace view public.relay_counters with (security_invoker = true) as
select
  rl.id as relay_id,
  rl.prenom as first_name,
  rl.statut as status,
  l.nom as batch,
  count(s.id)::integer as sent,
  (count(s.id) filter (where s.status = 'a_valider'))::integer as to_review,
  (count(s.id) filter (where s.status = 'a_corriger'))::integer as to_correct,
  (count(s.id) filter (where s.status = 'accepte' and s.kind <> 'correction'))::integer as accepted,
  (count(s.id) filter (where s.status = 'refuse'))::integer as refused,
  (count(s.id) filter (where s.contact_confirmed_at is not null))::integer as contacts_confirmed,
  (count(s.id) filter (where s.received_at >= now() - interval '7 days'))::integer as sent_week,
  (select count(*)::integer from public.erreurs e
    where e.relais_id = rl.id and e.code = 'position_trop_longue'
      and e.survenue_le >= now() - interval '7 days') as slow_position_week
from public.relais rl
left join public.lots l on l.id = rl.lot_id
left join public.field_submissions s on s.relay_id = rl.id
group by rl.id, rl.prenom, rl.statut, l.nom;
