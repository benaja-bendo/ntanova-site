-- Une enseigne sélectionnée par campus. Aucun fichier existant n'est rendu public.
create table prive.campus_photo_choices (
  campus_id uuid primary key references public.campuses(id),
  photo_id uuid references public.field_submission_photos(id) on delete set null
);
create table prive.public_photo_history (
  id bigint generated always as identity primary key,
  campus_id uuid not null references public.campuses(id),
  photo_id uuid,
  previous_photo_id uuid,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null
);
alter table prive.campus_photo_choices enable row level security;
alter table prive.public_photo_history enable row level security;
revoke all on prive.campus_photo_choices,prive.public_photo_history from public,anon,authenticated,service_role;
revoke all on sequence prive.public_photo_history_id_seq from public,anon,authenticated,service_role;

-- La vue propriétaire évite de donner au public accès aux relevés ou aux photos privées.
-- Colonnes et filtre stricts : aucune donnée de relais, de contact ou de contrôle interne.
create view public.public_campus_photos with (security_barrier=true) as
select c.id as campus_id,p.id,p.storage_path,p.taken_at
from prive.campus_photo_choices ch
join public.campuses c on c.id=ch.campus_id
join public.field_submission_photos p on p.id=ch.photo_id
join public.field_submissions s on s.id=p.submission_id and s.campus_id=c.id
where c.publication='publiee' and s.status='accepte' and p.role='signboard'
  and p.is_public and p.child_free_checked_at is not null;
revoke all on public.public_campus_photos from public,anon,authenticated,service_role;
grant select on public.public_campus_photos to anon,authenticated;

create function prive.proteger_selection_photo() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and new.is_public) or (tg_op='UPDATE' and new.is_public is distinct from old.is_public)) then
    raise exception 'Utiliser la sélection de photo publique.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function prive.proteger_selection_photo() from public,anon,authenticated;
create trigger photos_proteger_selection before insert or update on public.field_submission_photos
for each row execute function prive.proteger_selection_photo();

create function public.set_campus_public_photo(p_campus uuid,p_photo uuid,p_confirmed boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare v_previous uuid;
begin
  perform public.exiger_admin_session();
  perform 1 from public.campuses where id=p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode='P0002';end if;
  if p_photo is not null then
    if p_confirmed is distinct from true then
      raise exception 'Confirme le contrôle sans enfant ni donnée personnelle et la publication.' using errcode='22023';
    end if;
    if not exists(select 1 from public.field_submission_photos p join public.field_submissions s on s.id=p.submission_id
      where p.id=p_photo and p.role='signboard' and s.campus_id=p_campus and s.status='accepte') then
      raise exception 'Choisis une enseigne issue d’un relevé accepté de cette école.' using errcode='22023';
    end if;
  end if;
  select photo_id into v_previous from prive.campus_photo_choices where campus_id=p_campus;
  update public.field_submission_photos set is_public=false where id=v_previous;
  if p_photo is not null then
    update public.field_submission_photos set is_public=true,child_free_checked_at=clock_timestamp() where id=p_photo;
  end if;
  insert into prive.campus_photo_choices(campus_id,photo_id) values(p_campus,p_photo)
    on conflict(campus_id) do update set photo_id=excluded.photo_id;
  insert into prive.public_photo_history(campus_id,photo_id,previous_photo_id,recorded_by)
    values(p_campus,p_photo,v_previous,public.current_user_id());
end;
$$;
revoke all on function public.set_campus_public_photo(uuid,uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_campus_public_photo(uuid,uuid,boolean) to authenticated;
