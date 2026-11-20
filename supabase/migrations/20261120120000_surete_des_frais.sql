-- Sûreté des frais (ticket 199, décisions du fondateur du 20/11), après la saisie des écoles du supérieur du 20/11.
--
-- - A1 : le frais de dossier d'une formation (`campus_programs.application_fee_xaf`) était public sans le OUI de l'école. Il
--   suit désormais la règle des frais (15/11) : `application_fee_confirmed_on` est le jour du OUI, posé par le même geste
--   « Noter le OUI de l'école » (`confirm_school_fees`) ; changer le montant l'efface. Le public ne le lit qu'avec ce jour :
--   la vue `public_campus_programs` le tait sinon, et le visiteur ne lit plus la colonne dans la table. Les frais de dossier
--   déjà notés attendent ce OUI (aucun n'en avait).
-- - A23 : une ligne de frais « à partir de 40 000 » n'a pas de maximum (`maximum` nul) ; un maximum, s'il est dit, reste au
--   moins égal au minimum.
-- - A14 : les lignes de frais gardent l'ordre de leur saisie (`created_at`), à l'administration et sur le site. Les lignes
--   d'avant prennent la date de leur premier enregistrement, lue dans l'historique.

-- A23 et A14 : la ligne de frais ---------------------------------------------------------------------------------------------------------------
alter table public.campus_fees
  alter column maximum drop not null,
  add column created_at timestamptz not null default clock_timestamp();
comment on column public.campus_fees.maximum is
  'Le montant le plus haut de la ligne ; égal au minimum pour un montant unique ; nul : « à partir de » le minimum.';
comment on column public.campus_fees.created_at is 'Quand la ligne a été saisie : l''ordre de la saisie, à l''administration et sur le site.';

update public.campus_fees f set created_at = h.premier
from (select fee_id, min(recorded_at) as premier from prive.campus_fee_history where action = 'ajout' group by fee_id) h
where h.fee_id = f.id;

-- `set_school_fee` : un maximum nul se lit « à partir de ». Mêmes paramètres, même corps sinon (20261115200000).
create or replace function public.set_school_fee(
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
    or p_minimum is null or p_minimum < 0 or (p_maximum is not null and p_maximum < p_minimum)
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

-- A1 : le frais de dossier et son OUI ----------------------------------------------------------------------------------------------------------
alter table public.campus_programs
  add column application_fee_confirmed_on date,
  add constraint campus_programs_oui_du_frais_de_dossier
    check (application_fee_confirmed_on is null or (application_fee_xaf is not null and application_fee_confirmed_on >= details_declared_on));
comment on column public.campus_programs.application_fee_confirmed_on is
  'Le jour du OUI écrit de l''école sur le frais de dossier. Nul : le frais n''est pas public. Changer le montant l''efface.';

-- `set_program_details` : un frais de dossier changé perd son OUI. Mêmes paramètres, même corps sinon (20261113100700).
create or replace function public.set_program_details(
  p_program uuid, p_duration_years numeric, p_admission_level text, p_selection public.selection_kind,
  p_application_fee_xaf integer, p_diploma_issuer text, p_declared_on date
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_campus uuid;
  v_before jsonb;
  v_after jsonb;
  v_rien boolean := p_duration_years is null and nullif(btrim(p_admission_level), '') is null and p_selection is null
                    and p_application_fee_xaf is null and nullif(btrim(p_diploma_issuer), '') is null;
begin
  select cc.campus_id, to_jsonb(p) into v_campus, v_before
  from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
  where p.id = p_program for update of p;
  if not found then raise exception 'Formation introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(v_campus);
  if not v_rien and (p_declared_on is null or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date) then
    raise exception 'Dis quand l''école l''a dit (une date réelle).' using errcode = '22023';
  end if;
  update public.campus_programs p set
    duration_years = p_duration_years, admission_level = nullif(btrim(p_admission_level), ''), selection = p_selection,
    application_fee_xaf = p_application_fee_xaf, diploma_issuer = nullif(btrim(p_diploma_issuer), ''),
    details_declared_on = case when v_rien then null else p_declared_on end,
    -- Le OUI porte sur un montant : un autre montant (ou plus de montant) l'attend de nouveau.
    application_fee_confirmed_on = case when p_application_fee_xaf is not distinct from p.application_fee_xaf
                                        and (v_rien or p_declared_on <= p.application_fee_confirmed_on)
                                        then p.application_fee_confirmed_on end
  where p.id = p_program
  returning to_jsonb(p) into v_after;
  insert into prive.program_detail_history (program_id, campus_id, before_data, after_data, recorded_by)
  values (p_program, v_campus, v_before, v_after, public.current_user_id());
exception when check_violation then
  raise exception 'Vérifie la durée (0,5 à 8 ans), le niveau demandé (80 caractères), les frais de dossier et « délivré par » (120).' using errcode = '22023';
end;
$$;

-- `confirm_school_fees` : le OUI de l'école vaut pour ses lignes de frais et pour les frais de dossier de ses formations.
create or replace function public.confirm_school_fees(p_campus uuid, p_confirmed_on date) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer := 0; v_ligne record; v_apres jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if p_confirmed_on is null or p_confirmed_on > (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'Donne le jour réel où l''école a répondu OUI.' using errcode = '22023';
  end if;
  if exists (select 1 from public.campus_fees f where f.campus_id = p_campus and f.confirmed_on is null and f.declared_on > p_confirmed_on)
     or exists (select 1 from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
                where cc.campus_id = p_campus and p.application_fee_xaf is not null and p.application_fee_confirmed_on is null
                  and p.details_declared_on > p_confirmed_on) then
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
  for v_ligne in
    select p.id, to_jsonb(p) as avant from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
    where cc.campus_id = p_campus and p.application_fee_xaf is not null and p.application_fee_confirmed_on is null
    for update of p
  loop
    update public.campus_programs p set application_fee_confirmed_on = p_confirmed_on where p.id = v_ligne.id
      returning to_jsonb(p) into v_apres;
    insert into prive.program_detail_history (program_id, campus_id, before_data, after_data, recorded_by)
      values (v_ligne.id, p_campus, v_ligne.avant, v_apres, public.current_user_id());
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'Aucune ligne de frais n''attend le OUI de cette école.' using errcode = '22023';
  end if;
  return v_n;
end;
$$;
comment on function public.confirm_school_fees(uuid, date) is
  'Le OUI écrit de l''école sur ses frais : ses lignes et les frais de dossier de ses formations qui l''attendent deviennent publics, datés de ce jour. Rend leur nombre.';

-- Ce que lit le public : la vue tait un frais de dossier sans OUI ; la table ne le montre plus au visiteur. La vue lit avec
-- ses propres droits (comme `public_campus_accreditations`) et ne garde que les sites publiés, comme la règle d'accès.
create or replace view public.public_campus_programs with (security_barrier = true) as
select cc.campus_id, cc.cycle, p.title, ed.slug as domain_slug, ed.name as domain_name, p.bac_track, p.diploma, p.rhythms,
       p.id as program_id, p.duration_years, p.admission_level, p.selection::text as selection,
       case when p.application_fee_confirmed_on is not null then p.application_fee_xaf end as application_fee_xaf,
       p.diploma_issuer, p.details_declared_on
from public.campus_programs p
join public.campus_cycles cc on cc.id = p.campus_cycle_id
join public.campuses c on c.id = cc.campus_id
left join public.education_domains ed on ed.id = p.domain_id
where c.publication = 'publiee';
alter view public.public_campus_programs reset (security_invoker);
revoke all on public.public_campus_programs from public, anon, authenticated;
grant select on public.public_campus_programs to anon, authenticated;

revoke select on public.campus_programs from anon;
grant select (id, campus_cycle_id, domain_id, title, bac_track, diploma, rhythms, origin, source_submission_id, created_at,
              duration_years, admission_level, selection, diploma_issuer, details_declared_on, accepted_bac_tracks)
  on public.campus_programs to anon;
