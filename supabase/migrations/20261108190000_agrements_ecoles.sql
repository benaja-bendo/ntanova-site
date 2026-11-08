-- L'agrément d'une école ou d'une filière (ticket 148, décision du fondateur du 08/11/2026) : la référence d'un document officiel,
-- saisie par l'administration seule, après avoir vu ce document. Sans ligne ici, le site n'écrit rien du tout.
--
-- - `kind` : l'intitulé suit le document (« agrément », « autorisation d'ouverture »…), avec une case de sortie.
-- - La source se dit en mots (`source_label`) ; le lien (`source_url`) n'existe que si le document est en ligne.
-- - `checked_on`, le jour où NTanova a vu le document, reste hors de la vue publique : il sert à le revoir.
-- - Cette ligne cite un document, elle n'est pas une garantie de NTanova : ni badge, ni changement d'état de la fiche.

create domain public.accreditation_kind as text
  check (value in ('agrement', 'autorisation_ouverture', 'reconnaissance', 'autre'));

create table public.campus_accreditations (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id),
  -- Nulle : l'établissement. Renseignée : cette filière du campus.
  program_id uuid references public.campus_programs(id),
  kind public.accreditation_kind not null,
  custom_kind text check (length(btrim(custom_kind)) between 1 and 80),
  -- Telle qu'elle est écrite sur le document : « arrêté n° [référence] ».
  reference text not null check (length(btrim(reference)) between 1 and 160),
  issued_on date not null,
  source_label text not null check (length(btrim(source_label)) between 1 and 200),
  source_url text check (length(source_url) <= 500 and source_url ~ '^https://[^[:space:]]+$'),
  checked_on date not null,
  constraint campus_accreditations_autre_precise check ((kind = 'autre') = (custom_kind is not null)),
  constraint campus_accreditations_controle_apres_document check (checked_on >= issued_on)
);
create unique index campus_accreditations_une_par_ecole
  on public.campus_accreditations (campus_id) where program_id is null;
create unique index campus_accreditations_une_par_filiere
  on public.campus_accreditations (program_id) where program_id is not null;
create index campus_accreditations_campus on public.campus_accreditations (campus_id);

alter table public.campus_accreditations enable row level security;
revoke all on public.campus_accreditations from public, anon, authenticated, service_role;
grant select on public.campus_accreditations to authenticated;
create policy "Administration lit les agréments" on public.campus_accreditations for select to authenticated
  using ((select public.est_admin()));

-- La vue s'exécute avec les droits de son propriétaire : le public lit ces colonnes, jamais la table.
create view public.public_campus_accreditations with (security_barrier = true) as
select a.campus_id, a.program_id, a.kind, a.custom_kind, a.reference, a.issued_on, a.source_label, a.source_url
from public.campus_accreditations a
join public.campuses c on c.id = a.campus_id
where c.publication = 'publiee' and c.trashed_at is null;
revoke all on public.public_campus_accreditations from public, anon, authenticated, service_role;
grant select on public.public_campus_accreditations to anon, authenticated;

-- L'identifiant de la filière, à la fin de la vue : le site y rattache son agrément.
create or replace view public.public_campus_programs with (security_invoker = true) as
select cc.campus_id, cc.cycle, p.title, ed.slug as domain_slug, ed.name as domain_name,
       p.bac_track, p.diploma, p.rhythms, p.id as program_id
from public.campus_programs p
join public.campus_cycles cc on cc.id = p.campus_cycle_id
join public.campuses c on c.id = cc.campus_id
left join public.education_domains ed on ed.id = p.domain_id
where c.publication = 'publiee';

