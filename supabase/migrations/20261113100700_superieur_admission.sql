-- M8. Le supérieur : le détail des formations, l'admission, la preuve d'une autorisation (canevas, 12/11 ; validé le 13/11).
--
-- - `campus_programs` gagne la durée, le niveau demandé, la sélection, les frais de dossier, « Diplôme délivré par » (texte
--   libre facultatif, choix C6 : le mot exact reste à confirmer auprès d'une école) et la date de ces informations.
-- - `campus_admissions` (une ligne par site et par année) : les pièces à fournir, où déposer le dossier, et « dossiers reçus
--   sur place uniquement, d'après l'école le [date] » ; `campus_admission_steps` : dossiers, sélection, résultats, rentrée.
-- - `campus_accreditations` gagne la preuve : photo de l'arrêté (photo de travail, jamais publique), document vu sur place,
--   ou dit par l'école sans document. La page écrit « réf. [n°] · vue sur le document le [date] », jamais « reconnue par l'État ».
-- - `merge_campuses` refuse aussi un doublon qui porte des images, des nouvelles ou une admission : on ne les perd pas.
-- NTanova ne reçoit pas les candidatures : rien ici n'en stocke (étape C).

create domain public.selection_kind as text check (value in ('dossier', 'entretien', 'dossier_entretien', 'concours', 'autre'));
create domain public.admission_step as text check (value in ('dossiers', 'selection', 'resultats', 'rentree'));

-- Les formations ------------------------------------------------------------------------------------------------------------------------------------
alter table public.campus_programs
  add column duration_years numeric(3, 1) check (duration_years between 0.5 and 8),
  add column admission_level text check (length(btrim(admission_level)) between 1 and 80),
  add column selection public.selection_kind,
  add column application_fee_xaf integer check (application_fee_xaf >= 0),
  add column diploma_issuer text check (length(btrim(diploma_issuer)) between 1 and 120),
  add column details_declared_on date;
comment on column public.campus_programs.diploma_issuer is '« Diplôme délivré par » (texte libre, facultatif ; le mot exact est à confirmer auprès d''une école).';

create table prive.program_detail_history (
  id bigint generated always as identity primary key,
  program_id uuid not null,
  campus_id uuid,
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid
);
revoke all on table prive.program_detail_history from public, anon, authenticated;

create function public.set_program_details(
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
    details_declared_on = case when v_rien then null else p_declared_on end
  where p.id = p_program
  returning to_jsonb(p) into v_after;
  insert into prive.program_detail_history (program_id, campus_id, before_data, after_data, recorded_by)
  values (p_program, v_campus, v_before, v_after, public.current_user_id());
exception when check_violation then
  raise exception 'Vérifie la durée (0,5 à 8 ans), le niveau demandé (80 caractères), les frais de dossier et « délivré par » (120).' using errcode = '22023';
end;
$$;
comment on function public.set_program_details(uuid, numeric, text, public.selection_kind, integer, text, date) is
  'Le détail d''une formation : durée, niveau demandé, sélection, frais de dossier, « diplôme délivré par », et quand l''école l''a dit.';
revoke all on function public.set_program_details(uuid, numeric, text, public.selection_kind, integer, text, date) from public, anon, authenticated;
grant execute on function public.set_program_details(uuid, numeric, text, public.selection_kind, integer, text, date) to authenticated;

create or replace view public.public_campus_programs with (security_invoker = true) as
select cc.campus_id, cc.cycle, p.title, ed.slug as domain_slug, ed.name as domain_name, p.bac_track, p.diploma, p.rhythms,
       p.id as program_id, p.duration_years, p.admission_level, p.selection::text as selection, p.application_fee_xaf,
       p.diploma_issuer, p.details_declared_on
from public.campus_programs p
join public.campus_cycles cc on cc.id = p.campus_cycle_id
join public.campuses c on c.id = cc.campus_id
left join public.education_domains ed on ed.id = p.domain_id
where c.publication = 'publiee';

-- L'admission ----------------------------------------------------------------------------------------------------------------------------------------
create table public.campus_admissions (
  campus_id uuid not null references public.campuses (id) on delete cascade,
  school_year text not null check (length(btrim(school_year)) between 1 and 30),
  documents text[] not null default '{}'
    check (cardinality(documents) <= 10 and array_position(documents, null) is null),
  where_to_apply text check (length(btrim(where_to_apply)) between 1 and 300),
  on_site_only boolean not null default false,
  declared_on date not null,
  primary key (campus_id, school_year)
);
comment on table public.campus_admissions is
  'L''admission d''un site pour une année : pièces à fournir, où déposer le dossier, « sur place uniquement, d''après l''école ».';
create table public.campus_admission_steps (
  campus_id uuid not null,
  school_year text not null,
  step public.admission_step not null,
  starts_on date not null,
  ends_on date check (ends_on >= starts_on),
  primary key (campus_id, school_year, step),
  foreign key (campus_id, school_year) references public.campus_admissions (campus_id, school_year) on delete cascade
);
comment on table public.campus_admission_steps is 'Le calendrier de l''admission : dossiers, sélection, résultats, rentrée.';

alter table public.campus_admissions enable row level security;
alter table public.campus_admission_steps enable row level security;
create policy "L'administration lit les admissions" on public.campus_admissions for select to authenticated using ((select public.est_admin()));
create policy "L'administration lit les calendriers" on public.campus_admission_steps for select to authenticated using ((select public.est_admin()));
revoke all on table public.campus_admissions, public.campus_admission_steps from public, anon, authenticated;
grant select on table public.campus_admissions, public.campus_admission_steps to authenticated;

create table prive.campus_admission_history (
  id bigint generated always as identity primary key,
  campus_id uuid not null,
  school_year text not null,
  action text not null check (action in ('enregistrement', 'retrait')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid
);
revoke all on table prive.campus_admission_history from public, anon, authenticated;

create view public.public_campus_admissions with (security_barrier = true) as
select a.campus_id, a.school_year, a.documents, a.where_to_apply, a.on_site_only, a.declared_on,
       coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'starts_on', s.starts_on, 'ends_on', s.ends_on)
                                  order by s.starts_on, s.step)
                 from public.campus_admission_steps s where s.campus_id = a.campus_id and s.school_year = a.school_year), '[]') as steps
