-- Refonte publique, lot 3B2 (ticket 217) : ce que les écrans « Messages reçus » lisent de plus. Aucune écriture nouvelle.
--
-- Deux lectures de 3B1 ne suffisaient pas à l'écran :
--   * `list_public_requests` n'a ni filtre par nature, ni file des alertes en échec : filtrer la première page dans le navigateur
--     cacherait les messages suivants, et une alerte en échec plus ancienne que la page ne se verrait nulle part ;
--   * `public_request_overview` ne compte ni les messages clos, ni les annonces qui attendent.
-- Et un message effacé doit se dire : levé en P0002, il arrive à l'écran en « 500 Something went wrong », sans code ni phrase (PostgREST 14
-- rend P0002 en 500, écrit l'erreur dans son journal et s'arrête sur un accent ; constaté en local le 24/11). `PT404` rend 404 et sa phrase.
--
-- Rien d'autre ne change : mêmes gardes, mêmes colonnes, aucun texte ni coordonnée dans une liste. Rien n'appelle encore ces fonctions.

-- Ajouter un paramètre : l'ancienne signature part d'abord, sinon PostgREST hésite entre les deux (réponse 300).
drop function public.list_public_requests(text, integer, bigint);

-- La liste d'une file, sans le texte des messages ni les coordonnées : lire une liste n'ouvre rien. `p_before` : le `row_id` de la
-- dernière ligne lue. `p_kind` : une seule nature. « alertes » : les messages dont l'annonce a échoué ou est abandonnée, quelle que
-- soit leur file ; y relancer une alerte n'ouvre pas le message.
create function public.list_public_requests(p_tab text, p_limit integer default 50, p_before bigint default null, p_kind text default null)
returns table (
  row_id bigint, reference text, kind text, state text, row_version integer, received_at timestamptz, opened boolean,
  subject text, topic text, removal text, school_name text, town text, campus_name text, versions integer,
  follows text, redirected_from text, decision text, reply_channel text, reply_state text, limit_reached_at timestamptz,
  notice_state text, notice_error text, removal_step text, removed_at timestamptz, closed_at timestamptz, purge_on date
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if p_tab is null or p_tab not in ('a_traiter', 'en_attente', 'closes', 'indesirables', 'retraits', 'retraits_clos', 'alertes') then
    raise exception 'Cette file n''existe pas.' using errcode = '22023';
  end if;
  if p_kind is not null and not prive.public_request_in_list(p_kind, 'kind') then
    raise exception 'Cette nature n''existe pas.' using errcode = '22023';
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
      and (p_kind is null or d.kind = p_kind)
      and case p_tab
        when 'a_traiter' then d.kind <> 'retrait' and d.state in ('recue', 'ouverte')
        when 'en_attente' then d.kind <> 'retrait' and d.state = 'en_attente'
        when 'closes' then d.kind <> 'retrait' and d.state = 'close'
        when 'indesirables' then d.state = 'indesirable'
        when 'retraits' then d.kind = 'retrait' and d.state in ('recue', 'ouverte', 'en_attente')
        when 'retraits_clos' then d.kind = 'retrait' and d.state = 'close'
        else n.state = 'abandonnee' or (n.state in ('a_envoyer', 'en_cours') and n.last_error is not null)
      end
    order by d.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

-- Les mêmes nombres, plus ceux des onglets (clos, retraits clos) et des annonces qui attendent.
create or replace function public.public_request_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return jsonb_build_object(
    'to_handle', (select count(*) from prive.public_requests d where d.kind <> 'retrait' and d.state in ('recue', 'ouverte')),
    'new', (select count(*) from prive.public_requests d where d.state = 'recue'),
    'waiting', (select count(*) from prive.public_requests d where d.kind <> 'retrait' and d.state = 'en_attente'),
    'closed', (select count(*) from prive.public_requests d where d.kind <> 'retrait' and d.state = 'close'),
    'removals', (select count(*) from prive.public_requests d where d.kind = 'retrait' and d.state in ('recue', 'ouverte', 'en_attente')),
    'removals_closed', (select count(*) from prive.public_requests d where d.kind = 'retrait' and d.state = 'close'),
    'oldest_removal_at', (select min(d.received_at) from prive.public_requests d join prive.public_request_removals m on m.request_id = d.id
                          where d.state in ('recue', 'ouverte', 'en_attente') and m.removed_at is null and m.outcome is distinct from 'impossible'
                            and m.outcome is distinct from 'reorientee'),
    'spam', (select count(*) from prive.public_requests d where d.state = 'indesirable'),
    'limit_reached', (select count(*) from prive.public_requests d where d.limit_reached_at is not null and d.state in ('recue', 'ouverte', 'en_attente')),
    'notices_waiting', (select count(*) from prive.public_request_notices n where n.state in ('a_envoyer', 'en_cours')),
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

-- Les droits de la fonction recréée : retirés, puis donnés exactement, comme en 3B1. `create or replace` garde ceux de l'autre.
revoke all on function public.list_public_requests(text, integer, bigint, text) from public, anon, authenticated, service_role;
grant execute on function public.list_public_requests(text, integer, bigint, text) to authenticated;

-- Un message qui n'existe plus : 404, avec sa phrase. Le reste des deux fonctions est celui de 3B1, mot pour mot ------------------------------

create or replace function prive.lock_public_request(p_reference text, p_version integer, p_states text[]) returns prive.public_requests
language plpgsql set search_path = '' as $$
declare d prive.public_requests;
begin
  select * into d from prive.public_requests q where q.reference = upper(btrim(p_reference)) for update;
  if not found then
    raise exception 'Message introuvable : il a peut-être été effacé.' using errcode = 'PT404';
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

create or replace function public.open_public_request(p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d prive.public_requests;
  m prive.public_request_removals;
begin
  perform public.exiger_admin_session();
  select * into d from prive.public_requests q where q.reference = upper(btrim(p_reference)) for update;
  if not found then
    raise exception 'Message introuvable : il a peut-être été effacé.' using errcode = 'PT404';
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
