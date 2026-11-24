-- 20261124140200 : les messages reçus, le traitement par l'administration (lot 3B1, ticket 215). Qui lit et qui traite, ouvrir qui fige,
-- rattacher, décider, répondre, clore, rouvrir, réorienter, les étapes d'un retrait. Décider ne crée, ne corrige et ne publie rien.
begin;
create extension if not exists pgtap with schema extensions;
-- Sur une base restaurée hors de Supabase, `service_role` ne voit pas pgTAP : le temps de ce test seulement.
grant usage on schema extensions to service_role;
select plan(141);

select public.register_relay('00000000-0000-4000-8000-0000000003d1', 'google-3b1-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000003a1', 'google-3b1-a', '[Alice]');
select public.activer_relais('00000000-0000-4000-8000-0000000003a1', (select id from public.lots where nom = 'Tié-Tié'));
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000003d1');
insert into public.institutions(id, name, kind) values ('d2100000-0000-4000-8000-000000000001', '[École Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, label, division_id, publication, origin, sign_phone)
select 'd2200000-0000-4000-8000-000000000001', 'd2100000-0000-4000-8000-000000000001', 'exemple-traitement', 'Annexe', id, 'publiee', 'admin', '242060000002'
from public.geo_divisions where level = 3 limit 1;
insert into public.field_submissions(id, relay_id, taken_at, sign_name, campus_id, status) values
  ('d2300000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000003a1', now(), '[École Exemple]', 'd2200000-0000-4000-8000-000000000001', 'accepte');
insert into public.field_submission_photos(id, submission_id, role, storage_path, mime, bytes, child_free_checked_at, taken_at) values
  ('d2400000-0000-4000-8000-000000000001', 'd2300000-0000-4000-8000-000000000001', 'signboard',
   'd2300000-0000-4000-8000-000000000001/d2400000-0000-4000-8000-000000000001.webp', 'image/webp', 1000, now(), now());

delete from prive.public_requests;
delete from prive.public_request_runs;
select prive.renew_public_request_secret();
create temporary table m (nom text primary key, ref text, passe jsonb);
grant all on m to anon, authenticated;
create function pg_temp.recevoir(p_nom text, p_kind text, p_contenu jsonb) returns text language plpgsql as $$
declare v_passe jsonb := prive.issue_public_request_pass_at(now()); v jsonb;
begin
  v := prive.send_public_request_at(v_passe ->> 'key', (v_passe ->> 'issued_at')::bigint, v_passe ->> 'seal', 1, p_kind, p_contenu, null, now(), null);
  insert into m values (p_nom, v ->> 'reference', v_passe);
  return v ->> 'code';
end $$;
create function pg_temp.renvoyer(p_nom text, p_rev integer, p_kind text, p_contenu jsonb) returns jsonb language sql as $$
  select prive.send_public_request_at(passe ->> 'key', (passe ->> 'issued_at')::bigint, passe ->> 'seal', p_rev, p_kind, p_contenu, null, now(), null) from m where nom = p_nom $$;
create function pg_temp.ref(p_nom text) returns text language sql as $$ select ref from m where nom = p_nom $$;
-- Le numéro de ligne actuel, lu par la base (l'écran le lit en ouvrant).
create function pg_temp.num(p_nom text) returns integer language sql security definer as $$ select row_version from prive.public_requests where reference = (select ref from m where nom = p_nom) $$;
create function pg_temp.ligne(p_nom text) returns prive.public_requests language sql security definer as $$ select q from prive.public_requests q where reference = (select ref from m where nom = p_nom) $$;
create function pg_temp.histoire(p_nom text) returns text language sql security definer as
  $$ select string_agg(e.what, ' ' order by e.id) from prive.public_request_events e join prive.public_requests q on q.id = e.request_id where q.reference = (select ref from m where nom = p_nom) $$;

select is(pg_temp.recevoir('msg', 'contact', '{"origin":"contact","subject":"trouver","message":"[le message]","reply":"whatsapp","contact":"242060000009","person_name":"[Prénom]"}'), 'enregistree', 'Un message');
select is(pg_temp.recevoir('abs', 'absente', '{"origin":"ecoles","reply":"non","school_name":"[Complexe Exemple]","town":"Brazzaville","levels":["M","P"]}'), 'enregistree', 'Une école absente');
select is(pg_temp.recevoir('err', 'erreur', '{"origin":"fiche","reply":"email","contact":"p@exemple.com","campus_id":"d2200000-0000-4000-8000-000000000001","topic":"frais","correction":"[le bon montant]"}'),
  'enregistree', 'Une erreur');
select is(pg_temp.recevoir('ret', 'retrait', '{"origin":"fiche","reply":"whatsapp","contact":"242060000008","campus_id":"d2200000-0000-4000-8000-000000000001","removal":"tel"}'), 'enregistree', 'Un retrait');
select is(pg_temp.recevoir('ret2', 'retrait', '{"origin":"fiche","reply":"email","contact":"q@exemple.com","school_name":"[École Exemple]","removal":"fiche"}'), 'enregistree', 'Un autre retrait, sans fiche désignée');
select is(pg_temp.recevoir('ret3', 'retrait', '{"origin":"fiche","reply":"email","contact":"r@exemple.com","school_name":"[École Exemple]","removal":"photo","removal_details":"[précision]"}'), 'enregistree', 'Un troisième');
select is((select string_agg(left(ref, 1), '' order by nom) from m), 'AACRRR', 'Les références disent leur file : C, A, R');

-- Qui lit, qui traite : personne d'autre que l'administration -----------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003a1","role":"authenticated"}', true);
select throws_ok($$select * from public.list_public_requests('a_traiter')$$, '42501', null, 'Un relais ne lit aucune liste');
select throws_ok($$select public.open_public_request((select ref from m where nom = 'msg'))$$, '42501', null, 'Un relais n''ouvre rien, même avec la référence');
select throws_ok($$select public.public_request_overview()$$, '42501', null, 'Un relais ne lit pas les compteurs');
select throws_ok($$select public.decide_public_request((select ref from m where nom = 'msg'), 1, 'traitee')$$, '42501', null, 'Un relais ne décide rien');
select throws_ok($$select public.verify_removal((select ref from m where nom = 'ret'), 1, 'numero')$$, '42501', null, 'Un relais ne vérifie aucun retrait');
select throws_ok($$select public.record_removal((select ref from m where nom = 'ret'), 1)$$, '42501', null, 'Un relais ne note aucun retrait');
select throws_ok($$select * from prive.public_requests$$, '42501', null, 'Un relais ne lit pas la table');
select throws_ok($$select public.claim_public_request_notices()$$, '42501', null, 'Un relais ne réserve aucune annonce');
-- Un compte Google que NTanova ne connaît pas : ni relais, ni administrateur.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003ff","role":"authenticated"}', true);
select throws_ok($$select * from public.list_public_requests('a_traiter')$$, '42501', null, 'Un compte inconnu ne lit rien');
select throws_ok($$select public.open_public_request((select ref from m where nom = 'msg'))$$, '42501', null, 'Un compte inconnu n''ouvre rien');
reset role;
-- Une direction : le seul droit qu'elle aurait, gérer son site, n'ouvre aucun message. Aucune de ces fonctions ne passe par lui.
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname ~ 'public_request' or p.proname ~ 'removal')
             and pg_get_functiondef(p.oid) ~ 'exiger_gestion_site|peut_gerer_site'), 0, 'Gérer un site n''ouvre aucun message (direction)');