from public.campus_admissions a
join public.campuses c on c.id = a.campus_id
where c.publication = 'publiee' and c.trashed_at is null;
comment on view public.public_campus_admissions is 'L''admission des sites publiés, avec son calendrier.';
revoke all on table public.public_campus_admissions from public, anon, authenticated;
grant select on table public.public_campus_admissions to anon, authenticated;

create function public.set_campus_admission(
  p_campus uuid, p_school_year text, p_documents text[], p_where_to_apply text, p_on_site_only boolean,
  p_declared_on date, p_steps jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_annee text := nullif(btrim(p_school_year), '');
  v_before jsonb;
  v_after jsonb;
  v_step jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if not exists (select 1 from public.campuses c where c.id = p_campus and c.trashed_at is null) then
    raise exception 'École introuvable.' using errcode = 'P0002';
  end if;
  if v_annee is null or p_declared_on is null or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'L''année scolaire et la date réelle où l''école l''a dit sont requises.' using errcode = '22023';
  end if;
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 4 then
    raise exception 'Calendrier illisible.' using errcode = '22023';
  end if;
  select to_jsonb(a) into v_before from public.campus_admissions a where a.campus_id = p_campus and a.school_year = v_annee;
  insert into public.campus_admissions (campus_id, school_year, documents, where_to_apply, on_site_only, declared_on)
  values (p_campus, v_annee,
          coalesce((select array_agg(btrim(d)) from unnest(coalesce(p_documents, '{}')) d where nullif(btrim(d), '') is not null), '{}'),
          nullif(btrim(p_where_to_apply), ''), coalesce(p_on_site_only, false), p_declared_on)
  on conflict (campus_id, school_year) do update set documents = excluded.documents, where_to_apply = excluded.where_to_apply,
    on_site_only = excluded.on_site_only, declared_on = excluded.declared_on;
  delete from public.campus_admission_steps s where s.campus_id = p_campus and s.school_year = v_annee;
  for v_step in select x from jsonb_array_elements(p_steps) x loop
    insert into public.campus_admission_steps (campus_id, school_year, step, starts_on, ends_on)
    values (p_campus, v_annee, (v_step ->> 'step')::public.admission_step, (v_step ->> 'starts_on')::date, (v_step ->> 'ends_on')::date);
  end loop;
  select to_jsonb(a) || jsonb_build_object('steps', p_steps) into v_after
  from public.campus_admissions a where a.campus_id = p_campus and a.school_year = v_annee;
  insert into prive.campus_admission_history (campus_id, school_year, action, before_data, after_data, recorded_by)
  values (p_campus, v_annee, 'enregistrement', v_before, v_after, public.current_user_id());
exception
  when check_violation or unique_violation or invalid_datetime_format or not_null_violation then
    raise exception 'Vérifie les pièces (10 au plus), le lieu de dépôt (300 caractères) et le calendrier (une date par étape, la fin après le début).'
      using errcode = '22023';
end;
$$;
comment on function public.set_campus_admission(uuid, text, text[], text, boolean, date, jsonb) is
  'L''admission d''un site pour une année : pièces, lieu de dépôt, « sur place uniquement », date où l''école l''a dit, et calendrier [{step, starts_on, ends_on}].';
revoke all on function public.set_campus_admission(uuid, text, text[], text, boolean, date, jsonb) from public, anon, authenticated;
grant execute on function public.set_campus_admission(uuid, text, text[], text, boolean, date, jsonb) to authenticated;

create function public.remove_campus_admission(p_campus uuid, p_school_year text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_before jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  delete from public.campus_admissions a where a.campus_id = p_campus and a.school_year = btrim(p_school_year)
  returning to_jsonb(a) into v_before;
  if not found then raise exception 'Admission introuvable.' using errcode = 'P0002'; end if;
  insert into prive.campus_admission_history (campus_id, school_year, action, before_data, recorded_by)
  values (p_campus, btrim(p_school_year), 'retrait', v_before, public.current_user_id());
end;
$$;
revoke all on function public.remove_campus_admission(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_campus_admission(uuid, text) to authenticated;

-- La preuve d'une autorisation ------------------------------------------------------------------------------------------------------------------------
alter table public.campus_accreditations
  add column evidence text check (evidence in ('photo', 'document_vu', 'dit_ecole')),
  add column proof_photo_id uuid references public.field_submission_photos (id) on delete set null,
  add constraint campus_accreditations_photo_de_preuve check (proof_photo_id is null or evidence = 'photo');
comment on column public.campus_accreditations.evidence is
  'Ce qui prouve la référence : la photo de l''arrêté (photo de travail), le document vu sur place, ou l''école qui le dit sans document.';

create function public.set_accreditation_evidence(p_accreditation uuid, p_evidence text, p_proof_photo uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_campus uuid;
begin
  select a.campus_id into v_campus from public.campus_accreditations a where a.id = p_accreditation for update;
  if not found then raise exception 'Agrément introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(v_campus);
  if p_evidence is not null and p_evidence not in ('photo', 'document_vu', 'dit_ecole') or (p_proof_photo is not null and p_evidence is distinct from 'photo') then
    raise exception 'La preuve est une photo de l''arrêté, un document vu sur place, ou l''école qui le dit.' using errcode = '22023';
  end if;
  if p_proof_photo is not null and not exists (
    select 1 from public.field_submission_photos ph join public.field_submissions s on s.id = ph.submission_id
    where ph.id = p_proof_photo and s.campus_id = v_campus and s.status = 'accepte' and not ph.is_public
  ) then
    raise exception 'La photo de l''arrêté doit venir d''un relevé accepté de cette école, et rester privée.' using errcode = '22023';
  end if;
  update public.campus_accreditations a set evidence = p_evidence, proof_photo_id = p_proof_photo where a.id = p_accreditation;
  insert into prive.campus_accreditation_history (accreditation_id, campus_id, action, after_data, recorded_by)
  values (p_accreditation, v_campus, 'modification', jsonb_build_object('evidence', p_evidence, 'proof_photo_id', p_proof_photo), public.current_user_id());
end;
$$;
comment on function public.set_accreditation_evidence(uuid, text, uuid) is
  'Dit ce qui prouve un agrément ou une autorisation : photo de l''arrêté (privée), document vu, ou dit par l''école.';
revoke all on function public.set_accreditation_evidence(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_accreditation_evidence(uuid, text, uuid) to authenticated;

create or replace view public.public_campus_accreditations with (security_barrier = true) as
select a.campus_id, a.program_id, a.kind, a.custom_kind, a.reference, a.issued_on, a.source_label, a.source_url, a.evidence
from public.campus_accreditations a
join public.campuses c on c.id = a.campus_id
where c.publication = 'publiee' and c.trashed_at is null;

-- La fusion de doublons ne perd plus rien de nouveau --------------------------------------------------------------------------------------------------
create or replace function public.merge_campuses(p_duplicate uuid, p_kept uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_duplicate = p_kept then
    raise exception 'Un campus ne se fusionne pas avec lui-même.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campuses c where c.id = p_kept and c.publication <> 'retiree') then
    raise exception 'Le campus gardé doit exister et ne pas être retiré.' using errcode = '22023';
  end if;
  -- Ces données ne se déplacent pas toutes seules : le doublon qui en porte attend qu'on les saisisse sur la fiche gardée.
  if exists (select 1 from public.campus_accreditations a where a.campus_id = p_duplicate)
    or exists (select 1 from public.campus_statements s where s.campus_id = p_duplicate)
    or exists (select 1 from public.campus_enrollment_deadlines d where d.campus_id = p_duplicate)
    or exists (select 1 from public.campus_media m where m.campus_id = p_duplicate and m.source_photo_id is null)
    or exists (select 1 from public.campus_posts p where p.campus_id = p_duplicate and p.state = 'publiee')
    or exists (select 1 from public.campus_admissions a where a.campus_id = p_duplicate) then
    raise exception 'Ce doublon porte un agrément, un mot de la direction, une date d’inscription, une image ajoutée, une nouvelle ou une admission : retire-les d’abord, et saisis-les sur la fiche gardée.' using errcode = '22023';
  end if;
  update public.campuses c set
    publication = 'retiree', retired_at = now(), retirement_reason = 'doublon', replaced_by_campus_id = p_kept
  where c.id = p_duplicate;
  if not found then
    raise exception 'Campus introuvable.' using errcode = 'P0002';
  end if;
  update public.field_submissions s set campus_id = p_kept where s.campus_id = p_duplicate;
  -- Les images venues des relevés suivent leurs relevés : elles n'ont plus de place sur le doublon.
  delete from public.campus_media m where m.campus_id = p_duplicate and m.source_photo_id is not null;
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_duplicate and m.status = 'open';
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('merge', p_duplicate, (select public.current_user_id()), 'Fusionné dans ' || p_kept::text);
end;
$$;
