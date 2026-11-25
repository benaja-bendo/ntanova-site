-- Refonte publique, lot 3B1 (ticket 215) : les messages reçus. 4. La file des annonces et la purge.
--
-- L'annonce (« un message est arrivé ») attend dans nos tables ; le service qui l'enverra n'existe pas encore (lot 3B2). Il ne lira que
-- la référence et la nature, par deux fonctions données au seul rôle `service_role`. Au moins un essai, jamais « exactement une fois » :
-- un doublon porte le même `message_id` et ne touche pas au message.
--
-- La purge efface un message et toutes ses copies 12 mois après sa clôture (indésirable : 30 jours). Elle se rejoue sans rien effacer de
-- plus. Sa planification est dans la couche Supabase (`…140400_…`) ; ailleurs, un ordonnanceur appelle la même fonction chaque jour.

create function prive.claim_public_request_notices_at(p_limit integer, p_now timestamptz) returns jsonb
language plpgsql set search_path = '' as $$
declare v_reservees jsonb;
begin
  -- Abandonnée, et visible, 24 h après son premier essai : jamais sans avoir été essayée.
  update prive.public_request_notices n set state = 'abandonnee', lease_token = null, lease_until = null
  where n.request_id in (
    select x.request_id from prive.public_request_notices x
    where x.first_attempt_at <= p_now - interval '24 hours'
      and (x.state = 'a_envoyer' or (x.state = 'en_cours' and x.lease_until <= p_now))
    for update skip locked
  );
  with dues as (
    select n.request_id from prive.public_request_notices n
    where (n.state = 'a_envoyer' and n.next_attempt_at <= p_now) or (n.state = 'en_cours' and n.lease_until <= p_now)
    order by n.next_attempt_at, n.request_id
    limit least(greatest(coalesce(p_limit, 20), 1), 20)
    for update skip locked
  ), prises as (
    update prive.public_request_notices n set
      state = 'en_cours', attempts = n.attempts + 1, first_attempt_at = coalesce(n.first_attempt_at, p_now),
      lease_token = gen_random_uuid(), lease_until = p_now + interval '5 minutes'
    from dues where n.request_id = dues.request_id
    returning n.request_id, n.lease_token, n.message_id, n.attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object('lease', p.lease_token, 'reference', q.reference, 'kind', q.kind,
                                               'message_id', p.message_id, 'attempt', p.attempts) order by q.id), '[]')
    into v_reservees
    from prises p join prive.public_requests q on q.id = p.request_id;
  insert into prive.public_request_runs as r (task, last_run_at, last_count) values ('annonces', p_now, jsonb_array_length(v_reservees))
  on conflict (task) do update set last_run_at = excluded.last_run_at, last_count = excluded.last_count;
  return jsonb_build_object(
    'notices', v_reservees,
    'sent_last_hour', (select count(*) from prive.public_request_notices n where n.sent_at > p_now - interval '1 hour')
  );
end;
$$;

-- Marquer le résultat d'un essai, avec le bail reçu. Un bail périmé et repris ne marque plus rien. Nouvel essai à 5, 15 et 60 minutes,
-- puis toutes les heures ; jamais le texte du serveur de courrier, seulement un code de la liste.
create function prive.report_public_request_notice_at(p_lease uuid, p_result text, p_now timestamptz) returns boolean
language plpgsql set search_path = '' as $$
begin
  if p_result is null or p_result not in ('envoyee', 'connexion', 'authentification', 'refus_temporaire', 'refus_definitif', 'delai', 'configuration') then
    raise exception 'Ce résultat n''existe pas.' using errcode = '22023';
  end if;
  update prive.public_request_notices n set
    state = case when p_result = 'envoyee' then 'envoyee' when n.first_attempt_at <= p_now - interval '24 hours' then 'abandonnee' else 'a_envoyer' end,
    sent_at = case when p_result = 'envoyee' then p_now end,
    last_error = case when p_result <> 'envoyee' then p_result end,
    next_attempt_at = p_now + case n.attempts when 1 then interval '5 minutes' when 2 then interval '15 minutes' else interval '60 minutes' end,
    lease_token = null, lease_until = null
  where n.lease_token = p_lease and n.state = 'en_cours';
  return found;
