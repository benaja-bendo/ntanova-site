-- Le mot de la direction et la date limite des inscriptions (ticket 148, décision du fondateur du 08/11/2026).
--
-- Le mot : une parole de l'école, telle qu'elle l'a remise, datée, sans nom de personne ; il ne paraît que sur une fiche confirmée
-- par la direction (la vue le garde), et son accord (fonction, canal) reste en privé. La date limite : déclarée par l'école et datée,
-- comme les frais, sans exiger de confirmation. Aucune de ces deux données ne donne de badge.

create table public.campus_statements (
  campus_id uuid primary key references public.campuses(id),
  body text not null check (length(btrim(body)) between 1 and 400),
  stated_on date not null
);
alter table public.campus_statements enable row level security;
revoke all on public.campus_statements from public, anon, authenticated, service_role;
grant select on public.campus_statements to authenticated;
create policy "Administration lit les mots de la direction" on public.campus_statements for select to authenticated
  using ((select public.est_admin()));

create view public.public_campus_statements with (security_barrier = true) as
select s.campus_id, s.body, s.stated_on
from public.campus_statements s
join public.campuses c on c.id = s.campus_id
where c.publication = 'publiee' and c.trashed_at is null and c.verification_state = 'verifiee';
revoke all on public.public_campus_statements from public, anon, authenticated, service_role;
grant select on public.public_campus_statements to anon, authenticated;

create table prive.campus_statement_agreements (
  id bigint generated always as identity primary key,
  campus_id uuid not null references public.campuses(id),
  body text,
  stated_on date,
  agreed_role public.fonction_direction,
  channel text check (channel in ('whatsapp', 'appel', 'sur_place', 'autre')),
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  constraint campus_statement_accord_complet check (
    (body is null and stated_on is null and agreed_role is null and channel is null)
    or (body is not null and stated_on is not null and agreed_role is not null and channel is not null)
  )
);
alter table prive.campus_statement_agreements enable row level security;
revoke all on prive.campus_statement_agreements from public, anon, authenticated, service_role;
revoke all on sequence prive.campus_statement_agreements_id_seq from public, anon, authenticated, service_role;

-- `p_body` nul : le retrait, tracé comme un ajout.
create function public.set_campus_statement(
  p_campus uuid, p_body text, p_stated_on date, p_role public.fonction_direction, p_channel text
) returns void language plpgsql security definer set search_path = '' as $$
declare v_texte text := nullif(btrim(p_body), '');
begin
  perform public.exiger_admin_session();
  if v_texte is null then
    if p_stated_on is not null or p_role is not null or p_channel is not null then
      raise exception 'Écris le mot de la direction, ou retire-le sans rien d’autre.' using errcode = '22023';
    end if;
  elsif length(v_texte) > 400 or p_stated_on is null
    or p_stated_on > (current_timestamp at time zone 'Africa/Brazzaville')::date
    or p_role is null or p_channel is null or p_channel not in ('whatsapp', 'appel', 'sur_place', 'autre') then
    raise exception 'Le mot (400 caractères au plus), sa date réelle, la fonction et le canal de l’accord sont requis.' using errcode = '22023';
  end if;
  perform 1 from public.campuses where id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if v_texte is null then
    delete from public.campus_statements where campus_id = p_campus;
    if not found then raise exception 'Cette école n’a pas de mot de la direction.' using errcode = 'P0002'; end if;
  else
    insert into public.campus_statements (campus_id, body, stated_on) values (p_campus, v_texte, p_stated_on)
    on conflict (campus_id) do update set body = excluded.body, stated_on = excluded.stated_on;
  end if;
  update public.campuses set updated_at = now() where id = p_campus;
  insert into prive.campus_statement_agreements (campus_id, body, stated_on, agreed_role, channel, recorded_by)
  values (p_campus, v_texte, p_stated_on, p_role, p_channel, public.current_user_id());
end;
$$;
revoke all on function public.set_campus_statement(uuid, text, date, public.fonction_direction, text) from public, anon, authenticated, service_role;
grant execute on function public.set_campus_statement(uuid, text, date, public.fonction_direction, text) to authenticated;

