-- Origine déclarée par l'école : saisie admin, aucune publication ou preuve terrain induite.
alter domain public.origin_kind drop constraint origin_kind_check;
alter domain public.origin_kind add constraint origin_kind_check check (value in ('field','admin','import','school')) not valid;
alter table public.campuses add column school_declared_on date,
  add constraint campuses_declaration_date check(origin <> 'school' or school_declared_on is not null);

create table prive.school_declarations (
  id bigint generated always as identity primary key,
  campus_id uuid not null references public.campuses(id),
  declared_on date not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null
);
alter table prive.school_declarations enable row level security;
revoke all on prive.school_declarations from public,anon,authenticated,service_role;
revoke all on sequence prive.school_declarations_id_seq from public,anon,authenticated,service_role;

create function prive.proteger_declaration_ecole() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('anon','authenticated') and (
    (tg_op='INSERT' and (new.origin='school' or new.school_declared_on is not null))
    or (tg_op='UPDATE' and (new.school_declared_on is distinct from old.school_declared_on
      or (new.origin is distinct from old.origin and (new.origin='school' or old.origin='school'))))
  ) then
    raise exception 'Utiliser la commande de déclaration de l’école.' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function prive.proteger_declaration_ecole() from public,anon,authenticated;
create trigger campuses_proteger_declaration before insert or update on public.campuses
for each row execute function prive.proteger_declaration_ecole();

create function public.create_school_declaration(p_entry jsonb,p_declared_on date,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;v_id uuid;
begin
  perform public.exiger_admin_session();
  if p_confirmed is distinct from true or p_declared_on is null
    or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'Date réelle et transmission par l’école pour publication requises.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(p_entry->'campuses') c where nullif(btrim(c->>'sign_phone'),'') is not null) then
    raise exception 'Le contact public nécessite son accord séparé.' using errcode='22023';
  end if;
  -- La commande existante garde ses contrôles de doublons, division et publication.
  -- L'état intermédiaire admin reste dans la même transaction, jamais visible hors de cet appel.
  v_result:=public.create_catalog_entry(p_entry,'admin');
  if v_result->>'status'='created' then
    for v_id in select value::uuid from jsonb_array_elements_text(v_result->'campus_ids') loop
      update public.campuses set origin='school',school_declared_on=p_declared_on where id=v_id;
      update public.campus_programs set origin='school' where campus_cycle_id in (select id from public.campus_cycles where campus_id=v_id);
      insert into prive.school_declarations(campus_id,declared_on,recorded_by)
        values(v_id,p_declared_on,public.current_user_id());
    end loop;
  end if;
  return v_result;
end;
$$;
revoke all on function public.create_school_declaration(jsonb,date,boolean) from public,anon,authenticated,service_role;
grant execute on function public.create_school_declaration(jsonb,date,boolean) to authenticated;

create or replace view public.public_campuses with (security_invoker = true) as
select
  c.id,
  c.institution_id,
  i.name as institution_name,
  c.label,
  i.kind,
  c.slug,
  c.division_id,
  d.path::text as division_path,
  (select array_agg(a.slug::text order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_slugs,
  (select array_agg(a.name order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_names,
  c.neighbourhood,
  c.landmark,
  c.sign_phone,
  extensions.st_y(c.position) as latitude,
  extensions.st_x(c.position) as longitude,
  c.verification_state,
  c.verified_on,
  c.curriculum_note,
  c.surveyed_at,
  c.located_at,
  c.origin,
  c.updated_at,
  c.public_phone,
  c.public_phone_agreed_on,
  c.school_declared_on
from public.campuses c
join public.institutions i on i.id = c.institution_id
join public.geo_divisions d on d.id = c.division_id
where c.publication = 'publiee';
