-- 20261124150000 (lot 3B2, ticket 217) : ce que les écrans lisent de plus (filtre par nature, file des alertes en échec, nombres des
-- onglets), et un message effacé qui se dit. La sonnette de l'alerte e-mail est dans `supabase_couche.supabase.test.sql`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

select public.register_relay('00000000-0000-4000-8000-0000000004d1', 'google-3b2-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000004a1', 'google-3b2-a', '[Alice]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000004d1');

delete from prive.public_requests;
delete from prive.public_request_runs;
delete from prive.public_request_counters;
select prive.renew_public_request_secret();
create temporary table m (nom text primary key, ref text);
grant all on m to authenticated;
create function pg_temp.recevoir(p_nom text, p_kind text, p_contenu jsonb) returns void language plpgsql as $$
declare v_passe jsonb := prive.issue_public_request_pass_at(now()); v jsonb;
begin
  v := prive.send_public_request_at(v_passe ->> 'key', (v_passe ->> 'issued_at')::bigint, v_passe ->> 'seal', 1, p_kind, p_contenu, null, now(), null);
  insert into m values (p_nom, v ->> 'reference');
end $$;
create function pg_temp.ref(p_nom text) returns text language sql as $$ select ref from m where nom = p_nom $$;
create function pg_temp.file(p_tab text, p_kind text default null) returns text language sql as
  $$ select string_agg(m.nom, ' ' order by m.nom) from public.list_public_requests(p_tab, 50, null, p_kind) l join m on m.ref = l.reference $$;

select pg_temp.recevoir('c1', 'contact', '{"origin":"contact","message":"[le message]","reply":"non"}');
select pg_temp.recevoir('a1', 'absente', '{"origin":"ecoles","reply":"non","school_name":"[Complexe Exemple]","town":"Brazzaville"}');
select pg_temp.recevoir('c2', 'contact', '{"origin":"contact","message":"[un autre]","reply":"non"}');
select pg_temp.recevoir('e1', 'erreur', '{"origin":"fiche","reply":"non","school_name":"[École Exemple]","topic":"frais","correction":"[x]"}');
select pg_temp.recevoir('r1', 'retrait', '{"origin":"fiche","reply":"email","contact":"q@exemple.com","school_name":"[École Exemple]","removal":"tel"}');

-- Une seule signature : PostgREST n'hésite pas -------------------------------------------------------------------------------------------

select is((select count(*)::int from pg_proc where proname = 'list_public_requests'), 1, 'Une seule fonction de ce nom');
select ok(not has_function_privilege('anon', 'public.list_public_requests(text, integer, bigint, text)', 'execute'), 'Un visiteur ne l''appelle pas');
select ok(not has_function_privilege('service_role', 'public.list_public_requests(text, integer, bigint, text)', 'execute'), 'Le service d''alerte non plus');
select ok((select p.prosecdef and 'search_path=""' = any (p.proconfig) from pg_proc p where p.proname = 'list_public_requests'), 'Chemin de recherche vide');

-- Qui lit ----------------------------------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004a1","role":"authenticated"}', true);
select throws_ok($$select * from public.list_public_requests('alertes')$$, '42501', null, 'Un relais ne lit pas la file des alertes');
select throws_ok($$select * from public.list_public_requests('a_traiter', 50, null, 'contact')$$, '42501', null, 'Ni un filtre');
select throws_ok($$select public.public_request_overview()$$, '42501', null, 'Ni les nombres');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d1","role":"authenticated"}', true);

-- Le filtre porte sur la file entière, page par page ------------------------------------------------------------------------------------------

select is(pg_temp.file('a_traiter'), 'a1 c1 c2 e1', 'Sans filtre : toute la file');
select is(pg_temp.file('a_traiter', 'contact'), 'c1 c2', 'Contact');
select is(pg_temp.file('a_traiter', 'absente'), 'a1', 'École absente');
select is(pg_temp.file('a_traiter', 'erreur'), 'e1', 'Erreur');
select is(pg_temp.file('a_traiter', 'retrait'), null, 'Un retrait n''est jamais dans cette file');
select is((select reference from public.list_public_requests('a_traiter', 1, null, 'contact')), pg_temp.ref('c2'), 'Une page d''une ligne : la plus récente de cette nature');
select is((select reference from public.list_public_requests('a_traiter', 1, (select row_id from public.list_public_requests('a_traiter', 1, null, 'contact')), 'contact')),
  pg_temp.ref('c1'), 'La page suivante saute les autres natures : rien n''est caché par la première page');
