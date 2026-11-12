-- M7. Les nouvelles d'une école (canevas « Écrire une nouvelle », onglet « Nouvelles » ; décision du 12/11, validée le 13/11).
--
-- - Une table simple : genre, titre (80), texte (400), une image au plus (prise dans `campus_media`, donc contrôlée), date.
-- - **Publiées par l'administration seule**, avec l'accord de l'école (qui, par quel canal, quand), gardé en privé comme pour
--   le mot de la direction. Sans accord, rien ne paraît.
-- - `provided_by_school` décide du libellé : « Nouvelle de l'école » seulement si l'école l'a fournie ; jamais « publié par
--   l'école » quand NTanova l'a écrite.
-- - Une nouvelle se retire, jamais ne s'efface en silence : l'historique reste.

create domain public.post_kind as text check (value in ('evenement', 'inscriptions', 'vie_ecole', 'autre'));
create domain public.post_state as text check (value in ('publiee', 'retiree'));

create table public.campus_posts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  kind public.post_kind not null,
  title text not null check (length(btrim(title)) between 1 and 80),
  body text not null check (length(btrim(body)) between 1 and 400),
  media_id uuid references public.campus_media (id) on delete set null,
  published_on date not null,
  provided_by_school boolean not null,
  state public.post_state not null default 'publiee',
  created_at timestamptz not null default now(),
  created_by uuid,
  withdrawn_at timestamptz,
  constraint campus_posts_retrait_date check ((state = 'retiree') = (withdrawn_at is not null))
);
comment on table public.campus_posts is 'Les nouvelles d''un site (événement, inscriptions, vie de l''école), publiées par l''administration avec l''accord de l''école.';
create index campus_posts_par_site on public.campus_posts (campus_id, published_on desc) where state = 'publiee';
alter table public.campus_posts enable row level security;
create policy "L'administration lit les nouvelles" on public.campus_posts for select to authenticated
  using ((select public.est_admin()));
revoke all on table public.campus_posts from public, anon, authenticated;
grant select on table public.campus_posts to authenticated;

create table prive.post_agreements (
  id bigint generated always as identity primary key,
  post_id uuid not null,
  campus_id uuid not null,
  action text not null check (action in ('publication', 'modification', 'retrait')),
  agreed_role public.fonction_direction,
  channel text check (channel in ('whatsapp', 'appel', 'sur_place', 'autre')),
  agreed_on date,
  snapshot jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid,
  constraint post_agreements_accord_complet check (action = 'retrait' or (agreed_role is not null and channel is not null and agreed_on is not null))
);
revoke all on table prive.post_agreements from public, anon, authenticated;

create view public.public_campus_posts with (security_barrier = true) as
select p.id, p.campus_id, p.kind::text as kind, p.title, p.body, p.published_on, p.provided_by_school,
       m.storage_path as media_path, m.thumb_path as media_thumb_path, m.caption as media_caption
from public.campus_posts p
join public.campuses c on c.id = p.campus_id
left join public.campus_media m on m.id = p.media_id and m.is_public
where p.state = 'publiee' and c.publication = 'publiee' and c.trashed_at is null;
comment on view public.public_campus_posts is 'Les nouvelles publiées des sites publiés, avec leur image si elle est publique.';
revoke all on table public.public_campus_posts from public, anon, authenticated;
grant select on table public.public_campus_posts to anon, authenticated;

create function public.set_campus_post(
  p_campus uuid, p_post uuid, p_kind public.post_kind, p_title text, p_body text, p_media uuid, p_published_on date,
  p_provided_by_school boolean, p_role public.fonction_direction, p_channel text, p_agreed_on date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_today date := (current_timestamp at time zone 'Africa/Brazzaville')::date;
  v_after jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if not exists (select 1 from public.campuses c where c.id = p_campus and c.trashed_at is null) then
    raise exception 'École introuvable.' using errcode = 'P0002';
  end if;
  if p_kind is null or nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null
     or length(btrim(p_title)) > 80 or length(btrim(p_body)) > 400 or p_published_on is null or p_provided_by_school is null then
    raise exception 'Le genre, un titre (80 caractères au plus), un texte (400 au plus) et la date sont requis.' using errcode = '22023';
  end if;
  if p_role is null or p_channel is null or p_channel not in ('whatsapp', 'appel', 'sur_place', 'autre')
     or p_agreed_on is null or p_agreed_on > v_today then
    raise exception 'L''accord de l''école est requis : qui, par quel canal, et quand. Sans accord, rien ne paraît.' using errcode = '22023';
  end if;
  if p_media is not null and not exists (
    select 1 from public.campus_media m where m.id = p_media and m.campus_id = p_campus and m.is_public
  ) then
    raise exception 'L''image doit être une image publique de ce site (contrôlée, sans enfant reconnaissable).' using errcode = '22023';
  end if;
  if p_post is null then
    insert into public.campus_posts (campus_id, kind, title, body, media_id, published_on, provided_by_school, created_by)
    values (p_campus, p_kind, btrim(p_title), btrim(p_body), p_media, p_published_on, p_provided_by_school, public.current_user_id())
    returning id, to_jsonb(campus_posts) into v_id, v_after;
  else
    update public.campus_posts p set kind = p_kind, title = btrim(p_title), body = btrim(p_body), media_id = p_media,
      published_on = p_published_on, provided_by_school = p_provided_by_school
    where p.id = p_post and p.campus_id = p_campus and p.state = 'publiee'
    returning p.id, to_jsonb(p) into v_id, v_after;
    if not found then raise exception 'Nouvelle introuvable ou retirée.' using errcode = 'P0002'; end if;
  end if;
  insert into prive.post_agreements (post_id, campus_id, action, agreed_role, channel, agreed_on, snapshot, recorded_by)
  values (v_id, p_campus, case when p_post is null then 'publication' else 'modification' end,
          p_role, p_channel, p_agreed_on, v_after, public.current_user_id());
  return v_id;
end;
$$;
comment on function public.set_campus_post(uuid, uuid, public.post_kind, text, text, uuid, date, boolean, public.fonction_direction, text, date) is
  'Publie ou modifie une nouvelle d''un site, avec l''accord de l''école (fonction, canal, date), gardé en privé.';
revoke all on function public.set_campus_post(uuid, uuid, public.post_kind, text, text, uuid, date, boolean, public.fonction_direction, text, date) from public, anon, authenticated;
grant execute on function public.set_campus_post(uuid, uuid, public.post_kind, text, text, uuid, date, boolean, public.fonction_direction, text, date) to authenticated;

create function public.withdraw_campus_post(p_post uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.campus_posts;
begin
  select x.* into p from public.campus_posts x where x.id = p_post for update;
  if not found then raise exception 'Nouvelle introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(p.campus_id);
  if p.state = 'retiree' then raise exception 'Cette nouvelle est déjà retirée.' using errcode = '22023'; end if;
  update public.campus_posts x set state = 'retiree', withdrawn_at = now() where x.id = p_post;
  insert into prive.post_agreements (post_id, campus_id, action, snapshot, recorded_by)
  values (p.id, p.campus_id, 'retrait', to_jsonb(p), public.current_user_id());
end;
$$;
comment on function public.withdraw_campus_post(uuid) is 'Retire une nouvelle du site public ; elle reste dans l''historique.';
revoke all on function public.withdraw_campus_post(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_campus_post(uuid) to authenticated;
