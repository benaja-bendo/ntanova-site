-- Équipements datés : aucune absence déduite d'une observation incomplète.
create domain public.equipment_key as text check (value in ('electricite','eau','cantine','transport','bibliotheque','informatique','terrain_sport','cloture','autre'));
create domain public.equipment_state as text check (value in ('present','absent','non_precise'));
create domain public.fact_source as text check (value in ('ecole','terrain'));
create table public.campus_facts (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  key public.equipment_key not null,
  custom_label text check (length(btrim(custom_label)) between 1 and 80),
  value public.equipment_state not null,
  source public.fact_source not null,
  observed_on date not null,
  note text check (length(btrim(note)) between 1 and 300),
  constraint campus_facts_autre_precise check ((key='autre')=(custom_label is not null)),
  constraint campus_facts_terrain_visible check (source<>'terrain' or (value='present' and key in ('cloture','terrain_sport','autre'))),
  constraint campus_facts_equipement_unique unique nulls not distinct (campus_id,key,custom_label)
);
alter table public.campus_facts enable row level security;
revoke all on public.campus_facts from public,anon,authenticated,service_role;
grant select on public.campus_facts to anon,authenticated;
create policy "Équipements des écoles publiées" on public.campus_facts for select to anon,authenticated
  using (exists (select 1 from public.campuses c where c.id=campus_id and c.publication='publiee'));
create policy "Administration lit les équipements" on public.campus_facts for select to authenticated using ((select public.est_admin()));
create table prive.campus_fact_history (
  id bigint generated always as identity primary key,
  fact_id uuid not null,
  campus_id uuid not null references public.campuses(id),
  action text not null check (action in ('ajout','modification','retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null
);
alter table prive.campus_fact_history enable row level security;
revoke all on prive.campus_fact_history from public,anon,authenticated,service_role;
revoke all on sequence prive.campus_fact_history_id_seq from public,anon,authenticated,service_role;
create function public.set_school_fact(
  p_campus uuid,p_fact uuid,p_key public.equipment_key,p_label text,p_value public.equipment_state,
  p_source public.fact_source,p_observed_on date,p_note text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_before jsonb;v_after jsonb;v_id uuid;
begin
  perform public.exiger_admin_session();
  if p_key is null or p_value is null or p_source is null or p_observed_on is null
    or p_observed_on>(current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'Équipement, état, source et date réelle sont requis.' using errcode='22023';
  end if;
  if p_key='autre' and nullif(btrim(p_label),'') is null then
    raise exception 'Précise cet autre équipement.' using errcode='22023';
  end if;
  if p_source='terrain' and (p_value<>'present' or p_key not in ('cloture','terrain_sport','autre')) then
    raise exception 'Le terrain atteste seulement un élément réellement visible ; une absence ou un service doit être déclaré par l’école.' using errcode='22023';
  end if;
  if not exists (select 1 from public.campuses where id=p_campus) then raise exception 'École introuvable.' using errcode='P0002';end if;
  if p_fact is not null then
    select to_jsonb(f) into v_before from public.campus_facts f where id=p_fact and campus_id=p_campus for update;
    if not found then raise exception 'Équipement introuvable.' using errcode='P0002';end if;
    update public.campus_facts f set key=p_key,custom_label=case when p_key='autre' then nullif(btrim(p_label),'') else null end,
      value=p_value,source=p_source,observed_on=p_observed_on,note=nullif(btrim(p_note),'')
      where id=p_fact returning id,to_jsonb(f) into v_id,v_after;
  else
    insert into public.campus_facts(campus_id,key,custom_label,value,source,observed_on,note)
      values(p_campus,p_key,case when p_key='autre' then nullif(btrim(p_label),'') else null end,p_value,p_source,p_observed_on,nullif(btrim(p_note),''))
      returning id,to_jsonb(campus_facts) into v_id,v_after;
  end if;
  insert into prive.campus_fact_history(fact_id,campus_id,action,before_data,after_data,recorded_by)
    values(v_id,p_campus,case when p_fact is null then 'ajout' else 'modification' end,v_before,v_after,public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Cet équipement existe déjà : modifie sa ligne.' using errcode='22023';
end;
$$;
create function public.withdraw_school_fact(p_campus uuid,p_fact uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_before jsonb;
begin
  perform public.exiger_admin_session();
  delete from public.campus_facts f where id=p_fact and campus_id=p_campus returning to_jsonb(f) into v_before;
  if not found then raise exception 'Équipement introuvable.' using errcode='P0002';end if;
  insert into prive.campus_fact_history(fact_id,campus_id,action,before_data,recorded_by)
    values(p_fact,p_campus,'retrait',v_before,public.current_user_id());
end;
$$;
revoke all on function public.set_school_fact(uuid,uuid,public.equipment_key,text,public.equipment_state,public.fact_source,date,text),public.withdraw_school_fact(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_school_fact(uuid,uuid,public.equipment_key,text,public.equipment_state,public.fact_source,date,text),public.withdraw_school_fact(uuid,uuid) to authenticated;
