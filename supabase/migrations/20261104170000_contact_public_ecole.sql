-- Contact public de l'école (ticket 104) : distinct des contacts privés et du badge.
-- Aucun numéro réel ni accord existant n'est copié automatiquement.
alter table public.campuses
  add column public_phone public.telephone,
  add column public_phone_agreed_on date,
  add constraint campuses_contact_public_avec_accord check ((public_phone is null) = (public_phone_agreed_on is null));

create table prive.public_contact_agreements (
  id bigint generated always as identity primary key,
  campus_id uuid not null references public.campuses(id),
  phone public.telephone,
  agreed_on date,
  agreed_role public.fonction_direction,
  channel text check (channel in ('whatsapp', 'appel', 'sur_place', 'autre')),
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  constraint public_contact_accord_complet check (
    (phone is null and agreed_on is null and agreed_role is null and channel is null)
    or (phone is not null and agreed_on is not null and agreed_role is not null and channel is not null)
  )
);
comment on table prive.public_contact_agreements is 'Accords explicites de publication et retraits du contact public. Preuve privée, indépendante du badge et du contact privé de direction.';
alter table prive.public_contact_agreements enable row level security;
revoke all on prive.public_contact_agreements from public, anon, authenticated;
revoke all on sequence prive.public_contact_agreements_id_seq from public, anon, authenticated;

-- L'API admin possède déjà UPDATE sur campuses : interdire le contournement de la commande d'accord.
-- Dans la commande SECURITY DEFINER, current_user est le propriétaire, pas authenticated.
create function prive.proteger_contact_public() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') and (
    (tg_op = 'INSERT' and (new.public_phone is not null or new.public_phone_agreed_on is not null))
    or (tg_op = 'UPDATE' and (new.public_phone is distinct from old.public_phone
      or new.public_phone_agreed_on is distinct from old.public_phone_agreed_on))
  ) then
    raise exception 'Utiliser la commande d’accord de publication du contact.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function prive.proteger_contact_public() from public, anon, authenticated;
create trigger campuses_proteger_contact_public before insert or update on public.campuses
  for each row execute function prive.proteger_contact_public();

create function public.set_school_public_contact(
  p_campus uuid, p_phone public.telephone, p_agreed_on date,
  p_role public.fonction_direction, p_channel text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_phone is null then
    if p_agreed_on is not null or p_role is not null or p_channel is not null then
      raise exception 'Le retrait ne contient aucun nouvel accord.' using errcode = '22023';
    end if;
  elsif p_agreed_on is null or p_agreed_on > (current_timestamp at time zone 'Africa/Brazzaville')::date
    or p_role is null or p_channel is null or p_channel not in ('whatsapp', 'appel', 'sur_place', 'autre')
    or (p_phone like '242%' and length(p_phone) <> 12) then
    raise exception 'Numéro, date réelle, fonction et canal de l’accord de publication sont requis.' using errcode = '22023';
  end if;
  update public.campuses set public_phone = p_phone, public_phone_agreed_on = p_agreed_on,
    updated_at = now() where id = p_campus;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  insert into prive.public_contact_agreements(campus_id, phone, agreed_on, agreed_role, channel, recorded_by)
    values(p_campus, p_phone, p_agreed_on, p_role, p_channel, public.current_user_id());
end;
$$;
revoke all on function public.set_school_public_contact(uuid, public.telephone, date, public.fonction_direction, text) from public, anon, authenticated;
grant execute on function public.set_school_public_contact(uuid, public.telephone, date, public.fonction_direction, text) to authenticated;

-- Colonnes ajoutées à la fin, droits et filtre de publication conservés.
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
  c.public_phone_agreed_on
from public.campuses c
join public.institutions i on i.id = c.institution_id
join public.geo_divisions d on d.id = c.division_id
where c.publication = 'publiee';
