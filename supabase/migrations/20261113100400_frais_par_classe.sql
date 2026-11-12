-- M5. Les frais par classe et par formation (canevas « Frais par classe », « Frais depuis le prospectus », supérieur ; 13/11).
--
-- - `level_label` : la classe ou le groupe de classes d'une ligne (« CP1 à CM2 », « 3e »). Le cycle reste obligatoire : une
--   école peut toujours déclarer un seul tarif par cycle.
-- - `program_id` : les frais d'une formation du supérieur (« BTS : [min] à [max] FCFA par an »).
-- - `evidence` et `proof_photo_id` : ce qui prouve la ligne. Une déclaration de l'école, ou le prospectus photographié par un
--   relais (une **photo de travail**, jamais publique : la ligne recopiée est publiée, pas la photo).
-- - **Une ligne illisible n'entre jamais ici** : on n'invente pas de montant. Elle devient un manque (`campus_requests`, M6).
-- - `source` reste `ecole` : un prospectus est un document de l'école. La page dit « d'après le prospectus du [date] ».
-- La table est vide en production (13/11) : changer sa clé d'unicité ne touche aucune ligne.

alter table public.campus_fees
  add column level_label text check (length(btrim(level_label)) between 1 and 40),
  add column program_id uuid references public.campus_programs (id) on delete restrict,
  add column evidence text not null default 'declaration' check (evidence in ('declaration', 'prospectus')),
  add column proof_photo_id uuid references public.field_submission_photos (id) on delete set null,
  add constraint campus_fees_preuve_du_prospectus check (proof_photo_id is null or evidence = 'prospectus');
comment on column public.campus_fees.level_label is 'La classe ou le groupe de classes de la ligne (« CP1 à CM2 », « 3e ») ; nul : tout le cycle.';
comment on column public.campus_fees.program_id is 'Les frais d''une formation (supérieur), par an en général.';
comment on column public.campus_fees.evidence is 'Ce qui prouve la ligne : la déclaration de l''école, ou son prospectus photographié.';
comment on column public.campus_fees.proof_photo_id is 'La photo du prospectus (photo de travail, jamais publique).';

alter table public.campus_fees drop constraint campus_fees_ligne_unique;
alter table public.campus_fees add constraint campus_fees_ligne_unique
  unique nulls not distinct (campus_id, cycle, level_label, program_id, period, period_detail, school_year);

-- Une formation qui porte des frais ne part pas en silence ---------------------------------------------------------------------------------------
create function prive.garder_frais_formation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.campus_fees f where f.program_id = old.id) then
    raise exception 'Cette formation porte des frais : retire-les d''abord.' using errcode = '22023';
  end if;
  return old;
end;
$$;
create trigger campus_programs_frais_avant_retrait before delete on public.campus_programs
  for each row execute function prive.garder_frais_formation();

-- Enregistrer une ligne : les anciens appels marchent toujours (paramètres nouveaux à la fin, avec une valeur par défaut) ------------------------
drop function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text);
create function public.set_school_fee(
  p_campus uuid, p_fee uuid, p_cycle public.niveau, p_minimum integer, p_maximum integer, p_period text,
  p_period_detail text, p_registration integer, p_school_year text, p_declared_on date, p_note text,
  p_level_label text default null, p_program uuid default null, p_evidence text default 'declaration', p_proof_photo uuid default null
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
      evidence=coalesce(p_evidence, 'declaration'), proof_photo_id=p_proof_photo
      where id=p_fee returning id,to_jsonb(f) into v_id,v_after;
  else
    insert into public.campus_fees(campus_id,cycle,minimum,maximum,period,period_detail,registration,school_year,declared_on,note,
                                   level_label,program_id,evidence,proof_photo_id)
      values (p_campus,p_cycle,p_minimum,p_maximum,p_period,
        case when p_period='autre' then nullif(btrim(p_period_detail),'') else null end,
        p_registration,nullif(btrim(p_school_year),''),p_declared_on,nullif(btrim(p_note),''),
        nullif(btrim(p_level_label),''),p_program,coalesce(p_evidence, 'declaration'),p_proof_photo)
      returning id,to_jsonb(campus_fees) into v_id,v_after;
  end if;
  insert into prive.campus_fee_history(fee_id,campus_id,action,before_data,after_data,recorded_by)
    values(v_id,p_campus,case when p_fee is null then 'ajout' else 'modification' end,v_before,v_after,public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Une ligne existe déjà pour ce cycle, cette classe, cette formation, cette période et cette année : modifie-la.' using errcode = '22023';
end;
$$;
comment on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid) is
  'Une ligne de frais : cycle, classe (facultative), formation (supérieur), montants, période, inscription, année, date et preuve (déclaration ou prospectus photographié).';
revoke all on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_school_fee(uuid, uuid, public.niveau, integer, integer, text, text, integer, text, date, text, text, uuid, text, uuid) to authenticated;
