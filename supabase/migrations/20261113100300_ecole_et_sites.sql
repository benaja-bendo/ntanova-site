-- M4. L'école et ses sites (canevas « Fiche d'école », 12/11/2026 ; validé le 13/11).
--
-- - L'école (`institutions`) gagne l'année de création et le site web ; le sigle est arrivé avec M2.
-- - Le site (`campuses`) gagne le rythme (matin, après-midi, journée, soir) et les langues d'enseignement, avec qui les donne
--   et quand : l'école ou l'administration, jamais le relais (choix C7).
-- - **Le mot de la direction devient celui de l'école** (choix C1) : `institution_statements`. La vue publique
--   `public_campus_statements` garde son nom et ses colonnes (une ligne par site publié et confirmé), le site en ligne ne voit
--   pas la différence. `set_campus_statement` garde sa signature et écrit le mot de l'école du site. La table d'avant,
--   `campus_statements`, est vide en production (13/11) ; elle reste, lue en repli.
-- - `public_institution_sites` : les sites publiés d'une même école, pour « Les N sites de l'école » et les points du plan.
-- - `attach_campus_to_institution` : le geste « C'est un site de… ». L'adresse publique du site ne change pas. **L'école
--   quittée qui n'a plus aucun site est supprimée** (demande du fondateur du 13/11, comme `purge_campus`), après avoir donné
--   à la nouvelle ce qui lui manque (sigle, année, site web, logo, mot de la direction) ; ce qui ferait doublon est refusé.

-- Les listes ---------------------------------------------------------------------------------------------------------------------------------------
create domain public.study_shift as text check (value in ('matin', 'apres_midi', 'journee', 'soir'));
create domain public.teaching_language as text check (value in ('francais', 'anglais', 'lingala', 'kituba', 'autre'));

-- L'école et le site -------------------------------------------------------------------------------------------------------------------------------
alter table public.institutions
  add column founded_year smallint check (founded_year between 1800 and 2100),
  add column website_url text check (website_url ~ '^https://[^\s/$.?#][^\s]{2,200}$');
comment on column public.institutions.founded_year is 'L''année de création, dite par l''école (« depuis [année] »).';
comment on column public.institutions.website_url is 'Le site web de l''école, en https.';

alter table public.campuses
  add column shifts public.study_shift[] not null default '{}' check (cardinality(shifts) <= 4),
  add column teaching_languages public.teaching_language[] not null default '{}' check (cardinality(teaching_languages) <= 5),
  add column profile_declared_on date,
  add column profile_source text check (profile_source in ('ecole', 'administration')),
  add constraint campuses_profil_source_et_date check (
    (cardinality(shifts) = 0 and cardinality(teaching_languages) = 0) or (profile_declared_on is not null and profile_source is not null)
  );
comment on column public.campuses.shifts is 'Le rythme du site (matin, après-midi, journée, soir), donné par l''école ou l''administration.';
comment on column public.campuses.teaching_languages is 'Les langues d''enseignement du site.';

create table prive.school_profile_history (
  id bigint generated always as identity primary key,
  institution_id uuid,
  campus_id uuid,
  action text not null check (action in ('ecole', 'site', 'rattachement')),
  before_data jsonb,
  after_data jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid
);
revoke all on table prive.school_profile_history from public, anon, authenticated;