create table public.campus_enrollment_deadlines (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  school_year text not null check (length(btrim(school_year)) between 1 and 30),
  deadline date not null,
  declared_on date not null,
  constraint campus_enrollment_une_par_annee unique (campus_id, school_year),
  constraint campus_enrollment_limite_apres_declaration check (deadline >= declared_on)
);
alter table public.campus_enrollment_deadlines enable row level security;
revoke all on public.campus_enrollment_deadlines from public, anon, authenticated, service_role;
grant select on public.campus_enrollment_deadlines to anon, authenticated;
create policy "Inscriptions des écoles publiées" on public.campus_enrollment_deadlines for select to anon, authenticated
  using (exists (select 1 from public.campuses c where c.id = campus_id and c.publication = 'publiee' and c.trashed_at is null));
create policy "Administration lit les inscriptions" on public.campus_enrollment_deadlines for select to authenticated
  using ((select public.est_admin()));

create table prive.campus_enrollment_history (
  id bigint generated always as identity primary key,
  deadline_id uuid not null,
  campus_id uuid not null references public.campuses(id),
  action text not null check (action in ('ajout', 'modification', 'retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null
);
alter table prive.campus_enrollment_history enable row level security;
revoke all on prive.campus_enrollment_history from public, anon, authenticated, service_role;
revoke all on sequence prive.campus_enrollment_history_id_seq from public, anon, authenticated, service_role;

create function public.set_campus_enrollment_deadline(
  p_campus uuid, p_deadline_id uuid, p_school_year text, p_deadline date, p_declared_on date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_annee text := nullif(btrim(p_school_year), '');
  v_id uuid;
  v_avant jsonb;
  v_apres jsonb;
begin
  perform public.exiger_admin_session();
  if v_annee is null or length(v_annee) > 30 or p_deadline is null or p_declared_on is null
    or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date or p_deadline < p_declared_on then
    raise exception 'Indique l’année scolaire, la date limite et la date réelle de la déclaration ; la limite ne précède pas la déclaration.' using errcode = '22023';
  end if;
  perform 1 from public.campuses where id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if p_deadline_id is null then
    insert into public.campus_enrollment_deadlines (campus_id, school_year, deadline, declared_on)
    values (p_campus, v_annee, p_deadline, p_declared_on)
    returning id, to_jsonb(campus_enrollment_deadlines) into v_id, v_apres;
  else
    select to_jsonb(d) into v_avant from public.campus_enrollment_deadlines d
    where d.id = p_deadline_id and d.campus_id = p_campus for update;
    if not found then raise exception 'Date d’inscription introuvable.' using errcode = 'P0002'; end if;
    update public.campus_enrollment_deadlines d set school_year = v_annee, deadline = p_deadline, declared_on = p_declared_on
    where d.id = p_deadline_id returning d.id, to_jsonb(d) into v_id, v_apres;
  end if;
  update public.campuses set updated_at = now() where id = p_campus;
  insert into prive.campus_enrollment_history (deadline_id, campus_id, action, before_data, after_data, recorded_by)
  values (v_id, p_campus, case when v_avant is null then 'ajout' else 'modification' end, v_avant, v_apres, public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Une date existe déjà pour cette année scolaire : modifie-la.' using errcode = '22023';
end;
$$;
revoke all on function public.set_campus_enrollment_deadline(uuid, uuid, text, date, date) from public, anon, authenticated, service_role;
grant execute on function public.set_campus_enrollment_deadline(uuid, uuid, text, date, date) to authenticated;

create function public.remove_campus_enrollment_deadline(p_campus uuid, p_deadline_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_avant jsonb;
begin
  perform public.exiger_admin_session();
  delete from public.campus_enrollment_deadlines d where d.id = p_deadline_id and d.campus_id = p_campus returning to_jsonb(d) into v_avant;
  if not found then raise exception 'Date d’inscription introuvable.' using errcode = 'P0002'; end if;
  update public.campuses set updated_at = now() where id = p_campus;
  insert into prive.campus_enrollment_history (deadline_id, campus_id, action, before_data, recorded_by)
  values (p_deadline_id, p_campus, 'retrait', v_avant, public.current_user_id());
end;
$$;
revoke all on function public.remove_campus_enrollment_deadline(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_campus_enrollment_deadline(uuid, uuid) to authenticated;