select is((select count(*)::int from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname ~ 'public_request' or p.proname ~ 'removal')
             and p.proname not in ('issue_public_request_pass', 'send_public_request', 'claim_public_request_notices', 'report_public_request_notice')
             and pg_get_functiondef(p.oid) !~ 'begin\s+perform public\.exiger_admin_session\(\)'), 0, 'Chaque geste commence par exiger l''administration');
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok($$select public.open_public_request((select ref from m where nom = 'msg'))$$, '42501', null, 'Un visiteur n''ouvre pas son message, même avec sa référence');
select throws_ok($$select * from public.list_public_requests('a_traiter')$$, '42501', null, 'Un visiteur ne lit aucune liste');
select throws_ok($$select * from prive.public_request_versions$$, '42501', null, 'Un visiteur ne lit aucune table');
reset role;
set local role service_role;
select throws_ok($$select * from public.list_public_requests('a_traiter')$$, '42501', null, 'Le service d''annonce ne lit aucune liste');
select throws_ok($$select * from prive.public_requests$$, '42501', null, 'Le service d''annonce ne lit aucune table');
reset role;

-- Lire une liste n'ouvre rien ---------------------------------------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000003d1","role":"authenticated"}', true);
select is((select count(*)::int from public.list_public_requests('a_traiter')), 3, 'À traiter : les retraits ont leur file');
select is((select count(*)::int from public.list_public_requests('retraits')), 3, 'Trois retraits');
select is((select count(*)::int from public.list_public_requests('a_traiter', 1)), 1, 'La liste se lit par pages');
select is((select count(*)::int from public.list_public_requests('a_traiter', 50, (select min(row_id) from public.list_public_requests('a_traiter', 1)))), 2, 'La page suivante');
select throws_ok($$select * from public.list_public_requests('tout')$$, '22023', null, 'Une file inconnue est refusée');
select is((select campus_name from public.list_public_requests('a_traiter') where reference = pg_temp.ref('err')), '[École Exemple] — Annexe', 'La liste dit l''école rattachée');
select ok((select (to_jsonb(l))::text !~ '(le message|242060000009|p@exemple|Prénom|bon montant)' from public.list_public_requests('a_traiter') l limit 1), 'La liste ne porte ni texte ni coordonnée');
select ok((select bool_and((to_jsonb(l))::text !~ '(le message|242060000009|p@exemple|Prénom|bon montant)') from public.list_public_requests('a_traiter') l), 'Pour aucune ligne');
select ok((pg_temp.ligne('msg')).opened_at is null, 'Lister n''a rien ouvert');

