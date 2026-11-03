-- Plusieurs personnes à contacter par fiche (ticket #96, étape 1 : la base et l'administration).
--
-- Le relais rencontre un directeur, mais aussi un secrétariat, un propriétaire, un enseignant, parfois plusieurs à la fois ;
-- et le fondateur reçoit par WhatsApp des numéros que l'application n'a pas pu prendre (fiche d'ESTAM, 03/11). Jusqu'ici
-- `prive.direction_contacts` avait UNE ligne par fiche (clé = le relevé), écrite par le seul relais.
--
-- Additive, sans rien casser :
--   * une ligne par PERSONNE, avec son identifiant. L'existant garde pour identifiant le numéro de sa fiche : un téléphone
--     d'avant, qui envoie un seul contact avec l'ancienne forme de l'appel, continue de marcher à l'identique ;
--   * trois personnes au plus par fiche (le garde est dans la base, pas seulement dans l'écran) ;
--   * la fonction « autre » peut dire de quoi il s'agit (« propriétaire », « enseignant ») ;
--   * chaque personne dit d'où elle vient (« relais » ou « administration ») ; l'administration en ajoute, en corrige et en
--     efface une par une. Les numéros restent privés : le relais ne relit rien, personne ne lit la table par l'API.
-- Inchangés : l'accord par personne (pas de numéro sans lui), la confirmation de la fonction et la prime de contact, qui
-- restent PAR FICHE (une personne confirmée, hors secrétariat), et `contact_received` (« y a-t-il un contact ? »).

-- 1. La table : une ligne par personne ---------------------------------------------------------------------------------------------

alter table prive.direction_contacts drop constraint direction_contacts_pkey;
alter table prive.direction_contacts alter column submission_id set not null;
alter table prive.direction_contacts add column id uuid;
update prive.direction_contacts set id = submission_id;
alter table prive.direction_contacts alter column id set not null;
alter table prive.direction_contacts alter column id set default gen_random_uuid();
alter table prive.direction_contacts add primary key (id);
create index direction_contacts_fiche on prive.direction_contacts (submission_id, received_at);

alter table prive.direction_contacts
  add column role_detail text check (length(role_detail) <= 80),
  add column source text not null default 'relais' check (source in ('relais', 'administration')),
  add column added_by uuid,
  add column corrected_at timestamptz,
  add column corrected_by uuid,
  add constraint direction_contacts_precision_si_autre check (role_detail is null or role = 'autre');

comment on table prive.direction_contacts is
  'Les personnes à contacter pour une fiche (trois au plus), vues par le relais ou ajoutées par l''administration. Privé : aucun droit pour l''API, lu et écrit par des fonctions.';
comment on column prive.direction_contacts.id is
  'L''identifiant de la personne. Pour la première personne d''une fiche envoyée par un téléphone d''avant, c''est le numéro de la fiche.';
comment on column prive.direction_contacts.role_detail is
  'Quand la fonction est « autre » : de quoi il s''agit (propriétaire, enseignant…).';

-- Trois personnes au plus par fiche, que ce soit le relais ou l'administration qui ajoute.
create function prive.direction_contacts_avant_insertion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select count(*) from prive.direction_contacts c where c.submission_id = new.submission_id) >= 3 then
    raise exception 'Une fiche a trois personnes à contacter au plus.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger direction_contacts_avant_insertion
before insert on prive.direction_contacts
for each row execute function prive.direction_contacts_avant_insertion();

-- 2. Le relais : une personne de plus, rejouable sans doublon -------------------------------------------------------------------------

-- Une fonction qui prend deux paramètres de plus (avec une valeur par défaut) ne doit pas laisser l'ancienne à côté
-- d'elle : l'appel nommé de l'ancienne forme deviendrait ambigu.
drop function public.send_contact(uuid, public.fonction_direction, text, public.telephone, boolean, timestamptz, text);

-- Le contact d'une personne : le relais l'envoie sans pouvoir le relire. Répond `recu` ou `deja_recu`.
-- `p_contact` est l'identifiant de la personne, créé sur le téléphone ; sans lui (un téléphone d'avant), c'est le numéro
-- de la fiche : une fiche n'a alors qu'une personne, comme avant.
create function public.send_contact(
  p_submission uuid,
  p_role public.fonction_direction default null,
  p_name text default null,
  p_whatsapp public.telephone default null,
  p_agreement boolean default false,
  p_agreement_at timestamptz default null,
  p_note text default null,
  p_contact uuid default null,
  p_role_detail text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(p_contact, p_submission);
begin
  if not public.est_relais_actif() then
    raise exception 'Compte relais inactif.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.field_submissions s
    where s.id = p_submission and s.relay_id = (select public.current_user_id())
  ) then
    raise exception 'Relevé inconnu : envoyer la fiche avant le contact.' using errcode = 'P0002';
  end if;

  insert into prive.direction_contacts (id, submission_id, role, role_detail, name, whatsapp, contact_agreement, agreement_at, said_note)
  values (
    v_id, p_submission, p_role,
    case when p_role = 'autre' then left(nullif(btrim(p_role_detail), ''), 80) end,
    nullif(btrim(p_name), ''), p_whatsapp, coalesce(p_agreement, false), p_agreement_at, nullif(btrim(p_note), '')
  )
  on conflict (id) do nothing;

  if found then
    return 'recu';
  end if;
  -- Un identifiant déjà pris pour une AUTRE fiche n'est pas « déjà reçu » : on ne l'avale pas en silence.
  if not exists (select 1 from prive.direction_contacts c where c.id = v_id and c.submission_id = p_submission) then
    raise exception 'Identifiant de personne déjà utilisé.' using errcode = '23505';
  end if;
  return 'deja_recu';
end;
$$;

-- 3. L'administration lit, ajoute, corrige, efface ---------------------------------------------------------------------------------

-- Les personnes d'un relevé, la première reçue d'abord (l'écran « À valider »). Les colonnes d'avant n'ont pas bougé.
drop function public.contact_of_submission(uuid);
create function public.contact_of_submission(p_submission uuid)
returns table (
  role public.fonction_direction, name text, whatsapp public.telephone,
  contact_agreement boolean, agreement_at timestamptz, said_note text, received_at timestamptz,
  id uuid, role_detail text, source text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
    select c.role, c.name, c.whatsapp, c.contact_agreement, c.agreement_at, c.said_note, c.received_at,
           c.id, c.role_detail, c.source
    from prive.direction_contacts c
    where c.submission_id = p_submission
    order by c.received_at, c.id;
end;
$$;

-- Une personne de plus, notée par l'administration (un numéro reçu par WhatsApp, par exemple). Rend son identifiant.
create function public.add_contact(
  p_submission uuid,
  p_role public.fonction_direction,
  p_role_detail text,
  p_name text,
  p_whatsapp public.telephone,
  p_agreement boolean,
  p_agreement_at timestamptz default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.exiger_admin_session();
  if not exists (select 1 from public.field_submissions s where s.id = p_submission) then
    raise exception 'Relevé introuvable.' using errcode = 'P0002';
  end if;
  if p_whatsapp is not null and not coalesce(p_agreement, false) then
    raise exception 'Sans l''accord de la personne, on ne note pas son numéro.' using errcode = '22023';
  end if;

  insert into prive.direction_contacts
    (submission_id, role, role_detail, name, whatsapp, contact_agreement, agreement_at, said_note, source, added_by)
  values (
    p_submission, p_role,
    case when p_role = 'autre' then left(nullif(btrim(p_role_detail), ''), 80) end,
    nullif(btrim(p_name), ''), p_whatsapp, coalesce(p_agreement, false),
    case when coalesce(p_agreement, false) then coalesce(p_agreement_at, now()) end,
    nullif(btrim(p_note), ''), 'administration', (select public.current_user_id())
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Corrige une personne : tous ses champs sont redonnés (l'écran envoie ce qu'il montre).
create function public.update_contact(
  p_contact uuid,
  p_role public.fonction_direction,
  p_role_detail text,
  p_name text,
  p_whatsapp public.telephone,
  p_agreement boolean,
  p_agreement_at timestamptz default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_whatsapp is not null and not coalesce(p_agreement, false) then
    raise exception 'Sans l''accord de la personne, on ne note pas son numéro.' using errcode = '22023';
  end if;

  update prive.direction_contacts c set
    role = p_role,
    role_detail = case when p_role = 'autre' then left(nullif(btrim(p_role_detail), ''), 80) end,
    name = nullif(btrim(p_name), ''),
    whatsapp = p_whatsapp,
    contact_agreement = coalesce(p_agreement, false),
    agreement_at = case when coalesce(p_agreement, false) then coalesce(p_agreement_at, c.agreement_at, now()) end,
    said_note = nullif(btrim(p_note), ''),
    corrected_at = now(),
    corrected_by = (select public.current_user_id())
  where c.id = p_contact;
  if not found then
    raise exception 'Personne introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- Efface UNE personne (loi n° 29-2019). La fonction confirmée de la fiche ne tombe qu'avec la dernière personne :
-- elle ne dit rien d'une personne en particulier, et elle sert à la prime de contact.
create function public.erase_contact_person(p_contact uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_submission uuid;
begin
  perform public.exiger_admin_session();
  delete from prive.direction_contacts c where c.id = p_contact returning c.submission_id into v_submission;
  if not found then
    raise exception 'Personne introuvable.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from prive.direction_contacts c where c.submission_id = v_submission) then
    update public.field_submissions s set contact_confirmed_at = null, contact_role = null where s.id = v_submission;
  end if;
  insert into prive.erasures (what, submission_id, by_user, note)
  values ('contact', v_submission, (select public.current_user_id()), p_note);
end;
$$;

-- Les droits : retirés, puis donnés exactement ---------------------------------------------------------------------------------------

revoke all on function public.send_contact(uuid, public.fonction_direction, text, public.telephone, boolean, timestamptz, text, uuid, text) from public, anon, authenticated;
grant execute on function public.send_contact(uuid, public.fonction_direction, text, public.telephone, boolean, timestamptz, text, uuid, text) to authenticated;
revoke all on function public.contact_of_submission(uuid) from public, anon, authenticated;
grant execute on function public.contact_of_submission(uuid) to authenticated;
revoke all on function public.add_contact(uuid, public.fonction_direction, text, text, public.telephone, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function public.add_contact(uuid, public.fonction_direction, text, text, public.telephone, boolean, timestamptz, text) to authenticated;
revoke all on function public.update_contact(uuid, public.fonction_direction, text, text, public.telephone, boolean, timestamptz, text) from public, anon, authenticated;
grant execute on function public.update_contact(uuid, public.fonction_direction, text, text, public.telephone, boolean, timestamptz, text) to authenticated;
revoke all on function public.erase_contact_person(uuid, text) from public, anon, authenticated;
grant execute on function public.erase_contact_person(uuid, text) to authenticated;
revoke all on function prive.direction_contacts_avant_insertion() from public, anon, authenticated;
