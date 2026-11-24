-- Refonte publique, lot 3B1 (ticket 215) : les messages reçus. 2. Le laissez-passer et l'envoi.
--
-- Deux fonctions publiques, et elles seules :
--   * `issue_public_request_pass()` rend une clé, l'heure DU SERVEUR et un sceau ; elle n'écrit rien ;
--   * `send_public_request(…)` enregistre en une transaction et rend un code et une référence, jamais un contenu.
-- L'horloge de référence est celle de la base : le navigateur ne peut ni l'avancer ni la reculer (le sceau la couvre). Les fonctions
-- `prive.*_at(…)` prennent l'heure en paramètre pour les tests ; aucun rôle de l'API ne les atteint.
--
-- Les issues attendues sont des réponses, pas des erreurs : une contrainte violée et non capturée écrirait la ligne refusée
-- (« Failing row contains… »), donc le message d'une personne, dans le journal du serveur.

-- Lire ce qui arrive -----------------------------------------------------------------------------------------------------------------

-- Une valeur appartient-elle à une liste fermée ? La liste vit dans le domaine, pas ici.
create function prive.public_request_in_list(p_value text, p_list text) returns boolean
language plpgsql stable set search_path = '' as $$
begin
  case p_list
    when 'kind' then perform p_value::public.public_request_kind;
    when 'origin' then perform p_value::public.public_request_origin;
    when 'subject' then perform p_value::public.public_request_subject;
    when 'level' then perform p_value::public.public_request_level;
    when 'topic' then perform p_value::public.public_request_topic;
    when 'knowledge' then perform p_value::public.public_request_knowledge;
    when 'removal' then perform p_value::public.public_request_removal;
    when 'reply' then perform p_value::public.public_request_reply;
  end case;
  return p_value is not null;
exception when check_violation then
  return false;
end;
$$;

-- Un texte propre : fins de ligne unifiées, sans caractère de contrôle ni de sens d'écriture caché, sans blanc au bord. Vide : nul.
create function prive.public_request_text(p_text text, p_one_line boolean) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := replace(replace(p_text, E'\r\n', E'\n'), E'\r', E'\n');
begin
  if p_one_line then v := regexp_replace(v, '[\n\t ]+', ' ', 'g'); end if;
  v := regexp_replace(v, '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]', '', 'g');
  return nullif(btrim(v, E' \n\t\u00A0'), '');
end;
$$;

