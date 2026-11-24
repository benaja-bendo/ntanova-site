-- 20261124140100 à 140300 : les messages reçus, envois et gestes SIMULTANÉS (lot 3B1, ticket 215). De vraies connexions (dblink), lâchées
-- ensemble : une transaction unique ne prouverait rien de la concurrence. Ce test écrit donc pour de bon dans la base locale, à une date
-- lointaine, et retire lui-même ce qu'il a écrit, au début et à la fin. Données inventées ; jamais sur une base en ligne.
\set ON_ERROR_STOP on
create extension if not exists pgtap with schema extensions;
select plan(29);

drop schema if exists essai_messages cascade;
create schema essai_messages;
create table essai_messages.avant as
  select coalesce((select max(id) from prive.public_requests), 0) as id, coalesce((select max(id) from prive.public_request_secrets), 0) as secret,
    exists (select 1 from pg_extension where extname = 'dblink') as dblink;
create extension if not exists dblink with schema extensions;
update prive.public_request_settings set daily_creations_max = 300;
select prive.renew_public_request_secret();
create table essai_messages.interblocages as select deadlocks as n from pg_stat_database where datname = current_database();

-- Ce qui est à ce test : les messages d'après son début, et les compteurs de son jour (2031).
create function essai_messages.vider() returns void language sql as $$
  delete from prive.public_requests q where q.id > (select id from essai_messages.avant);
  delete from prive.public_request_counters c where c.window_start > '2031-01-01';
  delete from prive.public_request_salts s where s.day > '2031-01-01';
$$;
create function essai_messages.passe() returns jsonb language sql as $$ select prive.issue_public_request_pass_at('2031-03-04 10:00+00') $$;
create function essai_messages.envoi(p jsonb, p_rev integer, p_texte text, p_connexion inet) returns text language plpgsql as $$
declare v jsonb;
begin
  v := prive.send_public_request_at(p ->> 'key', (p ->> 'issued_at')::bigint, p ->> 'seal', p_rev, 'contact',
    jsonb_build_object('origin', 'direct', 'message', p_texte, 'reply', 'non'), null, '2031-03-04 10:00+00', p_connexion);
  return v ->> 'code';
end $$;
-- La connexion d'une session de plus : celle de ce serveur. Le propriétaire n'est pas superutilisateur sur Supabase local : il y faut
-- l'adresse du réseau et le mot de passe local public. Ailleurs, la prise du serveur suffit.
create function essai_messages.adresse() returns text language sql as $$
  select case when (select rolsuper from pg_roles where rolname = current_user)
    then format('host=%s port=%s dbname=%s user=%s', split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database(), current_user)
    else format('host=%s port=%s dbname=%s user=postgres password=postgres', host(inet_server_addr()), inet_server_port(), current_database()) end $$;
-- Lâche toutes les requêtes ensemble : chaque session attend le même verrou, tenu ici, puis part. Rend « code=nombre », ou l'erreur.
create function essai_messages.rafale(p_requetes text[]) returns text language plpgsql as $$
declare
  i integer;
  v text[] := '{}';
  t text;
begin
  perform pg_advisory_lock(3302);
  for i in 1..cardinality(p_requetes) loop
    perform extensions.dblink_connect('s' || i, essai_messages.adresse());
    perform extensions.dblink_send_query('s' || i, format('select essai_messages.lancer(%L)', p_requetes[i]));
  end loop;
  -- Toutes les sessions attendent le verrou avant d'être lâchées.
  for i in 1..200 loop
    exit when (select count(*) from pg_locks l where l.locktype = 'advisory' and l.objid = 3302 and not l.granted) >= cardinality(p_requetes);
    perform pg_sleep(0.02);
  end loop;
  perform pg_advisory_unlock(3302);
  for i in 1..cardinality(p_requetes) loop
    begin
      select r.x into t from extensions.dblink_get_result('s' || i) as r(x text);
    exception when others then
      t := 'ERREUR-' || sqlstate;
    end;
    v := array_append(v, split_part(coalesce(t, 'rien'), ' ', 1));
    perform extensions.dblink_disconnect('s' || i);
  end loop;
  return (select string_agg(c || '=' || n, ' ' order by c) from (select c, count(*) n from unnest(v) c group by c) g);