-- Ouvrir fige ------------------------------------------------------------------------------------------------------------------------------------------------

select is(public.open_public_request(lower(pg_temp.ref('msg'))) #>> '{versions,0,content,message}', '[le message]', 'Ouvrir rend le message (la casse de la référence ne compte pas)');
select is((pg_temp.ligne('msg')).state::text || ' ' || (pg_temp.ligne('msg')).opened_revision, 'ouverte 1', 'Ouvert, figé à la révision 1');
select is(public.open_public_request(pg_temp.ref('msg')) ->> 'row_version', pg_temp.num('msg')::text, 'Rouvrir la page ne réécrit rien');
select is(pg_temp.histoire('msg'), 'recue ouverte', 'Une seule ouverture dans l''historique');
select throws_ok($$select public.open_public_request('C-AAAA-AAAA')$$, 'PT404', null, 'Une référence inconnue');
reset role;
select is(pg_temp.renvoyer('msg', 2, 'contact', '{"origin":"contact","message":"[ajout]","reply":"non"}') ->> 'code', 'suite', 'Réécrire après l''ouverture fait une suite');
set local role authenticated;
select is(jsonb_array_length(public.open_public_request(pg_temp.ref('msg')) -> 'followed_by'), 1, 'Le message lu montre sa suite');
select is(public.open_public_request(pg_temp.ref('msg')) #>> '{versions,0,content,message}', '[le message]', 'Son texte n''a pas changé');
select is((select follows from public.list_public_requests('a_traiter') where follows is not null), pg_temp.ref('msg'), 'La suite dit d''où elle vient');

-- Un geste porte le numéro lu ------------------------------------------------------------------------------------------------------------------------------------

select throws_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('msg'), pg_temp.num('msg') - 1, 'traitee'), 'PT409', null, 'Un numéro périmé : rien n''est écrasé');
select throws_ok(format('select public.decide_public_request(%L, null, %L)', pg_temp.ref('msg'), 'traitee'), 'PT409', null, 'Sans numéro : rien');
select throws_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'existe'), '22023', null, 'On ne décide pas sans avoir ouvert');
select throws_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('msg'), pg_temp.num('msg')), '22023', null, 'Clore sans décision : refusé');
select throws_ok(format('select public.record_public_request_reply(%L, %s, %L, current_date)', pg_temp.ref('msg'), pg_temp.num('msg'), 'faite'), '22023', null, 'Répondre avant de décider : refusé');

-- Décider ne change que la demande ----------------------------------------------------------------------------------------------------------------------------------

reset role;
create temporary table avant as select (select count(*) from public.institutions) i, (select count(*) from public.campuses) c,
  (select md5(string_agg(to_jsonb(x)::text, '' order by x.id)) from public.campuses x) e, (select count(*) from prive.erasures) f;
