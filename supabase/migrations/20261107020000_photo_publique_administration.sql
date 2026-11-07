-- Le raccord de l'administration au repli automatique de la photo publique (07/11/2026).
--
-- La vue `public_campus_photos` (migration 20261107010000) retient, sans choix, la première enseigne ou façade contrôlée d'un
-- relevé accepté. Deux choses manquaient à l'administration pour la piloter sans surprise :
--   1. choisir une vue du bâtiment comme une enseigne : la vue sait déjà exposer un choix explicite de rôle `building`, mais
--      `set_campus_public_photo` ne le permettait que pour une enseigne ;
--   2. lire l'état de la photo d'une école. Le choix vit dans `prive.campus_photo_choices`, que l'API ne lit pas : sans cette
--      fonction, l'écran ne pourrait pas distinguer « repli automatique » de « retrait explicite » (une ligne au `photo_id`
--      nul), ni dire quelle photo est effectivement retenue.
-- Le retrait reste `set_campus_public_photo(école, null, false)` : il écrit le choix nul qui bloque tout repli. Un simple
-- `child_free_checked_at = null` ferait apparaître une autre photo contrôlée.

create or replace function public.set_campus_public_photo(p_campus uuid, p_photo uuid, p_confirmed boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_previous uuid;
begin
  perform public.exiger_admin_session();
  perform 1 from public.campuses where id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if p_photo is not null then
    if p_confirmed is distinct from true then
      raise exception 'Confirme le contrôle sans enfant ni donnée personnelle et la publication.' using errcode = '22023';
    end if;
    -- Une enseigne ou une vue du bâtiment : les deux rôles que la vue publique sait exposer. Un panneau des formations ou un
    -- prospectus ne devient jamais public.
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
end;
$$;
revoke all on function public.set_campus_public_photo(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_campus_public_photo(uuid, uuid, boolean) to authenticated;

-- L'état de la photo publique d'une école, pour l'administration seule (lecture seule).
--   mode      : `automatique` (aucune ligne de choix : repli), `choix` (une photo choisie), `retire` (retrait explicite).
--   choice    : la photo choisie, nulle sauf en mode `choix`.
--   published : la fiche est publiée et hors corbeille (sinon aucune photo n'est publique, quel que soit le mode).
--   retained  : la photo que `public_campus_photos` expose, nulle quand rien n'est exposé.
create function public.campus_public_photo_state(p_campus uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_publiee boolean;
  v_existe boolean;
  v_photo uuid;
  v_mode text;
begin
  perform public.exiger_admin_session();
  select c.publication = 'publiee' and c.trashed_at is null into v_publiee from public.campuses c where c.id = p_campus;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  select true, ch.photo_id into v_existe, v_photo from prive.campus_photo_choices ch where ch.campus_id = p_campus;
  v_mode := case
    when not coalesce(v_existe, false) then 'automatique'
    when v_photo is null then 'retire'
    else 'choix'
  end;
  return jsonb_build_object(
    'mode', v_mode,
    'choice', v_photo,
    'published', v_publiee,
    'retained', (select p.id from public.public_campus_photos p where p.campus_id = p_campus)
  );
end;
$$;
revoke all on function public.campus_public_photo_state(uuid) from public, anon, authenticated, service_role;
grant execute on function public.campus_public_photo_state(uuid) to authenticated;