end;
$$;

create function public.claim_public_request_notices(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return prive.claim_public_request_notices_at(p_limit, clock_timestamp());
end;
$$;
comment on function public.claim_public_request_notices(integer) is
  'Réserver des annonces à envoyer (service d''annonce seulement) : référence, nature, bail de cinq minutes. Rien du message.';

create function public.report_public_request_notice(p_lease uuid, p_result text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  return prive.report_public_request_notice_at(p_lease, p_result, clock_timestamp());
end;
$$;

-- Le secret d'envoi. Le premier ouvre les envois (geste du fondateur) ; ensuite la purge le renouvelle chaque mois et oublie les anciens
-- une fois leur validité passée. `p_revoke` : tous les laissez-passer en cours
-- cessent de valoir (après une restauration, avant de rouvrir les formulaires).
create function prive.renew_public_request_secret(p_now timestamptz default clock_timestamp(), p_revoke boolean default false) returns void
language plpgsql set search_path = '' as $$
begin
  if p_revoke then delete from prive.public_request_secrets; end if;
  insert into prive.public_request_secrets (secret, created_at) values (extensions.gen_random_bytes(32), p_now);
end;
$$;

-- La purge quotidienne, une à la fois. Par lots, sans attendre une ligne en cours de traitement ; rend le nombre de messages effacés.
create function prive.purge_public_requests(p_now timestamptz default clock_timestamp()) returns integer
language plpgsql set search_path = '' as $$
declare
  r prive.public_request_settings;
  v_lot bigint[];
  v_n integer := 0;
begin
  select * into r from prive.public_request_settings;
  -- Une purge à la fois : effacer un message vide le lien de sa suite, et deux purges qui se partageraient les deux s'attendraient l'une l'autre.
  perform pg_advisory_xact_lock(33030);
  loop
    v_lot := array(
      select q.id from prive.public_requests q
      where q.closed_at <= p_now - r.closed_retention or q.spam_since <= p_now - r.spam_retention
      order by q.id limit 500
      for update skip locked
    );
    exit when cardinality(v_lot) = 0;
    -- Versions, historique, annonce et suivi du retrait partent avec lui ; une demande reliée perd son lien et reste.
    delete from prive.public_requests q where q.id = any (v_lot);
    v_n := v_n + cardinality(v_lot);
  end loop;
  delete from prive.public_request_counters c where c.window_start <= p_now - interval '48 hours';
  delete from prive.public_request_salts s where s.day <= (p_now at time zone 'Africa/Brazzaville')::date - 2;
  -- Un secret par mois ; un ancien s'oublie quand plus aucun laissez-passer ne peut en venir. Sans aucun secret, les envois sont fermés :
  -- la purge ne les ouvre pas.
  if (select max(s.created_at) from prive.public_request_secrets s) <= p_now - interval '1 month' then
    perform prive.renew_public_request_secret(p_now);
  end if;
  delete from prive.public_request_secrets s
  where exists (select 1 from prive.public_request_secrets x where x.id > s.id and x.created_at <= p_now - r.pass_validity);
  insert into prive.public_request_runs as t (task, last_run_at, last_count) values ('purge', p_now, v_n)
  on conflict (task) do update set last_run_at = excluded.last_run_at, last_count = excluded.last_count;
  return v_n;
end;
$$;

-- Les droits -------------------------------------------------------------------------------------------------------------------------------

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
    where p.proname in ('claim_public_request_notices_at', 'report_public_request_notice_at', 'claim_public_request_notices',
        'report_public_request_notice', 'renew_public_request_secret', 'purge_public_requests')
      and p.pronamespace in ('prive'::regnamespace, 'public'::regnamespace)
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', f);
  end loop;
end
$$;
grant execute on function public.claim_public_request_notices(integer) to service_role;
grant execute on function public.report_public_request_notice(uuid, text) to service_role;
