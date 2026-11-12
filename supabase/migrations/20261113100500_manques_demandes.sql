-- M6. « Compléter la fiche » : ce qui manque, et ce qui est demandé (canevas « Compléter », fiche admin, « Une de mes fiches » ; 13/11).
--
-- - `campus_requests` garde chaque demande : à l'école (au retour de WhatsApp : « demandé à l'école le [date] », annulable) ou
--   à un relais (avec sa mission). Elle sert aussi le manque qu'aucun calcul ne voit : « Frais de la 3e, illisible sur le
--   prospectus » (une ligne illisible n'entre jamais dans `campus_fees`, M5).
-- - `campus_gaps(p_campus)` calcule ce qui manque à un site (logo, photos, frais, contact, agrément) et dit, pour chacun, qui
--   peut le donner et s'il est déjà demandé.
-- - Le relais lit seulement les sujets qui manquent à **sa** fiche acceptée (`my_submission_gaps`) : jamais une date, jamais
--   un contact, jamais les demandes elles-mêmes.

create domain public.request_topic as text check (value in ('logo', 'frais', 'agrement', 'photos', 'contact', 'admission', 'horaires', 'autre'));
create domain public.request_target as text check (value in ('ecole', 'relais'));
create domain public.request_state as text check (value in ('ouverte', 'obtenue', 'annulee'));

create table public.campus_requests (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  topic public.request_topic not null,
  detail text check (length(btrim(detail)) between 1 and 120),
  asked_to public.request_target not null,
  mission_id uuid references public.missions (id) on delete set null,
  asked_on date not null,
  state public.request_state not null default 'ouverte',
  created_at timestamptz not null default now(),
  created_by uuid,
  closed_at timestamptz,
  constraint campus_requests_fermee_datee check ((state = 'ouverte') = (closed_at is null)),
  constraint campus_requests_autre_precise check (topic <> 'autre' or detail is not null)
);
comment on table public.campus_requests is
  'Ce que NTanova a demandé pour compléter une fiche : à l''école (WhatsApp, rien ne part tout seul) ou à un relais (mission). Administration seule.';
create index campus_requests_ouvertes on public.campus_requests (campus_id) where state = 'ouverte';
alter table public.campus_requests enable row level security;
create policy "L'administration lit les demandes" on public.campus_requests for select to authenticated
  using ((select public.est_admin()));
revoke all on table public.campus_requests from public, anon, authenticated;
grant select on table public.campus_requests to authenticated;

create function public.record_campus_request(
  p_campus uuid, p_topic public.request_topic, p_detail text, p_asked_to public.request_target, p_mission uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.exiger_gestion_site(p_campus);
  if not exists (select 1 from public.campuses c where c.id = p_campus and c.trashed_at is null) then
    raise exception 'École introuvable.' using errcode = 'P0002';
  end if;
  if p_topic is null or p_asked_to is null or (p_topic = 'autre' and nullif(btrim(p_detail), '') is null) then
    raise exception 'Dis ce qui est demandé (et précise « autre »), et à qui.' using errcode = '22023';
  end if;
  if p_mission is not null and not exists (select 1 from public.missions m where m.id = p_mission and m.campus_id = p_campus) then
    raise exception 'Cette mission ne concerne pas cette école.' using errcode = '22023';
  end if;
  if (p_mission is not null) <> (p_asked_to = 'relais') then
    raise exception 'Une demande à un relais passe par sa mission ; une demande à l''école n''en a pas.' using errcode = '22023';
  end if;
  insert into public.campus_requests (campus_id, topic, detail, asked_to, mission_id, asked_on, created_by)
  values (p_campus, p_topic, nullif(btrim(p_detail), ''), p_asked_to, p_mission,
          (current_timestamp at time zone 'Africa/Brazzaville')::date, public.current_user_id())
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.record_campus_request(uuid, public.request_topic, text, public.request_target, uuid) is
  'Note qu''un manque est demandé, à l''école (au retour de WhatsApp) ou à un relais (avec sa mission).';
revoke all on function public.record_campus_request(uuid, public.request_topic, text, public.request_target, uuid) from public, anon, authenticated;
grant execute on function public.record_campus_request(uuid, public.request_topic, text, public.request_target, uuid) to authenticated;

create function public.close_campus_request(p_request uuid, p_state public.request_state) returns void
language plpgsql security definer set search_path = '' as $$
declare v_campus uuid;
begin
  select r.campus_id into v_campus from public.campus_requests r where r.id = p_request for update;
  if not found then raise exception 'Demande introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(v_campus);
  if p_state is null or p_state = 'ouverte' then
    raise exception 'Une demande se ferme comme obtenue ou annulée.' using errcode = '22023';
  end if;
  update public.campus_requests r set state = p_state, closed_at = now() where r.id = p_request and r.state = 'ouverte';
  if not found then raise exception 'Cette demande est déjà fermée.' using errcode = '22023'; end if;
end;
$$;
comment on function public.close_campus_request(uuid, public.request_state) is 'Ferme une demande : obtenue, ou annulée (« demandé » se défait).';
revoke all on function public.close_campus_request(uuid, public.request_state) from public, anon, authenticated;
grant execute on function public.close_campus_request(uuid, public.request_state) to authenticated;

-- Ce qui manque à un site : un seul calcul, privé ; l'administration et le relais le lisent par leurs fonctions ---------------------------------
create function prive.campus_gaps_for(p_campus uuid)
returns table (topic text, detail text, who_can text[], requested_on date, requested_to text, request_id uuid)
language sql stable security definer set search_path = '' as $$
  with c as (
    select k.id, k.institution_id, k.public_phone, i.kind
    from public.campuses k join public.institutions i on i.id = k.institution_id
    where k.id = p_campus
  ),
  calcules as (
    select 'logo'::text as topic, array['ecole'] as who_can from c
    where not exists (select 1 from public.campus_media m where m.institution_id = c.institution_id and m.kind = 'logo')
    union all
    select 'photos', array['relais', 'ecole'] from c
    where not exists (select 1 from public.campus_media m where m.campus_id = c.id and m.is_public)
      and not exists (select 1 from public.public_campus_photos p where p.campus_id = c.id)
    union all
    select 'frais', array['ecole', 'relais'] from c
    where not exists (select 1 from public.campus_fees f where f.campus_id = c.id)
    union all
    select 'contact', array['ecole'] from c where c.public_phone is null
    union all
    select 'agrement', array['ecole'] from c
    where c.kind in ('privee', 'confessionnelle')
      and not exists (select 1 from public.campus_accreditations a where a.campus_id = c.id and a.program_id is null)
  ),
  ouvertes as (
    select distinct on (r.topic, coalesce(r.detail, '')) r.id, r.topic::text as topic, r.detail, r.asked_on, r.asked_to::text as asked_to
    from public.campus_requests r
    where r.campus_id = p_campus and r.state = 'ouverte'
    order by r.topic, coalesce(r.detail, ''), r.asked_on desc
  )
  select k.topic, o.detail, k.who_can, o.asked_on, o.asked_to, o.id
  from calcules k left join ouvertes o on o.topic = k.topic and o.detail is null
  union all
  -- ce qu'aucun calcul ne voit (une ligne illisible, un sujet précisé) : la demande ouverte suffit
  select o.topic, o.detail, array[o.asked_to], o.asked_on, o.asked_to, o.id
  from ouvertes o
  where o.detail is not null or not exists (select 1 from calcules k where k.topic = o.topic)
$$;
revoke all on function prive.campus_gaps_for(uuid) from public, anon, authenticated;

create function public.campus_gaps(p_campus uuid)
returns table (topic text, detail text, who_can text[], requested_on date, requested_to text, request_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_gestion_site(p_campus);
  return query select * from prive.campus_gaps_for(p_campus);
end;
$$;
comment on function public.campus_gaps(uuid) is
  'Ce qui manque à un site (logo, photos, frais, contact, agrément, et les demandes précisées), qui peut le donner, et « demandé le [date] ».';
revoke all on function public.campus_gaps(uuid) from public, anon, authenticated;
grant execute on function public.campus_gaps(uuid) to authenticated;

create function public.my_submission_gaps(p_submission uuid)
returns table (topic text)
language plpgsql stable security definer set search_path = '' as $$
declare v_campus uuid;
begin
  if not public.est_relais_actif() then
    return;
  end if;
  select s.campus_id into v_campus from public.field_submissions s
  where s.id = p_submission and s.relay_id = (select public.current_user_id()) and s.status = 'accepte';
  if v_campus is null then
    return;
  end if;
  return query select distinct g.topic from prive.campus_gaps_for(v_campus) g;
end;
$$;
comment on function public.my_submission_gaps(uuid) is
  '« Ce qui manque encore » à l''école d''une fiche acceptée du relais connecté : les sujets seulement (ni date, ni contact).';
revoke all on function public.my_submission_gaps(uuid) from public, anon, authenticated;
grant execute on function public.my_submission_gaps(uuid) to authenticated;