grant select on avant to authenticated;
set local role authenticated;
select public.open_public_request(pg_temp.ref('abs'));
select public.open_public_request(pg_temp.ref('err'));
select throws_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'retenue'), '22023', null, 'Une décision d''une autre nature est refusée');
select throws_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('msg'), pg_temp.num('msg'), 'a_l_annuaire'), '22023', null, 'Une réorientation passe par son geste');
select throws_ok(format('select public.decide_public_request(%L, %s, %L, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'introuvable', repeat('x', 301)), '22023', null, 'Un motif de 301 signes : refusé');
select throws_ok(format('select public.decide_public_request(%L, %s, %L, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'existe', 'motif'), '22023', null, 'Un motif sans raison d''être : refusé');
select lives_ok(format('select public.decide_public_request(%L, %s, %L, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'introuvable', '[motif]'), 'Introuvable, avec son motif');
select lives_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'existe'), 'La décision se change tant que la demande est ouverte');
select ok((pg_temp.ligne('abs')).decision_note is null, 'L''ancien motif part avec l''ancienne décision');
select lives_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('err'), pg_temp.num('err'), 'retenue'), 'Correction retenue');
select lives_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('msg'), pg_temp.num('msg'), 'traitee'), 'Message traité');
reset role;
select is((select row((select count(*) from public.institutions), (select count(*) from public.campuses),
                      (select md5(string_agg(to_jsonb(x)::text, '' order by x.id)) from public.campuses x), (select count(*) from prive.erasures))::text),
          (select row(i, c, e, f)::text from avant), 'Décider n''a créé, corrigé ni publié aucune fiche');
set local role authenticated;

-- Rattacher, détacher ---------------------------------------------------------------------------------------------------------------------------------------------------

select lives_ok(format('select public.attach_public_request(%L, %s, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), 'd2200000-0000-4000-8000-000000000001'), 'Rattacher à une fiche');
select is((pg_temp.ligne('abs')).decision::text, 'existe', 'Rattacher ne décide rien');
select lives_ok(format('select public.attach_public_request(%L, %s, null)', pg_temp.ref('abs'), pg_temp.num('abs')), 'Détacher');
select ok((pg_temp.ligne('abs')).campus_id is null, 'Détachée');
select throws_ok(format('select public.attach_public_request(%L, %s, %L)', pg_temp.ref('abs'), pg_temp.num('abs'), gen_random_uuid()), 'P0002', null, 'Une fiche qui n''existe pas');
select throws_ok(format('select public.attach_public_request(%L, %s, %L)', pg_temp.ref('msg'), pg_temp.num('msg'), 'd2200000-0000-4000-8000-000000000001'), '22023', null, 'Un message ne se rattache pas');

-- Attendre, répondre, clore, rouvrir ---------------------------------------------------------------------------------------------------------------------------------------

select lives_ok(format('select public.set_public_request_waiting(%L, %s, true)', pg_temp.ref('err'), pg_temp.num('err')), 'Mettre en attente');
select throws_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('err'), pg_temp.num('err')), '22023', null, 'On ne clôt pas une demande en attente');
select is((select count(*)::int from public.list_public_requests('en_attente')), 1, 'Elle est dans sa file');
select lives_ok(format('select public.set_public_request_waiting(%L, %s, false)', pg_temp.ref('err'), pg_temp.num('err')), 'La remettre à traiter');
select throws_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('err'), pg_temp.num('err')), '22023', null, 'Clore avec une réponse à faire : refusé');
select throws_ok(format('select public.record_public_request_reply(%L, %s, %L)', pg_temp.ref('err'), pg_temp.num('err'), 'faite'), '22023', null, 'Noter sans date : refusé');
select throws_ok(format('select public.record_public_request_reply(%L, %s, %L, %L)', pg_temp.ref('err'), pg_temp.num('err'), 'faite', current_date + 2), '22023', null, 'Noter une date future : refusé');
select throws_ok(format('select public.record_public_request_reply(%L, %s, %L, current_date)', pg_temp.ref('abs'), pg_temp.num('abs'), 'faite'), '22023', null, 'Personne n''attend de réponse : refusé');
select lives_ok(format('select public.record_public_request_reply(%L, %s, %L, %L)', pg_temp.ref('err'), pg_temp.num('err'), 'faite', (now() at time zone 'Africa/Brazzaville')::date), 'Noter le jour où la réponse est partie');
select is(public.close_public_request(pg_temp.ref('err'), pg_temp.num('err')), ((now() + interval '12 months') at time zone 'Africa/Brazzaville')::date, 'Clore rend la date d''effacement');
select throws_ok(format('select public.attach_public_request(%L, %s, null)', pg_temp.ref('err'), pg_temp.num('err')), '22023', null, 'Close, elle ne se rattache plus');
select throws_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('err'), pg_temp.num('err') - 1), 'PT409', null, 'Rejouer la clôture ne l''écrit pas deux fois');
select is((select purge_on from public.list_public_requests('closes')), ((now() + interval '12 months') at time zone 'Africa/Brazzaville')::date, 'La liste dit quand elle s''efface');
select lives_ok(format('select public.reopen_public_request(%L, %s)', pg_temp.ref('err'), pg_temp.num('err')), 'Rouvrir');
select is((pg_temp.ligne('err')).state::text || coalesce((pg_temp.ligne('err')).closed_at::text, ' sans échéance'), 'ouverte sans échéance', 'L''échéance est annulée');
select is(public.open_public_request(pg_temp.ref('err')) ->> 'purge_on', null, 'Plus de date d''effacement');
select lives_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('abs'), pg_temp.num('abs')), 'Sans réponse demandée : clore');
select is(pg_temp.histoire('err'), 'recue ouverte decidee en_attente reprise reponse_faite close rouverte', 'L''historique garde chaque geste');
select lives_ok(format('select public.record_public_request_reply(%L, %s, %L)', pg_temp.ref('msg'), pg_temp.num('msg'), 'impossible'), 'Réponse impossible');
select lives_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('msg'), pg_temp.num('msg')), 'Elle permet de clore');

