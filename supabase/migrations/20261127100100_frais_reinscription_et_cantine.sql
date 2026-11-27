-- Ticket 236 (retours du 27/11), point 9 : la réinscription et la cantine, annoncées par des affiches d'écoles. Deux montants
-- de plus sur une ligne de frais, sous la même règle que les autres : publics seulement avec le OUI daté de l'école
-- (`confirmed_on`, `confirm_school_fees`) ; les changer l'efface.
--
-- Compatible avec ce qui est en ligne : l'ancienne administration enregistre une ligne sans ces deux montants (nuls), le site
-- construit avant lit les lignes confirmées sans les regarder.

alter table public.campus_fees
  add column re_registration integer check (re_registration >= 0),
  add column canteen integer check (canteen >= 0),
  add column canteen_period text check (canteen_period in ('jour', 'mois', 'trimestre', 'annee')),
  add constraint campus_fees_cantine_et_sa_periode check ((canteen is null) = (canteen_period is null));
comment on column public.campus_fees.re_registration is 'La réinscription demandée à un élève déjà inscrit, en FCFA ; nul : pas dit.';
comment on column public.campus_fees.canteen is 'La cantine, en FCFA, pour la période `canteen_period` ; nul : pas dit.';
comment on column public.campus_fees.canteen_period is 'La période de la cantine : jour, mois, trimestre ou année.';

-- Trois paramètres de plus : l'ancienne signature part d'abord (les appels nommés d'avant gardent leur sens).
drop function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer);
create function public.set_school_fee(
  p_campus uuid, p_fee uuid, p_cycle public.niveau, p_minimum integer, p_maximum integer, p_period text,
  p_period_detail text, p_registration integer, p_school_year text, p_declared_on date, p_note text,
  p_level_label text default null, p_program uuid default null, p_evidence text default 'declaration', p_proof_photo uuid default null,
  p_billed_months integer default null, p_re_registration integer default null, p_canteen integer default null,
  p_canteen_period text default null
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
  if p_re_registration < 0 or p_canteen < 0 or (p_canteen is null) <> (p_canteen_period is null)
     or p_canteen_period not in ('jour', 'mois', 'trimestre', 'annee') then
    raise exception 'La réinscription et la cantine sont des montants positifs ; la cantine dit par jour, mois, trimestre ou année.'
      using errcode = '22023';
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
      evidence=coalesce(p_evidence, 'declaration'), proof_photo_id=p_proof_photo, billed_months=p_billed_months,
      re_registration=p_re_registration, canteen=p_canteen, canteen_period=p_canteen_period
      where id=p_fee returning id,to_jsonb(f) into v_id,v_after;
    -- Des montants changés n'ont plus le OUI de l'école : la ligne attend le prochain, et quitte le site d'ici là.
    if (v_after - 'confirmed_on') is distinct from (v_before - 'confirmed_on') and v_after ->> 'confirmed_on' is not null then
      update public.campus_fees f set confirmed_on = null where id = v_id returning to_jsonb(f) into v_after;
    end if;
  else
    insert into public.campus_fees(campus_id,cycle,minimum,maximum,period,period_detail,registration,school_year,declared_on,note,
                                   level_label,program_id,evidence,proof_photo_id,billed_months,re_registration,canteen,canteen_period)
      values (p_campus,p_cycle,p_minimum,p_maximum,p_period,
        case when p_period='autre' then nullif(btrim(p_period_detail),'') else null end,
        p_registration,nullif(btrim(p_school_year),''),p_declared_on,nullif(btrim(p_note),''),
        nullif(btrim(p_level_label),''),p_program,coalesce(p_evidence, 'declaration'),p_proof_photo,p_billed_months,
        p_re_registration,p_canteen,p_canteen_period)
      returning id,to_jsonb(campus_fees) into v_id,v_after;
  end if;
  insert into prive.campus_fee_history(fee_id,campus_id,action,before_data,after_data,recorded_by)
    values(v_id,p_campus,case when p_fee is null then 'ajout' else 'modification' end,v_before,v_after,public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Une ligne existe déjà pour ce cycle, cette classe, cette formation, cette période et cette année : modifie-la.' using errcode = '22023';
end;
$$;
comment on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer, integer, integer, text) is
  'Une ligne de frais : cycle, classe (facultative), formation (supérieur), montants, période, inscription, réinscription, cantine, année, date et preuve.';
revoke all on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer, integer, integer, text) from public, anon, authenticated;
grant execute on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid, integer, integer, integer, text) to authenticated;
