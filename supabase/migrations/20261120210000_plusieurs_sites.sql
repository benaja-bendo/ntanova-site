-- Plusieurs sites (ticket 203, décisions du fondateur du 20/11), après la saisie des écoles du supérieur.
--
-- - A3 et A24 : une formation appartient au cycle d'un site. Le 2e ou le 3e site d'une école n'en avait aucune, et il
--   fallait tout ressaisir (ESTAM, ISGI) ou recopier par script (ISCOM, IUHL). `copy_campus_programs` copie les formations
--   cochées d'un site vers un autre site de la même école, avec leur détail. Le frais de dossier n'est pas copié : chaque site
--   a ses frais et son OUI. Une formation déjà présente (même intitulé, même cycle) n'est pas copiée deux fois.
-- - A4 (nom du site, sigle) : la base a déjà `campuses.label` et `institutions.acronym` ; seul l'écran manquait.

create function public.copy_campus_programs(p_from uuid, p_to uuid, p_programs uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_de public.campuses;
  v_vers public.campuses;
  v_cycle_manquant public.niveau;
  p public.campus_programs;
  v_cycle uuid;
  v_id uuid;
  v_apres jsonb;
  v_copiees integer := 0;
begin
  perform public.exiger_gestion_site(p_to);
  if p_programs is null or cardinality(p_programs) = 0 then
    raise exception 'Coche au moins une formation à copier.' using errcode = '22023';
  end if;
  if p_from = p_to then
    raise exception 'Choisis un autre site que celui-ci.' using errcode = '22023';
  end if;
  select c.* into v_de from public.campuses c where c.id = p_from and c.trashed_at is null;
  select c.* into v_vers from public.campuses c where c.id = p_to and c.trashed_at is null for update;
  if v_de.id is null or v_vers.id is null then
    raise exception 'Site introuvable.' using errcode = 'P0002';
  end if;
  if v_vers.publication = 'retiree' then
    raise exception 'Un site retiré ne se modifie plus : le republier d''abord.' using errcode = '22023';
  end if;
  if v_de.institution_id <> v_vers.institution_id then
    raise exception 'Les formations se copient entre deux sites de la même école.' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_programs) x(id)
    where not exists (
      select 1 from public.campus_programs k join public.campus_cycles cc on cc.id = k.campus_cycle_id
      where k.id = x.id and cc.campus_id = p_from
    )
  ) then
    raise exception 'Ces formations ne sont pas toutes celles du site choisi.' using errcode = '22023';
  end if;
  select cc.cycle into v_cycle_manquant
  from public.campus_programs k join public.campus_cycles cc on cc.id = k.campus_cycle_id
  where k.id = any (p_programs)
    and not exists (select 1 from public.campus_cycles t where t.campus_id = p_to and t.cycle = cc.cycle)
  limit 1;
  if v_cycle_manquant is not null then
    raise exception 'Ce site n''enseigne pas ce cycle (%) : ajoute-le d''abord dans « En bref ».', v_cycle_manquant
      using errcode = '22023';
  end if;

  for p in
    select k.* from public.campus_programs k where k.id = any (p_programs) order by k.created_at, k.id
  loop
    select t.id into v_cycle from public.campus_cycles t
    where t.campus_id = p_to and t.cycle = (select cc.cycle from public.campus_cycles cc where cc.id = p.campus_cycle_id);
    continue when exists (
      select 1 from public.campus_programs d
      where d.campus_cycle_id = v_cycle and public.norm_text(d.title) = public.norm_text(p.title)
    );
    insert into public.campus_programs (
      campus_cycle_id, domain_id, title, bac_track, diploma, rhythms, origin, duration_years, admission_level, selection,
      diploma_issuer, details_declared_on, accepted_bac_tracks
    ) values (
      v_cycle, p.domain_id, p.title, p.bac_track, p.diploma, p.rhythms, 'admin', p.duration_years, p.admission_level, p.selection,
      p.diploma_issuer, p.details_declared_on, p.accepted_bac_tracks
    )
    returning id, to_jsonb(campus_programs.*) into v_id, v_apres;
    insert into prive.program_identity_history (program_id, campus_id, before_data, after_data, recorded_by)
    values (v_id, p_to, null, v_apres || jsonb_build_object('copied_from', p.id), public.current_user_id());
    v_copiees := v_copiees + 1;
  end loop;

  if v_copiees > 0 then
    update public.campuses set updated_at = now() where id = p_to;
  end if;
  return v_copiees;
end;
$$;
comment on function public.copy_campus_programs(uuid, uuid, uuid[]) is
  'Copie les formations cochées d''un site vers un autre site de la même école, avec leur détail, sans le frais de dossier ; une formation déjà présente n''est pas copiée deux fois. Rend le nombre copié. 20/11.';
revoke all on function public.copy_campus_programs(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.copy_campus_programs(uuid, uuid, uuid[]) to authenticated;