select throws_ok($$select * from public.list_public_requests('a_traiter', 50, null, 'autre')$$, '22023', null, 'Une nature inconnue est refusée');
select throws_ok($$select * from public.list_public_requests('tout')$$, '22023', null, 'Une file inconnue aussi');
select is((select count(*)::int from public.list_public_requests('a_traiter') where opened), 0, 'Lister n''ouvre rien');

-- Les nombres des onglets ----------------------------------------------------------------------------------------------------------------------

select is((select (o ->> 'to_handle') || ' ' || (o ->> 'closed') || ' ' || (o ->> 'removals') || ' ' || (o ->> 'removals_closed') || ' ' || (o ->> 'notices_waiting')
           from public.public_request_overview() o), '4 0 1 0 5', 'À traiter, clos, retraits, retraits clos, annonces qui attendent');
select public.open_public_request(pg_temp.ref('c1'));
select lives_ok($$select public.decide_public_request(pg_temp.ref('c1'), 2, 'traitee')$$, 'Décidé');
select lives_ok($$select public.close_public_request(pg_temp.ref('c1'), 3)$$, 'Clos');
select is((select (o ->> 'to_handle') || ' ' || (o ->> 'closed') from public.public_request_overview() o), '3 1', 'Un message clos change d''onglet');
select is(pg_temp.file('closes', 'contact'), 'c1', 'Et se lit dans les clos, filtré aussi');
select is((select o ? 'notices_last_run_at' and o -> 'notices_last_run_at' = 'null'::jsonb from public.public_request_overview() o), true,
  'Un service jamais passé : aucune date, pas un faux « en marche »');

-- Un message effacé se dit, par un code que l'API rend avec sa phrase ------------------------------------------------------------------------------

select throws_ok($$select public.open_public_request('C-AAAA-AAAA')$$, 'PT404', 'Message introuvable : il a peut-être été effacé.', 'L''ouvrir : 404, pas une panne');
select throws_ok($$select public.decide_public_request('C-AAAA-AAAA', 1, 'traitee')$$, 'PT404', null, 'Un geste non plus ne l''invente pas');
select throws_ok($$select public.set_public_request_waiting(pg_temp.ref('a1'), 99, true)$$, 'PT409', null, 'Une version périmée reste un conflit');
select is((select (public.open_public_request(pg_temp.ref('a1')) ->> 'state') || ' ' || (public.open_public_request(pg_temp.ref('a1')) ->> 'row_version')), 'ouverte 2',
  'Ouvrir fige toujours, une fois');

-- La file des alertes : en échec ou abandonnée, quelle que soit la file du message -----------------------------------------------------------------

select is(pg_temp.file('alertes'), null, 'Aucune alerte en échec');
reset role;
do $$
declare v jsonb; n jsonb;
begin
  v := prive.claim_public_request_notices_at(20, now());
  for n in select * from jsonb_array_elements(v -> 'notices') loop
    perform prive.report_public_request_notice_at((n ->> 'lease')::uuid,
      case when n ->> 'reference' in (pg_temp.ref('c1'), pg_temp.ref('r1')) then 'connexion' else 'envoyee' end, now());
  end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d1","role":"authenticated"}', true);
select is(pg_temp.file('alertes'), 'c1 r1', 'Un message clos et un retrait, réunis par leur alerte');
select is(pg_temp.file('alertes', 'retrait'), 'r1', 'Filtrés aussi');
select is((select string_agg(distinct notice_error, ',') from public.list_public_requests('alertes')), 'connexion', 'Un code, jamais le texte du serveur');
select is((select (o ->> 'notices_failing') || ' ' || (o ->> 'notices_waiting') from public.public_request_overview() o), '2 2', 'Les nombres le disent');
select is((select opened from public.list_public_requests('alertes') where reference = pg_temp.ref('r1')), false, 'Lister les alertes n''ouvre rien');
select lives_ok($$select public.retry_public_request_notice(pg_temp.ref('r1'))$$, 'Relancer');
select is((select opened from public.list_public_requests('alertes') where reference = pg_temp.ref('r1')), false, 'Relancer une alerte n''ouvre pas le message');
reset role;
update prive.public_request_notices n set state = 'abandonnee' from prive.public_requests q where q.id = n.request_id and q.reference = pg_temp.ref('r1');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000004d1","role":"authenticated"}', true);
select is(pg_temp.file('alertes'), 'c1 r1', 'Une alerte abandonnée y reste visible');
reset role;

select * from finish();
rollback;