-- Indésirable : visible 30 jours, réversible -----------------------------------------------------------------------------------------------------------------------------------

reset role;
select pg_temp.recevoir('pub', 'contact', '{"origin":"direct","message":"[publicité]","reply":"non"}');
set local role authenticated;
select public.open_public_request(pg_temp.ref('pub'));
select lives_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('pub'), pg_temp.num('pub'), 'indesirable'), 'Ranger dans les indésirables');
select is((select purge_on from public.list_public_requests('indesirables')), ((now() + interval '30 days') at time zone 'Africa/Brazzaville')::date, 'Effacé dans 30 jours, pas avant');
select is((select count(*)::int from public.list_public_requests('a_traiter') where reference = pg_temp.ref('pub')), 0, 'Il quitte la file');
select lives_ok(format('select public.restore_public_request(%L, %s)', pg_temp.ref('pub'), pg_temp.num('pub')), '« Ce n''est pas indésirable »');
select is((pg_temp.ligne('pub')).state::text || ' ' || coalesce((pg_temp.ligne('pub')).decision, '-'), 'recue -', 'Il revient à traiter, sans décision');
select throws_ok(format('select public.restore_public_request(%L, %s)', pg_temp.ref('pub'), pg_temp.num('pub')), '22023', null, 'Deux fois : refusé');

-- Réorienter ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

select public.open_public_request(pg_temp.ref('pub'));
select throws_ok(format('select public.redirect_public_request(%L, %s, %L)', pg_temp.ref('pub'), pg_temp.num('pub'), 'retrait'), '22023', null, 'Un retrait sans coordonnée : refusé');
select throws_ok(format('select public.redirect_public_request(%L, %s, %L)', pg_temp.ref('pub'), pg_temp.num('pub'), 'contact'), '22023', null, 'Vers sa propre file : refusé');
reset role;
insert into m select 'neuf', null, null;
set local role authenticated;
update m set ref = public.redirect_public_request(pg_temp.ref('pub'), pg_temp.num('pub'), 'absente') where nom = 'neuf';
select matches(pg_temp.ref('neuf'), '^A-', 'Un message devient une demande d''annuaire');
select is(public.open_public_request(pg_temp.ref('neuf')) ->> 'redirected_from', pg_temp.ref('pub'), 'Reliée à l''original');
select is(public.open_public_request(pg_temp.ref('pub')) #>> '{versions,0,content,message}', '[publicité]', 'L''original reste lisible');
select is((pg_temp.ligne('pub')).decision::text, 'a_l_annuaire', 'Et il est décidé');
select is(public.open_public_request(pg_temp.ref('neuf')) -> 'notice', 'null'::jsonb, 'Sans annonce : le fondateur vient de la créer');
select throws_ok(format('select public.redirect_public_request(%L, %s, %L)', pg_temp.ref('pub'), pg_temp.num('pub'), 'erreur'), '22023', null, 'Une seule fois');
select throws_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('pub'), pg_temp.num('pub'), 'traitee'), '22023', null, 'Sa décision ne se reprend pas');

