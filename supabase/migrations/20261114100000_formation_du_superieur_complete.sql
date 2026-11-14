-- Lot 2 (refonte v2, 14/11) : le tiroir « modifier une formation » du supérieur (planche « Licence en droit des affaires »)
-- enregistre tous ses champs d'un seul geste : l'intitulé, le diplôme, le domaine, la durée, le rythme, « diplôme délivré par »,
-- l'admission et les frais (niveau demandé, sélection, frais de dossier, frais par an), et l'autorisation de la formation.
--
-- - Une seule fonction, une seule transaction : rien n'est à moitié enregistré.
-- - Le détail passe toujours par `set_program_details` ; les frais par an par `set_school_fee` (une ligne « par an » liée à la
--   formation) ; l'autorisation par `set_campus_accreditation` puis `set_accreditation_evidence`. Leurs règles et leurs
--   historiques restent les mêmes ; cette fonction ne fait que les enchaîner et ajouter l'identité de la formation.
-- - Elle rend l'identifiant de l'autorisation de la formation (ou null), pour y joindre la photo de l'arrêté.
-- - Une clé absente de `p_sheet` ne touche à rien ; `annual_fee_xaf` ou `authorization` à null retire la ligne existante.
-- - La page écrit « Autorisation : réf. [n°] · vue sur le document le [date] », ou « d'après l'école » : jamais « reconnue par
--   l'État ».

create table prive.program_identity_history (
  id bigint generated always as identity primary key,
  program_id uuid not null,
  campus_id uuid,
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid
);
alter table prive.program_identity_history enable row level security;
revoke all on table prive.program_identity_history from public, anon, authenticated, service_role;
revoke all on sequence prive.program_identity_history_id_seq from public, anon, authenticated, service_role;

