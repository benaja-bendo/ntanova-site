-- Lot 1 du site public à trois piliers (15/11) : les champs de base décidés par le fondateur le 15/11 (canevas « Site
-- public », version 44). Aucun écran ne les lit encore : l'administration les saisira au lot 2, le site les montrera aux
-- lots 4 à 6. Tout est additif ; aucune ligne existante ne change de sens.
--
-- - P1 `campus_fees.billed_months` : le nombre de mois que l'école facture dans l'année, pour des frais au mois. Le
--   calculateur de la fiche fait l'année avec lui, ou avec le choix du parent (règle du 14/11).
-- - P2 `campus_programs.accepted_bac_tracks` : les séries du bac qu'une formation admet (le test d'orientation). Distinct de
--   `bac_track`, la série enseignée au lycée. Nul : pas dit.
-- - P3 `campus_openings` : les places annoncées par l'école, classe par classe, redemandées chaque mois. Le public ne lit
--   plus une annonce 30 jours après le jour où l'école l'a dite (`expires_on`) ; la page porte cette date et cache
--   elle-même une annonce passée (site statique).
-- - P4 `campus_class_sizes` : l'effectif d'une classe en tranches, jamais le nombre exact. Facultatif : il n'entre pas
--   dans ce qui manque à une fiche.
-- - P5 `family_demands` : les demandes des familles comptées sans nom ni numéro (« Demander la vérification » d'une fiche,
--   « Compter ma demande » d'un test d'orientation sans résultat). Au plus une par téléphone, sujet et jour : le navigateur
--   envoie l'empreinte (SHA-256) de sa clé tirée au hasard et du jour, jamais la clé elle-même. Le public ne lit qu'un
--   compte par fiche, à partir de 5 (`public_verification_demands`).
-- - P6 `campus_fees.confirmed_on` : le jour du OUI écrit de l'école sur ses frais. **Une ligne n'est publique qu'avec lui**
--   (« publier ou modifier vos tarifs sans votre accord daté » : jamais). Modifier les montants d'une ligne efface son OUI.
--   Les lignes déclarées par l'école avant ce jour sont tenues pour confirmées à leur date ; celles lues sur un prospectus
--   attendent le OUI.
-- - Toute écriture sur les données d'un site passe par `exiger_gestion_site` : l'administration aujourd'hui, le compte de
--   la direction à l'étape C (consigne du fondateur du 15/11 : préparer les comptes, sans écran).

-- Les listes ---------------------------------------------------------------------------------------------------------------------------------------
create domain public.opening_state as text check (value in ('disponibles', 'peu', 'complet', 'autre'));
create domain public.class_size_band as text check (value in ('moins_de_20', '20_a_34', '35_a_49', '50_et_plus', 'autre'));
create domain public.family_demand_kind as text check (value in ('verification', 'orientation'));
create domain public.orientation_profile as text check (value in ('bepc', 'bac', 'adulte', 'autre'));

-- P1 et P6 : les mois facturés et le OUI de l'école -------------------------------------------------------------------------------------------
alter table public.campus_fees
  add column billed_months smallint check (billed_months between 1 and 12),
  add column confirmed_on date,
  add constraint campus_fees_mois_factures_au_mois check (billed_months is null or period = 'mois'),
  add constraint campus_fees_oui_apres_les_frais check (confirmed_on is null or confirmed_on >= declared_on);
comment on column public.campus_fees.billed_months is 'Les mois facturés dans l''année, dits par l''école, pour des frais au mois ; nul : pas dit.';
comment on column public.campus_fees.confirmed_on is
  'Le jour du OUI écrit de l''école sur ces montants. Nul : ligne préparée (prospectus, saisie), jamais publiée.';

-- Les frais déclarés par l'école elle-même avant ce jour : son OUI est sa déclaration.
update public.campus_fees set confirmed_on = declared_on where evidence = 'declaration';

drop policy "Frais des écoles publiées" on public.campus_fees;
create policy "Frais confirmés des écoles publiées" on public.campus_fees for select to anon, authenticated
  using (confirmed_on is not null
         and exists (select 1 from public.campuses c where c.id = campus_id and c.publication = 'publiee'));