end $$;
-- Une session : attendre le départ, puis exécuter, dans une instruction de plus (donc une lecture de la base d'après le départ).
create function essai_messages.lancer(p_sql text) returns text language plpgsql volatile as $$
declare v text;
begin
  perform pg_advisory_xact_lock_shared(3302);
  execute p_sql into v;
  return v;
end $$;
create function essai_messages.r(p jsonb, p_rev integer, p_texte text, p_connexion text) returns text language sql as $$
  select format('select essai_messages.envoi(%L::jsonb, %s, %L, %L::inet)', p, p_rev, p_texte, p_connexion) $$;
create function essai_messages.miens(p_table text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('select count(*) from prive.%I x where x.%I > (select id from essai_messages.avant)', p_table, case p_table when 'public_requests' then 'id' else 'request_id' end) into n;
  return n;
end $$;
select essai_messages.vider();

-- Des répétitions ---------------------------------------------------------------------------------------------------------------------------
create table essai_messages.p as select essai_messages.passe() as v;
select is(essai_messages.rafale((select array_agg(essai_messages.r(v, 1, 'texte', '197.0.2.1')) from essai_messages.p, generate_series(1, 30))),
  'deja_enregistree=29 enregistree=1', 'Trente premiers envois simultanés : un seul enregistre');
select is(essai_messages.rafale((select array_agg(essai_messages.r(v, 1, 'texte', '197.0.2.1')) from essai_messages.p, generate_series(1, 30))),
  'deja_enregistree=30', 'Trente répétitions simultanées : aucune n''écrit');
select is(essai_messages.rafale((select array_agg(essai_messages.r(v, 1, 'texte', '197.0.2.1')) from essai_messages.p, generate_series(1, 30))),
  'deja_enregistree=30', 'Trente de plus : toujours la même référence');
select is(essai_messages.miens('public_requests') || ' ' || essai_messages.miens('public_request_versions') || ' ' || essai_messages.miens('public_request_notices'), '1 1 1',
  'Un message, une version, une annonce');
select is((select max(n) from prive.public_request_counters where window_start > '2031-01-01'), 1, 'Les répétitions ne consomment aucun compteur');

-- Des modifications sous une même clé ---------------------------------------------------------------------------------------------------------
select is(essai_messages.rafale((select array_agg(essai_messages.r(v, g, 'contenu ' || g, '197.0.2.' || g)) from essai_messages.p, generate_series(2, 31) g)) ~ 'limite_atteinte=23',
  true, 'Trente modifications simultanées, connexions différentes : vingt-trois refus de limite');
select is(essai_messages.miens('public_request_versions') || ' ' || essai_messages.miens('public_requests') || ' ' || essai_messages.miens('public_request_notices'), '8 1 1',
  'Huit écritures exactement, un message, une annonce');
select is((select count(*)::int from prive.public_request_events e where e.what = 'limite' and e.request_id > (select id from essai_messages.avant)), 1, 'Une seule date de limite');
select is((select q.current_revision = (select max(v.revision) from prive.public_request_versions v where v.request_id = q.id and not v.late)
           from prive.public_requests q where q.id > (select id from essai_messages.avant)), true, 'La version courante est la plus haute acceptée');

-- Des créations pour une connexion, puis pour le jour -----------------------------------------------------------------------------------------------
select essai_messages.vider();
select is(essai_messages.rafale((select array_agg(essai_messages.r(essai_messages.passe(), 1, 'x', '197.0.2.50')) from generate_series(1, 40))),
  'enregistree=20 trop_d_envois=20', 'Quarante créations simultanées, une connexion : vingt exactement');
select is(essai_messages.miens('public_requests'), 20::bigint, 'Les refus n''écrivent rien');
select is((select string_agg(left(bucket, 1) || n, ' ' order by left(bucket, 1) collate "C") from prive.public_request_counters where window_start > '2031-01-01'), 'C20 E20 c20 e20', 'Ni ne consomment un compteur');
select essai_messages.vider();
update prive.public_request_settings set daily_creations_max = 5;
select is(essai_messages.rafale((select array_agg(essai_messages.r(essai_messages.passe(), 1, 'x', '197.0.2.' || g)) from generate_series(1, 12) g)),
  'enregistree=5 plafond=7', 'Douze créations simultanées pour un plafond de cinq : cinq exactement');
select is((select count(*)::int from prive.public_request_counters where window_start > '2031-01-01' and bucket like 'c:%'), 5, 'Un refus d''ensemble ne consomme pas la connexion');
update prive.public_request_settings set daily_creations_max = 300;
select essai_messages.vider();
-- Une connexion, des créations et des suites mêlées : l'ordre des compteurs est le même partout.
create table essai_messages.ouvertes as select essai_messages.passe() as v from generate_series(1, 10);
select essai_messages.envoi(v, 1, 'premier', '197.0.2.60') from essai_messages.ouvertes;
update prive.public_requests set opened_at = now(), opened_revision = current_revision, state = 'ouverte' where id > (select id from essai_messages.avant);
select is(essai_messages.rafale((select array_agg(x) from (
    select essai_messages.r(v, 2, 'suite', '197.0.2.60') x from essai_messages.ouvertes
    union all select essai_messages.r(essai_messages.passe(), 1, 'neuf', '197.0.2.60') from generate_series(1, 20)) y)) !~ 'ERREUR', true,
  'Créations et suites mêlées sur une connexion : aucune erreur, aucun interblocage');
select is((select n from prive.public_request_counters where window_start > '2031-01-01' and bucket like 'c:%'), 20, 'Vingt créations ou suites dans l''heure, pas une de plus');

-- Ouvrir et envoyer en même temps -----------------------------------------------------------------------------------------------------------------------
select essai_messages.vider();
create table essai_messages.course as select essai_messages.passe() as v, g from generate_series(1, 15) g;
select essai_messages.envoi(v, 1, 'course ' || g, ('197.0.3.' || g)::inet) from essai_messages.course;
select is(essai_messages.rafale((select array_agg(x order by random()) from (
    select essai_messages.r(v, 2, 'course ' || g || ' bis', '197.0.3.' || g) x from essai_messages.course
    union all
    select format($f$select public.open_public_request(%L) ->> 'kind'$f$, q.reference) from prive.public_requests q where q.id > (select id from essai_messages.avant)) y)) !~ 'ERREUR', true,
  'Quinze ouvertures et quinze envois simultanés : aucune erreur');
select is((select count(*)::int from prive.public_requests q where q.id > (select id from essai_messages.avant) and q.opened_at is not null and q.opened_revision <> q.current_revision), 0,
  'Jamais une version lue puis remplacée');
select is((select count(*)::int from prive.public_request_versions v where v.request_id > (select id from essai_messages.avant) and v.content ->> 'message' like '% bis'), 15,
  'Chaque second texte existe, version ou suite');

-- Deux gestes sur la même ligne ------------------------------------------------------------------------------------------------------------------------------
create table essai_messages.cible as select q.reference, q.row_version from prive.public_requests q
  where q.id > (select id from essai_messages.avant) and q.state = 'ouverte' and q.follows_id is null order by q.id limit 1;
select is(essai_messages.rafale((select array_agg(format($f$select public.decide_public_request(%L, %s, 'traitee')::text || ' '$f$, reference, row_version)) from essai_messages.cible, generate_series(1, 8))) ~ 'ERREUR-PT409=7',
  true, 'Huit décisions simultanées au même numéro : une passe, sept disent que la demande a changé');
select is((select count(*)::int from prive.public_request_events e join prive.public_requests q on q.id = e.request_id where e.what = 'decidee' and q.reference = (select reference from essai_messages.cible)), 1,
  'La décision n''est écrite qu''une fois');

-- Le service d'annonce en double ----------------------------------------------------------------------------------------------------------------------------------
update prive.public_request_notices set next_attempt_at = now() - interval '1 hour' where request_id > (select id from essai_messages.avant);
select is(essai_messages.rafale((select array_agg($f$select jsonb_array_length(prive.claim_public_request_notices_at(20, clock_timestamp()) -> 'notices')::text$f$::text) from generate_series(1, 6))) !~ 'ERREUR',
  true, 'Six services en même temps : aucune erreur');
select is((select max(attempts) from prive.public_request_notices n where n.request_id > (select id from essai_messages.avant)), 1, 'Chaque annonce n''est réservée qu''une fois');
select is((select count(distinct lease_token) = count(*) from prive.public_request_notices n where n.request_id > (select id from essai_messages.avant) and n.state = 'en_cours'), true, 'Chaque bail est unique');

-- La purge, trois fois, pendant qu'on ouvre ce qu'elle efface ---------------------------------------------------------------------------------------------------------
update prive.public_requests set opened_at = coalesce(opened_at, now()), opened_revision = current_revision, state = 'close', closed_at = now() - interval '13 months',
  decision = 'traitee', decided_at = now() where id > (select id from essai_messages.avant);
select is(regexp_replace(essai_messages.rafale((select array_agg(x order by random()) from (
    select 'select prive.purge_public_requests()::text' x from generate_series(1, 3)
    union all select format($f$select public.open_public_request(%L) ->> 'kind'$f$, reference) from prive.public_requests where id > (select id from essai_messages.avant)) y)),
  'ERREUR-P0002|contact|[0-9]+|=| ', '', 'g'), '', 'Trois purges et des ouvertures simultanées : seulement « introuvable » pour un message déjà effacé');
select prive.purge_public_requests();
select is(essai_messages.miens('public_requests') || ' ' || essai_messages.miens('public_request_versions') || ' ' || essai_messages.miens('public_request_events') || ' ' || essai_messages.miens('public_request_notices'),
  '0 0 0 0', 'Tout est effacé, sans rien laisser');

-- Aucun interblocage (les statistiques suivent la fin des sessions) ------------------------------------------------------------------------------------------------------
-- Une relance verrouille l'annonce puis écrit dans l'historique du message. La purge prend le message puis son annonce :
-- sans un ordre commun, les deux s'attendent. Une barrière après la mise à jour de l'annonce rend cette course déterministe.
select essai_messages.envoi(essai_messages.passe(), 1, 'relance et purge', null);
update prive.public_requests set state = 'close', closed_at = now() - interval '13 months', decision = 'traitee', decided_at = now()
where id > (select id from essai_messages.avant);
update prive.public_request_notices set last_error = 'connexion', state = 'a_envoyer', lease_token = null, lease_until = null
where request_id > (select id from essai_messages.avant);
create function essai_messages.attendre_relance() returns trigger language plpgsql as $$
begin
  perform pg_advisory_xact_lock(3303);
  return new;
end $$;
create trigger essai_relance after update on prive.public_request_notices
for each row execute function essai_messages.attendre_relance();
create function essai_messages.relance_et_purge() returns text language plpgsql as $$
declare v_ref text; v_pid integer; v_relance text; v_purge text; i integer;
begin
  select reference into v_ref from prive.public_requests where id > (select id from essai_messages.avant) order by id limit 1;
  perform pg_advisory_lock(3303);
  perform extensions.dblink_connect('relance', essai_messages.adresse());
  perform extensions.dblink_connect('purge_relance', essai_messages.adresse());
  select p.pid into v_pid from extensions.dblink('purge_relance', 'select pg_backend_pid()') as p(pid integer);
  perform extensions.dblink_send_query('relance', format('select ''relancee'' || public.retry_public_request_notice(%L)::text', v_ref));
  for i in 1..200 loop
    exit when exists (select 1 from pg_locks where locktype = 'advisory' and objid = 3303 and not granted);
    perform pg_sleep(0.01);
  end loop;
  if not exists (select 1 from pg_locks where locktype = 'advisory' and objid = 3303 and not granted) then
    raise exception 'La relance n''a pas atteint la barrière du test.';
  end if;
  perform extensions.dblink_send_query('purge_relance', 'select prive.purge_public_requests()::text');
  for i in 1..200 loop
    exit when extensions.dblink_is_busy('purge_relance') = 0
      or exists (select 1 from pg_locks where pid = v_pid and not granted);
    perform pg_sleep(0.01);
  end loop;
  perform pg_advisory_unlock(3303);
  begin
    select r.x into v_relance from extensions.dblink_get_result('relance') as r(x text);
  exception when others then v_relance := 'ERREUR-' || sqlstate;
  end;
  begin
    select r.x into v_purge from extensions.dblink_get_result('purge_relance') as r(x text);
  exception when others then v_purge := 'ERREUR-' || sqlstate;
  end;
  perform extensions.dblink_disconnect('relance');
  perform extensions.dblink_disconnect('purge_relance');
  return v_relance || ' ' || v_purge;
end $$;
select is(essai_messages.relance_et_purge(), 'relancee 0', 'Relancer pendant la purge : le message est réservé, la purge le laisse, aucun interblocage');
drop trigger essai_relance on prive.public_request_notices;
select is(prive.purge_public_requests(), 1, 'La purge suivante efface le message après la fin de la relance');

select pg_sleep(1);
select is((select d.deadlocks from pg_stat_database d where d.datname = current_database()), (select n from essai_messages.interblocages), 'Aucun interblocage');

select * from finish();
select essai_messages.vider();
delete from prive.public_request_secrets s where s.id > (select secret from essai_messages.avant);
select not dblink as a_retirer from essai_messages.avant \gset
drop schema essai_messages cascade;
\if :a_retirer
drop extension dblink;
\endif