-- Les étapes d'un retrait -----------------------------------------------------------------------------------------------------------------------------------------------------------

select is((select string_agg(removal_step, ' ') from public.list_public_requests('retraits')), 'verifier verifier verifier', 'Tout retrait commence par la vérification');
select public.open_public_request(pg_temp.ref('ret'));
select throws_ok(format('select public.decide_public_request(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'retiree'), '22023', null, 'Un retrait ne se décide pas d''un mot : il a ses étapes');
select throws_ok(format('select public.record_removal(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), '22023', null, 'Pas de retrait avant la vérification');
select throws_ok(format('select public.verify_removal(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'formulaire'), '22023', null, 'Un numéro écrit dans le formulaire n''est pas une preuve');
select throws_ok(format('select public.verify_removal(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'autre'), '22023', null, 'Une autre vérification se note en une ligne');
select lives_ok(format('select public.verify_removal(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'numero'), 'Elle écrit depuis le numéro');
select throws_ok(format('select public.record_removal(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), '22023', null, 'On désigne d''abord la cible');
select throws_ok(format('select public.target_removal(%L, %s, %L, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), '{photo}', 'd2200000-0000-4000-8000-000000000001'), '22023', null, 'Une photo se désigne');
select throws_ok(format('select public.target_removal(%L, %s, %L, %L, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), '{photo}', 'd2200000-0000-4000-8000-000000000001', gen_random_uuid()), '22023', null, 'Une photo d''ailleurs : refusé');
select lives_ok(format('select public.target_removal(%L, %s, %L, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), '{contact_public,numero_enseigne}', 'd2200000-0000-4000-8000-000000000001'), 'Le contact public et le numéro de l''enseigne');
select throws_ok(format('select public.record_removal(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), '22023', 'Encore publié : le numéro de l''enseigne. Retire-le dans Écoles, puis reviens.',
  'La base publie encore la cible : refusé, et nommée');
reset role;
update public.campuses set sign_phone = null where id = 'd2200000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(format('select public.record_removal(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), 'Retiré de la base : noté');
reset role;
select is((select what || '/' || campus_id || '/' || note from prive.erasures order by id desc limit 1), 'public_info/d2200000-0000-4000-8000-000000000001/Retrait demandé : contact_public, numero_enseigne',
  'Le journal des effacements : quoi et quelle fiche, jamais l''information ni la personne');
set local role authenticated;
select throws_ok(format('select public.record_removal_seen(%L, %s, current_date, current_date)', pg_temp.ref('ret'), pg_temp.num('ret')), '22023', null, 'Pas de constat avant la mise en ligne demandée');
select throws_ok(format('select public.record_removal_publication(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'exécution 12'), '22023', null, 'Le numéro d''exécution est un nombre');
select lives_ok(format('select public.record_removal_publication(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), '45161064876'), 'Mise en ligne demandée');
select throws_ok(format('select public.record_removal_seen(%L, %s, %L, null)', pg_temp.ref('ret'), pg_temp.num('ret'), (now() at time zone 'Africa/Brazzaville')::date), '22023', null, 'Un constat partiel : refusé');
select throws_ok(format('select public.record_removal_seen(%L, %s, %L, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), (now() at time zone 'Africa/Brazzaville')::date - 1, (now() at time zone 'Africa/Brazzaville')::date), '22023', null,
  'Un constat d''avant la mise en ligne : refusé');
select lives_ok(format('select public.record_removal_seen(%L, %s, %L, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), (now() at time zone 'Africa/Brazzaville')::date, (now() at time zone 'Africa/Brazzaville')::date), 'Constaté sur les deux adresses');
select is((select removal_step from public.list_public_requests('retraits') where reference = pg_temp.ref('ret')), 'prevenir', 'Il reste à prévenir');
select throws_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), '22023', null, 'Clore sans prévenir : refusé');
select lives_ok(format('select public.record_public_request_reply(%L, %s, %L, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'faite', (now() at time zone 'Africa/Brazzaville')::date), 'La personne est prévenue');
select lives_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), 'Clore le retrait');
select lives_ok(format('select public.reopen_public_request(%L, %s)', pg_temp.ref('ret'), pg_temp.num('ret')), 'Rouvrir un retrait');
select is((select removal_step from public.list_public_requests('retraits') where reference = pg_temp.ref('ret')), 'retirer', 'Il reprend au retrait dans la base, vérification gardée');

-- Impossible à vérifier : prévenir, puis clore. Réorienter un retrait. Une photo.
select public.open_public_request(pg_temp.ref('ret2'));
select throws_ok(format('select public.verify_removal(%L, %s, %L)', pg_temp.ref('ret2'), pg_temp.num('ret2'), 'numero'), '22023', null, 'La fiche entière : un numéro ne suffit pas');
select lives_ok(format('select public.fail_removal(%L, %s)', pg_temp.ref('ret2'), pg_temp.num('ret2')), 'Impossible à vérifier');
select throws_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('ret2'), pg_temp.num('ret2')), '22023', null, 'Ne se clôt pas d''un geste : on prévient d''abord');
select is((select publication::text from public.campuses where id = 'd2200000-0000-4000-8000-000000000001'), 'publiee', 'Rien n''a été retiré');
select lives_ok(format('select public.record_public_request_reply(%L, %s, %L)', pg_temp.ref('ret2'), pg_temp.num('ret2'), 'impossible'), 'La personne ne peut pas être prévenue : noté');
select lives_ok(format('select public.close_public_request(%L, %s)', pg_temp.ref('ret2'), pg_temp.num('ret2')), 'Puis on clôt');
select lives_ok(format('select public.reopen_public_request(%L, %s)', pg_temp.ref('ret2'), pg_temp.num('ret2')), 'Elle donne une précision : rouvrir');
select is((select removal_step from public.list_public_requests('retraits') where reference = pg_temp.ref('ret2')), 'verifier', 'Et tout recommence à la vérification');
reset role;
insert into m values ('corr', null, null);
set local role authenticated;
update m set ref = public.redirect_public_request(pg_temp.ref('ret2'), pg_temp.num('ret2'), 'erreur') where nom = 'corr';
select matches(pg_temp.ref('corr'), '^A-', 'Un retrait devient une demande de correction');
select is((select removal_step || ' ' || decision from public.list_public_requests('retraits') where reference = pg_temp.ref('ret2')), 'prevenir reorientee', 'Le retrait reste à prévenir, puis à clore');
select throws_ok(format('select public.redirect_public_request(%L, %s, %L)', pg_temp.ref('ret'), pg_temp.num('ret'), 'erreur'), '22023', null, 'Un retrait commencé ne se réoriente plus');
select public.open_public_request(pg_temp.ref('ret3'));
select lives_ok(format('select public.verify_removal(%L, %s, %L, %L)', pg_temp.ref('ret3'), pg_temp.num('ret3'), 'autre', '[appel du numéro déjà connu]'), 'Une autre vérification, notée');
select lives_ok(format('select public.target_removal(%L, %s, %L, %L, %L)', pg_temp.ref('ret3'), pg_temp.num('ret3'), '{photo}', 'd2200000-0000-4000-8000-000000000001', 'd2400000-0000-4000-8000-000000000001'), 'La photo de l''enseigne');
select throws_ok(format('select public.record_removal(%L, %s)', pg_temp.ref('ret3'), pg_temp.num('ret3')), '22023', 'Encore publié : la photo. Retire-le dans Écoles, puis reviens.', 'La photo automatique est encore publique : refusé');
select lives_ok($$select public.erase_photo('d2400000-0000-4000-8000-000000000001', null)$$, 'Effacer la photo, par la fonction existante');
select lives_ok(format('select public.record_removal(%L, %s)', pg_temp.ref('ret3'), pg_temp.num('ret3')), 'La photo effacée : noté');

-- La vue d'ensemble : des nombres et des dates --------------------------------------------------------------------------------------------------------------------------------------

select is(public.public_request_overview() - 'oldest_removal_at' - 'to_handle' - 'new' - 'daily_cap_reached_at',
  '{"waiting":0,"closed":2,"removals":3,"removals_closed":0,"spam":0,"limit_reached":0,"notices_waiting":8,"notices_failing":0,"notices_abandoned":0,"notices_last_run_at":null,"purge_last_run_at":null,"overdue":0}'::jsonb,
  'Les compteurs de l''administration');
select ok((public.public_request_overview())::text !~ '[CAR]-[2-9A-Z]{4}-', 'Sans aucune référence');
reset role;

select * from finish();
rollback;
