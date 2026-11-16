-- Les contacts de l'école, sur sa fiche d'administration (fondateur, 16/11/2026).
--
-- Le constat : la personne que le relais rencontre (et son numéro, avec son accord) est rangée sous la FICHE du relais
-- (`prive.direction_contacts.submission_id`). Elle ne se lisait que dans « À valider » ; une fois la fiche acceptée,
-- l'administration ne la retrouvait plus depuis la fiche de l'école.
--
-- Additive, sans rien casser :
--   * `contacts_of_campus(site)` rend, pour un site, toutes les personnes de toutes ses fiches : celles qui y sont
--     rattachées (acceptées, contre-visites), et celles des fiches qu'elles corrigent (le contact reste sur l'original,
--     ticket 94), avec le prénom du relais et le jour de la fiche ; plus les personnes notées par l'administration
--     directement sur le site ;
--   * une personne peut appartenir au SITE plutôt qu'à une fiche (`campus_id`) : l'administration note un numéro reçu par
--     WhatsApp pour une école importée, sans fiche de relais. Une ligne a l'un ou l'autre, jamais aucun ;
--   * `add_campus_contact(site, …)` l'ajoute ; `update_contact` est inchangée ; `erase_contact_person` garde aussi le site
--     dans le registre des effacements.
-- Inchangé : privé, admin seulement (`exiger_admin_session`, pas `exiger_gestion_site` : le futur compte d'une direction ne
-- lit pas les personnes que NTanova a rencontrées) ; pas de numéro sans accord ; trois personnes au plus par FICHE.

-- 1. Une personne rattachée au site ----------------------------------------------------------------------------------------------

alter table prive.direction_contacts
  add column campus_id uuid references public.campuses (id) on delete cascade;
alter table prive.direction_contacts alter column submission_id drop not null;
alter table prive.direction_contacts
  add constraint direction_contacts_fiche_ou_site check (submission_id is not null or campus_id is not null);
create index direction_contacts_site on prive.direction_contacts (campus_id) where campus_id is not null;

comment on column prive.direction_contacts.campus_id is
  'Le site, pour une personne notée par l''administration sans fiche de relais (école importée, numéro reçu par WhatsApp).';

-- Dix personnes au plus notées directement sur un site : un garde, pas une règle de métier.
create function prive.direction_contacts_site_avant_insertion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.campus_id is not null and new.submission_id is null and (
    select count(*) from prive.direction_contacts c where c.campus_id = new.campus_id and c.submission_id is null
  ) >= 10 then
    raise exception 'Un site a dix contacts notés par l''administration au plus.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger direction_contacts_site_avant_insertion
before insert on prive.direction_contacts
for each row execute function prive.direction_contacts_site_avant_insertion();

-- 2. Lire les contacts d'un site ------------------------------------------------------------------------------------------------

