-- La visite sur place, un manque comme les autres (décision du fondateur du 17/11/2026, option B) : une école ajoutée par
-- NTanova, sans passage d'un relais ni confirmation de sa direction, paraît sur la carte en épingle en tirets ; sa fiche
-- d'administration dit « Visite sur place » dans « À compléter », à confier à un relais en un clic. Le passage du relais
-- (`surveyed_at`) ou la confirmation de la direction retire le manque, et l'épingle devient pleine à la mise à jour suivante.

alter domain public.request_topic drop constraint request_topic_check;
alter domain public.request_topic add constraint request_topic_check
  check (value in ('logo', 'frais', 'agrement', 'photos', 'contact', 'admission', 'horaires', 'visite', 'autre'));

create or replace function prive.campus_gaps_for(p_campus uuid)
returns table (topic text, detail text, who_can text[], requested_on date, requested_to text, request_id uuid)
language sql stable security definer set search_path = '' as $$
  with c as (
    select k.id, k.institution_id, k.public_phone, k.surveyed_at, k.verification_state, i.kind
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
    -- ni passage d'un relais ni confirmation de la direction : l'épingle reste en tirets tant qu'un relais n'y est pas allé
    select 'visite', array['relais'] from c where c.surveyed_at is null and c.verification_state <> 'verifiee'
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

comment on function public.campus_gaps(uuid) is
  'Ce qui manque à un site (logo, photos, frais, contact, agrément, visite sur place, et les demandes précisées), qui peut le donner, et « demandé le [date] ».';

-- Le relais lit ce qui manque à sa fiche acceptée : la visite, c'est la sienne ; elle ne lui est jamais dite.
create or replace function public.my_submission_gaps(p_submission uuid)
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
  return query select distinct g.topic from prive.campus_gaps_for(v_campus) g where g.topic <> 'visite';
end;
$$;