alter table prive.campus_fee_history drop constraint campus_fee_history_action_check;
alter table prive.campus_fee_history add constraint campus_fee_history_action_check
  check (action in ('ajout', 'modification', 'retrait', 'confirmation'));

-- Enregistrer une ligne : les anciens appels marchent toujours (le paramètre nouveau est à la fin, avec une valeur par défaut).
drop function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid);
create function public.set_school_fee(
  p_campus uuid, p_fee uuid, p_cycle public.niveau, p_minimum integer, p_maximum integer, p_period text,
  p_period_detail text, p_registration integer, p_school_year text, p_declared_on date, p_note text,
  p_level_label text default null, p_program uuid default null, p_evidence text default 'declaration', p_proof_photo uuid default null,
  p_billed_months integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_before jsonb; v_after jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if p_declared_on is null or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date
    or p_minimum is null or p_maximum is null or p_minimum < 0 or p_maximum < p_minimum
    or p_registration < 0 or p_period is null or p_period not in ('mois','trimestre','annee','autre')
    or (p_period = 'autre' and nullif(btrim(p_period_detail),'') is null) then
    raise exception 'Vérifie les montants, la période et la date réelle de déclaration.' using errcode = '22023';
  end if;
  if p_billed_months is not null and (p_billed_months not between 1 and 12 or p_period <> 'mois') then
    raise exception 'Les mois facturés vont de 1 à 12, et seulement pour des frais au mois.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campus_cycles where campus_id = p_campus and cycle = p_cycle) then
    raise exception 'Ce cycle doit être renseigné dans la fiche de l’école.' using errcode = '22023';
  end if;
  if p_program is not null and not exists (
    select 1 from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
    where p.id = p_program and cc.campus_id = p_campus and cc.cycle = p_cycle
  ) then
    raise exception 'Cette formation n''appartient pas à ce cycle de l''école.' using errcode = '22023';
  end if;
  if coalesce(p_evidence, 'declaration') not in ('declaration', 'prospectus')
     or (p_proof_photo is not null and p_evidence <> 'prospectus') then
    raise exception 'La preuve est une déclaration de l''école, ou son prospectus photographié.' using errcode = '22023';
  end if;
  if p_proof_photo is not null and not exists (
    select 1 from public.field_submission_photos ph join public.field_submissions s on s.id = ph.submission_id
    where ph.id = p_proof_photo and ph.role = 'brochure' and s.campus_id = p_campus and s.status = 'accepte'
  ) then
    raise exception 'La preuve doit être le prospectus d''un relevé accepté de cette école.' using errcode = '22023';
  end if;
  if p_fee is not null then
    select to_jsonb(f) into v_before from public.campus_fees f where id = p_fee and campus_id = p_campus for update;
    if not found then raise exception 'Ligne de frais introuvable.' using errcode = 'P0002'; end if;
    update public.campus_fees f set cycle=p_cycle,minimum=p_minimum,maximum=p_maximum,period=p_period,
      period_detail=case when p_period='autre' then nullif(btrim(p_period_detail),'') else null end,
      registration=p_registration, school_year=nullif(btrim(p_school_year),''), declared_on=p_declared_on,
      note=nullif(btrim(p_note),''), level_label=nullif(btrim(p_level_label),''), program_id=p_program,
      evidence=coalesce(p_evidence, 'declaration'), proof_photo_id=p_proof_photo, billed_months=p_billed_months
      where id=p_fee returning id,to_jsonb(f) into v_id,v_after;
    -- Des montants changés n'ont plus le OUI de l'école : la ligne attend le prochain, et quitte le site d'ici là.
    if (v_after - 'confirmed_on') is distinct from (v_before - 'confirmed_on') and v_after ->> 'confirmed_on' is not null then
      update public.campus_fees f set confirmed_on = null where id = v_id returning to_jsonb(f) into v_after;
    end if;
  else
    insert into public.campus_fees(campus_id,cycle,minimum,maximum,period,period_detail,registration,school_year,declared_on,note,
                                   level_label,program_id,evidence,proof_photo_id,billed_months)
      values (p_campus,p_cycle,p_minimum,p_maximum,p_period,
        case when p_period='autre' then nullif(btrim(p_period_detail),'') else null end,
        p_registration,nullif(btrim(p_school_year),''),p_declared_on,nullif(btrim(p_note),''),
        nullif(btrim(p_level_label),''),p_program,coalesce(p_evidence, 'declaration'),p_proof_photo,p_billed_months)
      returning id,to_jsonb(campus_fees) into v_id,v_after;
  end if;
  insert into prive.campus_fee_history(fee_id,campus_id,action,before_data,after_data,recorded_by)
    values(v_id,p_campus,case when p_fee is null then 'ajout' else 'modification' end,v_before,v_after,public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Une ligne existe déjà pour ce cycle, cette classe, cette formation, cette période et cette année : modifie-la.' using errcode = '22023';
end;
$$;
comment on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer) is
  'Une ligne de frais : cycle, classe, formation, montants, période, mois facturés, inscription, année, date et preuve. Sans OUI de l''école, elle n''est pas publique.';
revoke all on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer) to authenticated;