create function public.save_program_sheet(p_program uuid, p_sheet jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_campus uuid;
  v_cycle public.niveau;
  v_avant jsonb;
  v_apres jsonb;
  v_titre text := nullif(btrim(p_sheet ->> 'title'), '');
  v_domaine smallint;
  v_rythmes public.study_rhythm[];
  v_dit_le date := nullif(p_sheet ->> 'declared_on', '')::date;
  v_frais_an integer;
  v_ligne_frais uuid;
  v_auto jsonb := p_sheet -> 'authorization';
  v_agrement uuid;
  v_preuve text;
  v_aujourdhui date := (current_timestamp at time zone 'Africa/Brazzaville')::date;
begin
  if p_sheet is null or jsonb_typeof(p_sheet) <> 'object' then
    raise exception 'La fiche de la formation est vide.' using errcode = '22023';
  end if;
  select cc.campus_id, cc.cycle, to_jsonb(p) into v_campus, v_cycle, v_avant
  from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
  where p.id = p_program for update of p;
  if not found then raise exception 'Formation introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(v_campus);

  -- L'identité : intitulé, diplôme, domaine, rythme ------------------------------------------------------------------------------------------
  if p_sheet ? 'title' and v_titre is null then
    raise exception 'Écris l''intitulé de la formation.' using errcode = '22023';
  end if;
  if p_sheet ? 'domain' and nullif(p_sheet ->> 'domain', '') is not null then
    select d.id into v_domaine from public.education_domains d where d.slug = p_sheet ->> 'domain';
    if v_domaine is null then raise exception 'Ce domaine n''existe pas.' using errcode = '22023'; end if;
  end if;
  if p_sheet ? 'rhythms' then
    if jsonb_typeof(p_sheet -> 'rhythms') <> 'array' then
      raise exception 'Le rythme est une liste : jour, soir, week-end.' using errcode = '22023';
    end if;
    select coalesce(array_agg(distinct r::public.study_rhythm), '{}') into v_rythmes
    from jsonb_array_elements_text(p_sheet -> 'rhythms') r;
  end if;
  update public.campus_programs p set
    title = case when p_sheet ? 'title' then v_titre else p.title end,
    diploma = case when p_sheet ? 'diploma' then nullif(p_sheet ->> 'diploma', '')::public.diploma_kind else p.diploma end,
    domain_id = case when p_sheet ? 'domain' then v_domaine else p.domain_id end,
    rhythms = case when p_sheet ? 'rhythms' then v_rythmes else p.rhythms end
  where p.id = p_program
  returning to_jsonb(p) into v_apres;
  if v_apres is distinct from v_avant then
    insert into prive.program_identity_history (program_id, campus_id, before_data, after_data, recorded_by)
    values (p_program, v_campus, v_avant, v_apres, public.current_user_id());
  end if;

  -- Le détail et l'admission (règles et historique de `set_program_details`) ------------------------------------------------------------
  perform public.set_program_details(
    p_program,
    case when p_sheet ? 'duration_years' then nullif(p_sheet ->> 'duration_years', '')::numeric else (v_avant ->> 'duration_years')::numeric end,
    case when p_sheet ? 'admission_level' then p_sheet ->> 'admission_level' else v_avant ->> 'admission_level' end,
    case when p_sheet ? 'selection' then nullif(p_sheet ->> 'selection', '')::public.selection_kind else (v_avant ->> 'selection')::public.selection_kind end,
    case when p_sheet ? 'application_fee_xaf' then nullif(p_sheet ->> 'application_fee_xaf', '')::integer else (v_avant ->> 'application_fee_xaf')::integer end,
    case when p_sheet ? 'diploma_issuer' then p_sheet ->> 'diploma_issuer' else v_avant ->> 'diploma_issuer' end,
    case when p_sheet ? 'declared_on' then v_dit_le else (v_avant ->> 'details_declared_on')::date end
  );

  -- Les frais par an : une ligne « par an » liée à la formation ---------------------------------------------------------------------------
  if p_sheet ? 'annual_fee_xaf' then
    v_frais_an := nullif(p_sheet ->> 'annual_fee_xaf', '')::integer;
    select f.id into v_ligne_frais from public.campus_fees f
    where f.campus_id = v_campus and f.program_id = p_program and f.period = 'annee'
    order by f.declared_on desc nulls last limit 1;
    if v_frais_an is not null then
      if v_dit_le is null then
        raise exception 'Dis quand l''école a donné les frais par an (une date réelle).' using errcode = '22023';
      end if;
      perform public.set_school_fee(v_campus, v_ligne_frais, v_cycle, v_frais_an, v_frais_an, 'annee', null, null, null,
                                    v_dit_le, null, null, p_program, 'declaration', null);
    elsif v_ligne_frais is not null then
      perform public.withdraw_school_fee(v_campus, v_ligne_frais);
    end if;
  end if;

  -- L'autorisation de cette formation ------------------------------------------------------------------------------------------------------
  if p_sheet ? 'authorization' then
    select a.id into v_agrement from public.campus_accreditations a where a.program_id = p_program;
    if v_auto is null or jsonb_typeof(v_auto) = 'null' then
      if v_agrement is not null then perform public.remove_campus_accreditation(v_agrement); end if;
    else
      v_preuve := nullif(v_auto ->> 'evidence', '');
      if v_preuve is null or v_preuve not in ('photo', 'document_vu', 'dit_ecole') then
        raise exception 'Dis sur quoi l''autorisation a été vue : la photo de l''arrêté, le document sur place, ou l''école qui le dit.' using errcode = '22023';
      end if;
      v_agrement := public.set_campus_accreditation(
        v_campus, p_program, 'autorisation_ouverture', null, v_auto ->> 'reference',
        nullif(v_auto ->> 'issued_on', '')::date,
        case v_preuve when 'photo' then 'Photo de l''arrêté' when 'document_vu' then 'Document vu sur place'
                      else 'Dit par l''école, sans document' end,
        null, v_aujourdhui);
      perform public.set_accreditation_evidence(v_agrement, v_preuve, nullif(v_auto ->> 'proof_photo', '')::uuid);
    end if;
  end if;

  update public.campuses set updated_at = now() where id = v_campus;
  -- L'autorisation de la formation (ou null) : le navigateur y joint ensuite la photo de l'arrêté.
  return (select a.id from public.campus_accreditations a where a.program_id = p_program);
exception
  when unique_violation then
    raise exception 'Une formation de ce cycle porte déjà cet intitulé.' using errcode = '22023';
  when invalid_text_representation or check_violation then
    raise exception 'Vérifie le diplôme, le rythme, la durée (0,5 à 8 ans), les montants et l''intitulé (160 caractères).' using errcode = '22023';
end;
$$;
comment on function public.save_program_sheet(uuid, jsonb) is
  'Le tiroir « modifier une formation » du supérieur : intitulé, diplôme, domaine, rythme, détail et admission, frais par an, autorisation, en une transaction.';
revoke all on function public.save_program_sheet(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_program_sheet(uuid, jsonb) to authenticated;
