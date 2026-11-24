-- Refonte publique, lot 3B1 (ticket 215) : les messages reçus. 3. Le traitement par l'administration.
--
-- Chaque fonction commence par `exiger_admin_session()` (jamais `exiger_gestion_site` : le futur compte d'une direction ne lit aucun
-- message). Chaque geste porte le numéro de ligne lu : s'il a changé, rien n'est écrasé (PT409, réponse 409 de l'API), et un geste rejoué
-- ne s'écrit pas deux fois. Décider ne crée, ne corrige et ne publie rien ; une réponse se note, elle ne s'envoie pas d'ici.

-- Outils -------------------------------------------------------------------------------------------------------------------------------

-- La ligne, verrouillée, au numéro lu. Un geste n'a lieu que dans un état attendu.
create function prive.lock_public_request(p_reference text, p_version integer, p_states text[]) returns prive.public_requests
language plpgsql set search_path = '' as $$
declare d prive.public_requests;
begin
  select * into d from prive.public_requests q where q.reference = upper(btrim(p_reference)) for update;
  if not found then
    raise exception 'Message introuvable : il a peut-être été effacé.' using errcode = 'P0002';
  end if;
  if d.row_version is distinct from p_version then
    raise exception 'Cette demande a changé entre-temps. Rien n''est écrasé.' using errcode = 'PT409';
  end if;
  if d.state <> all (p_states) then
    raise exception 'Ce geste n''est pas possible dans cet état.' using errcode = '22023';
  end if;
  return d;
end;
$$;

-- Les décisions possibles, par nature. Celles d'un retrait se posent par ses étapes, celles d'une réorientation par son geste.
create function prive.public_request_decisions(p_kind text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'contact' then array['traitee', 'indesirable']
    when 'absente' then array['existe', 'deja_presente', 'introuvable', 'non_retenue']
    when 'erreur' then array['retenue', 'fiche_juste', 'non_retenue']
    else array[]::text[]
  end;
$$;

-- L'étape d'un retrait, déduite de ce qui est noté.
create function prive.removal_step(d prive.public_requests, m prive.public_request_removals) returns text
language sql immutable set search_path = '' as $$
  select case
    when d.kind <> 'retrait' then null
    when d.state = 'close' then 'close'
    when m.outcome is null then 'verifier'
    when m.outcome = 'concernee' and m.removed_at is null then 'retirer'
    when m.outcome = 'concernee' and m.publish_requested_at is null then 'mettre_en_ligne'
    when m.outcome = 'concernee' and m.seen_at is null then 'constater'
    when d.reply_state = 'a_faire' then 'prevenir'
    else 'clore'
  end;
$$;

-- Une photo est-elle publique : choisie ou automatique sur une fiche, ou reprise dans les images d'une école.
create function prive.photo_is_public(p_photo uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.public_campus_photos p where p.id = p_photo)
      or exists (select 1 from public.public_campus_media v join public.campus_media m on m.id = v.id
                 where m.id = p_photo or m.source_photo_id = p_photo);
$$;

-- Ce que les cibles désignées montrent encore au public, ou null quand plus rien n'est publié.
create function prive.removal_still_public(m prive.public_request_removals) returns text
language sql stable set search_path = '' as $$
  select string_agg(x.quoi, ', ' order by x.quoi) from (
    select 'le contact public' as quoi from public.campuses c
      where 'contact_public' = any (m.targets) and c.id = m.target_campus_id and c.publication = 'publiee' and c.public_phone is not null
    union all
    select 'le numéro de l''enseigne' from public.campuses c
      where 'numero_enseigne' = any (m.targets) and c.id = m.target_campus_id and c.publication = 'publiee' and c.sign_phone is not null
    union all
    select 'la fiche' from public.campuses c
      where 'fiche' = any (m.targets) and c.id = m.target_campus_id and c.publication = 'publiee'
    union all
    select 'la photo' where 'photo' = any (m.targets) and prive.photo_is_public(m.target_photo_id)
  ) x;
$$;

create function prive.public_request_purge_on(d prive.public_requests) returns date
language sql stable set search_path = '' as $$
  select ((case when d.state = 'close' then d.closed_at + s.closed_retention
                when d.state = 'indesirable' then d.spam_since + s.spam_retention end) at time zone 'Africa/Brazzaville')::date
  from prive.public_request_settings s;
$$;

create function prive.campus_display_name(p_campus uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(i.name || ' — ' || nullif(btrim(c.label), ''), i.name)
  from public.campuses c join public.institutions i on i.id = c.institution_id where c.id = p_campus;
$$;

-- Lire -----------------------------------------------------------------------------------------------------------------------------------

-- La liste d'une file, sans le texte des messages ni les coordonnées : lire une liste n'ouvre rien. `p_before` : le `row_id` de la
-- dernière ligne lue.
create function public.list_public_requests(p_tab text, p_limit integer default 50, p_before bigint default null)
returns table (
  row_id bigint, reference text, kind text, state text, row_version integer, received_at timestamptz, opened boolean,
  subject text, topic text, removal text, school_name text, town text, campus_name text, versions integer,
  follows text, redirected_from text, decision text, reply_channel text, reply_state text, limit_reached_at timestamptz,
  notice_state text, notice_error text, removal_step text, removed_at timestamptz, closed_at timestamptz, purge_on date
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_tab is null or p_tab not in ('a_traiter', 'en_attente', 'closes', 'indesirables', 'retraits', 'retraits_clos') then
    raise exception 'Cette file n''existe pas.' using errcode = '22023';
  end if;
  return query
    select d.id, d.reference, d.kind::text, d.state::text, d.row_version, d.received_at, d.opened_at is not null,
           v.content ->> 'subject', v.content ->> 'topic', v.content ->> 'removal', v.content ->> 'school_name', v.content ->> 'town',
           prive.campus_display_name(d.campus_id),
           (select count(*)::integer from prive.public_request_versions x where x.request_id = d.id),
           (select q.reference from prive.public_requests q where q.id = d.follows_id),
           (select q.reference from prive.public_requests q where q.id = d.redirected_from_id),
           d.decision::text, d.reply_channel::text, d.reply_state::text, d.limit_reached_at,
           n.state::text, n.last_error::text, prive.removal_step(d, m), m.removed_at, d.closed_at, prive.public_request_purge_on(d)
    from prive.public_requests d
    join prive.public_request_versions v on v.request_id = d.id and v.revision = d.current_revision
    left join prive.public_request_notices n on n.request_id = d.id
    left join prive.public_request_removals m on m.request_id = d.id
    where (p_before is null or d.id < p_before)
      and case p_tab
        when 'a_traiter' then d.kind <> 'retrait' and d.state in ('recue', 'ouverte')
        when 'en_attente' then d.kind <> 'retrait' and d.state = 'en_attente'
        when 'closes' then d.kind <> 'retrait' and d.state = 'close'
        when 'indesirables' then d.state = 'indesirable'
        when 'retraits' then d.kind = 'retrait' and d.state in ('recue', 'ouverte', 'en_attente')
        else d.kind = 'retrait' and d.state = 'close'
      end
    order by d.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Ouvrir : le message entier. La première fois, son texte est figé et l'ouverture notée, dans la même transaction. Un indésirable
-- s'ouvre sans quitter sa file.
create function public.open_public_request(p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  m prive.public_request_removals;
begin
  perform public.exiger_admin_session();
  select * into d from prive.public_requests q where q.reference = upper(btrim(p_reference)) for update;
  if not found then
    raise exception 'Message introuvable : il a peut-être été effacé.' using errcode = 'P0002';
  end if;
  if d.opened_at is null or d.state = 'recue' then
    update prive.public_requests q set
      opened_at = coalesce(q.opened_at, now()), opened_revision = coalesce(q.opened_revision, q.current_revision),
      state = case when q.state = 'recue' then 'ouverte' else q.state end
    where q.id = d.id returning * into d;
    perform prive.note_public_request_event(d.id, 'ouverte', null, now(), (select public.current_user_id()));
  end if;
  select * into m from prive.public_request_removals x where x.request_id = d.id;
  return jsonb_build_object(
    'reference', d.reference, 'kind', d.kind, 'state', d.state, 'row_version', d.row_version,
    'received_at', d.received_at, 'opened_at', d.opened_at, 'limit_reached_at', d.limit_reached_at,
    'campus', (select jsonb_build_object('id', c.id, 'name', prive.campus_display_name(c.id), 'publication', c.publication)
               from public.campuses c where c.id = d.campus_id),
    'decision', d.decision, 'decision_note', d.decision_note, 'decided_at', d.decided_at,
    'reply_channel', d.reply_channel, 'reply_state', d.reply_state, 'replied_on', d.replied_on,
    'spam_since', d.spam_since, 'closed_at', d.closed_at, 'purge_on', prive.public_request_purge_on(d),
    'follows', (select q.reference from prive.public_requests q where q.id = d.follows_id),
    'followed_by', (select coalesce(jsonb_agg(q.reference order by q.id), '[]') from prive.public_requests q where q.follows_id = d.id),
    'redirected_from', (select q.reference from prive.public_requests q where q.id = d.redirected_from_id),
    'redirected_to', (select coalesce(jsonb_agg(q.reference order by q.id), '[]') from prive.public_requests q where q.redirected_from_id = d.id),
    'revision', d.current_revision,
    'versions', (select jsonb_agg(jsonb_build_object('revision', v.revision, 'content', v.content, 'late', v.late,
                                                     'current', v.revision = d.current_revision, 'received_at', v.received_at) order by v.revision)
                 from prive.public_request_versions v where v.request_id = d.id),
    'events', (select jsonb_agg(jsonb_build_object('what', e.what, 'detail', e.detail, 'at', e.at) order by e.id)
               from prive.public_request_events e where e.request_id = d.id),
    'notice', (select jsonb_build_object('state', n.state, 'attempts', n.attempts, 'next_attempt_at', n.next_attempt_at,
                                         'last_error', n.last_error, 'sent_at', n.sent_at)
               from prive.public_request_notices n where n.request_id = d.id),
    'removal', case when m.request_id is not null then jsonb_build_object(
      'step', prive.removal_step(d, m), 'outcome', m.outcome, 'check_kind', m.check_kind, 'check_note', m.check_note, 'checked_at', m.checked_at,
      'targets', m.targets, 'target_campus_id', m.target_campus_id, 'target_photo_id', m.target_photo_id, 'removed_at', m.removed_at,
      'publish_requested_at', m.publish_requested_at, 'publish_run', m.publish_run,
      'production_seen_on', m.production_seen_on, 'essai_seen_on', m.essai_seen_on, 'seen_at', m.seen_at) end
  );
end;
$$;
comment on function public.open_public_request(text) is
  'Lire un message (administration) : la première ouverture fige son texte. Ce que la personne réécrit ensuite devient une suite.';

-- Ce que l'administration voit d'un coup : des nombres et des dates.
create function public.public_request_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return jsonb_build_object(
    'to_handle', (select count(*) from prive.public_requests d where d.kind <> 'retrait' and d.state in ('recue', 'ouverte')),
    'new', (select count(*) from prive.public_requests d where d.state = 'recue'),
    'waiting', (select count(*) from prive.public_requests d where d.kind <> 'retrait' and d.state = 'en_attente'),
    'removals', (select count(*) from prive.public_requests d where d.kind = 'retrait' and d.state in ('recue', 'ouverte', 'en_attente')),
    'oldest_removal_at', (select min(d.received_at) from prive.public_requests d join prive.public_request_removals m on m.request_id = d.id
                          where d.state in ('recue', 'ouverte', 'en_attente') and m.removed_at is null and m.outcome is distinct from 'impossible'
                            and m.outcome is distinct from 'reorientee'),
    'spam', (select count(*) from prive.public_requests d where d.state = 'indesirable'),
    'limit_reached', (select count(*) from prive.public_requests d where d.limit_reached_at is not null and d.state in ('recue', 'ouverte', 'en_attente')),
    'notices_failing', (select count(*) from prive.public_request_notices n where n.state in ('a_envoyer', 'en_cours') and n.last_error is not null),
    'notices_abandoned', (select count(*) from prive.public_request_notices n where n.state = 'abandonnee'),
    'notices_last_run_at', (select r.last_run_at from prive.public_request_runs r where r.task = 'annonces'),
    'purge_last_run_at', (select r.last_run_at from prive.public_request_runs r where r.task = 'purge'),
    'overdue', (select count(*) from prive.public_requests d, prive.public_request_settings s
                where d.closed_at <= now() - s.closed_retention or d.spam_since <= now() - s.spam_retention),
    'daily_cap_reached_at', (select min(c.filled_at) from prive.public_request_counters c
                             where c.bucket in ('C', 'E')
                               and c.window_start = (now() at time zone 'Africa/Brazzaville')::date::timestamp at time zone 'Africa/Brazzaville')
  );
end;
$$;

-- Traiter -------------------------------------------------------------------------------------------------------------------------------

-- Rattacher à une fiche, en changer ou s'en détacher (`p_campus` nul). Ne décide rien et ne change pas la fiche.
create function public.attach_public_request(p_reference text, p_version integer, p_campus uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['recue', 'ouverte', 'en_attente']);
  if d.opened_at is null then
    raise exception 'Ouvre d''abord cette demande.' using errcode = '22023';
  end if;
  if d.kind = 'contact' then
    raise exception 'Un message ne se rattache pas à une fiche : passe-le d''abord dans la bonne file.' using errcode = '22023';
  end if;
  if p_campus is not null and not exists (select 1 from public.campuses c where c.id = p_campus) then
    raise exception 'Cette fiche n''existe pas.' using errcode = 'P0002';
  end if;
  update prive.public_requests q set campus_id = p_campus where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, case when p_campus is null then 'detachee' else 'rattachee' end, null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- Décider : une décision de la liste de sa nature. « Indésirable » range le message 30 jours avec les indésirables.
create function public.decide_public_request(p_reference text, p_version integer, p_decision text, p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  v_note text := prive.public_request_text(p_note, false);
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['ouverte']);
  if p_decision is null or p_decision <> all (prive.public_request_decisions(d.kind)) then
    raise exception 'Cette décision n''existe pas pour cette demande.' using errcode = '22023';
  end if;
  if d.decision in ('a_l_annuaire', 'au_retrait') then
    raise exception 'Ce message est déjà passé dans une autre file.' using errcode = '22023';
  end if;
  if v_note is not null and (p_decision not in ('non_retenue', 'introuvable') or length(v_note) > 300) then
    raise exception 'Un motif va avec « non retenue » ou « introuvable », en 300 caractères au plus.' using errcode = '22023';
  end if;
  update prive.public_requests q set
    decision = p_decision, decision_note = v_note, decided_at = now(),
    state = case when p_decision = 'indesirable' then 'indesirable' else q.state end,
    spam_since = case when p_decision = 'indesirable' then now() end
  where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, case when p_decision = 'indesirable' then 'indesirable' else 'decidee' end, p_decision, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- « Ce n'est pas indésirable » : le message revient à traiter.
create function public.restore_public_request(p_reference text, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['indesirable']);
  update prive.public_requests q set
    state = 'recue', spam_since = null,
    decision = null, decision_note = null, decided_at = null
  where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'pas_indesirable', null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- Passer dans une autre file : une demande reliée, avec de quoi la traiter et répondre ; l'originale reste lisible. Un message devient
-- une demande d'annuaire ou de retrait ; un retrait devient une correction. Rend la référence de la nouvelle.
create function public.redirect_public_request(p_reference text, p_version integer, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  n prive.public_requests;
  v_contenu jsonb;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['ouverte']);
  if not coalesce((d.kind = 'contact' and p_kind in ('absente', 'erreur', 'retrait')) or (d.kind = 'retrait' and p_kind = 'erreur'), false) then
    raise exception 'Cette demande ne passe pas dans cette file.' using errcode = '22023';
  end if;
  if d.decision is not null then
    raise exception 'Cette demande est déjà décidée.' using errcode = '22023';
  end if;
  if p_kind = 'retrait' and d.reply_channel = 'non' then
    raise exception 'Un retrait demande de pouvoir répondre : cette personne n''a laissé aucune coordonnée.' using errcode = '22023';
  end if;
  if d.kind = 'retrait' and exists (select 1 from prive.public_request_removals m where m.request_id = d.id and m.outcome is not null) then
    raise exception 'Ce retrait est déjà commencé.' using errcode = '22023';
  end if;
  select (v.content - 'campus_id' - 'removal' - 'subject')
         || case when d.campus_id is not null then jsonb_build_object('campus_id', d.campus_id) else '{}'::jsonb end
    into v_contenu
    from prive.public_request_versions v where v.request_id = d.id and v.revision = d.current_revision;
  -- Sa clé est tirée au hasard : aucun navigateur ne peut lui envoyer une suite.
  n := prive.create_public_request(p_kind, extensions.gen_random_bytes(32), 1, v_contenu, now(),
                                   p_redirected_from => d.id, p_opened => true);
  update prive.public_requests q set
    decision = case when d.kind = 'retrait' then 'reorientee' when p_kind = 'retrait' then 'au_retrait' else 'a_l_annuaire' end,
    decided_at = now()
  where q.id = d.id;
  if d.kind = 'retrait' then
    update prive.public_request_removals m set outcome = 'reorientee', checked_at = now() where m.request_id = d.id;
  end if;
  perform prive.note_public_request_event(d.id, 'reorientee', n.reference, now(), (select public.current_user_id()));
  return n.reference;
end;
$$;

create function public.set_public_request_waiting(p_reference text, p_version integer, p_waiting boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array[case when p_waiting then 'ouverte' else 'en_attente' end]);
  update prive.public_requests q set state = case when p_waiting then 'en_attente' else 'ouverte' end where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, case when p_waiting then 'en_attente' else 'reprise' end, null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- Noter la réponse : le jour où elle est partie (jamais écrit d'avance, jamais futur), ou qu'elle est impossible. Jamais les échanges.
create function public.record_public_request_reply(p_reference text, p_version integer, p_outcome text, p_replied_on date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['ouverte', 'en_attente']);
  if d.reply_state = 'non_demandee' then
    raise exception 'Cette personne n''a pas demandé de réponse.' using errcode = '22023';
  end if;
  if d.decision is null then
    raise exception 'Décide d''abord : la réponse vient après.' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome not in ('faite', 'impossible') then
    raise exception 'La réponse est faite, ou impossible.' using errcode = '22023';
  end if;
  if p_outcome = 'faite' and (p_replied_on is null or p_replied_on > (now() at time zone 'Africa/Brazzaville')::date) then
    raise exception 'Donne le jour réel où la réponse est partie.' using errcode = '22023';
  end if;
  update prive.public_requests q set reply_state = p_outcome, replied_on = case when p_outcome = 'faite' then p_replied_on end
  where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'reponse_' || p_outcome, d.reply_channel, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- Clore : décidée, et la réponse réglée. Rend la date d'effacement.
create function public.close_public_request(p_reference text, p_version integer) returns date
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['ouverte']);
  if d.decision is null then
    raise exception 'Cette demande n''est pas décidée.' using errcode = '22023';
  end if;
  if d.reply_state = 'a_faire' then
    raise exception 'La réponse est encore à faire.' using errcode = '22023';
  end if;
  update prive.public_requests q set state = 'close', closed_at = now() where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'close', null, now(), (select public.current_user_id()));
  return prive.public_request_purge_on(d);
end;
$$;

-- Rouvrir : l'échéance est annulée et repartira de la prochaine clôture. Un retrait reprend à sa vérification s'il n'avait rien retiré,
-- sinon au retrait dans la base ; la personne sera prévenue de nouveau.
create function public.reopen_public_request(p_reference text, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_public_request(p_reference, p_version, array['close']);
  update prive.public_requests q set state = 'ouverte', closed_at = null where q.id = d.id returning * into d;
  if d.kind = 'retrait' then
    update prive.public_request_removals m set
      outcome = case when m.outcome = 'concernee' then m.outcome end,
      check_kind = case when m.outcome = 'concernee' then m.check_kind end,
      check_note = case when m.outcome = 'concernee' then m.check_note end,
      checked_at = case when m.outcome = 'concernee' then m.checked_at end,
      removed_at = null, publish_requested_at = null, publish_run = null, production_seen_on = null, essai_seen_on = null, seen_at = null
    where m.request_id = d.id;
    update prive.public_requests q set decision = null, decided_at = null, reply_state = 'a_faire', replied_on = null
    where q.id = d.id returning * into d;
  end if;
  perform prive.note_public_request_event(d.id, 'rouverte', null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- Relancer une annonce en échec ou abandonnée : avance son échéance. N'envoie rien d'ici.
create function public.retry_public_request_notice(p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform public.exiger_admin_session();
  -- Même ordre que la purge : le message, puis son annonce. L'événement final référence le message ; prendre l'annonce
  -- d'abord ferait attendre la relance et la purge l'une sur l'autre.
  select q.id into v_id from prive.public_requests q where q.reference = upper(btrim(p_reference)) for update;
  update prive.public_request_notices n set state = 'a_envoyer', next_attempt_at = now(), first_attempt_at = null
  where n.request_id = v_id
    and (n.state = 'abandonnee' or (n.state = 'a_envoyer' and n.last_error is not null))
  returning n.request_id into v_id;
  if v_id is null then
    raise exception 'Aucune annonce en échec pour ce message.' using errcode = '22023';
  end if;
  perform prive.note_public_request_event(v_id, 'annonce_relancee', null, now(), (select public.current_user_id()));
end;
$$;

-- Les étapes d'un retrait -------------------------------------------------------------------------------------------------------------------

create function prive.lock_removal(p_reference text, p_version integer, p_step text) returns prive.public_requests
language plpgsql set search_path = '' as $$
declare
  d prive.public_requests;
  m prive.public_request_removals;
begin
  d := prive.lock_public_request(p_reference, p_version, array['ouverte']);
  select * into m from prive.public_request_removals x where x.request_id = d.id;
  if d.kind <> 'retrait' then
    raise exception 'Ce n''est pas une demande de retrait.' using errcode = '22023';
  end if;
  if prive.removal_step(d, m) is distinct from p_step then
    raise exception 'Cette étape n''est pas la prochaine.' using errcode = '22023';
  end if;
  return d;
end;
$$;

-- 1. La personne est concernée : elle écrit depuis le numéro, la direction connue confirme, ou une autre vérification notée en une ligne.
--    Un numéro seulement écrit dans le formulaire n'est pas une preuve ; aucune pièce d'identité. Le doute : « en attente », puis préciser.
create function public.verify_removal(p_reference text, p_version integer, p_check text, p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  v_note text := prive.public_request_text(p_note, true);
begin
  perform public.exiger_admin_session();
  d := prive.lock_removal(p_reference, p_version, 'verifier');
  if p_check is null or p_check not in ('numero', 'direction', 'autre') then
    raise exception 'Dis comment tu as vérifié.' using errcode = '22023';
  end if;
  if (p_check = 'autre') <> (v_note is not null) or length(v_note) > 160 then
    raise exception 'Une autre vérification se note en une ligne (160 caractères) ; les deux premières n''en ont pas besoin.' using errcode = '22023';
  end if;
  if p_check = 'numero' and exists (
    select 1 from prive.public_request_versions v where v.request_id = d.id and v.revision = d.current_revision and v.content ->> 'removal' = 'fiche'
  ) then
    raise exception 'Pour la fiche entière, un numéro ne suffit pas : la direction confirme.' using errcode = '22023';
  end if;
  update prive.public_request_removals m set outcome = 'concernee', check_kind = p_check, check_note = v_note, checked_at = now() where m.request_id = d.id;
  update prive.public_requests q set row_version = q.row_version where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'retrait_verifie', p_check, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- 1 bis. Impossible à vérifier : on prévient la personne, puis on clôt. Rien n'est retiré.
create function public.fail_removal(p_reference text, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_removal(p_reference, p_version, 'verifier');
  update prive.public_request_removals m set outcome = 'impossible', checked_at = now() where m.request_id = d.id;
  update prive.public_requests q set decision = 'impossible_a_verifier', decided_at = now() where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'retrait_impossible', null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- 2. Désigner ce qui est à retirer, sur quelle fiche. Le retrait lui-même se fait dans Écoles, par les fonctions existantes.
create function public.target_removal(p_reference text, p_version integer, p_targets text[], p_campus uuid default null, p_photo uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_removal(p_reference, p_version, 'retirer');
  if p_targets is null or cardinality(p_targets) not between 1 and 5
     or not p_targets <@ array['contact_public', 'numero_enseigne', 'photo', 'fiche', 'texte'] then
    raise exception 'Désigne ce qui est à retirer.' using errcode = '22023';
  end if;
  if p_targets && array['contact_public', 'numero_enseigne', 'fiche', 'photo'] and not exists (select 1 from public.campuses c where c.id = p_campus) then
    raise exception 'Désigne la fiche concernée.' using errcode = '22023';
  end if;
  if ('photo' = any (p_targets)) <> (p_photo is not null) or (p_photo is not null and not exists (
    select 1 from public.field_submission_photos ph join public.field_submissions s on s.id = ph.submission_id where ph.id = p_photo and s.campus_id = p_campus
    union all
    select 1 from public.campus_media cm join public.campuses c on c.id = p_campus
      where cm.id = p_photo and (cm.campus_id = c.id or cm.institution_id = c.institution_id)
  )) then
    raise exception 'Désigne la photo de cette fiche.' using errcode = '22023';
  end if;
  update prive.public_request_removals m set
    targets = (select array_agg(distinct t order by t) from unnest(p_targets) t)::public.public_removal_target[],
    target_campus_id = p_campus, target_photo_id = p_photo
  where m.request_id = d.id;
  update prive.public_requests q set campus_id = coalesce(q.campus_id, p_campus) where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'retrait_cible', array_to_string(p_targets, ','), now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- 2 bis. Retiré de la base : refusé tant que la base publie encore la cible. Pour un texte libre, c'est la déclaration datée de
--    l'administrateur. Le journal des effacements garde quoi, quand, par qui et quelle fiche ; jamais l'information ni la personne.
create function public.record_removal(p_reference text, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  m prive.public_request_removals;
  v_reste text;
begin
  perform public.exiger_admin_session();
  d := prive.lock_removal(p_reference, p_version, 'retirer');
  select * into m from prive.public_request_removals x where x.request_id = d.id;
  if m.targets is null then
    raise exception 'Désigne d''abord ce qui est à retirer.' using errcode = '22023';
  end if;
  v_reste := prive.removal_still_public(m);
  if v_reste is not null then
    raise exception 'Encore publié : %. Retire-le dans Écoles, puis reviens.', v_reste using errcode = '22023';
  end if;
  update prive.public_request_removals x set removed_at = now() where x.request_id = d.id;
  update prive.public_requests q set row_version = q.row_version where q.id = d.id returning * into d;
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('public_info', m.target_campus_id, (select public.current_user_id()), 'Retrait demandé : ' || array_to_string(m.targets, ', '));
  perform prive.note_public_request_event(d.id, 'retrait_base', null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- 3. La mise en ligne est demandée (production et essai), avec le numéro de l'exécution s'il est utile. Rien n'est lancé d'ici.
create function public.record_removal_publication(p_reference text, p_version integer, p_run text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare d prive.public_requests;
begin
  perform public.exiger_admin_session();
  d := prive.lock_removal(p_reference, p_version, 'mettre_en_ligne');
  if nullif(btrim(p_run), '') is not null and btrim(p_run) !~ '^[0-9]{1,20}$' then
    raise exception 'Le numéro d''exécution est une suite de chiffres.' using errcode = '22023';
  end if;
  update prive.public_request_removals m set publish_requested_at = now(), publish_run = nullif(btrim(p_run), '') where m.request_id = d.id;
  update prive.public_requests q set row_version = q.row_version where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'retrait_mise_en_ligne', null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- 4. Constaté sur les DEUX adresses, chacune à sa date : un constat partiel ne se note pas.
create function public.record_removal_seen(p_reference text, p_version integer, p_production_on date, p_essai_on date) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  v_aujourdhui date := (now() at time zone 'Africa/Brazzaville')::date;
  v_demandee date;
begin
  perform public.exiger_admin_session();
  d := prive.lock_removal(p_reference, p_version, 'constater');
  select (m.publish_requested_at at time zone 'Africa/Brazzaville')::date into v_demandee from prive.public_request_removals m where m.request_id = d.id;
  if p_production_on is null or p_essai_on is null or p_production_on not between v_demandee and v_aujourdhui
     or p_essai_on not between v_demandee and v_aujourdhui then
    raise exception 'Donne le jour du constat sur ntanova.com ET sur essai.ntanova.com, depuis la mise en ligne demandée.' using errcode = '22023';
  end if;
  update prive.public_request_removals m set production_seen_on = p_production_on, essai_seen_on = p_essai_on, seen_at = now() where m.request_id = d.id;
  update prive.public_requests q set decision = 'retiree', decided_at = now() where q.id = d.id returning * into d;
  perform prive.note_public_request_event(d.id, 'retrait_constate', null, now(), (select public.current_user_id()));
  return d.row_version;
end;
$$;

-- Les droits : retirés, puis donnés exactement ---------------------------------------------------------------------------------------------

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace in ('prive'::regnamespace, 'public'::regnamespace)
      and p.proname in ('lock_public_request', 'public_request_decisions', 'removal_step', 'removal_still_public', 'photo_is_public',
        'public_request_purge_on', 'campus_display_name', 'lock_removal')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('list_public_requests', 'open_public_request', 'public_request_overview', 'attach_public_request',
        'decide_public_request', 'restore_public_request', 'redirect_public_request', 'set_public_request_waiting',
        'record_public_request_reply', 'close_public_request', 'reopen_public_request', 'retry_public_request_notice',
        'verify_removal', 'fail_removal', 'target_removal', 'record_removal', 'record_removal_publication', 'record_removal_seen')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end
$$;
