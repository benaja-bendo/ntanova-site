-- 20261124140300 : les messages reçus, la file des annonces et la purge (lot 3B1, ticket 215). L'heure est un paramètre des fonctions
-- privées ; les deux portes du service n'en ont pas.
begin;
create extension if not exists pgtap with schema extensions;
-- Sur une base restaurée hors de Supabase, `service_role` ne voit pas pgTAP : le temps de ce test seulement.
grant usage on schema extensions to service_role;
select plan(74);

select public.register_relay('00000000-0000-4000-8000-0000000004d1', 'google-3b1-purge', '[Admin]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000004d1');
insert into public.institutions(id, name, kind) values ('d3100000-0000-4000-8000-000000000001', '[École Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin)
select 'd3200000-0000-4000-8000-000000000001', 'd3100000-0000-4000-8000-000000000001', 'exemple-purge', id, 'publiee', 'admin' from public.geo_divisions where level = 3 limit 1;

delete from prive.public_requests;
delete from prive.public_request_counters;
delete from prive.public_request_runs;
delete from prive.public_request_secrets;
select prive.renew_public_request_secret('2026-11-01');
create temporary table m (nom text primary key, ref text, passe jsonb);
grant select on m to authenticated;
create function pg_temp.recevoir(p_nom text, p_now timestamptz, p_kind text default 'contact', p_piege text default null) returns text language plpgsql as $$
declare v_passe jsonb := prive.issue_public_request_pass_at(p_now); v jsonb;
begin
  v := prive.send_public_request_at(v_passe ->> 'key', (v_passe ->> 'issued_at')::bigint, v_passe ->> 'seal', 1, p_kind,
    case p_kind when 'retrait' then '{"origin":"fiche","reply":"email","contact":"p@exemple.com","campus_id":"d3200000-0000-4000-8000-000000000001","removal":"tel"}'::jsonb
                else '{"origin":"direct","message":"[texte privé]","reply":"email","contact":"p@exemple.com","person_name":"[Nom privé]"}' end, p_piege, p_now, '197.0.2.1');
  insert into m values (p_nom, v ->> 'reference', v_passe) on conflict (nom) do update set ref = excluded.ref, passe = excluded.passe;
  return v ->> 'code';
end $$;
create function pg_temp.renvoyer(p_nom text, p_rev integer, p_texte text, p_now timestamptz) returns jsonb language sql as $$
  select prive.send_public_request_at(passe ->> 'key', (passe ->> 'issued_at')::bigint, passe ->> 'seal', p_rev, 'contact',
    jsonb_build_object('origin', 'direct', 'message', p_texte, 'reply', 'email', 'contact', 'p@exemple.com', 'person_name', '[Nom privé]'), null, p_now, '197.0.2.1') from m where nom = p_nom $$;
create function pg_temp.annonce(p_nom text) returns prive.public_request_notices language sql as $$
  select n from prive.public_request_notices n join prive.public_requests q on q.id = n.request_id where q.reference = (select ref from m where nom = p_nom) $$;
create function pg_temp.prendre(p_now timestamptz, p_n integer default 20) returns jsonb language sql as $$ select prive.claim_public_request_notices_at(p_n, p_now) $$;

-- La file des annonces ----------------------------------------------------------------------------------------------------------------------

select is(pg_temp.prendre('2026-11-24 10:00+00'), '{"notices":[],"sent_last_hour":0}'::jsonb, 'File vide : rien à réserver');
select is((select last_run_at from prive.public_request_runs where task = 'annonces'), timestamptz '2026-11-24 10:00+00', 'Le passage est noté, même vide');
select pg_temp.recevoir('a', '2026-11-24 10:01+00');
select pg_temp.recevoir('b', '2026-11-24 10:02+00');
select pg_temp.recevoir('spam', '2026-11-24 10:03+00', p_piege => 'x');
create temporary table c as select pg_temp.prendre('2026-11-24 10:05+00') as v;
select is((select jsonb_array_length(v -> 'notices') from c), 2, 'Deux annonces, aucune pour l''indésirable');
select is((select string_agg(k, ',' order by k) from c, jsonb_object_keys(v #> '{notices,0}') k), 'attempt,kind,lease,message_id,reference', 'Le service reçoit la référence et la nature, rien du message');
select ok((select v::text !~ '(texte privé|Nom privé|exemple\.com)' from c), 'Aucun contenu ne sort');
select is((select v #>> '{notices,0,reference}' from c), (select ref from m where nom = 'a'), 'La plus ancienne d''abord');
select is(pg_temp.prendre('2026-11-24 10:06+00') -> 'notices', '[]'::jsonb, 'Réservée : personne d''autre ne la prend pendant cinq minutes');

-- Succès, échec, reprise
select is(prive.report_public_request_notice_at((select (v #>> '{notices,0,lease}')::uuid from c), 'envoyee', '2026-11-24 10:06+00'), true, 'Marquer l''envoi');
select is((pg_temp.annonce('a')).state::text, 'envoyee', 'Envoyée');
select is(prive.report_public_request_notice_at((select (v #>> '{notices,0,lease}')::uuid from c), 'connexion', '2026-11-24 10:07+00'), false, 'Un second marquage du même bail ne change rien');
select is(prive.report_public_request_notice_at((select (v #>> '{notices,1,lease}')::uuid from c), 'refus_temporaire', '2026-11-24 10:06+00'), true, 'Marquer un échec');
select is((pg_temp.annonce('b')).state || ' ' || (pg_temp.annonce('b')).last_error || ' ' || (pg_temp.annonce('b')).next_attempt_at, 'a_envoyer refus_temporaire ' || timestamptz '2026-11-24 10:11+00',
  'Nouvel essai à 5 minutes, un code de la liste pour toute trace');
select throws_ok(format('select prive.report_public_request_notice_at(%L, %L, now())', gen_random_uuid(), 'Mailbox p@exemple.com unavailable'), '22023', null, 'Jamais le texte du serveur de courrier');
select is(pg_temp.prendre('2026-11-24 10:10+00') -> 'notices', '[]'::jsonb, 'Pas avant son heure');
create function pg_temp.echouer(p_now timestamptz) returns timestamptz language plpgsql as $$
declare v jsonb := pg_temp.prendre(p_now);
begin
  perform prive.report_public_request_notice_at((v #>> '{notices,0,lease}')::uuid, 'connexion', p_now);
  return (pg_temp.annonce('b')).next_attempt_at;
end $$;
select is(pg_temp.echouer('2026-11-24 10:11+00'), timestamptz '2026-11-24 10:26+00', 'Puis 15 minutes');
select is(pg_temp.echouer('2026-11-24 10:26+00'), timestamptz '2026-11-24 11:26+00', 'Puis 60 minutes');
select is(pg_temp.echouer('2026-11-24 11:26+00'), timestamptz '2026-11-24 12:26+00', 'Puis toutes les heures');
update c set v = pg_temp.prendre('2026-11-24 12:26+00');
select is((select v #>> '{notices,0,message_id}' from c), (pg_temp.annonce('b')).message_id::text, 'Le même message_id à chaque essai : un doublon se reconnaît');
select is(pg_temp.prendre('2026-11-24 12:32+00') #>> '{notices,0,reference}', (select ref from m where nom = 'b'), 'Coupure avant le marquage : le bail expire, elle repart');
select is(prive.report_public_request_notice_at((select (v #>> '{notices,0,lease}')::uuid from c), 'envoyee', '2026-11-24 12:33+00'), false, 'Un bail périmé et repris ne marque plus rien');
select is(pg_temp.prendre('2026-11-25 10:06+00') -> 'notices', '[]'::jsonb, '24 heures après son premier essai, elle n''est plus prise');
select is((pg_temp.annonce('b')).state::text, 'abandonnee', 'Elle est abandonnée, et cela se voit');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d1","role":"authenticated"}', true);
select is((public.public_request_overview() ->> 'notices_abandoned')::int, 1, 'Comptée dans la vue d''ensemble');
select lives_ok(format('select public.retry_public_request_notice(%L)', (select ref from m where nom = 'b')), '« Relancer » avance l''échéance');
select throws_ok(format('select public.retry_public_request_notice(%L)', (select ref from m where nom = 'a')), '22023', null, 'Une annonce partie ne se relance pas');
reset role;
select is((pg_temp.annonce('b')).state::text || coalesce((pg_temp.annonce('b')).sent_at::text, ''), 'a_envoyer', '« Relancer » n''envoie rien');
update c set v = pg_temp.prendre(now() + interval '1 minute');
select is((select v #>> '{notices,0,reference}' from c), (select ref from m where nom = 'b'), 'Le service la reprend au passage suivant');
select pg_temp.recevoir('vieille', '2026-11-20 10:00+00');
select is(pg_temp.prendre('2026-11-28 10:00+00', 1) #>> '{notices,0,reference}', (select ref from m where nom = 'vieille'), 'Jamais essayée pendant un long arrêt : elle est essayée, pas abandonnée');
select pg_temp.recevoir('n' || g, '2026-11-28 10:00+00'::timestamptz + g * interval '1 hour') from generate_series(1, 25) g;
select is(jsonb_array_length(pg_temp.prendre('2026-12-01 10:00+00', 500) -> 'notices'), 20, 'Vingt au plus par passage, quoi qu''on demande');

-- Les portes du service
set local role service_role;
select lives_ok($$select public.claim_public_request_notices()$$, 'Le service réserve');
select is(public.report_public_request_notice(gen_random_uuid(), 'envoyee'), false, 'Un bail inconnu ne marque rien');
reset role;
set local role anon;
select throws_ok($$select public.claim_public_request_notices()$$, '42501', null, 'Un visiteur ne réserve rien');
select throws_ok($$select public.report_public_request_notice(gen_random_uuid(), 'envoyee')$$, '42501', null, 'Ni ne marque rien');
select throws_ok($$select prive.purge_public_requests()$$, '42501', null, 'Ni ne purge');
reset role;

-- La purge -----------------------------------------------------------------------------------------------------------------------------------------

delete from prive.public_requests;
delete from prive.public_request_counters;
delete from prive.public_request_salts;
select pg_temp.recevoir('x', '2026-11-24 10:00+00');
select pg_temp.renvoyer('x', 2, '[second texte]', '2026-11-24 10:05+00');
update prive.public_requests set opened_at = '2026-11-25', opened_revision = 2, state = 'ouverte';
select is(pg_temp.renvoyer('x', 3, '[suite]', '2026-11-25 10:00+00') ->> 'code', 'suite', 'Un message, sa suite');
select pg_temp.recevoir('r', '2026-11-24 10:00+00', 'retrait');
select pg_temp.recevoir('spam', '2026-11-24 10:00+00', p_piege => 'x');
insert into prive.erasures(what, campus_id, by_user, note) values ('public_info', 'd3200000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000004d1', 'Retrait demandé : contact_public');
update prive.public_requests set state = 'close', closed_at = '2026-12-01 10:00+00', decision = 'traitee', decided_at = now(), reply_state = 'impossible'
  where reference = (select ref from m where nom = 'x');
update prive.public_requests set opened_at = now(), opened_revision = 1, state = 'close', closed_at = '2026-12-05 10:00+00', decision = 'retiree', decided_at = now(), reply_state = 'impossible'
  where reference = (select ref from m where nom = 'r');

select is(prive.purge_public_requests('2026-12-24 09:59+00'), 0, 'À 29 jours et 23 heures : l''indésirable est encore là');
select is(prive.purge_public_requests('2026-12-24 10:00+00'), 1, 'À 30 jours : il est effacé');
select is(prive.purge_public_requests('2027-12-01 09:59+00'), 0, 'Une minute avant 12 mois : rien');
select is((select count(*)::int from prive.public_requests), 3, 'Le message, sa suite, le retrait');
select is(prive.purge_public_requests('2027-12-01 10:00+00'), 1, 'À 12 mois de la clôture : le message est effacé');
select is(prive.purge_public_requests('2027-12-01 10:00+00'), 0, 'La rejouer n''efface rien de plus');
select is((select count(*)::int from prive.public_request_versions v where v.content ->> 'message' in ('[texte privé]', '[second texte]')), 0, 'Aucune version ne reste');
select is((select count(*)::int from prive.public_request_versions) || ' ' || (select count(*)::int from prive.public_request_notices) || ' ' || (select count(distinct request_id)::int from prive.public_request_events), '2 2 2',
  'Versions, annonce et historique sont partis avec lui ; les deux autres messages gardent les leurs');
select is((select string_agg(coalesce(follows_id::text, 'sans lien'), ',') from prive.public_requests where kind = 'contact'), 'sans lien', 'La suite reste, sans lien');
select is((select count(*)::int from prive.public_requests q where q.reference = (select ref from m where nom = 'r')), 1, 'Le retrait clos plus tard attend son heure');
select is(prive.purge_public_requests('2027-12-05 10:00+00'), 1, 'Puis il part');
select is((select count(*)::int from prive.public_request_removals), 0, 'Avec son suivi');
select is((select count(*)::int from prive.erasures where what = 'public_info' and campus_id = 'd3200000-0000-4000-8000-000000000001'), 1, 'Le journal des effacements garde la trace, sans la personne');
select is((select last_run_at from prive.public_request_runs where task = 'purge'), timestamptz '2027-12-05 10:00+00', 'Chaque passage est noté');
select is((select last_count from prive.public_request_runs where task = 'purge'), 1, 'Avec le nombre effacé');
-- Une base restaurée, une colonne oubliée : le message purgé n'est nulle part dans le schéma privé.
create function pg_temp.chercher(p_texte text) returns text language plpgsql as $$
declare r record; n integer; v text := '';
begin
  for r in select c.oid::regclass as t from pg_class c where c.relnamespace = 'prive'::regnamespace and c.relkind = 'r' and c.relname ~ '^public_request' loop
    execute format('select count(*) from %s x where x::text like %L', r.t, '%' || p_texte || '%') into n;
    if n > 0 then v := v || r.t || ' '; end if;
  end loop;
  return v;
end $$;
select is(pg_temp.chercher((select ref from m where nom = 'x')), '', 'Sa référence n''est plus nulle part');
select is(pg_temp.chercher(encode(sha256(convert_to((select passe ->> 'key' from m where nom = 'x'), 'UTF8')), 'hex')), '', 'Ni l''empreinte de sa clé');

-- Un vieil onglet ne recrée rien
select is(pg_temp.renvoyer('x', 2, '[second texte]', '2027-12-06 10:00+00'), '{"code":"expiree"}'::jsonb, 'Renvoyé après la purge la plus longue : expirée, rien recréé');
select is(pg_temp.renvoyer('spam', 1, '[texte privé]', '2026-12-24 10:01+00'), '{"code":"expiree"}'::jsonb, 'Renvoyé après la purge la plus courte : expirée');
select is((select count(*)::int from prive.public_requests), 1, 'Il ne reste que la suite');

-- Rouvrir annule l'échéance
select pg_temp.recevoir('y', '2026-11-24 10:00+00');
update prive.public_requests set opened_at = now(), opened_revision = 1, state = 'close', closed_at = '2026-11-30 10:00+00', decision = 'traitee', decided_at = now(), reply_state = 'impossible'
  where reference = (select ref from m where nom = 'y');
set local role authenticated;
select is((public.public_request_overview() ->> 'overdue')::int, 0, 'Rien n''est en retard');
select lives_ok(format('select public.reopen_public_request(%L, %s)', (select ref from m where nom = 'y'), (select (public.open_public_request((select ref from m where nom = 'y')) ->> 'row_version')::int)), 'Rouvert avant l''échéance');
reset role;
select is(prive.purge_public_requests('2028-01-01 10:00+00'), 0, 'Rouvert : il n''expire pas');
update prive.public_requests set state = 'close', closed_at = now() - interval '13 months' where reference = (select ref from m where nom = 'y');
set local role authenticated;
select is((public.public_request_overview() ->> 'overdue')::int, 1, 'Échu pendant un arrêt : l''administration le voit');
reset role;
select is(prive.purge_public_requests(now()), 1, 'Et le premier passage l''efface');

-- Compteurs, sels, secrets
delete from prive.public_request_counters;
delete from prive.public_request_salts;
select pg_temp.recevoir('z', '2026-11-24 10:00+00');
select is((select count(*)::int from prive.public_request_counters) || ' ' || (select count(*)::int from prive.public_request_salts), '4 1', 'Quatre compteurs et un sel');
select prive.purge_public_requests('2026-11-25 22:00+00');
select is((select count(*)::int from prive.public_request_salts), 1, 'Le lendemain, le sel du jour est encore là');
select prive.purge_public_requests('2026-11-26 10:00+00');
select is((select count(*)::int from prive.public_request_counters where bucket ~ '^[ce]:') || ' ' || (select count(*)::int from prive.public_request_salts), '0 0', 'À 48 heures : ni compteur de connexion, ni sel');
delete from prive.public_request_secrets;
select prive.renew_public_request_secret('2026-11-01 10:00+00');
select prive.purge_public_requests('2026-11-30 10:00+00');
select is((select count(*)::int from prive.public_request_secrets), 1, 'Avant un mois : le même secret');
select prive.purge_public_requests('2026-12-02 10:00+00');
select is((select count(*)::int from prive.public_request_secrets), 2, 'Après un mois : un nouveau, l''ancien attend la fin de ses laissez-passer');
select prive.purge_public_requests('2026-12-09 09:59+00');
select is((select count(*)::int from prive.public_request_secrets), 2, 'Toujours là à 6 jours et 23 heures');
select prive.purge_public_requests('2026-12-09 10:00+00');
select is((select count(*)::int from prive.public_request_secrets), 1, 'Oublié après 7 jours');
select prive.renew_public_request_secret(p_revoke => true);
select is((select count(*)::int from prive.public_request_secrets), 1, 'Révoquer (après une restauration) ne garde que le nouveau');

-- Les réglages : l'ordre entre la validité et la conservation
select throws_ok($$update prive.public_request_settings set pass_validity = '30 days'$$, '23514', null, 'Une validité aussi longue que la conservation la plus courte : refusée');
select throws_ok($$update prive.public_request_settings set spam_retention = '6 days'$$, '23514', null, 'Une conservation plus courte que la validité : refusée');
select throws_ok($$update prive.public_request_settings set closed_retention = '7 days'$$, '23514', null, 'Pour les messages clos aussi');
select throws_ok($$update prive.public_request_settings set pass_validity = '0'$$, '23514', null, 'Une validité nulle : refusée');
select throws_ok($$insert into prive.public_request_settings default values$$, '23505', null, 'Une seule ligne de réglages');
update prive.public_requests set opened_at = now(), opened_revision = current_revision, state = 'ouverte' where reference = (select ref from m where nom = 'z');
select throws_ok($$update prive.public_requests set current_revision = 9 where opened_at is not null$$, '23514', null, 'La base refuse de changer la révision d''un message ouvert');

select * from finish();
rollback;
