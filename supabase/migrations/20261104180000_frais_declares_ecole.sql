-- Frais communiqués par l'école : données publiques déclaratives, aucun encaissement.
create table public.campus_fees (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  cycle public.niveau not null,
  minimum integer not null check (minimum >= 0),
  maximum integer not null check (maximum >= minimum),
  period text not null check (period in ('mois','trimestre','annee','autre')),
  period_detail text check (length(btrim(period_detail)) between 1 and 80),
  registration integer check (registration >= 0),
  school_year text check (length(btrim(school_year)) between 1 and 30),
  declared_on date not null,
  source text not null default 'ecole' check (source = 'ecole'),
  note text check (length(btrim(note)) between 1 and 300),
  constraint campus_fees_cycle foreign key (campus_id,cycle) references public.campus_cycles(campus_id,cycle),
  constraint campus_fees_periode_precisee check ((period = 'autre') = (period_detail is not null)),
  constraint campus_fees_ligne_unique unique nulls not distinct (campus_id,cycle,period,period_detail,school_year)
);
alter table public.campus_fees enable row level security;
revoke all on public.campus_fees from public, anon, authenticated, service_role;
grant select on public.campus_fees to anon, authenticated;
create policy "Frais des écoles publiées" on public.campus_fees for select to anon, authenticated
  using (exists (select 1 from public.campuses c where c.id = campus_id and c.publication = 'publiee'));
create policy "Administration lit les frais" on public.campus_fees for select to authenticated
  using ((select public.est_admin()));

create table prive.campus_fee_history (
  id bigint generated always as identity primary key,
  fee_id uuid not null,
  campus_id uuid not null references public.campuses(id),
  action text not null check (action in ('ajout','modification','retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null
);
alter table prive.campus_fee_history enable row level security;
revoke all on prive.campus_fee_history from public, anon, authenticated, service_role;
revoke all on sequence prive.campus_fee_history_id_seq from public, anon, authenticated, service_role;

create function public.set_school_fee(
  p_campus uuid, p_fee uuid, p_cycle public.niveau, p_minimum integer, p_maximum integer,
  p_period text, p_period_detail text, p_registration integer, p_school_year text,
  p_declared_on date, p_note text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_before jsonb; v_after jsonb;
begin
  perform public.exiger_admin_session();
  if p_declared_on is null or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date
    or p_minimum is null or p_maximum is null or p_minimum < 0 or p_maximum < p_minimum
    or p_registration < 0 or p_period is null or p_period not in ('mois','trimestre','annee','autre')
    or (p_period = 'autre' and nullif(btrim(p_period_detail),'') is null) then
    raise exception 'Vérifie les montants, la période et la date réelle de déclaration.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campus_cycles where campus_id = p_campus and cycle = p_cycle) then
    raise exception 'Ce cycle doit être renseigné dans la fiche de l’école.' using errcode = '22023';
  end if;
  if p_fee is not null then
    select to_jsonb(f) into v_before from public.campus_fees f where id = p_fee and campus_id = p_campus for update;
    if not found then raise exception 'Ligne de frais introuvable.' using errcode = 'P0002'; end if;
    update public.campus_fees f set cycle=p_cycle,minimum=p_minimum,maximum=p_maximum,period=p_period,
      period_detail=case when p_period='autre' then nullif(btrim(p_period_detail),'') else null end,
      registration=p_registration, school_year=nullif(btrim(p_school_year),''), declared_on=p_declared_on,
      note=nullif(btrim(p_note),'') where id=p_fee returning id,to_jsonb(f) into v_id,v_after;
  else
    insert into public.campus_fees(campus_id,cycle,minimum,maximum,period,period_detail,registration,school_year,declared_on,note)
      values (p_campus,p_cycle,p_minimum,p_maximum,p_period,
        case when p_period='autre' then nullif(btrim(p_period_detail),'') else null end,
        p_registration,nullif(btrim(p_school_year),''),p_declared_on,nullif(btrim(p_note),''))
      returning id,to_jsonb(campus_fees) into v_id,v_after;
  end if;
  insert into prive.campus_fee_history(fee_id,campus_id,action,before_data,after_data,recorded_by)
    values(v_id,p_campus,case when p_fee is null then 'ajout' else 'modification' end,v_before,v_after,public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Une ligne existe déjà pour ce cycle, cette période et cette année scolaire : modifie-la.' using errcode = '22023';
end;
$$;
create function public.withdraw_school_fee(p_campus uuid, p_fee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  perform public.exiger_admin_session();
  delete from public.campus_fees f where id=p_fee and campus_id=p_campus returning to_jsonb(f) into v_before;
  if not found then raise exception 'Ligne de frais introuvable.' using errcode='P0002'; end if;
  insert into prive.campus_fee_history(fee_id,campus_id,action,before_data,recorded_by)
    values(p_fee,p_campus,'retrait',v_before,public.current_user_id());
end;
$$;
revoke all on function public.set_school_fee(uuid,uuid,public.niveau,integer,integer,text,text,integer,text,date,text) from public,anon,authenticated,service_role;
revoke all on function public.withdraw_school_fee(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_school_fee(uuid,uuid,public.niveau,integer,integer,text,text,integer,text,date,text), public.withdraw_school_fee(uuid,uuid) to authenticated;

create function prive.cycle_avec_frais() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.campus_fees where campus_id=old.campus_id and cycle=old.cycle) then
    raise exception 'Retire d’abord les frais déclarés pour ce cycle.' using errcode='22023';
  end if;
  return old;
end;
$$;
revoke all on function prive.cycle_avec_frais() from public,anon,authenticated,service_role;
create trigger campus_cycles_frais_avant_retrait before delete on public.campus_cycles
  for each row execute function prive.cycle_avec_frais();