-- Le contenu d'un envoi, contrôlé en entier : { "content": {…}, "errors": { champ: code } }. Un champ inconnu est refusé ; les codes
-- d'erreur sont une liste fermée (requis, trop_long, hors_liste, format, champ_inconnu, illisible), jamais ce qui a été écrit.
create function prive.normalize_public_request(p_kind text, p_request jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_content jsonb := '{}';
  v_errors jsonb := '{}';
  v_champs text[] := '{}';
  f record;
  v jsonb;
  t text;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    return jsonb_build_object('content', '{}'::jsonb, 'errors', jsonb_build_object('request', 'illisible'));
  end if;
  for f in
    select s.field, s.form, s.max_length, p_kind = any (s.required_kinds) as required
    from (values
      -- champ, natures, forme, longueur, natures où il est requis
      ('origin',          '{contact,absente,erreur,retrait}'::text[], 'origin',    null, '{contact,absente,erreur,retrait}'::text[]),
      ('subject',         '{contact}',                                'subject',   null, '{}'),
      ('message',         '{contact}',                                'texte',     2000, '{contact}'),
      ('school_name',     '{absente,erreur,retrait}',                 'ligne',      120, '{absente}'),
      ('town',            '{absente}',                                'ligne',       80, '{absente}'),
      ('landmark',        '{absente}',                                'ligne',      160, '{}'),
      ('other_details',   '{absente}',                                'texte',      300, '{}'),
      ('levels',          '{absente}',                                'niveaux',   null, '{}'),
      ('is_from_school',  '{absente}',                                'booleen',   null, '{}'),
      ('campus_id',       '{erreur,retrait}',                         'fiche',     null, '{}'),
      ('topic',           '{erreur}',                                 'topic',     null, '{erreur}'),
      ('correction',      '{erreur}',                                 'texte',     1000, '{erreur}'),
      ('knowledge',       '{erreur}',                                 'knowledge', null, '{}'),
      ('removal',         '{retrait}',                                'removal',   null, '{retrait}'),
      ('removal_details', '{retrait}',                                'texte',      500, '{}'),
      ('reply',           '{contact,absente,erreur,retrait}',         'reply',     null, '{contact,absente,erreur,retrait}'),
      ('contact',         '{contact,absente,erreur,retrait}',         'ligne',      254, '{}'),
      ('person_name',     '{contact,absente,erreur,retrait}',         'ligne',       80, '{}')
    ) as s(field, kinds, form, max_length, required_kinds)
    where p_kind = any (s.kinds)
  loop
    v_champs := v_champs || f.field;
    v := p_request -> f.field;
    t := null;
    if v is not null and jsonb_typeof(v) <> 'null' then
      if f.form = 'booleen' then
        if jsonb_typeof(v) = 'boolean' then
          v_content := v_content || jsonb_build_object(f.field, v);
        else
          v_errors := v_errors || jsonb_build_object(f.field, 'format');
        end if;
        continue;
      elsif f.form = 'niveaux' then
        if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 6 then
          v_errors := v_errors || jsonb_build_object(f.field, 'format');
        elsif exists (select 1 from jsonb_array_elements(v) e
                      where jsonb_typeof(e) <> 'string' or not prive.public_request_in_list(e #>> '{}', 'level')) then
          v_errors := v_errors || jsonb_build_object(f.field, 'hors_liste');
        elsif jsonb_array_length(v) > 0 then
          v_content := v_content || jsonb_build_object(f.field,
            (select jsonb_agg(distinct e order by e) from jsonb_array_elements_text(v) e));
        end if;
        continue;
      elsif jsonb_typeof(v) <> 'string' then
        v_errors := v_errors || jsonb_build_object(f.field, 'format');
        continue;
      end if;
      t := prive.public_request_text(v #>> '{}', f.form <> 'texte');
    end if;
    if t is null then
      if f.required then v_errors := v_errors || jsonb_build_object(f.field, 'requis'); end if;
    elsif f.form in ('texte', 'ligne') then
      if char_length(t) > f.max_length then
        v_errors := v_errors || jsonb_build_object(f.field, 'trop_long');
      else
        v_content := v_content || jsonb_build_object(f.field, t);
      end if;
    elsif f.form = 'fiche' then
      if t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_content := v_content || jsonb_build_object(f.field, t);
      else
        v_errors := v_errors || jsonb_build_object(f.field, 'format');
      end if;
    elsif prive.public_request_in_list(t, f.form) then
      v_content := v_content || jsonb_build_object(f.field, t);
    else
      v_errors := v_errors || jsonb_build_object(f.field, 'hors_liste');
    end if;
  end loop;

  if exists (select 1 from jsonb_object_keys(p_request) k where k <> all (v_champs)) then
    v_errors := v_errors || jsonb_build_object('request', 'champ_inconnu');
  end if;
  -- Une fiche connue, ou son nom.
  if p_kind in ('erreur', 'retrait') and not (v_content ? 'campus_id' or v_content ? 'school_name' or v_errors ? 'campus_id' or v_errors ? 'school_name') then
    v_errors := v_errors || jsonb_build_object('school_name', 'requis');
  end if;
  -- Un retrait a toujours une réponse ; une coordonnée sans réponse demandée n'est pas gardée.
  if p_kind = 'retrait' and v_content ->> 'reply' = 'non' then
    v_errors := v_errors || jsonb_build_object('reply', 'requis');
  elsif v_content ->> 'reply' = 'non' then
    v_content := v_content - 'contact';
    v_errors := v_errors - 'contact';
  elsif v_content ->> 'reply' in ('whatsapp', 'email') and not v_errors ? 'contact' then
    if not v_content ? 'contact' then
      v_errors := v_errors || jsonb_build_object('contact', 'requis');
    elsif v_content ->> 'reply' = 'whatsapp' and v_content ->> 'contact' !~ '^[1-9][0-9]{7,14}$' then
      v_errors := v_errors || jsonb_build_object('contact', 'format');
    elsif v_content ->> 'reply' = 'email' and v_content ->> 'contact' !~ '^[^[:space:]@<>()",;:]+@[^[:space:]@<>()",;:.]+(\.[^[:space:]@<>()",;:.]+)*\.[^[:space:]@<>()",;:.]{2,}$' then
      v_errors := v_errors || jsonb_build_object('contact', 'format');
    end if;
  end if;
  if octet_length(v_content::text) > 8192 then
    v_errors := v_errors || jsonb_build_object('request', 'trop_long');
  end if;
  return jsonb_build_object('content', v_content, 'errors', v_errors);
end;
$$;

-- Le laissez-passer -------------------------------------------------------------------------------------------------------------------

create function prive.public_request_seal(p_key text, p_issued_at bigint, p_secret bytea) returns text
language plpgsql stable set search_path = '' as $$
begin
  return encode(extensions.hmac(convert_to(p_key || ':' || p_issued_at, 'UTF8'), p_secret, 'sha256'), 'hex');
end;
$$;

create function prive.issue_public_request_pass_at(p_now timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_secret bytea := (select s.secret from prive.public_request_secrets s order by s.id desc limit 1);
  v_key text := gen_random_uuid()::text;
  v_issued bigint := floor(extract(epoch from p_now));
begin
  if v_secret is null then
    raise exception 'Les envois ne sont pas ouverts.' using errcode = '55000';
  end if;
  return jsonb_build_object('key', v_key, 'issued_at', v_issued, 'seal', prive.public_request_seal(v_key, v_issued, v_secret));
end;
$$;

-- Le sceau est-il bon, et l'heure dans la validité ? Un secret remplacé reste bon le temps de la validité, pas plus. Une minute de
-- tolérance si l'horloge du serveur a été remise à l'heure.
create function prive.public_request_pass_is_valid(p_key text, p_issued_at bigint, p_seal text, p_now timestamptz) returns boolean
language plpgsql stable set search_path = '' as $$
declare v_validity interval := (select s.pass_validity from prive.public_request_settings s);
begin
  if p_key is null or p_issued_at is null or p_seal is null or length(p_seal) <> 64 or p_issued_at not between 0 and 4102444800 then
    return false;
  end if;
  if to_timestamp(p_issued_at) > p_now + interval '1 minute' or p_now >= to_timestamp(p_issued_at) + v_validity then
    return false;
  end if;
  return exists (
    select 1
    from (select s.secret, lead(s.created_at) over (order by s.id) as replaced_at from prive.public_request_secrets s) x
    where (x.replaced_at is null or p_now < x.replaced_at + v_validity)
      and prive.public_request_seal(p_key, p_issued_at, x.secret) = p_seal
  );
end;
$$;

-- Les bornes ---------------------------------------------------------------------------------------------------------------------------

-- Une seule écriture conditionnelle : deux envois simultanés ne dépassent jamais le seuil. `filled_at` date le moment où il est
-- atteint (l'administration le voit) sans qu'un refus n'écrive rien.
create function prive.reserve_public_request_counter(p_bucket text, p_window timestamptz, p_max integer, p_now timestamptz, p_code text) returns void
language plpgsql set search_path = '' as $$
begin
  insert into prive.public_request_counters as c (bucket, window_start, n, filled_at)
  values (p_bucket, p_window, 1, case when p_max <= 1 then p_now end)
  on conflict (bucket, window_start) do update
    set n = c.n + 1, filled_at = case when c.n + 1 >= p_max then p_now end
    where c.n < p_max;
  if not found then
    raise exception 'Borne atteinte.' using errcode = p_code;
  end if;
end;
$$;

-- L'ordre des compteurs est toujours le même (connexion, puis ensemble ; écritures, puis créations) : pas d'interblocage.
create function prive.reserve_public_request_write(p_creation boolean, p_connection inet, p_now timestamptz) returns void
language plpgsql set search_path = '' as $$
declare
  r prive.public_request_settings;
  v_heure timestamptz := date_trunc('hour', p_now);
  v_jour date := (p_now at time zone 'Africa/Brazzaville')::date;
  v_debut_du_jour timestamptz := v_jour::timestamp at time zone 'Africa/Brazzaville';
  v_salt bytea;
  v_hash text;
begin
  select * into r from prive.public_request_settings;
  if p_connection is not null then
    insert into prive.public_request_salts (day, salt) values (v_jour, extensions.gen_random_bytes(16)) on conflict (day) do nothing;
    select s.salt into v_salt from prive.public_request_salts s where s.day = v_jour;
    v_hash := encode(sha256(v_salt || convert_to(host(p_connection), 'UTF8')), 'hex');
    perform prive.reserve_public_request_counter('e:' || v_hash, v_heure, r.connection_writes_per_hour, p_now, 'NTC01');
    if p_creation then
      perform prive.reserve_public_request_counter('c:' || v_hash, v_heure, r.connection_creations_per_hour, p_now, 'NTC01');
    end if;
  end if;
  perform prive.reserve_public_request_counter('E', v_debut_du_jour, r.daily_writes_max, p_now, 'NTD01');
  if p_creation then
    perform prive.reserve_public_request_counter('C', v_debut_du_jour, r.daily_creations_max, p_now, 'NTD01');
  end if;
end;
$$;

-- L'adresse de la personne, seulement si un en-tête a été CONSTATÉ fiable (réglage) et s'il ne porte qu'une adresse. Sinon nul : une
-- adresse que le client peut écrire ne prouve rien, et ne borne rien. Une adresse IPv6 compte pour son réseau (/64).
create function prive.public_request_connection() returns inet
language plpgsql stable set search_path = '' as $$
declare
  v_header text := (select s.trusted_connection_header from prive.public_request_settings s);
  v_adresse text;
begin
  if v_header is null then return null; end if;
  v_adresse := btrim(nullif(current_setting('request.headers', true), '')::json ->> v_header);
  if v_adresse is null or v_adresse !~ '^[0-9A-Fa-f:.]{2,45}$' then return null; end if;
  v_adresse := regexp_replace(v_adresse, '^::ffff:(?=[0-9.]+$)', '', 'i');
  return case when family(v_adresse::inet) = 6 then network(set_masklen(v_adresse::inet, 64))::inet else v_adresse::inet end;
exception when data_exception then
  return null;
end;
$$;

-- Enregistrer --------------------------------------------------------------------------------------------------------------------------

create function prive.note_public_request_event(p_request bigint, p_what text, p_detail text, p_at timestamptz, p_by uuid default null) returns void
language sql set search_path = '' as $$
  insert into prive.public_request_events (request_id, what, detail, at, by_user) values (p_request, p_what, p_detail, p_at, p_by);
$$;

-- Crée un message, sa première version, son annonce (sauf indésirable ou réorientation) et le suivi d'un retrait. Rend son numéro interne.
create function prive.create_public_request(
  p_kind text, p_key_hash bytea, p_revision integer, p_content jsonb, p_now timestamptz,
  p_spam boolean default false, p_follows bigint default null, p_redirected_from bigint default null, p_opened boolean default false
) returns prive.public_requests
language plpgsql set search_path = '' as $$
declare
  v prive.public_requests;
  v_signes constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_hasard bytea;
  v_reference text;
begin
  -- 32 signes : un octet en donne cinq bits sans biais. Une référence déjà prise se retire.
  loop
    v_hasard := extensions.gen_random_bytes(8);
    select case p_kind when 'contact' then 'C-' when 'retrait' then 'R-' else 'A-' end
           || string_agg(substr(v_signes, (get_byte(v_hasard, i) & 31) + 1, 1) || case when i = 3 then '-' else '' end, '' order by i)
      into v_reference from generate_series(0, 7) i;
    insert into prive.public_requests (
      reference, kind, key_hash, state, received_at, current_revision, opened_at, opened_revision, campus_id,
      reply_channel, reply_state, spam_since, follows_id, redirected_from_id)
    values (
      v_reference, p_kind, p_key_hash,
      case when p_spam then 'indesirable' when p_opened then 'ouverte' else 'recue' end, p_now, p_revision,
      case when p_opened then p_now end, case when p_opened then p_revision end,
      (p_content ->> 'campus_id')::uuid,
      p_content ->> 'reply', case when p_content ->> 'reply' = 'non' then 'non_demandee' else 'a_faire' end,
      case when p_spam then p_now end, p_follows, p_redirected_from)
    on conflict (reference) do nothing
    returning * into v;
    exit when v.id is not null;
  end loop;
  insert into prive.public_request_versions (request_id, revision, content, content_hash, received_at)
  values (v.id, p_revision, p_content, sha256(convert_to(p_content::text, 'UTF8')), p_now);
  if p_kind = 'retrait' then
    insert into prive.public_request_removals (request_id) values (v.id);
  end if;
  if not p_spam and p_redirected_from is null then
    insert into prive.public_request_notices (request_id, next_attempt_at) values (v.id, p_now);
  end if;
  perform prive.note_public_request_event(v.id, case when p_spam then 'indesirable' else 'recue' end, null, p_now);
  return v;
end;
$$;

-- L'envoi, à une heure donnée (les tests), depuis une connexion donnée ou inconnue. Voir `public.send_public_request`.
create function prive.send_public_request_at(
  p_key text, p_issued_at bigint, p_seal text, p_revision integer, p_kind text, p_request jsonb, p_trap text,
  p_now timestamptz, p_connection inet
) returns jsonb
language plpgsql set search_path = '' as $$
declare
  r prive.public_request_settings;
  d prive.public_requests;
  n prive.public_requests;
  v_lu jsonb;
  v_contenu jsonb;
  v_empreinte bytea;
  v_empreinte_cle bytea;
  v_empreinte_suite bytea;
  v_piege boolean := nullif(btrim(p_trap), '') is not null;
  v_suite boolean;
  v_code text;
begin
  -- 1. Le contenu, en entier, avant tout verrou et toute contrainte.
  if p_kind is null or not prive.public_request_in_list(p_kind, 'kind') then
    return jsonb_build_object('code', 'refusee', 'errors', jsonb_build_object('kind', 'hors_liste'));
  end if;
  if p_revision is null or p_revision not between 1 and 1000 then
    return jsonb_build_object('code', 'refusee', 'errors', jsonb_build_object('revision', 'format'));
  end if;
  v_lu := prive.normalize_public_request(p_kind, p_request);
  if v_lu -> 'errors' <> '{}'::jsonb then
    return jsonb_build_object('code', 'refusee', 'errors', v_lu -> 'errors');
  end if;
  v_contenu := v_lu -> 'content';
  v_empreinte := sha256(convert_to(v_contenu::text, 'UTF8'));

  -- 2. La clé : une forme, un verrou (même avant la première ligne), puis la ligne. Envoi et ouverture s'ordonnent toujours.
  if p_key is null or p_key !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('code', 'expiree');
  end if;
  select * into r from prive.public_request_settings;
  v_empreinte_cle := sha256(convert_to(p_key, 'UTF8'));
  v_empreinte_suite := sha256(v_empreinte_cle || convert_to(':suite:', 'UTF8') || v_empreinte);
  perform pg_advisory_xact_lock(hashtextextended(encode(v_empreinte_cle, 'hex'), 3301));
  select * into d from prive.public_requests q where q.key_hash = v_empreinte_cle for update;

  if d.id is not null then
    -- 3. Déjà reçu : la même révision et le même texte, le texte courant, ou une suite déjà enregistrée. Rien n'est écrit, rien n'est
    --    compté, même après l'expiration.
    if d.kind = p_kind then
      if exists (select 1 from prive.public_request_versions v
                 where v.request_id = d.id and v.content_hash = v_empreinte and (v.revision = p_revision or v.revision = d.current_revision)) then
        return jsonb_build_object('code', 'deja_enregistree', 'reference', d.reference);
      end if;
      select * into n from prive.public_requests q where q.key_hash = v_empreinte_suite;
      if n.id is not null then
        return jsonb_build_object('code', 'deja_enregistree', 'reference', n.reference, 'previous_reference', d.reference);
      end if;
    else
      return jsonb_build_object('code', 'cle_deja_utilisee');
    end if;
  end if;

  -- 4. La validité : celle de l'heure du serveur, jamais celle du navigateur.
  if not prive.public_request_pass_is_valid(p_key, p_issued_at, p_seal, p_now) then
    return jsonb_strip_nulls(jsonb_build_object('code', 'expiree', 'reference', d.reference));
  end if;

  -- 5. Une fiche qui n'est plus publiée : la page montre le champ du nom et garde tout le reste.
  if v_contenu ? 'campus_id' and not exists (
    select 1 from public.campuses c where c.id = (v_contenu ->> 'campus_id')::uuid and c.publication = 'publiee' and c.trashed_at is null
  ) then
    return jsonb_strip_nulls(jsonb_build_object('code', 'ecole_inconnue', 'reference', d.reference));
  end if;

  -- 6. Une première écriture.
  if d.id is null then
    begin
      perform prive.reserve_public_request_write(true, p_connection, p_now);
      n := prive.create_public_request(p_kind, v_empreinte_cle, p_revision, v_contenu, p_now, v_piege);
      return jsonb_build_object('code', 'enregistree', 'reference', n.reference);
    exception
      when sqlstate 'NTC01' then return jsonb_build_object('code', 'trop_d_envois');
      when sqlstate 'NTD01' then return jsonb_build_object('code', 'plafond');
    end;
  end if;

  -- 7. Un autre texte sous la même clé. Une suite : la demande est ouverte et le texte est plus récent, ou la révision est déjà reçue
  --    avec un autre texte (deux fenêtres) : rien n'est écrasé.
  v_suite := (p_revision > d.current_revision and d.opened_at is not null)
    or exists (select 1 from prive.public_request_versions v where v.request_id = d.id and v.revision = p_revision);
  if d.writes >= r.key_writes_max or (v_suite and d.followups >= r.key_followups_max) then
    -- La seule trace d'un refus : une date, une fois, pour que le fondateur sache qu'un texte manque.
    if d.limit_reached_at is null then
      update prive.public_requests q set limit_reached_at = p_now where q.id = d.id;
      perform prive.note_public_request_event(d.id, 'limite', null, p_now);
    end if;
    return jsonb_build_object('code', 'limite_atteinte', 'reference', d.reference);
  end if;
  begin
    perform prive.reserve_public_request_write(v_suite, p_connection, p_now);
    if v_suite then
      n := prive.create_public_request(p_kind, v_empreinte_suite, p_revision, v_contenu, p_now, v_piege or d.state = 'indesirable', d.id);
      update prive.public_requests q set writes = q.writes + 1, followups = q.followups + 1 where q.id = d.id;
      perform prive.note_public_request_event(d.id, 'suite', n.reference, p_now);
      return jsonb_build_object('code', 'suite', 'reference', n.reference, 'previous_reference', d.reference);
    end if;
    v_code := case when p_revision > d.current_revision then 'mise_a_jour' else 'version_ancienne' end;
    insert into prive.public_request_versions (request_id, revision, content, content_hash, late, received_at)
    values (d.id, p_revision, v_contenu, v_empreinte, v_code = 'version_ancienne', p_now);
    if v_code = 'mise_a_jour' then
      update prive.public_requests q set
        writes = q.writes + 1, current_revision = p_revision, campus_id = (v_contenu ->> 'campus_id')::uuid,
        reply_channel = v_contenu ->> 'reply', reply_state = case when v_contenu ->> 'reply' = 'non' then 'non_demandee' else 'a_faire' end
      where q.id = d.id;
    else
      update prive.public_requests q set writes = q.writes + 1 where q.id = d.id;
    end if;
    perform prive.note_public_request_event(d.id, v_code, null, p_now);
    return jsonb_build_object('code', v_code, 'reference', d.reference);
  exception
    when sqlstate 'NTC01' then return jsonb_build_object('code', 'trop_d_envois', 'reference', d.reference);
    when sqlstate 'NTD01' then return jsonb_build_object('code', 'plafond', 'reference', d.reference);
  end;
end;
$$;

-- Les deux portes publiques ------------------------------------------------------------------------------------------------------------

create function public.issue_public_request_pass() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return prive.issue_public_request_pass_at(clock_timestamp());
end;
$$;
comment on function public.issue_public_request_pass() is
  'Un laissez-passer d''envoi : une clé, l''heure du serveur, un sceau. N''écrit rien.';

-- Un seul paramètre, un json SANS NOM, exprès : PostgREST passe alors le corps tel quel, et c'est ici qu'il se lit. Avec des paramètres
-- nommés, le serveur le décode lui-même avant d'appeler la fonction : un caractère impossible (\u0000) dans un message y lève une erreur
-- qui en recopie une cinquantaine de signes dans son journal (constaté le 24/11 sur PostgREST 14). Sans nom, la fonction ne s'appelle
-- pas non plus par GET : un message ne passe pas dans une adresse.
-- Le corps : { key, issued_at, seal, revision, kind, request: {…}, trap }.
create function public.send_public_request(json) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b jsonb;
begin
  -- 8 Ko de contenu, et l'enveloppe.
  if octet_length($1::text) > 9216 then
    return jsonb_build_object('code', 'refusee', 'errors', jsonb_build_object('request', 'trop_long'));
  end if;
  begin
    b := $1::jsonb;
  exception when data_exception then
    b := null;
  end;
  if b is null or jsonb_typeof(b) <> 'object' then
    return jsonb_build_object('code', 'refusee', 'errors', jsonb_build_object('request', 'illisible'));
  end if;
  return prive.send_public_request_at(
    b ->> 'key',
    case when b ->> 'issued_at' ~ '^[0-9]{1,12}$' then (b ->> 'issued_at')::bigint end,
    b ->> 'seal',
    case when b ->> 'revision' ~ '^[0-9]{1,4}$' then (b ->> 'revision')::integer end,
    b ->> 'kind', b -> 'request', b ->> 'trap',
    clock_timestamp(), prive.public_request_connection());
exception
  when integrity_constraint_violation or data_exception then
    return jsonb_build_object('code', 'refusee', 'errors', jsonb_build_object('request', 'illisible'));
  when others then
    raise exception 'Envoi non confirmé.' using errcode = sqlstate;
end;
$$;
comment on function public.send_public_request(json) is
  'Enregistrer un message (Contact ou annuaire) : un code et une référence, jamais un contenu. La référence ne vient qu''après l''écriture.';

-- Les droits : retirés, puis donnés exactement ---------------------------------------------------------------------------------------------

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where (p.pronamespace = 'prive'::regnamespace and p.proname ~ 'public_request')
       or (p.pronamespace = 'public'::regnamespace and p.proname in ('issue_public_request_pass', 'send_public_request'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end
$$;
grant execute on function public.issue_public_request_pass() to anon, authenticated;
grant execute on function public.send_public_request(json) to anon, authenticated;