create function public.set_institution_profile(p_campus uuid, p_acronym text, p_founded_year integer, p_website_url text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  i public.institutions;
  v_after jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  select x.* into i from public.institutions x
  where x.id = (select c.institution_id from public.campuses c where c.id = p_campus) for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if p_founded_year is not null and p_founded_year > extract(year from current_timestamp at time zone 'Africa/Brazzaville') then
    raise exception 'L''année de création ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  update public.institutions x set
    acronym = nullif(btrim(p_acronym), ''), founded_year = p_founded_year, website_url = nullif(btrim(p_website_url), ''),
    updated_at = now()
  where x.id = i.id
  returning to_jsonb(x) into v_after;
  insert into prive.school_profile_history (institution_id, campus_id, action, before_data, after_data, recorded_by)
  values (i.id, p_campus, 'ecole', to_jsonb(i), v_after, public.current_user_id());
exception when check_violation then
  raise exception 'Vérifie le sigle (20 caractères au plus), l''année et l''adresse du site web (https://…).' using errcode = '22023';
end;
$$;
comment on function public.set_institution_profile(uuid, text, integer, text) is
  'Le sigle, l''année de création et le site web de l''école du site donné (communs à tous ses sites).';
revoke all on function public.set_institution_profile(uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.set_institution_profile(uuid, text, integer, text) to authenticated;

create function public.set_campus_profile(
  p_campus uuid, p_shifts public.study_shift[], p_languages public.teaching_language[], p_declared_on date, p_source text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.campuses;
  v_after jsonb;
  v_vide boolean := cardinality(coalesce(p_shifts, '{}')) = 0 and cardinality(coalesce(p_languages, '{}')) = 0;
begin
  perform public.exiger_gestion_site(p_campus);
  select x.* into c from public.campuses x where x.id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if not v_vide and (p_declared_on is null or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date
                     or p_source is null or p_source not in ('ecole', 'administration')) then
    raise exception 'Dis qui le donne (l''école ou l''administration) et quand (une date réelle).' using errcode = '22023';
  end if;
  update public.campuses x set
    shifts = (select coalesce(array_agg(distinct s order by s), '{}') from unnest(coalesce(p_shifts, '{}')) s),
    teaching_languages = (select coalesce(array_agg(distinct l order by l), '{}') from unnest(coalesce(p_languages, '{}')) l),
    profile_declared_on = case when v_vide then null else p_declared_on end,
    profile_source = case when v_vide then null else p_source end,
    updated_at = now()
  where x.id = p_campus
  returning to_jsonb(x) into v_after;
  insert into prive.school_profile_history (institution_id, campus_id, action, before_data, after_data, recorded_by)
  values (c.institution_id, p_campus, 'site',
          jsonb_build_object('shifts', c.shifts, 'teaching_languages', c.teaching_languages, 'profile_declared_on', c.profile_declared_on, 'profile_source', c.profile_source),
          jsonb_build_object('shifts', v_after -> 'shifts', 'teaching_languages', v_after -> 'teaching_languages', 'profile_declared_on', v_after -> 'profile_declared_on', 'profile_source', v_after -> 'profile_source'),
          public.current_user_id());
end;
$$;
comment on function public.set_campus_profile(uuid, public.study_shift[], public.teaching_language[], date, text) is
  'Le rythme et les langues d''un site, avec qui les donne (école ou administration) et quand. Des listes vides les retirent.';
revoke all on function public.set_campus_profile(uuid, public.study_shift[], public.teaching_language[], date, text) from public, anon, authenticated;
grant execute on function public.set_campus_profile(uuid, public.study_shift[], public.teaching_language[], date, text) to authenticated;

-- La fiche publique : les colonnes nouvelles en dernier (les anciennes ne bougent pas) -------------------------------------------------------------
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
  c.school_declared_on,
  c.public_number,
  i.acronym as institution_acronym,
  i.founded_year,
  i.website_url,
  c.shifts::text[] as shifts,
  c.teaching_languages::text[] as teaching_languages,
  c.profile_declared_on,
  c.profile_source
from public.campuses c
join public.institutions i on i.id = c.institution_id
join public.geo_divisions d on d.id = c.division_id
where c.publication = 'publiee';

-- Les sites d'une même école -----------------------------------------------------------------------------------------------------------------------
create view public.public_institution_sites with (security_invoker = true) as
select c.institution_id, c.id as campus_id, c.label, c.public_number, c.slug, c.division_id,
       extensions.st_y(c.position) as latitude, extensions.st_x(c.position) as longitude,
       coalesce((select array_agg(cc.cycle::text order by cc.cycle) from public.campus_cycles cc where cc.campus_id = c.id), '{}') as cycles
from public.campuses c
where c.publication = 'publiee' and c.trashed_at is null;
comment on view public.public_institution_sites is
  'Les sites publiés de chaque école, avec leurs niveaux et leur position : « Les N sites de l''école » et les points du plan.';
revoke all on table public.public_institution_sites from public, anon, authenticated;
grant select on table public.public_institution_sites to anon, authenticated;

-- Le mot de la direction, à l'école ---------------------------------------------------------------------------------------------------------------
create table public.institution_statements (
  institution_id uuid primary key references public.institutions (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 400),
  stated_on date not null
);
comment on table public.institution_statements is 'Le mot de la direction, commun à tous les sites de l''école (choix C1 du 13/11).';
alter table public.institution_statements enable row level security;
create policy "L'administration lit les mots des écoles" on public.institution_statements for select to authenticated
  using ((select public.est_admin()));
revoke all on table public.institution_statements from public, anon, authenticated;
grant select on table public.institution_statements to authenticated;

alter table prive.campus_statement_agreements add column institution_id uuid;

create or replace view public.public_campus_statements with (security_barrier = true) as
select c.id as campus_id, coalesce(st.body, s.body) as body, coalesce(st.stated_on, s.stated_on) as stated_on
from public.campuses c
left join public.institution_statements st on st.institution_id = c.institution_id
left join public.campus_statements s on s.campus_id = c.id
where c.publication = 'publiee' and c.trashed_at is null and c.verification_state = 'verifiee'
  and (st.institution_id is not null or s.campus_id is not null);
revoke all on public.public_campus_statements from public, anon, authenticated;
grant select on public.public_campus_statements to anon, authenticated;

create or replace function public.set_campus_statement(p_campus uuid, p_body text, p_stated_on date, p_role public.fonction_direction, p_channel text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_texte text := nullif(btrim(p_body), '');
  v_institution uuid;
begin
  perform public.exiger_gestion_site(p_campus);
  if v_texte is null then
    if p_stated_on is not null or p_role is not null or p_channel is not null then
      raise exception 'Écris le mot de la direction, ou retire-le sans rien d’autre.' using errcode = '22023';
    end if;
  elsif length(v_texte) > 400 or p_stated_on is null
    or p_stated_on > (current_timestamp at time zone 'Africa/Brazzaville')::date
    or p_role is null or p_channel is null or p_channel not in ('whatsapp', 'appel', 'sur_place', 'autre') then
    raise exception 'Le mot (400 caractères au plus), sa date réelle, la fonction et le canal de l’accord sont requis.' using errcode = '22023';
  end if;
  select c.institution_id into v_institution from public.campuses c where c.id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  if v_texte is null then
    delete from public.institution_statements where institution_id = v_institution;
    if not found and not exists (select 1 from public.campus_statements where campus_id = p_campus) then
      raise exception 'Cette école n’a pas de mot de la direction.' using errcode = 'P0002';
    end if;
  else
    insert into public.institution_statements (institution_id, body, stated_on) values (v_institution, v_texte, p_stated_on)
    on conflict (institution_id) do update set body = excluded.body, stated_on = excluded.stated_on;
  end if;
  -- Le mot d'avant, posé sur un seul site, laisse la place à celui de l'école.
  delete from public.campus_statements where campus_id in (select c.id from public.campuses c where c.institution_id = v_institution);
  update public.campuses set updated_at = now() where institution_id = v_institution;
  insert into prive.campus_statement_agreements (campus_id, institution_id, body, stated_on, agreed_role, channel, recorded_by)
  values (p_campus, v_institution, v_texte, p_stated_on, p_role, p_channel, public.current_user_id());
end;
$$;
comment on function public.set_campus_statement(uuid, text, date, public.fonction_direction, text) is
  'Le mot de la direction de l''école du site donné, avec l''accord (fonction, canal, date). Commun à tous ses sites. Un texte nul le retire.';

-- « C'est un site de… » ------------------------------------------------------------------------------------------------------------------------------
alter table prive.erasures drop constraint erasures_what_check;
alter table prive.erasures add constraint erasures_what_check
  check (what in ('contact', 'photo', 'merge', 'campus', 'trash', 'restore', 'zone', 'institution'));

create function public.attach_campus_to_institution(p_campus uuid, p_institution uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.campuses;
  v_old public.institutions;
  v_new public.institutions;
  v_orpheline boolean;
begin
  perform public.exiger_gestion_site(p_campus);
  select x.* into c from public.campuses x where x.id = p_campus for update;
  if not found or c.trashed_at is not null or c.publication = 'retiree' then
    raise exception 'Site introuvable, à la corbeille ou retiré.' using errcode = 'P0002';
  end if;
  if c.institution_id = p_institution then
    raise exception 'Ce site appartient déjà à cette école.' using errcode = '22023';
  end if;
  select x.* into v_new from public.institutions x where x.id = p_institution for update;
  if not found or not exists (select 1 from public.campuses k where k.institution_id = p_institution and k.trashed_at is null) then
    raise exception 'École introuvable (ou sans site actif).' using errcode = 'P0002';
  end if;
  select x.* into v_old from public.institutions x where x.id = c.institution_id for update;
  v_orpheline := not exists (select 1 from public.campuses k where k.institution_id = v_old.id and k.id <> p_campus);

  if v_orpheline then
    -- Ce que l'école quittée avait, la nouvelle le reçoit s'il lui manque ; un vrai conflit se règle d'abord à la main.
    if exists (select 1 from public.institution_statements s where s.institution_id = v_old.id)
       and exists (select 1 from public.institution_statements s where s.institution_id = v_new.id) then
      raise exception 'Les deux écoles ont un mot de la direction : retire celui qui ne vaut plus, puis rattache.' using errcode = '22023';
    end if;
    update public.institution_statements set institution_id = v_new.id where institution_id = v_old.id;
    if exists (select 1 from public.campus_media m where m.institution_id = v_old.id and m.kind = 'logo')
       and exists (select 1 from public.campus_media m where m.institution_id = v_new.id and m.kind = 'logo') then
      raise exception 'Les deux écoles ont un logo : retire celui qui ne vaut plus, puis rattache.' using errcode = '22023';
    end if;
    update public.campus_media set institution_id = v_new.id where institution_id = v_old.id and kind = 'logo';
    update public.institutions x set
      acronym = coalesce(x.acronym, v_old.acronym),
      founded_year = coalesce(x.founded_year, v_old.founded_year),
      website_url = coalesce(x.website_url, v_old.website_url),
      updated_at = now()
    where x.id = v_new.id;
  end if;

  update public.campuses x set institution_id = v_new.id, updated_at = now() where x.id = p_campus;
  -- Un relevé qui disait « un autre site de » l'école quittée pointe maintenant vers la bonne.
  update public.field_submissions s set duplicate_of_institution_id = v_new.id where s.duplicate_of_institution_id = v_old.id;

  insert into prive.school_profile_history (institution_id, campus_id, action, before_data, after_data, recorded_by)
  values (v_new.id, p_campus, 'rattachement',
          jsonb_build_object('institution_id', v_old.id, 'name', v_old.name, 'acronym', v_old.acronym, 'deleted', v_orpheline),
          jsonb_build_object('institution_id', v_new.id, 'name', v_new.name),
          public.current_user_id());

  if v_orpheline then
    insert into prive.erasures (what, campus_id, by_user, note)
    values ('institution', p_campus, (select public.current_user_id()),
            left(format('École sans site après rattachement à %s : %s', v_new.name, v_old.name), 500));
    delete from public.institutions x where x.id = v_old.id;
  end if;

  return jsonb_build_object('campus', p_campus, 'institution', v_new.id, 'deleted_institution',
                            case when v_orpheline then v_old.id end);
end;
$$;
comment on function public.attach_campus_to_institution(uuid, uuid) is
  '« C''est un site de… » : déplace un site sous une autre école, garde son adresse publique et l''historique. L''école quittée sans aucun site est supprimée, après avoir donné à la nouvelle ce qui lui manque.';
revoke all on function public.attach_campus_to_institution(uuid, uuid) from public, anon, authenticated;
grant execute on function public.attach_campus_to_institution(uuid, uuid) to authenticated;
