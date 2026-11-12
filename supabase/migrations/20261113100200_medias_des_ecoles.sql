-- M3. Les médias d'une école : logo, couverture, galerie (canevas « Fiche d'école », 12/11/2026 ; validé le 13/11).
--
-- Avant : une école n'avait pas de photos à elle. La seule photo publique était une enseigne ou une façade choisie parmi ses
-- relevés (`prive.campus_photo_choices`, une par école), lue par le site dans `public_campus_photos`.
-- Maintenant : `campus_media`, une ligne par image de l'école. Un logo appartient à l'école (`institution_id`) ; une couverture
-- et la galerie appartiennent à un site (`campus_id`). Une image vient d'un relevé accepté (`source_photo_id`), ou d'un
-- fichier ajouté par l'administration (plus tard, par l'école), rangé dans le seau `releves` sous `ecoles/<site>/`.
--
-- Règles écrites dans la base :
-- - une image n'est publique qu'après le contrôle « aucun enfant, aucune personne reconnaissable » (`child_free_checked_at`) ;
-- - **une photo de travail (prospectus, programmes, affiche d'inscription) n'entre jamais** : le déclencheur refuse une photo
--   de relevé dont le rôle n'est pas publiable (`photo_role_is_public`, M2), et `media_subject` ne connaît que des lieux ;
-- - un logo par école, une couverture par site, douze images de galerie par site au plus.
--
-- Transition, sans rien casser en ligne (demande du fondateur du 13/11) : **`public_campus_photos` ne change pas** et reste la
-- source de la photo du site en production ; `set_campus_public_photo` tient en plus la couverture de `campus_media` à jour.
-- Les six choix existants y sont repris. Le site passera à `public_campus_media` avec son lot ; la vue ancienne partira après.
--
-- `peut_gerer_site(p_campus)` naît ici : elle vaut `est_admin()` aujourd'hui ; les comptes d'école (étape C) l'élargiront.
-- Toutes les fonctions nouvelles des migrations M3 à M8 passent par elle.

-- Qui gère une école ------------------------------------------------------------------------------------------------------------------------------
create function public.peut_gerer_site(p_campus uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- Étape C : ajouter ici les comptes de la direction (accord vérifié), sans toucher aux fonctions qui l'appellent.
  select public.est_admin() and p_campus is not null
$$;
comment on function public.peut_gerer_site(uuid) is
  'Qui peut modifier la fiche d''un site : l''administration aujourd''hui. Les comptes d''école (étape C) s''ajouteront ici.';
revoke all on function public.peut_gerer_site(uuid) from public, anon, authenticated;
grant execute on function public.peut_gerer_site(uuid) to authenticated;

create function public.exiger_gestion_site(p_campus uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.peut_gerer_site(p_campus) then
    -- La session du propriétaire de la base (migrations, tests) garde la main, comme pour `exiger_admin_session`.
    perform public.exiger_admin_session();
  end if;
end;
$$;
revoke all on function public.exiger_gestion_site(uuid) from public, anon, authenticated;
grant execute on function public.exiger_gestion_site(uuid) to authenticated;

-- Les listes ---------------------------------------------------------------------------------------------------------------------------------------
create domain public.media_kind as text check (value in ('logo', 'cover', 'gallery'));
create domain public.media_subject as text check (value in ('logo', 'enseigne', 'portail', 'batiment', 'cour', 'salle', 'terrain', 'activite', 'autre'));
create domain public.media_source as text check (value in ('terrain', 'ecole', 'administration'));

-- La table -----------------------------------------------------------------------------------------------------------------------------------------
create table public.campus_media (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid references public.institutions (id) on delete cascade,
  campus_id uuid references public.campuses (id) on delete cascade,
  kind public.media_kind not null,
  subject public.media_subject not null,
  storage_path text not null
    check (storage_path ~ '^[a-z0-9][a-z0-9_./-]{0,200}$' and storage_path !~ '(\.\.|//|supabase|https?)'),
  thumb_path text
    check (thumb_path ~ '^[a-z0-9][a-z0-9_./-]{0,200}$' and thumb_path !~ '(\.\.|//|supabase|https?)'),
  mime text not null default 'image/webp' check (mime in ('image/webp', 'image/jpeg', 'image/png')),
  width smallint check (width > 0),
  height smallint check (height > 0),
  caption text check (length(btrim(caption)) between 1 and 60),
  sort_order smallint not null default 0,
  source public.media_source not null,
  source_photo_id uuid references public.field_submission_photos (id) on delete cascade,
  taken_at timestamptz,
  child_free_checked_at timestamptz,
  checked_by uuid,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint campus_media_un_seul_proprietaire check ((institution_id is null) <> (campus_id is null)),
  constraint campus_media_logo_a_l_ecole check ((kind = 'logo') = (institution_id is not null)),
  constraint campus_media_logo_sujet check ((kind = 'logo') = (subject = 'logo')),
  constraint campus_media_publique_controlee check (not is_public or child_free_checked_at is not null),
  constraint campus_media_terrain_vient_d_un_releve check ((source = 'terrain') = (source_photo_id is not null))
);
comment on table public.campus_media is
  'Les images d''une école : logo (à l''école), couverture et galerie (à un site). Publique seulement après le contrôle « sans enfant ». Jamais une photo de travail.';
create unique index campus_media_un_logo on public.campus_media (institution_id) where kind = 'logo';
create unique index campus_media_une_couverture on public.campus_media (campus_id) where kind = 'cover';
create unique index campus_media_photo_une_fois on public.campus_media (campus_id, source_photo_id) where source_photo_id is not null;
create index campus_media_par_site on public.campus_media (campus_id, kind, sort_order);

-- Une image de relevé : un lieu (jamais une photo de travail), d'un relevé accepté de ce site ; une galerie de douze au plus ---------------------
create function public.campus_media_avant_ecriture() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.field_submission_photos;
  v_campus uuid;
  v_status text;
begin
  if new.source_photo_id is not null then
    select x.* into p from public.field_submission_photos x where x.id = new.source_photo_id;
    select s.campus_id, s.status into v_campus, v_status from public.field_submissions s where s.id = p.submission_id;
    if not public.photo_role_is_public(p.role) then
      raise exception 'Une photo de travail (prospectus, programmes, affiche) ne devient jamais une image de l''école.' using errcode = '22023';
    end if;
    if v_status <> 'accepte' or v_campus is distinct from new.campus_id then
      raise exception 'La photo doit venir d''un relevé accepté de ce site.' using errcode = '22023';
    end if;
    if new.storage_path <> p.storage_path then
      raise exception 'Une image de relevé garde le chemin de sa photo.' using errcode = '22023';
    end if;
  elsif new.storage_path !~ '^ecoles/' or (new.thumb_path is not null and new.thumb_path !~ '^ecoles/') then
    raise exception 'Un fichier ajouté se range sous ecoles/.' using errcode = '22023';
  end if;
  if new.kind = 'gallery' and (tg_op = 'INSERT' or old.kind <> 'gallery') and (
    select count(*) from public.campus_media m where m.campus_id = new.campus_id and m.kind = 'gallery' and m.id <> new.id
  ) >= 12 then
    raise exception 'Douze images au plus dans la galerie d''un site.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger campus_media_avant_ecriture before insert or update on public.campus_media
  for each row execute function public.campus_media_avant_ecriture();

-- Les droits : l'administration lit la table ; personne n'y écrit directement ; le public lit la vue -----------------------------------------------
alter table public.campus_media enable row level security;
create policy "L'administration lit les médias des écoles" on public.campus_media for select to authenticated
  using ((select public.est_admin()));
revoke all on table public.campus_media from public, anon, authenticated;
grant select on table public.campus_media to authenticated;

create table prive.campus_media_history (
  id bigint generated always as identity primary key,
  media_id uuid not null,
  campus_id uuid,
  institution_id uuid,
  action text not null check (action in ('ajout', 'modification', 'retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default now(),
  recorded_by uuid
);
revoke all on table prive.campus_media_history from public, anon, authenticated;

create view public.public_campus_media with (security_barrier = true) as
select m.id, m.campus_id, m.institution_id, m.kind::text as kind, m.subject::text as subject,
       m.storage_path, m.thumb_path, m.width, m.height, m.caption, m.sort_order, m.taken_at
from public.campus_media m
where m.is_public
  and (
    (m.campus_id is not null and exists (
       select 1 from public.campuses c where c.id = m.campus_id and c.publication = 'publiee' and c.trashed_at is null))
    or (m.institution_id is not null and exists (
       select 1 from public.campuses c where c.institution_id = m.institution_id and c.publication = 'publiee' and c.trashed_at is null))
  );
comment on view public.public_campus_media is
  'Les images publiques des écoles publiées : logo (par école), couverture et galerie (par site), avec légende et ordre.';
revoke all on table public.public_campus_media from public, anon, authenticated;
grant select on table public.public_campus_media to anon, authenticated;

-- Les gestes de l'administration ------------------------------------------------------------------------------------------------------------------
create function public.add_campus_media(
  p_campus uuid, p_kind public.media_kind, p_subject public.media_subject,
  p_source_photo uuid default null, p_storage_path text default null, p_thumb_path text default null,
  p_mime text default null, p_width integer default null, p_height integer default null,
  p_caption text default null, p_checked boolean default false, p_public boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_institution uuid;
  v_photo public.field_submission_photos;
  v_id uuid;
  v_after jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  select c.institution_id into v_institution from public.campuses c where c.id = p_campus and c.trashed_at is null for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if (p_source_photo is null) = (p_storage_path is null) then
    raise exception 'Une image vient d''une photo de relevé, ou d''un fichier ajouté : l''un ou l''autre.' using errcode = '22023';
  end if;
  if p_public and not coalesce(p_checked, false) then
    raise exception 'Contrôle d''abord l''image (aucun enfant, aucune personne reconnaissable) avant de la publier.' using errcode = '22023';
  end if;
  if p_kind = 'logo' and p_source_photo is not null then
    raise exception 'Un logo est un fichier remis par l''école, pas une photo de relevé.' using errcode = '22023';
  end if;
  if p_kind = 'logo' and exists (select 1 from public.campus_media m where m.institution_id = v_institution and m.kind = 'logo') then
    raise exception 'Cette école a déjà un logo : retire-le d''abord.' using errcode = '22023';
  end if;
  if p_kind = 'cover' and exists (select 1 from public.campus_media m where m.campus_id = p_campus and m.kind = 'cover') then
    raise exception 'Ce site a déjà une couverture : retire-la d''abord.' using errcode = '22023';
  end if;
  if p_source_photo is not null then
    select x.* into v_photo from public.field_submission_photos x where x.id = p_source_photo;
    if not found then raise exception 'Photo introuvable.' using errcode = 'P0002'; end if;
  end if;

  insert into public.campus_media (
    institution_id, campus_id, kind, subject, storage_path, thumb_path, mime, width, height, caption, sort_order,
    source, source_photo_id, taken_at, child_free_checked_at, checked_by, is_public, created_by
  ) values (
    case when p_kind = 'logo' then v_institution end,
    case when p_kind = 'logo' then null else p_campus end,
    p_kind, case when p_kind = 'logo' then 'logo' else p_subject end,
    coalesce(v_photo.storage_path, p_storage_path), p_thumb_path,
    coalesce(v_photo.mime, p_mime, 'image/webp'), coalesce(v_photo.width, p_width), coalesce(v_photo.height, p_height),
    nullif(btrim(p_caption), ''),
    coalesce((select max(m.sort_order) + 1 from public.campus_media m where m.campus_id = p_campus and m.kind = 'gallery'), 0),
    case when p_source_photo is not null then 'terrain' else 'administration' end,
    p_source_photo, v_photo.taken_at,
    case when p_checked then clock_timestamp() end, case when p_checked then public.current_user_id() end,
    coalesce(p_public, false), public.current_user_id()
  ) returning id, to_jsonb(campus_media) into v_id, v_after;

  insert into prive.campus_media_history (media_id, campus_id, institution_id, action, after_data, recorded_by)
  values (v_id, p_campus, v_institution, 'ajout', v_after, public.current_user_id());
  return v_id;
end;
$$;
comment on function public.add_campus_media(uuid, public.media_kind, public.media_subject, uuid, text, text, text, integer, integer, text, boolean, boolean) is
  'Ajoute une image à une école : une photo de lieu d''un relevé accepté, ou un fichier rangé sous ecoles/<site>/. Le logo va à l''école.';
revoke all on function public.add_campus_media(uuid, public.media_kind, public.media_subject, uuid, text, text, text, integer, integer, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.add_campus_media(uuid, public.media_kind, public.media_subject, uuid, text, text, text, integer, integer, text, boolean, boolean) to authenticated;

create function public.set_campus_media(
  p_media uuid, p_caption text default null, p_sort_order integer default null,
  p_checked boolean default null, p_public boolean default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.campus_media;
  v_campus uuid;
  v_after jsonb;
begin
  select x.* into m from public.campus_media x where x.id = p_media for update;
  if not found then raise exception 'Image introuvable.' using errcode = 'P0002'; end if;
  v_campus := coalesce(m.campus_id, (select c.id from public.campuses c where c.institution_id = m.institution_id order by c.created_at limit 1));
  perform public.exiger_gestion_site(v_campus);
  update public.campus_media x set
    caption = case when p_caption is null then x.caption else nullif(btrim(p_caption), '') end,
    sort_order = coalesce(p_sort_order, x.sort_order),
    child_free_checked_at = case when p_checked is null then x.child_free_checked_at
                                 when p_checked then coalesce(x.child_free_checked_at, clock_timestamp()) end,
    checked_by = case when p_checked is null then x.checked_by when p_checked then coalesce(x.checked_by, public.current_user_id()) end,
    is_public = coalesce(p_public, x.is_public) and (case when p_checked is null then x.child_free_checked_at is not null else p_checked end)
  where x.id = p_media
  returning to_jsonb(x) into v_after;
  if coalesce(p_public, false) and not (v_after ->> 'is_public')::boolean then
    raise exception 'Contrôle d''abord l''image (aucun enfant, aucune personne reconnaissable) avant de la publier.' using errcode = '22023';
  end if;
  insert into prive.campus_media_history (media_id, campus_id, institution_id, action, before_data, after_data, recorded_by)
  values (m.id, m.campus_id, m.institution_id, 'modification', to_jsonb(m), v_after, public.current_user_id());
end;
$$;
comment on function public.set_campus_media(uuid, text, integer, boolean, boolean) is
  'Légende, ordre, contrôle « sans enfant » et publication d''une image. Retirer le contrôle la retire du public.';
revoke all on function public.set_campus_media(uuid, text, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.set_campus_media(uuid, text, integer, boolean, boolean) to authenticated;

create function public.withdraw_campus_media(p_media uuid) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  m public.campus_media;
  v_campus uuid;
begin
  select x.* into m from public.campus_media x where x.id = p_media for update;
  if not found then raise exception 'Image introuvable.' using errcode = 'P0002'; end if;
  v_campus := coalesce(m.campus_id, (select c.id from public.campuses c where c.institution_id = m.institution_id order by c.created_at limit 1));
  perform public.exiger_gestion_site(v_campus);
  delete from public.campus_media x where x.id = p_media;
  insert into prive.campus_media_history (media_id, campus_id, institution_id, action, before_data, recorded_by)
  values (m.id, m.campus_id, m.institution_id, 'retrait', to_jsonb(m), public.current_user_id());
  -- Les fichiers à effacer du stockage : seulement ceux ajoutés par l'administration ; une photo de relevé reste au relevé.
  return case when m.source_photo_id is null then array_remove(array[m.storage_path, m.thumb_path], null) else '{}'::text[] end;
end;
$$;
comment on function public.withdraw_campus_media(uuid) is
  'Retire une image de l''école. Rend les chemins des fichiers ajoutés à effacer du stockage (rien pour une photo de relevé, qui reste au relevé).';
revoke all on function public.withdraw_campus_media(uuid) from public, anon, authenticated;
grant execute on function public.withdraw_campus_media(uuid) to authenticated;

-- La photo publique d'aujourd'hui tient la couverture à jour (transition) -------------------------------------------------------------------------
create or replace function public.set_campus_public_photo(p_campus uuid, p_photo uuid, p_confirmed boolean default false)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_previous uuid;
  v_photo public.field_submission_photos;
begin
  perform public.exiger_admin_session();
  perform 1 from public.campuses where id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if p_photo is not null then
    if p_confirmed is distinct from true then
      raise exception 'Confirme le contrôle sans enfant ni donnée personnelle et la publication.' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.field_submission_photos p join public.field_submissions s on s.id = p.submission_id
      where p.id = p_photo and p.role in ('signboard', 'building') and s.campus_id = p_campus and s.status = 'accepte'
    ) then
      raise exception 'Choisis une enseigne ou une vue du bâtiment issue d’un relevé accepté de cette école.' using errcode = '22023';
    end if;
  end if;
  select photo_id into v_previous from prive.campus_photo_choices where campus_id = p_campus;
  update public.field_submission_photos set is_public = false where id = v_previous;
  if p_photo is not null then
    update public.field_submission_photos set is_public = true, child_free_checked_at = clock_timestamp() where id = p_photo;
  end if;
  insert into prive.campus_photo_choices(campus_id, photo_id) values (p_campus, p_photo)
    on conflict (campus_id) do update set photo_id = excluded.photo_id;
  insert into prive.public_photo_history(campus_id, photo_id, previous_photo_id, recorded_by)
    values (p_campus, p_photo, v_previous, public.current_user_id());

  -- La couverture de `campus_media` suit ce choix, tant qu'elle vient d'un relevé : un fichier ajouté n'est jamais écrasé.
  delete from public.campus_media m where m.campus_id = p_campus and m.kind = 'cover' and m.source_photo_id is not null;
  if p_photo is not null and not exists (select 1 from public.campus_media m where m.campus_id = p_campus and m.kind = 'cover') then
    select x.* into v_photo from public.field_submission_photos x where x.id = p_photo;
    insert into public.campus_media (campus_id, kind, subject, storage_path, mime, width, height, source, source_photo_id,
                                     taken_at, child_free_checked_at, checked_by, is_public, created_by)
    values (p_campus, 'cover', case v_photo.role when 'building' then 'batiment' else 'enseigne' end, v_photo.storage_path,
            v_photo.mime, v_photo.width, v_photo.height, 'terrain', v_photo.id, v_photo.taken_at,
            v_photo.child_free_checked_at, public.current_user_id(), true, public.current_user_id());
  end if;
end;
$$;

-- Les six choix d'aujourd'hui deviennent des couvertures, sans rien perdre ------------------------------------------------------------------------
insert into public.campus_media (campus_id, kind, subject, storage_path, mime, width, height, source, source_photo_id,
                                 taken_at, child_free_checked_at, is_public)
select ch.campus_id, 'cover', case p.role when 'building' then 'batiment' else 'enseigne' end, p.storage_path, p.mime,
       p.width, p.height, 'terrain', p.id, p.taken_at, p.child_free_checked_at, true
from prive.campus_photo_choices ch
join public.field_submission_photos p on p.id = ch.photo_id
join public.field_submissions s on s.id = p.submission_id and s.status = 'accepte' and s.campus_id = ch.campus_id
where p.child_free_checked_at is not null and public.photo_role_is_public(p.role);

-- Ce que la suppression d'une école emporte : les fichiers ajoutés de ses images, et le logo si c'est son dernier site ----------------------------
create or replace function public.campus_purge_preview(p_campus uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_nom text;
  v_corbeille boolean;
  v_institution uuid;
  v_ids uuid[];
  v_bloque text;
  v_chemins jsonb;
  v_medias jsonb;
begin
  perform public.exiger_admin_session();
  select i.name || coalesce(' — ' || c.label, ''), c.trashed_at is not null, c.institution_id
    into v_nom, v_corbeille, v_institution
  from public.campuses c join public.institutions i on i.id = c.institution_id
  where c.id = p_campus;
  if not found then
    raise exception 'Cette école est introuvable.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(s.id), '{}') into v_ids
  from public.field_submissions s
  where s.campus_id = p_campus or s.duplicate_of_campus_id = p_campus;

  v_bloque := case
    when not v_corbeille then 'Mets l''école à la corbeille d''abord.'
    when exists (select 1 from public.payout_lines pl where pl.submission_id = any (v_ids)) then
      'Une fiche de cette école figure dans la paie d''un relais : l''école reste à la corbeille.'
    when exists (
      select 1 from public.field_submissions s
      where s.id = any (v_ids) and s.status in ('a_valider', 'a_corriger')
    ) then 'Un envoi en attente concerne cette école : décide-le d''abord.'
    when exists (select 1 from public.campuses o where o.replaced_by_campus_id = p_campus) then
      'Des fiches fusionnées renvoient vers cette école : elle ne se supprime pas.'
  end;

  select coalesce(jsonb_agg(p.storage_path), '[]'::jsonb) into v_chemins
  from public.field_submission_photos p where p.submission_id = any (v_ids);
  select coalesce(jsonb_agg(x.chemin), '[]'::jsonb) into v_medias
  from (
    select unnest(array_remove(array[m.storage_path, m.thumb_path], null)) as chemin
    from public.campus_media m
    where m.source_photo_id is null
      and (m.campus_id = p_campus
           or (m.institution_id = v_institution
               and not exists (select 1 from public.campuses o where o.institution_id = v_institution and o.id <> p_campus)))
  ) x;

  return jsonb_build_object(
    'name', v_nom,
    'trashed', v_corbeille,
    'blocked', v_bloque,
    'submissions', cardinality(v_ids),
    'photos', jsonb_array_length(v_chemins),
    'media', jsonb_array_length(v_medias),
    'contacts', (select count(*) from prive.direction_contacts d where d.submission_id = any (v_ids)),
    'paths', v_chemins || v_medias
  );
end;
$$;

-- Le stockage (couche Supabase seulement) : l'administration range ses fichiers sous ecoles/ ; le public lit les images publiques ---------------
do $$ begin
  if to_regclass('storage.objects') is not null then
    create policy "L'administration ajoute les images des écoles"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'releves' and (storage.foldername(name))[1] = 'ecoles' and (select public.est_admin()));
    create policy "Le public lit les images publiques des écoles"
    on storage.objects for select to anon, authenticated
    using (bucket_id = 'releves' and exists (
      select 1 from public.public_campus_media m where m.storage_path = name or m.thumb_path = name));
  end if;
end $$;
