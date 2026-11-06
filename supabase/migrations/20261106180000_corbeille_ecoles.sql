-- La corbeille des écoles (audit de l'administration, 06/11/2026).
--
-- Jusqu'ici, « Retirer du site » mettait seulement l'école à l'état « retirée » : elle restait pour toujours dans les
-- listes, les statistiques et les compteurs des relais, et seules une photo ou un contact pouvaient être effacés. Les
-- fiches de test (ecole de test, fiches d'essai) ne partaient jamais. Trois niveaux, du plus doux au plus définitif :
--   1. retirer du site (existe) : hors du site, réversible (« Republier »), tout est conservé ;
--   2. la corbeille : l'école disparaît des listes, des statistiques et des missions, mais se restaure ;
--   3. la suppression définitive : l'école, ses fiches, ses photos, ses contacts et ses accords sont effacés, avec une
--      trace dans `prive.erasures`. Elle exige la corbeille d'abord, et refuse tant qu'une fiche de l'école figure dans
--      la paie, qu'un envoi l'attend ou qu'une fusion y renvoie.

-- 1. Les colonnes -----------------------------------------------------------------------------------------------------------------

alter table public.campuses
  add column trashed_at timestamptz,
  add column trashed_from public.publication;

-- Une école à la corbeille est toujours « retirée » : le site, la recherche et la détection de doublon l'ignorent déjà.
alter table public.campuses
  add constraint campuses_corbeille_coherente check (
    (trashed_at is null) = (trashed_from is null)
    and (trashed_at is null or publication = 'retiree')
  );

alter table prive.erasures drop constraint erasures_what_check;
alter table prive.erasures
  add constraint erasures_what_check check (what in ('contact', 'photo', 'merge', 'campus', 'trash', 'restore'));

-- 2. Les statistiques par zone ne comptent pas la corbeille ----------------------------------------------------------------

create or replace view public.division_stats with (security_invoker = true) as
select
  d.id as division_id,
  d.path::text as path,
  d.level,
  d.name,
  d.open_for_fieldwork,
  count(c.id)::integer as campuses,
  count(c.id) filter (where c.publication = 'publiee')::integer as published,
  count(c.id) filter (where c.origin = 'field')::integer as from_field,
  count(c.id) filter (where c.origin = 'admin')::integer as from_admin,
  count(c.id) filter (where c.origin = 'import')::integer as from_import
from public.geo_divisions d
left join public.campuses c on c.division_id = d.id and c.trashed_at is null
group by d.id, d.path, d.level, d.name, d.open_for_fieldwork;

-- 3. « Publier » refuse clairement une école à la corbeille ---------------------------------------------------------------------

create or replace function public.publish_campus(p_campus uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  if exists (select 1 from public.campuses c where c.id = p_campus and c.trashed_at is not null) then
    raise exception 'Cette école est à la corbeille : restaure-la d''abord.' using errcode = '22023';
  end if;
  update public.campuses c set
    publication = 'publiee', retired_at = null, retirement_reason = null, retirement_note = null
  where c.id = p_campus and c.publication in ('prete', 'retiree') and c.replaced_by_campus_id is null;
  if not found then
    raise exception 'Seul un campus prêt ou retiré se publie (un campus à situer attend sa position).' using errcode = '22023';
  end if;
end;
$$;

-- 4. Mettre à la corbeille, restaurer ---------------------------------------------------------------------------------------------

create function public.trash_campus(p_campus uuid, p_reason public.motif_retrait default 'erreur', p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  update public.campuses c set
    trashed_from = c.publication,
    trashed_at = now(),
    publication = 'retiree',
    retired_at = coalesce(c.retired_at, now()),
    retirement_reason = coalesce(c.retirement_reason, p_reason),
    retirement_note = coalesce(c.retirement_note, p_note)
  where c.id = p_campus and c.trashed_at is null;
  if not found then
    raise exception 'Cette école est introuvable ou déjà à la corbeille.' using errcode = 'P0002';
  end if;
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_campus and m.status = 'open';
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('trash', p_campus, (select public.current_user_id()), left(p_note, 500));
end;
$$;

-- Restaurer rend l'état d'avant, sauf « publiée » : une école restaurée repasse « prête », la publier est un geste à part.
create function public.restore_campus(p_campus uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  update public.campuses c set
    publication = case when c.trashed_from = 'publiee' then 'prete' else c.trashed_from end,
    retired_at = case when c.trashed_from = 'retiree' then c.retired_at end,
    retirement_reason = case when c.trashed_from = 'retiree' then c.retirement_reason end,
    retirement_note = case when c.trashed_from = 'retiree' then c.retirement_note end,
    trashed_at = null,
    trashed_from = null
  where c.id = p_campus and c.trashed_at is not null;
  if not found then
    raise exception 'Cette école est introuvable ou n''est pas à la corbeille.' using errcode = 'P0002';
  end if;
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('restore', p_campus, (select public.current_user_id()), null);
end;
$$;

-- 5. La suppression définitive ---------------------------------------------------------------------------------------------------

-- Ce que la suppression emporterait, et ce qui la bloque : l'écran le lit avant de demander la confirmation. `paths` est la
-- liste des fichiers du stockage à effacer avec elle (photos des fiches de l'école).
create function public.campus_purge_preview(p_campus uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_nom text;
  v_corbeille boolean;
  v_ids uuid[];
  v_bloque text;
  v_chemins jsonb;
begin
  perform public.exiger_admin_session();
  select i.name || coalesce(' — ' || c.label, ''), c.trashed_at is not null
    into v_nom, v_corbeille
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

  return jsonb_build_object(
    'name', v_nom,
    'trashed', v_corbeille,
    'blocked', v_bloque,
    'submissions', cardinality(v_ids),
    'photos', jsonb_array_length(v_chemins),
    'contacts', (select count(*) from prive.direction_contacts d where d.submission_id = any (v_ids)),
    'paths', v_chemins
  );
end;
$$;

create function public.purge_campus(p_campus uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_apercu jsonb;
  v_ids uuid[];
  v_institution uuid;
begin
  perform public.exiger_admin_session();
  v_apercu := public.campus_purge_preview(p_campus);
  if v_apercu ->> 'blocked' is not null then
    raise exception '%', v_apercu ->> 'blocked' using errcode = '22023';
  end if;
  select c.institution_id into v_institution from public.campuses c where c.id = p_campus;
  select coalesce(array_agg(s.id), '{}') into v_ids
  from public.field_submissions s
  where s.campus_id = p_campus or s.duplicate_of_campus_id = p_campus;

  -- La trace d'abord : le nom de l'école, ce qu'elle emporte. Ni photo, ni contact, ni numéro dans la note.
  insert into prive.erasures (what, by_user, note)
  values ('campus', (select public.current_user_id()),
          left(format('École supprimée : %s (%s fiches, %s photos, %s contacts)', v_apercu ->> 'name',
                      v_apercu ->> 'submissions', v_apercu ->> 'photos', v_apercu ->> 'contacts'), 500));

  -- Les fiches : ce qui les référence part avant elles.
  update public.field_submissions s set corrects_submission_id = null where s.corrects_submission_id = any (v_ids);
  delete from public.campus_programs p where p.source_submission_id = any (v_ids);
  update public.missions m set closed_by_submission_id = null
  where m.closed_by_submission_id = any (v_ids) and m.campus_id <> p_campus;
  delete from public.missions m where m.campus_id = p_campus;
  delete from public.field_submission_photos p where p.submission_id = any (v_ids);
  delete from public.field_submissions s where s.id = any (v_ids);

  -- L'école : son historique, ses frais et ses faits d'abord (ils pointent vers ses cycles), puis elle.
  delete from prive.campus_fact_history h where h.campus_id = p_campus;
  delete from prive.campus_fee_history h where h.campus_id = p_campus;
  delete from prive.campus_photo_choices h where h.campus_id = p_campus;
  delete from prive.public_contact_agreements h where h.campus_id = p_campus;
  delete from prive.public_photo_history h where h.campus_id = p_campus;
  delete from prive.school_declarations h where h.campus_id = p_campus;
  delete from public.campus_fees f where f.campus_id = p_campus;
  delete from public.campus_facts f where f.campus_id = p_campus;
  delete from public.campuses c where c.id = p_campus;

  -- Une institution qui n'a plus aucun campus n'a plus de raison d'être.
  delete from public.institutions i
  where i.id = v_institution and not exists (select 1 from public.campuses c where c.institution_id = i.id);

  return v_apercu - 'paths';
end;
$$;

revoke all on function public.trash_campus(uuid, public.motif_retrait, text) from public, anon, authenticated;
revoke all on function public.restore_campus(uuid) from public, anon, authenticated;
revoke all on function public.campus_purge_preview(uuid) from public, anon, authenticated;
revoke all on function public.purge_campus(uuid) from public, anon, authenticated;
grant execute on function public.trash_campus(uuid, public.motif_retrait, text) to authenticated;
grant execute on function public.restore_campus(uuid) to authenticated;
grant execute on function public.campus_purge_preview(uuid) to authenticated;
grant execute on function public.purge_campus(uuid) to authenticated;
