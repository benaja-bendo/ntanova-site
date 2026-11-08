-- Ticket 148 : l'effacement définitif et la fusion de doublons connaissent l'agrément, le mot de la direction et les inscriptions.
-- Les deux fonctions reprennent leur dernière définition ; seules les lignes qui nomment ces données sont nouvelles.

create or replace function public.purge_campus(p_campus uuid) returns jsonb
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

  -- L'agrément d'abord : une filière qui en porte un refuse de partir.
  delete from prive.campus_accreditation_history h where h.campus_id = p_campus;
  delete from public.campus_accreditations a where a.campus_id = p_campus;

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
  delete from prive.campus_statement_agreements h where h.campus_id = p_campus;
  delete from prive.campus_enrollment_history h where h.campus_id = p_campus;
  delete from public.campus_statements s where s.campus_id = p_campus;
  delete from public.campus_enrollment_deadlines d where d.campus_id = p_campus;
  delete from public.campus_fees f where f.campus_id = p_campus;
  delete from public.campus_facts f where f.campus_id = p_campus;
  delete from public.campuses c where c.id = p_campus;

  -- Une institution qui n'a plus aucun campus n'a plus de raison d'être.
  delete from public.institutions i
  where i.id = v_institution and not exists (select 1 from public.campuses c where c.institution_id = i.id);

  return v_apercu - 'paths';
end;
$$;

create or replace function public.merge_campuses(p_duplicate uuid, p_kept uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_duplicate = p_kept then
    raise exception 'Un campus ne se fusionne pas avec lui-même.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campuses c where c.id = p_kept and c.publication <> 'retiree') then
    raise exception 'Le campus gardé doit exister et ne pas être retiré.' using errcode = '22023';
  end if;
  -- Ces données ne se déplacent pas toutes seules : le doublon qui en porte attend qu'on les saisisse sur la fiche gardée.
  if exists (select 1 from public.campus_accreditations a where a.campus_id = p_duplicate)
    or exists (select 1 from public.campus_statements s where s.campus_id = p_duplicate)
    or exists (select 1 from public.campus_enrollment_deadlines d where d.campus_id = p_duplicate) then
    raise exception 'Ce doublon porte un agrément, un mot de la direction ou une date d’inscription : retire-les d’abord, et saisis-les sur la fiche gardée.' using errcode = '22023';
  end if;
  update public.campuses c set
    publication = 'retiree', retired_at = now(), retirement_reason = 'doublon', replaced_by_campus_id = p_kept
  where c.id = p_duplicate;
  if not found then
    raise exception 'Campus introuvable.' using errcode = 'P0002';
  end if;
  update public.field_submissions s set campus_id = p_kept where s.campus_id = p_duplicate;
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_duplicate and m.status = 'open';
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('merge', p_duplicate, (select public.current_user_id()), 'Fusionné dans ' || p_kept::text);
end;
$$;