-- Noter le OUI de l'école : toutes les lignes qui l'attendent, au jour où elle l'a écrit.
create function public.confirm_school_fees(p_campus uuid, p_confirmed_on date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_ligne record; v_apres jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if p_confirmed_on is null or p_confirmed_on > (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'Donne le jour réel où l''école a répondu OUI.' using errcode = '22023';
  end if;
  if exists (select 1 from public.campus_fees f where f.campus_id = p_campus and f.confirmed_on is null and f.declared_on > p_confirmed_on) then
    raise exception 'Le OUI ne peut pas précéder la date des frais qu''il confirme.' using errcode = '22023';
  end if;
  for v_ligne in
    select f.id, to_jsonb(f) as avant from public.campus_fees f where f.campus_id = p_campus and f.confirmed_on is null for update
  loop
    update public.campus_fees f set confirmed_on = p_confirmed_on where f.id = v_ligne.id returning to_jsonb(f) into v_apres;
    insert into prive.campus_fee_history(fee_id, campus_id, action, before_data, after_data, recorded_by)
      values (v_ligne.id, p_campus, 'confirmation', v_ligne.avant, v_apres, public.current_user_id());
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'Aucune ligne de frais n''attend le OUI de cette école.' using errcode = '22023';
  end if;
  return v_n;
end;
$$;
comment on function public.confirm_school_fees(uuid, date) is
  'Le OUI écrit de l''école sur ses frais : toutes les lignes qui l''attendent deviennent publiques, datées de ce jour. Rend leur nombre.';
revoke all on function public.confirm_school_fees(uuid, date) from public, anon, authenticated;
grant execute on function public.confirm_school_fees(uuid, date) to authenticated;

-- P2 : les séries du bac admises par une formation ------------------------------------------------------------------------------------------
alter table public.campus_programs
  add column accepted_bac_tracks public.bac_track[] check (accepted_bac_tracks is null or cardinality(accepted_bac_tracks) between 1 and 20);
comment on column public.campus_programs.accepted_bac_tracks is
  'Les séries du bac que la formation admet (dites par l''établissement) ; nul : pas dit. Le test d''orientation les lit.';

-- Le tiroir « modifier une formation » enregistre aussi les séries admises (clé `accepted_bac_tracks`, une liste ; null : pas dit).
-- Supprimée puis recréée : une base qui a reçu une version antérieure de 20261114100000 la garde avec un autre type de retour.
drop function public.save_program_sheet(uuid, jsonb);
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
  v_series public.bac_track[];
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

  -- L'identité : intitulé, diplôme, domaine, rythme, séries admises ---------------------------------------------------------------------
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
  if p_sheet ? 'accepted_bac_tracks' and jsonb_typeof(p_sheet -> 'accepted_bac_tracks') <> 'null' then
    if jsonb_typeof(p_sheet -> 'accepted_bac_tracks') <> 'array' then
      raise exception 'Les séries admises sont une liste : A, C, D…' using errcode = '22023';
    end if;
    -- Une liste vide se lit « pas dit ».
    select array_agg(distinct s::public.bac_track order by s::public.bac_track) into v_series
    from jsonb_array_elements_text(p_sheet -> 'accepted_bac_tracks') s;
  end if;
  update public.campus_programs p set
    title = case when p_sheet ? 'title' then v_titre else p.title end,
    diploma = case when p_sheet ? 'diploma' then nullif(p_sheet ->> 'diploma', '')::public.diploma_kind else p.diploma end,
    domain_id = case when p_sheet ? 'domain' then v_domaine else p.domain_id end,
    rhythms = case when p_sheet ? 'rhythms' then v_rythmes else p.rhythms end,
    accepted_bac_tracks = case when p_sheet ? 'accepted_bac_tracks' then v_series else p.accepted_bac_tracks end
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
    raise exception 'Vérifie le diplôme, le rythme, les séries, la durée (0,5 à 8 ans), les montants et l''intitulé (160 caractères).' using errcode = '22023';
end;
$$;
comment on function public.save_program_sheet(uuid, jsonb) is
  'Le tiroir « modifier une formation » du supérieur : intitulé, diplôme, domaine, rythme, séries admises, détail et admission, frais par an, autorisation, en une transaction.';
revoke all on function public.save_program_sheet(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_program_sheet(uuid, jsonb) to authenticated;

-- L'historique des places et des effectifs ---------------------------------------------------------------------------------------------------
create table prive.campus_detail_history (
  id bigint generated always as identity primary key,
  topic text not null check (topic in ('places', 'effectif')),
  row_id uuid not null,
  campus_id uuid not null references public.campuses (id) on delete cascade,
  action text not null check (action in ('ajout', 'modification', 'retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid
);
comment on table prive.campus_detail_history is 'Qui a annoncé, modifié ou retiré des places ou un effectif, et quand (lot 1, 15/11).';
alter table prive.campus_detail_history enable row level security;
revoke all on table prive.campus_detail_history from public, anon, authenticated, service_role;
revoke all on sequence prive.campus_detail_history_id_seq from public, anon, authenticated, service_role;

-- P3 : les places annoncées -------------------------------------------------------------------------------------------------------------------
create table public.campus_openings (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  cycle public.niveau not null,
  level_label text check (length(btrim(level_label)) between 1 and 40),
  state public.opening_state not null,
  detail text check (length(btrim(detail)) between 1 and 120),
  said_on date not null,
  expires_on date generated always as (said_on + 30) stored,
  source text not null default 'ecole' check (source = 'ecole'),
  created_at timestamptz not null default now(),
  constraint campus_openings_cycle foreign key (campus_id, cycle) references public.campus_cycles (campus_id, cycle) on delete cascade,
  constraint campus_openings_autre_precise check (state <> 'autre' or detail is not null),
  constraint campus_openings_une_par_classe unique nulls not distinct (campus_id, cycle, level_label)
);
comment on table public.campus_openings is
  'Les places annoncées par l''école, classe par classe. Le public ne lit plus une annonce 30 jours après le jour où elle a été dite.';
alter table public.campus_openings enable row level security;
revoke all on table public.campus_openings from public, anon, authenticated, service_role;
grant select on table public.campus_openings to anon, authenticated;
create policy "Places annoncées depuis moins de 30 jours, écoles publiées" on public.campus_openings for select to anon, authenticated
  using (expires_on >= (current_timestamp at time zone 'Africa/Brazzaville')::date
         and exists (select 1 from public.campuses c where c.id = campus_id and c.publication = 'publiee'));
create policy "L'administration lit les places" on public.campus_openings for select to authenticated
  using ((select public.est_admin()));

create function public.set_campus_opening(
  p_campus uuid, p_opening uuid, p_cycle public.niveau, p_level_label text, p_state text, p_detail text, p_said_on date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_avant jsonb; v_apres jsonb; v_aujourdhui date := (current_timestamp at time zone 'Africa/Brazzaville')::date;
begin
  perform public.exiger_gestion_site(p_campus);
  if p_said_on is null or p_said_on > v_aujourdhui then
    raise exception 'Donne le jour réel où l''école a annoncé ses places.' using errcode = '22023';
  end if;
  if p_said_on < v_aujourdhui - 30 then
    raise exception 'Une annonce de plus de 30 jours ne se publie plus : redemande à l''école.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campus_cycles where campus_id = p_campus and cycle = p_cycle) then
    raise exception 'Ce cycle doit être renseigné dans la fiche de l''école.' using errcode = '22023';
  end if;
  if p_opening is not null then
    select to_jsonb(o) into v_avant from public.campus_openings o where o.id = p_opening and o.campus_id = p_campus for update;
    if not found then raise exception 'Annonce introuvable.' using errcode = 'P0002'; end if;
    update public.campus_openings o set cycle = p_cycle, level_label = nullif(btrim(p_level_label), ''),
      state = p_state::public.opening_state, detail = nullif(btrim(p_detail), ''), said_on = p_said_on
    where o.id = p_opening returning o.id, to_jsonb(o) into v_id, v_apres;
  else
    insert into public.campus_openings (campus_id, cycle, level_label, state, detail, said_on)
    values (p_campus, p_cycle, nullif(btrim(p_level_label), ''), p_state::public.opening_state, nullif(btrim(p_detail), ''), p_said_on)
    returning id, to_jsonb(campus_openings) into v_id, v_apres;
  end if;
  insert into prive.campus_detail_history (topic, row_id, campus_id, action, before_data, after_data, recorded_by)
  values ('places', v_id, p_campus, case when p_opening is null then 'ajout' else 'modification' end, v_avant, v_apres, public.current_user_id());
  return v_id;
exception
  when unique_violation then
    raise exception 'Une annonce existe déjà pour cette classe : modifie-la.' using errcode = '22023';
  when check_violation or invalid_text_representation then
    raise exception 'Vérifie l''état des places (une précision pour « autre »), la classe (40 caractères) et la précision (120).' using errcode = '22023';
end;
$$;
comment on function public.set_campus_opening(uuid, uuid, public.niveau, text, text, text, date) is
  'Annoncer ou redire les places d''une classe, au jour où l''école l''a dit (30 jours au plus).';
revoke all on function public.set_campus_opening(uuid, uuid, public.niveau, text, text, text, date) from public, anon, authenticated;
grant execute on function public.set_campus_opening(uuid, uuid, public.niveau, text, text, text, date) to authenticated;

create function public.withdraw_campus_opening(p_campus uuid, p_opening uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_avant jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  delete from public.campus_openings o where o.id = p_opening and o.campus_id = p_campus returning to_jsonb(o) into v_avant;
  if v_avant is null then raise exception 'Annonce introuvable.' using errcode = 'P0002'; end if;
  insert into prive.campus_detail_history (topic, row_id, campus_id, action, before_data, recorded_by)
  values ('places', p_opening, p_campus, 'retrait', v_avant, public.current_user_id());
end;
$$;
revoke all on function public.withdraw_campus_opening(uuid, uuid) from public, anon, authenticated;
grant execute on function public.withdraw_campus_opening(uuid, uuid) to authenticated;

-- P4 : l'effectif d'une classe, en tranches -------------------------------------------------------------------------------------------------
create table public.campus_class_sizes (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  cycle public.niveau not null,
  level_label text check (length(btrim(level_label)) between 1 and 40),
  band public.class_size_band not null,
  detail text check (length(btrim(detail)) between 1 and 120),
  said_on date not null,
  source text not null default 'ecole' check (source = 'ecole'),
  created_at timestamptz not null default now(),
  constraint campus_class_sizes_cycle foreign key (campus_id, cycle) references public.campus_cycles (campus_id, cycle) on delete cascade,
  constraint campus_class_sizes_autre_precise check (band <> 'autre' or detail is not null),
  constraint campus_class_sizes_une_par_classe unique nulls not distinct (campus_id, cycle, level_label)
);
comment on table public.campus_class_sizes is
  'L''effectif d''une classe dit par l''école, en tranches (jamais le nombre exact). Facultatif : il n''entre pas dans ce qui manque à une fiche.';
alter table public.campus_class_sizes enable row level security;
revoke all on table public.campus_class_sizes from public, anon, authenticated, service_role;
grant select on table public.campus_class_sizes to anon, authenticated;
create policy "Effectifs des écoles publiées" on public.campus_class_sizes for select to anon, authenticated
  using (exists (select 1 from public.campuses c where c.id = campus_id and c.publication = 'publiee'));
create policy "L'administration lit les effectifs" on public.campus_class_sizes for select to authenticated
  using ((select public.est_admin()));

create function public.set_campus_class_size(
  p_campus uuid, p_size uuid, p_cycle public.niveau, p_level_label text, p_band text, p_detail text, p_said_on date
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_avant jsonb; v_apres jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if p_said_on is null or p_said_on > (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'Donne le jour réel où l''école a dit cet effectif.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campus_cycles where campus_id = p_campus and cycle = p_cycle) then
    raise exception 'Ce cycle doit être renseigné dans la fiche de l''école.' using errcode = '22023';
  end if;
  if p_size is not null then
    select to_jsonb(s) into v_avant from public.campus_class_sizes s where s.id = p_size and s.campus_id = p_campus for update;
    if not found then raise exception 'Effectif introuvable.' using errcode = 'P0002'; end if;
    update public.campus_class_sizes s set cycle = p_cycle, level_label = nullif(btrim(p_level_label), ''),
      band = p_band::public.class_size_band, detail = nullif(btrim(p_detail), ''), said_on = p_said_on
    where s.id = p_size returning s.id, to_jsonb(s) into v_id, v_apres;
  else
    insert into public.campus_class_sizes (campus_id, cycle, level_label, band, detail, said_on)
    values (p_campus, p_cycle, nullif(btrim(p_level_label), ''), p_band::public.class_size_band, nullif(btrim(p_detail), ''), p_said_on)
    returning id, to_jsonb(campus_class_sizes) into v_id, v_apres;
  end if;
  insert into prive.campus_detail_history (topic, row_id, campus_id, action, before_data, after_data, recorded_by)
  values ('effectif', v_id, p_campus, case when p_size is null then 'ajout' else 'modification' end, v_avant, v_apres, public.current_user_id());
  return v_id;
exception
  when unique_violation then
    raise exception 'Un effectif existe déjà pour cette classe : modifie-le.' using errcode = '22023';
  when check_violation or invalid_text_representation then
    raise exception 'Vérifie la tranche (une précision pour « autre »), la classe (40 caractères) et la précision (120).' using errcode = '22023';
end;
$$;
comment on function public.set_campus_class_size(uuid, uuid, public.niveau, text, text, text, date) is
  'Dire l''effectif d''une classe, en tranches, au jour où l''école l''a dit.';
revoke all on function public.set_campus_class_size(uuid, uuid, public.niveau, text, text, text, date) from public, anon, authenticated;
grant execute on function public.set_campus_class_size(uuid, uuid, public.niveau, text, text, text, date) to authenticated;

create function public.withdraw_campus_class_size(p_campus uuid, p_size uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_avant jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  delete from public.campus_class_sizes s where s.id = p_size and s.campus_id = p_campus returning to_jsonb(s) into v_avant;
  if v_avant is null then raise exception 'Effectif introuvable.' using errcode = 'P0002'; end if;
  insert into prive.campus_detail_history (topic, row_id, campus_id, action, before_data, recorded_by)
  values ('effectif', p_size, p_campus, 'retrait', v_avant, public.current_user_id());
end;
$$;
revoke all on function public.withdraw_campus_class_size(uuid, uuid) from public, anon, authenticated;
grant execute on function public.withdraw_campus_class_size(uuid, uuid) to authenticated;

-- P5 : les demandes des familles, comptées sans nom ni numéro --------------------------------------------------------------------------------
create table public.family_demands (
  id bigint generated always as identity primary key,
  kind public.family_demand_kind not null,
  campus_id uuid references public.campuses (id) on delete cascade,
  profile public.orientation_profile,
  domain_id smallint references public.education_domains (id),
  division_id uuid references public.geo_divisions (id),
  rhythm public.study_rhythm,
  bac_track public.bac_track,
  demand_day date not null default ((current_timestamp at time zone 'Africa/Brazzaville')::date),
  device_day_key text not null check (device_day_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint family_demands_sujet check (
    (kind = 'verification' and campus_id is not null and profile is null and domain_id is null and division_id is null
       and rhythm is null and bac_track is null)
    or (kind = 'orientation' and campus_id is null and profile is not null)
  ),
  constraint family_demands_une_par_jour unique nulls not distinct
    (kind, campus_id, profile, domain_id, division_id, rhythm, bac_track, demand_day, device_day_key)
);
comment on table public.family_demands is
  'Les demandes des familles, sans nom ni numéro : une fiche à vérifier, ou un test d''orientation sans résultat. '
  '`device_day_key` : l''empreinte (SHA-256) d''une clé tirée au hasard dans le navigateur et du jour, jamais la clé.';
alter table public.family_demands enable row level security;
revoke all on table public.family_demands from public, anon, authenticated, service_role;
revoke all on sequence public.family_demands_id_seq from public, anon, authenticated, service_role;
grant select on table public.family_demands to authenticated;
create policy "L'administration lit les demandes des familles" on public.family_demands for select to authenticated
  using ((select public.est_admin()));

create function public.count_family_demand(
  p_kind text, p_device_day_key text, p_campus uuid default null, p_profile text default null, p_domain text default null,
  p_division uuid default null, p_rhythm text default null, p_bac_track text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare v_domaine smallint;
begin
  if p_kind = 'verification' then
    if p_campus is null or not exists (select 1 from public.campuses c where c.id = p_campus and c.publication = 'publiee') then
      raise exception 'Cette fiche n''est pas publiée.' using errcode = '22023';
    end if;
  elsif p_kind = 'orientation' then
    if nullif(p_profile, '') is null then
      raise exception 'Le profil du test manque.' using errcode = '22023';
    end if;
    if nullif(p_domain, '') is not null then
      select d.id into v_domaine from public.education_domains d where d.slug = p_domain;
      if v_domaine is null then raise exception 'Ce domaine n''existe pas.' using errcode = '22023'; end if;
    end if;
  else
    raise exception 'Une demande est une vérification ou une orientation.' using errcode = '22023';
  end if;
  insert into public.family_demands (kind, campus_id, profile, domain_id, division_id, rhythm, bac_track, device_day_key)
  values (
    p_kind::public.family_demand_kind,
    case when p_kind = 'verification' then p_campus end,
    case when p_kind = 'orientation' then p_profile::public.orientation_profile end,
    v_domaine,
    case when p_kind = 'orientation' then p_division end,
    case when p_kind = 'orientation' then nullif(p_rhythm, '')::public.study_rhythm end,
    case when p_kind = 'orientation' then nullif(p_bac_track, '')::public.bac_track end,
    lower(p_device_day_key)
  );
  return 'comptee';
exception
  when unique_violation then
    return 'deja_comptee';
  when check_violation or invalid_text_representation or foreign_key_violation or not_null_violation then
    raise exception 'Demande illisible : rien n''est compté.' using errcode = '22023';
end;
$$;
comment on function public.count_family_demand(text, text, uuid, text, text, uuid, text, text) is
  'Compter une demande de famille, sans nom ni numéro : « comptee », ou « deja_comptee » (même téléphone, même sujet, même jour).';
revoke all on function public.count_family_demand(text, text, uuid, text, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.count_family_demand(text, text, uuid, text, text, uuid, text, text) to anon, authenticated;

-- Ce que l'Espace écoles montre : le nombre de demandes de vérification d'une fiche publiée, à partir de 5.
create view public.public_verification_demands with (security_barrier = true) as
select d.campus_id, count(*)::integer as demands, min(d.demand_day) as since
from public.family_demands d
join public.campuses c on c.id = d.campus_id and c.publication = 'publiee'
where d.kind = 'verification'
group by d.campus_id
having count(*) >= 5;
comment on view public.public_verification_demands is
  'Les familles qui ont demandé la vérification d''une fiche publiée : le nombre et le premier jour, à partir de 5 demandes.';
revoke all on table public.public_verification_demands from public, anon, authenticated, service_role;
grant select on table public.public_verification_demands to anon, authenticated;