create table prive.campus_accreditation_history (
  id bigint generated always as identity primary key,
  accreditation_id uuid not null,
  campus_id uuid not null references public.campuses(id),
  action text not null check (action in ('ajout', 'modification', 'retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null
);
alter table prive.campus_accreditation_history enable row level security;
revoke all on prive.campus_accreditation_history from public, anon, authenticated, service_role;
revoke all on sequence prive.campus_accreditation_history_id_seq from public, anon, authenticated, service_role;

-- Une seule ligne par école et par filière : la commande ajoute ou remplace.
create function public.set_campus_accreditation(
  p_campus uuid, p_program uuid, p_kind public.accreditation_kind, p_custom_kind text, p_reference text,
  p_issued_on date, p_source_label text, p_source_url text, p_checked_on date
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_aujourdhui date := (current_timestamp at time zone 'Africa/Brazzaville')::date;
  v_precision text := case when p_kind = 'autre' then nullif(btrim(p_custom_kind), '') end;
  v_reference text := nullif(btrim(p_reference), '');
  v_source text := nullif(btrim(p_source_label), '');
  v_lien text := nullif(btrim(p_source_url), '');
  v_id uuid;
  v_avant jsonb;
  v_apres jsonb;
begin
  perform public.exiger_admin_session();
  if p_kind is null or v_reference is null or v_source is null or p_issued_on is null or p_checked_on is null
    or p_issued_on > v_aujourdhui or p_checked_on > v_aujourdhui or p_checked_on < p_issued_on
    or (p_kind = 'autre' and v_precision is null)
    or (v_lien is not null and v_lien !~ '^https://[^[:space:]]+$') then
    raise exception 'Indique l’intitulé, la référence, la date du document, la source et le jour où tu l’as vu ; un lien commence par https://.' using errcode = '22023';
  end if;
  perform 1 from public.campuses where id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if p_program is not null and not exists (
    select 1 from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
    where p.id = p_program and cc.campus_id = p_campus
  ) then
    raise exception 'Cette filière n’appartient pas à cette école.' using errcode = '22023';
  end if;
  select a.id, to_jsonb(a) into v_id, v_avant from public.campus_accreditations a
  where a.campus_id = p_campus and a.program_id is not distinct from p_program for update;
  if v_id is null then
    insert into public.campus_accreditations (campus_id, program_id, kind, custom_kind, reference, issued_on, source_label, source_url, checked_on)
    values (p_campus, p_program, p_kind, v_precision, v_reference, p_issued_on, v_source, v_lien, p_checked_on)
    returning id, to_jsonb(campus_accreditations) into v_id, v_apres;
  else
    update public.campus_accreditations a set kind = p_kind, custom_kind = v_precision, reference = v_reference,
      issued_on = p_issued_on, source_label = v_source, source_url = v_lien, checked_on = p_checked_on
    where a.id = v_id returning to_jsonb(a) into v_apres;
  end if;
  update public.campuses set updated_at = now() where id = p_campus;
  insert into prive.campus_accreditation_history (accreditation_id, campus_id, action, before_data, after_data, recorded_by)
  values (v_id, p_campus, case when v_avant is null then 'ajout' else 'modification' end, v_avant, v_apres, public.current_user_id());
  return v_id;
end;
$$;
revoke all on function public.set_campus_accreditation(uuid, uuid, public.accreditation_kind, text, text, date, text, text, date) from public, anon, authenticated, service_role;
grant execute on function public.set_campus_accreditation(uuid, uuid, public.accreditation_kind, text, text, date, text, text, date) to authenticated;

create function public.remove_campus_accreditation(p_accreditation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_avant jsonb; v_campus uuid;
begin
  perform public.exiger_admin_session();
  delete from public.campus_accreditations a where a.id = p_accreditation returning to_jsonb(a), a.campus_id into v_avant, v_campus;
  if not found then raise exception 'Agrément introuvable.' using errcode = 'P0002'; end if;
  update public.campuses set updated_at = now() where id = v_campus;
  insert into prive.campus_accreditation_history (accreditation_id, campus_id, action, before_data, recorded_by)
  values (p_accreditation, v_campus, 'retrait', v_avant, public.current_user_id());
end;
$$;
revoke all on function public.remove_campus_accreditation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_campus_accreditation(uuid) to authenticated;

-- Retirer une filière (ou son cycle) ne fait jamais disparaître un agrément sans bruit.
create function prive.garder_agrement_filiere() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.campus_accreditations a where a.program_id = old.id) then
    raise exception 'Retire d’abord l’agrément de cette filière.' using errcode = '22023';
  end if;
  return old;
end;
$$;
revoke all on function prive.garder_agrement_filiere() from public, anon, authenticated, service_role;
create trigger campus_programs_agrement_avant_retrait before delete on public.campus_programs
  for each row execute function prive.garder_agrement_filiere();
