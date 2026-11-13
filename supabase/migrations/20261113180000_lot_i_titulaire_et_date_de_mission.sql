-- M13. Lot I (13/11/2026) : le nom du titulaire Mobile Money, et la date où NTanova a confié la mission.
--
-- 1. « Au nom de » : au Congo, MTN et Airtel affichent le nom du titulaire avant d'envoyer l'argent ; NTanova le compare à
--    celui que le relais a donné. Il reste dans le schéma privé, à côté du numéro, et ne se lit que par les mêmes fonctions.
--    Facultatif en base (les numéros déjà notés n'en ont pas) ; quand une fonction reçoit null, le nom déjà noté reste.
-- 2. `my_missions()` rend `assigned_at` (la date de création de la mission, c'est-à-dire de son attribution :
--    `assign_mission` crée une mission neuve à chaque fois).
-- Les anciens appels marchent toujours : les paramètres nouveaux ont une valeur par défaut, les colonnes nouvelles s'ajoutent
-- à la fin (le code en ligne lit les colonnes par leur nom).

alter table prive.relay_payment_details add column holder_name text
  check (holder_name is null or char_length(btrim(holder_name)) between 2 and 80);
comment on column prive.relay_payment_details.holder_name is
  'Le nom du titulaire du compte Mobile Money, tel que le relais l''a écrit (« Au nom de »). NTanova le compare au nom affiché par l''opérateur avant d''envoyer.';

-- Le relais : lire ---------------------------------------------------------------------------------------------------------------------------
drop function public.my_payment_details();
create function public.my_payment_details()
returns table (operator text, msisdn text, updated_at timestamptz, holder_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_relais_actif() then
    return;
  end if;
  return query
  select d.operator, d.msisdn::text, d.updated_at, d.holder_name
  from prive.relay_payment_details d
  where d.relay_id = (select public.current_user_id());
end;
$$;
comment on function public.my_payment_details() is
  'Le numéro Mobile Money du relais connecté (opérateur, numéro, nom du titulaire), ou rien. Jamais celui d''un autre relais.';
revoke all on function public.my_payment_details() from public, anon, authenticated;
grant execute on function public.my_payment_details() to authenticated;

-- Le relais : écrire -------------------------------------------------------------------------------------------------------------------------
drop function public.set_my_payment_details(text, text);
create function public.set_my_payment_details(p_operator text, p_msisdn text, p_holder_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_user_id());
  v_nom text := nullif(regexp_replace(btrim(coalesce(p_holder_name, '')), '\s+', ' ', 'g'), '');
begin
  if not public.est_relais_actif() then
    raise exception 'Seul un relais actif enregistre son numéro de paie.' using errcode = '42501';
  end if;
  if p_operator is null or p_operator not in ('mtn', 'airtel', 'autre') then
    raise exception 'L''opérateur est MTN, Airtel ou autre.' using errcode = '22023';
  end if;
  if p_msisdn is null or p_msisdn !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Le numéro s''écrit avec l''indicatif, sans + ni espace (242…).' using errcode = '22023';
  end if;
  if v_nom is not null and char_length(v_nom) not between 2 and 80 then
    raise exception 'Le nom du titulaire fait de 2 à 80 caractères.' using errcode = '22023';
  end if;
  insert into prive.relay_payment_details (relay_id, operator, msisdn, holder_name, updated_by)
  values (v_me, p_operator, p_msisdn::public.telephone, v_nom, v_me)
  on conflict (relay_id) do update set operator = excluded.operator, msisdn = excluded.msisdn,
    holder_name = coalesce(excluded.holder_name, prive.relay_payment_details.holder_name),
    updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
comment on function public.set_my_payment_details(text, text, text) is
  'Le relais actif connecté pose ou change son numéro Mobile Money (mtn, airtel, autre ; numéro avec indicatif ; nom du titulaire).';
revoke all on function public.set_my_payment_details(text, text, text) from public, anon, authenticated;
grant execute on function public.set_my_payment_details(text, text, text) to authenticated;

-- L'administration : écrire ------------------------------------------------------------------------------------------------------------------
drop function public.set_relay_payment_details(uuid, text, public.telephone);
create function public.set_relay_payment_details(p_relay uuid, p_operator text, p_msisdn public.telephone, p_holder_name text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_nom text := nullif(regexp_replace(btrim(coalesce(p_holder_name, '')), '\s+', ' ', 'g'), '');
begin
  perform public.exiger_admin_session();
  if v_nom is not null and char_length(v_nom) not between 2 and 80 then
    raise exception 'Le nom du titulaire fait de 2 à 80 caractères.' using errcode = '22023';
  end if;
  insert into prive.relay_payment_details (relay_id, operator, msisdn, holder_name, updated_by)
  values (p_relay, p_operator, p_msisdn, v_nom, (select public.current_user_id()))
  on conflict (relay_id) do update set operator = excluded.operator, msisdn = excluded.msisdn,
    holder_name = coalesce(excluded.holder_name, prive.relay_payment_details.holder_name),
    updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
comment on function public.set_relay_payment_details(uuid, text, public.telephone, text) is
  'L''administration note le numéro Mobile Money d''un relais (et le nom du titulaire s''il est donné ; sinon celui déjà noté reste).';
revoke all on function public.set_relay_payment_details(uuid, text, public.telephone, text) from public, anon, authenticated;
grant execute on function public.set_relay_payment_details(uuid, text, public.telephone, text) to authenticated;

-- L'administration : lire les paiements d'une semaine, avec le nom à comparer ------------------------------------------------------------------
drop function public.payout_statements_of(uuid);
create function public.payout_statements_of(p_batch uuid)
returns table (relay_id uuid, first_name text, total_xaf integer, submissions integer, contacts integer, trial_bundles integer,
               operator text, msisdn text, paid_at timestamptz, reference text, missions integer, holder_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select s.relay_id, r.prenom, s.total_xaf,
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'trial_bundle'),
         d.operator, d.msisdn::text, s.paid_at, s.reference,
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'mission'),
         d.holder_name
  from public.payout_statements s
  join public.relais r on r.id = s.relay_id
  left join prive.relay_payment_details d on d.relay_id = s.relay_id
  where s.batch_id = p_batch
  order by r.prenom, s.relay_id;
end;
$$;
revoke all on function public.payout_statements_of(uuid) from public, anon, authenticated;
grant execute on function public.payout_statements_of(uuid) to authenticated;

-- Le relais : ses missions, avec la date où NTanova les a confiées ------------------------------------------------------------------------------
drop function public.my_missions();
create function public.my_missions()
returns table (
  mission_id uuid, campus_id uuid, name text, label text, neighbourhood text, school_kind text, cycles text[],
  curriculum_note text, landmark text, sign_phone text, note text, kind text, latitude double precision,
  longitude double precision, verification_state text, photo_roles text[], contact_confirmed boolean,
  task text, reason text, due_on date, pay_xaf integer, assigned_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select m.id, c.id, i.name, c.label, c.neighbourhood, i.kind::text,
         coalesce((select array_agg(cc.cycle::text order by cc.cycle) from public.campus_cycles cc where cc.campus_id = c.id), '{}'),
         c.curriculum_note, c.landmark, c.sign_phone::text, m.note, m.kind::text,
         extensions.st_y(c.position), extensions.st_x(c.position), c.verification_state::text,
         coalesce((select array_agg(distinct p.role::text order by p.role::text)
                   from public.field_submission_photos p
                   join public.field_submissions s on s.id = p.submission_id
                   where s.campus_id = c.id and s.status = 'accepte'), '{}'),
         exists (select 1 from public.field_submissions s
                 where s.campus_id = c.id and s.status = 'accepte' and s.contact_confirmed_at is not null),
         m.task, m.reason, m.due_on, m.pay_xaf, m.created_at
  from public.missions m
  join public.campuses c on c.id = m.campus_id
  join public.institutions i on i.id = c.institution_id
  where public.est_relais_actif() and m.status = 'open' and m.relay_id = (select public.current_user_id())
  order by m.created_at;
$$;
comment on function public.my_missions() is
  'Les missions ouvertes du relais connecté : l''école, ce que NTanova en sait, ce qu''il faut faire et pourquoi, la date limite, le montant et la date où elle a été confiée.';
revoke all on function public.my_missions() from public, anon, authenticated;
grant execute on function public.my_missions() to authenticated;

-- 3. « On y voit » : sous la photo de l'étape 1, le relais coche ce que la photo montre (l'enseigne, le portail, le
--    bâtiment). La photo garde son rôle (`signboard`, la photo obligatoire de l'étape 1) ; `shows` dit seulement ce qu'on y
--    voit, pour que l'administration sache, avant de la publier, si l'enseigne est vraiment lisible dessus.
alter table public.field_submission_photos add column shows text[]
  check (shows is null or shows <@ array['signboard', 'entrance', 'building']::text[]);
comment on column public.field_submission_photos.shows is
  'Ce que le relais dit voir sur la photo (« On y voit ») : signboard (l''enseigne), entrance (le portail), building (le bâtiment). Null : pas dit.';

drop function public.register_photo(uuid, uuid, public.photo_role, text, integer, integer, integer, timestamptz);
create function public.register_photo(
  p_photo uuid,
  p_submission uuid,
  p_role public.photo_role,
  p_mime text,
  p_bytes integer,
  p_width integer default null,
  p_height integer default null,
  p_taken_at timestamptz default null,
  p_shows text[] default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_shows text[] := (select array_agg(distinct x order by x) from unnest(p_shows) x where x is not null);
begin
  if not public.est_relais_actif() then
    raise exception 'Compte relais inactif.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.field_submissions s
    where s.id = p_submission and s.relay_id = (select public.current_user_id())
  ) then
    raise exception 'Relevé inconnu : envoyer la fiche avant les photos.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.field_submission_photos p where p.id = p_photo) then
    return 'deja_recu';
  end if;
  if v_shows is not null and not v_shows <@ array['signboard', 'entrance', 'building']::text[] then
    raise exception 'Sur la photo : l''enseigne, le portail ou le bâtiment.' using errcode = '22023';
  end if;

  insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes, width, height, taken_at, shows)
  values (
    p_photo, p_submission, p_role,
    p_submission::text || '/' || p_photo::text || case p_mime when 'image/webp' then '.webp' else '.jpg' end,
    p_mime, p_bytes, p_width, p_height, p_taken_at, v_shows
  );
  return 'recu';
end;
$$;
comment on function public.register_photo(uuid, uuid, public.photo_role, text, integer, integer, integer, timestamptz, text[]) is
  'Le relais actif enregistre une photo de son relevé (déjà déposée dans le stockage), avec ce qu''on y voit. Rejouable : une photo déjà reçue répond deja_recu.';
revoke all on function public.register_photo(uuid, uuid, public.photo_role, text, integer, integer, integer, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.register_photo(uuid, uuid, public.photo_role, text, integer, integer, integer, timestamptz, text[]) to authenticated;
