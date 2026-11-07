-- Un choix explicite reste prioritaire ; un retrait explicite (choix nul) désactive le repli.
-- Sans choix, seule une enseigne ou façade contrôlée d'un relevé accepté peut être exposée.
create or replace view public.public_campus_photos with (security_barrier=true) as
select c.id as campus_id,p.id,p.storage_path,p.taken_at
from public.campuses c
left join prive.campus_photo_choices ch on ch.campus_id=c.id
join lateral (
  select ph.id,ph.storage_path,ph.taken_at
  from public.field_submission_photos ph
  join public.field_submissions s on s.id=ph.submission_id
  where s.campus_id=c.id and s.status='accepte'
    and ph.child_free_checked_at is not null
    and ph.role in ('signboard','building')
    and ((ch.campus_id is not null and ph.id=ch.photo_id and ph.is_public)
      or ch.campus_id is null)
  order by ph.taken_at nulls last,ph.id
  limit 1
) p on true
where c.publication='publiee' and c.trashed_at is null;
revoke all on public.public_campus_photos from public,anon,authenticated,service_role;
grant select on public.public_campus_photos to anon,authenticated;