-- Les fiches d'un site : celles qui y sont rattachées, puis, en remontant, celles qu'elles corrigent.
create function public.contacts_of_campus(p_campus uuid)
returns table (
  id uuid, role public.fonction_direction, role_detail text, name text, whatsapp public.telephone,
  contact_agreement boolean, agreement_at timestamptz, said_note text, received_at timestamptz, source text,
  submission_id uuid, submission_taken_at timestamptz, relay_first_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
    with recursive fiches(fid, profondeur) as (
      select s.id, 0 from public.field_submissions s
      where s.campus_id = p_campus or s.duplicate_of_campus_id = p_campus
      union
      select s.corrects_submission_id, f.profondeur + 1
      from fiches f join public.field_submissions s on s.id = f.fid
      where s.corrects_submission_id is not null and f.profondeur < 20
    )
    select c.id, c.role, c.role_detail, c.name, c.whatsapp, c.contact_agreement, c.agreement_at, c.said_note,
           c.received_at, c.source, c.submission_id, s.taken_at, nullif(btrim(r.prenom), '')
    from prive.direction_contacts c
    left join public.field_submissions s on s.id = c.submission_id
    left join public.relais r on r.id = s.relay_id
    where c.submission_id in (select f.fid from fiches f)
       or (c.submission_id is null and c.campus_id = p_campus)
    -- Ceux qui ont un numéro d'abord, puis le plus récent.
    order by (c.whatsapp is null), c.received_at desc, c.id;
end;
$$;

-- 3. Noter une personne sur le site ---------------------------------------------------------------------------------------------

create function public.add_campus_contact(
  p_campus uuid,
  p_role public.fonction_direction,
  p_role_detail text,
  p_name text,
  p_whatsapp public.telephone,
  p_agreement boolean,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.exiger_admin_session();
  if not exists (select 1 from public.campuses c where c.id = p_campus) then
    raise exception 'Site introuvable.' using errcode = 'P0002';
  end if;
  if p_whatsapp is not null and not coalesce(p_agreement, false) then
    raise exception 'Sans l''accord de la personne, on ne note pas son numéro.' using errcode = '22023';
  end if;

  insert into prive.direction_contacts
    (campus_id, role, role_detail, name, whatsapp, contact_agreement, agreement_at, said_note, source, added_by)
  values (
    p_campus, p_role,
    case when p_role = 'autre' then left(nullif(btrim(p_role_detail), ''), 80) end,
    nullif(btrim(p_name), ''), p_whatsapp, coalesce(p_agreement, false),
    case when coalesce(p_agreement, false) then now() end,
    nullif(btrim(p_note), ''), 'administration', (select public.current_user_id())
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- 4. Effacer : le registre garde aussi le site ----------------------------------------------------------------------------------

create or replace function public.erase_contact_person(p_contact uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_submission uuid;
  v_campus uuid;
begin
  perform public.exiger_admin_session();
  delete from prive.direction_contacts c where c.id = p_contact
  returning c.submission_id, c.campus_id into v_submission, v_campus;
  if not found then
    raise exception 'Personne introuvable.' using errcode = 'P0002';
  end if;
  if v_submission is not null
     and not exists (select 1 from prive.direction_contacts c where c.submission_id = v_submission) then
    update public.field_submissions s set contact_confirmed_at = null, contact_role = null where s.id = v_submission;
  end if;
  insert into prive.erasures (what, submission_id, campus_id, by_user, note)
  values ('contact', v_submission, v_campus, (select public.current_user_id()), p_note);
end;
$$;

-- 5. Fusionner deux sites : les contacts notés sur le doublon passent sur le site gardé -------------------------------------------
-- (reprise exacte de 20261113100700_superieur_admission.sql, une ligne en plus)

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
  -- Les contacts notés sur le site (16/11) suivent, comme les fiches.
  update prive.direction_contacts c set campus_id = p_kept where c.campus_id = p_duplicate;
  -- Les images venues des relevés suivent leurs relevés : elles n'ont plus de place sur le doublon.
  delete from public.campus_media m where m.campus_id = p_duplicate and m.source_photo_id is not null;
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_duplicate and m.status = 'open';
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('merge', p_duplicate, (select public.current_user_id()), 'Fusionné dans ' || p_kept::text);
end;
$$;

-- Les droits : retirés, puis donnés exactement ---------------------------------------------------------------------------------------

revoke all on function prive.direction_contacts_site_avant_insertion() from public, anon, authenticated;
revoke all on function public.contacts_of_campus(uuid) from public, anon, authenticated;
grant execute on function public.contacts_of_campus(uuid) to authenticated;
revoke all on function public.add_campus_contact(uuid, public.fonction_direction, text, text, public.telephone, boolean, text)
  from public, anon, authenticated;
grant execute on function public.add_campus_contact(uuid, public.fonction_direction, text, text, public.telephone, boolean, text)
  to authenticated;
revoke all on function public.erase_contact_person(uuid, text) from public, anon, authenticated;
grant execute on function public.erase_contact_person(uuid, text) to authenticated;
