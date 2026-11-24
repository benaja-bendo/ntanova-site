-- 20261124140100 : les messages reçus, l'envoi (lot 3B1, ticket 215). Contenu contrôlé en entier, laissez-passer daté par le serveur,
-- les neuf situations du contrat (§7), bornes par clé, connexion et jour, piège, fiche retirée. L'heure est un paramètre des fonctions
-- privées `*_at` ; les portes publiques n'en ont pas. Données inventées.
begin;
create extension if not exists pgtap with schema extensions;
select plan(130);

insert into public.institutions(id, name, kind) values ('d1100000-0000-4000-8000-000000000001', '[École Exemple]', 'privee');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin)
select v.id::uuid, 'd1100000-0000-4000-8000-000000000001', v.slug, (select id from public.geo_divisions where level = 3 limit 1), v.publication, 'admin'
from (values ('d1200000-0000-4000-8000-000000000001', 'exemple-publiee', 'publiee'), ('d1200000-0000-4000-8000-000000000002', 'exemple-prete', 'prete')) v(id, slug, publication);

-- Les outils du test : un laissez-passer à une heure, un envoi à une heure. Rend « code » ou « code référence ».
create function pg_temp.passe(p_now timestamptz default '2026-11-24 10:00+00') returns jsonb language sql as
  $$ select prive.issue_public_request_pass_at(p_now) $$;
create function pg_temp.envoi(p jsonb, p_rev integer, p_contenu jsonb, p_now timestamptz default '2026-11-24 10:00+00',
                              p_connexion inet default null, p_kind text default 'contact', p_piege text default null) returns jsonb language sql as
  $$ select prive.send_public_request_at(p ->> 'key', (p ->> 'issued_at')::bigint, p ->> 'seal', p_rev, p_kind, p_contenu, p_piege, p_now, p_connexion) $$;
create function pg_temp.msg(p_texte text) returns jsonb language sql as
  $$ select jsonb_build_object('origin', 'direct', 'message', p_texte, 'reply', 'non') $$;
create function pg_temp.code(p jsonb) returns text language sql as $$ select p ->> 'code' $$;
create function pg_temp.erreurs(p_kind text, p_contenu jsonb) returns jsonb language sql as
  $$ select prive.normalize_public_request(p_kind, p_contenu) -> 'errors' $$;
create function pg_temp.lignes() returns text language sql as $$
  select (select count(*) from prive.public_requests) || ' ' || (select count(*) from prive.public_request_versions) || ' ' ||
         (select count(*) from prive.public_request_notices) || ' ' || (select count(*) from prive.public_request_counters) $$;
create function pg_temp.vider() returns void language sql as
  $$ delete from prive.public_requests; delete from prive.public_request_counters; delete from prive.public_request_salts $$;
create temporary table p (nom text primary key, v jsonb);
-- La transaction se défait à la fin : une base locale qui a déjà des messages n'y change rien.
select pg_temp.vider();

-- Le contenu, nature par nature ---------------------------------------------------------------------------------------------------------------

select is(pg_temp.erreurs('contact', pg_temp.msg('Bonjour')), '{}'::jsonb, 'Un message : son texte, son origine, sans réponse demandée');
select is(pg_temp.erreurs('contact', '{}'), '{"origin":"requis","message":"requis","reply":"requis"}'::jsonb, 'Un message vide : les trois champs requis, rien de coché d''avance');
select is(pg_temp.erreurs('contact', pg_temp.msg(E' \n\t\u00A0 ')), '{"message":"requis"}'::jsonb, 'Des blancs ne sont pas un message');
select is(pg_temp.erreurs('contact', pg_temp.msg(repeat('é', 2000))), '{}'::jsonb, '2 000 signes accentués passent');
select is(pg_temp.erreurs('contact', pg_temp.msg(repeat('é', 2001))), '{"message":"trop_long"}'::jsonb, '2 001 signes : trop long');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"subject":"publicite"}'), '{"subject":"hors_liste"}'::jsonb, 'Un sujet hors de la liste');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"subject":"donnees"}'), '{}'::jsonb, 'Un sujet de la liste');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"origin":"https://ailleurs.example/?q=secret"}'), '{"origin":"hors_liste"}'::jsonb,
  'Une origine est un code de la liste, jamais une adresse');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"topic":"frais"}'), '{"request":"champ_inconnu"}'::jsonb, 'Le champ d''une autre nature est inconnu');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"piece_jointe":"x"}'), '{"request":"champ_inconnu"}'::jsonb, 'Aucune pièce jointe : champ inconnu');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"message":12}'), '{"message":"format"}'::jsonb, 'Un message qui n''est pas un texte');
select is(pg_temp.erreurs('contact', '[]'), '{"request":"illisible"}'::jsonb, 'Un contenu qui n''est pas un objet');
select is(pg_temp.erreurs('contact', null), '{"request":"illisible"}'::jsonb, 'Sans contenu');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"reply":"whatsapp"}'), '{"contact":"requis"}'::jsonb, 'Une réponse demandée sans coordonnée');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"reply":"whatsapp","contact":"06 123 45 67"}'), '{"contact":"format"}'::jsonb,
  'Un numéro arrive normalisé (chiffres, indicatif compris)');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"reply":"whatsapp","contact":"242060000000"}'), '{}'::jsonb, 'Un numéro normalisé');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"reply":"email","contact":"prenom@exemple.com"}'), '{}'::jsonb, 'Une adresse e-mail');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"reply":"email","contact":"prenom@exemple"}'), '{"contact":"format"}'::jsonb, 'Une adresse incomplète');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || '{"reply":"email","contact":"a@exemple.com,b@exemple.com"}'), '{"contact":"format"}'::jsonb, 'Deux adresses : refusé');
select is(pg_temp.erreurs('contact', pg_temp.msg('x') || jsonb_build_object('reply', 'email', 'contact', repeat('a', 250) || '@x.fr')), '{"contact":"trop_long"}'::jsonb,
  '254 signes au plus pour une adresse');
select is(prive.normalize_public_request('contact', pg_temp.msg('x') || '{"contact":"242060000000"}') -> 'content', pg_temp.msg('x'),
  'Une coordonnée sans réponse demandée n''est pas gardée');
select is(prive.normalize_public_request('contact', pg_temp.msg(E'  a\r\nb\u0007\u202Ec  ')) #>> '{content,message}', E'a\nbc', 'Fins de ligne unifiées, signes de contrôle retirés, bords nets');
select is(prive.normalize_public_request('contact', pg_temp.msg('x') || jsonb_build_object('person_name', E' Marie\n  Claire ')) #>> '{content,person_name}', 'Marie Claire',
  'Un nom tient sur une ligne');

select is(pg_temp.erreurs('absente', '{"origin":"ecoles","reply":"non","school_name":"[École]","town":"Dolisie"}'), '{}'::jsonb, 'École absente : son nom et sa ville suffisent');
select is(pg_temp.erreurs('absente', '{"origin":"ecoles","reply":"non"}'), '{"school_name":"requis","town":"requis"}'::jsonb, 'École absente : nom et ville requis');
select is(prive.normalize_public_request('absente', '{"origin":"ecoles","reply":"non","school_name":"[École]","town":"Dolisie","levels":["P","M","P"],"is_from_school":true}') -> 'content',
  '{"origin":"ecoles","reply":"non","school_name":"[École]","town":"Dolisie","levels":["M","P"],"is_from_school":true}'::jsonb, 'Les niveaux se rangent, sans doublon');
select is(pg_temp.erreurs('absente', '{"origin":"ecoles","reply":"non","school_name":"[É]","town":"X","levels":["M","Z"]}'), '{"levels":"hors_liste"}'::jsonb, 'Un niveau inconnu');
select is(pg_temp.erreurs('absente', '{"origin":"ecoles","reply":"non","school_name":"[É]","town":"X","levels":"M","is_from_school":"oui"}'),
  '{"levels":"format","is_from_school":"format"}'::jsonb, 'Niveaux et case : leur forme');

select is(pg_temp.erreurs('erreur', '{"origin":"fiche","reply":"non","campus_id":"d1200000-0000-4000-8000-000000000001","topic":"frais","correction":"c''est 15 000"}'), '{}'::jsonb,
  'Une erreur sur une fiche connue');
select is(pg_temp.erreurs('erreur', '{"origin":"pied","reply":"non","topic":"frais","correction":"x"}'), '{"school_name":"requis"}'::jsonb, 'Sans fiche, le nom de l''école est requis');
select is(pg_temp.erreurs('erreur', '{"origin":"fiche","reply":"non","campus_id":"128","topic":"frais","correction":"x"}'), '{"campus_id":"format"}'::jsonb, 'Une fiche est désignée par son identifiant');
select is(pg_temp.erreurs('erreur', '{"origin":"pied","reply":"non","school_name":"[É]","topic":"prix","knowledge":"rumeur"}'),
  '{"topic":"hors_liste","correction":"requis","knowledge":"hors_liste"}'::jsonb, 'Une erreur : information de la liste et texte requis');

select is(pg_temp.erreurs('retrait', '{"origin":"fiche","reply":"whatsapp","contact":"242060000000","school_name":"[É]","removal":"tel"}'), '{}'::jsonb, 'Un retrait : quoi, où, et où répondre');
select is(pg_temp.erreurs('retrait', '{"origin":"fiche","reply":"non","school_name":"[É]","removal":"tel"}'), '{"reply":"requis"}'::jsonb, 'Un retrait sans réponse possible est refusé');
select is(pg_temp.erreurs('retrait', '{"origin":"fiche","reply":"email","contact":"p@exemple.com","removal":"compte"}'), '{"removal":"hors_liste","school_name":"requis"}'::jsonb,
  'Un retrait : liste fermée, école désignée');

-- Le laissez-passer ----------------------------------------------------------------------------------------------------------------------------

delete from prive.public_request_secrets;
select throws_ok($$select public.issue_public_request_pass()$$, '55000', null, 'Au départ, les envois sont fermés : aucun laissez-passer');
select prive.purge_public_requests();
select is((select count(*)::int from prive.public_request_secrets), 0, 'La purge quotidienne ne les ouvre pas');
select prive.renew_public_request_secret('2026-11-01');
select is((select count(*)::int from prive.public_request_secrets where octet_length(secret) = 32), 1, 'Ouvrir : un secret, tiré par la base');
select pg_temp.passe() from generate_series(1, 20);
select is(pg_temp.lignes(), '0 0 0 0', 'Demander vingt laissez-passer n''écrit aucune ligne');
insert into p values ('a', pg_temp.passe());
select matches((select v ->> 'key' from p where nom = 'a'), '^[0-9a-f]{8}-[0-9a-f]{4}-4', 'La clé est tirée par le serveur');
select is((select (v ->> 'issued_at')::bigint from p where nom = 'a'), extract(epoch from timestamptz '2026-11-24 10:00+00')::bigint, 'L''heure est celle du serveur');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('x'), '2026-12-01 10:00+00') ->> 'code', 'expiree', 'À 7 jours exactement : expirée');
select is(pg_temp.envoi((select v || '{"seal":"0000000000000000000000000000000000000000000000000000000000000000"}' from p where nom = 'a'), 1, pg_temp.msg('x')),
  '{"code":"expiree"}'::jsonb, 'Un sceau faux : rien, sans référence');
select is(pg_temp.envoi((select v || jsonb_build_object('issued_at', (v ->> 'issued_at')::bigint + 2592000) from p where nom = 'a'), 1, pg_temp.msg('x'), '2026-12-20 10:00+00') ->> 'code',
  'expiree', 'Une heure avancée par le navigateur : rien');
select is(pg_temp.envoi('{}', 1, pg_temp.msg('x')) ->> 'code', 'expiree', 'Sans laissez-passer : rien');
select is(pg_temp.envoi((select v || '{"key":"pas-une-cle"}' from p where nom = 'a'), 1, pg_temp.msg('x')) ->> 'code', 'expiree', 'Une clé qui n''en est pas une : rien');
select is(pg_temp.envoi((select v || jsonb_build_object('key', gen_random_uuid()) from p where nom = 'a'), 1, pg_temp.msg('x')) ->> 'code', 'expiree', 'La clé d''un autre : le sceau ne va pas');
select is(pg_temp.envoi((select v || '{"issued_at":999999999999}' from p where nom = 'a'), 1, pg_temp.msg('x')) ->> 'code', 'expiree', 'Une heure absurde : rien, sans erreur');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('x'), '2026-11-24 09:50+00') ->> 'code', 'expiree', 'Une heure venue du futur : rien');
select is(pg_temp.lignes(), '0 0 0 0', 'Aucun de ces refus n''a écrit une ligne');

-- Les neuf situations --------------------------------------------------------------------------------------------------------------------------

insert into p values ('r', pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('premier'), '2026-12-01 09:00+00'));
select is((select v ->> 'code' from p where nom = 'r'), 'enregistree', '1. À 6 jours et 23 heures, clé inconnue : enregistrée');
select matches((select v ->> 'reference' from p where nom = 'r'), '^C-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$', 'La référence : huit signes sans ambiguïté');
select is((select v - 'code' - 'reference' from p where nom = 'r'), '{}'::jsonb, 'La réponse ne porte qu''un code et une référence');
select is(pg_temp.lignes(), '1 1 1 2', 'Un message, une version, une annonce, deux compteurs du jour');
select is((select (key_hash = sha256(convert_to((select v ->> 'key' from p where nom = 'a'), 'UTF8')))::text from prive.public_requests), 'true', 'La base garde l''empreinte de la clé, pas la clé');
select is((select count(*)::int from prive.public_requests q, prive.public_request_versions v
           where (to_jsonb(q) || to_jsonb(v))::text like '%' || (select p.v ->> 'key' from p where nom = 'a') || '%'), 0, 'La clé n''est écrite nulle part');
select is(pg_temp.envoi(pg_temp.passe(), 1, pg_temp.msg('x'), '2026-12-05 10:00+00') ->> 'code', 'expiree', '2. Clé inconnue, laissez-passer expiré : rien');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('premier'), '2026-12-01 09:01+00'), (select v || '{"code":"deja_enregistree"}' from p where nom = 'r'),
  '3. La même révision, le même texte : même référence');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg(E' premier \r\n'), '2027-11-01 09:01+00'), (select v || '{"code":"deja_enregistree"}' from p where nom = 'r'),
  '3. Même expiré, même avec des blancs au bord : même référence');
select is(pg_temp.lignes(), '1 1 1 2', 'Une répétition n''écrit et ne compte rien');
select is(pg_temp.envoi((select v from p where nom = 'a'), 2, pg_temp.msg('second'), '2026-12-01 10:00+00'), (select v || '{"code":"expiree"}' from p where nom = 'r'),
  '4. Clé connue, expirée, autre texte : refus, avec la référence de ce qui est enregistré');
select is(pg_temp.envoi((select v from p where nom = 'a'), 3, pg_temp.msg('troisième'), '2026-12-01 09:30+00'), (select v || '{"code":"mise_a_jour"}' from p where nom = 'r'),
  '5. Plus récente, jamais ouverte : elle devient courante');
select is((select current_revision || ' ' || writes from prive.public_requests), '3 2', 'La révision 3 est courante');
select is((select count(*)::int from prive.public_request_notices), 1, 'Pas de seconde annonce pour une mise à jour');
select is(pg_temp.envoi((select v from p where nom = 'a'), 2, pg_temp.msg('second'), '2026-12-01 09:31+00'), (select v || '{"code":"version_ancienne"}' from p where nom = 'r'),
  '7. Arrivée en retard : gardée sans devenir courante');
select is((select string_agg(revision || case when late then ' tardive' else '' end, ', ' order by revision) from prive.public_request_versions), '1, 2 tardive, 3', 'Les trois versions sont là');
select is((select current_revision from prive.public_requests), 3, 'La version en retard ne remplace rien');
select is(pg_temp.envoi((select v from p where nom = 'a'), 2, pg_temp.msg('troisième'), '2026-12-01 09:31+00') ->> 'code', 'deja_enregistree',
  'Le texte courant, sous une autre révision, est déjà enregistré');
select is(pg_temp.envoi((select v from p where nom = 'a'), 5, pg_temp.msg('premier'), '2026-12-01 09:32+00') ->> 'code', 'mise_a_jour',
  'Revenir à un ancien texte est une vraie modification : pas de faux accusé');
insert into p values ('s', pg_temp.envoi((select v from p where nom = 'a'), 5, pg_temp.msg('autre fenêtre'), '2026-12-01 09:33+00'));
select is((select v ->> 'code' from p where nom = 's'), 'suite', '8. Une révision déjà reçue, un autre texte : une suite, rien n''est écrasé');
select is((select v ->> 'previous_reference' from p where nom = 's'), (select v ->> 'reference' from p where nom = 'r'), 'Une suite rend les deux références');
select isnt((select v ->> 'reference' from p where nom = 's'), (select v ->> 'reference' from p where nom = 'r'), 'La suite a sa propre référence');
select is(pg_temp.envoi((select v from p where nom = 'a'), 9, pg_temp.msg('autre fenêtre'), '2026-12-01 09:34+00'), (select v || '{"code":"deja_enregistree"}' from p where nom = 's'),
  'Renvoyer une suite rend sa référence, sans rien écrire');
update prive.public_requests set opened_at = now(), opened_revision = current_revision, state = 'ouverte' where reference = (select v ->> 'reference' from p where nom = 'r');
select is(pg_temp.envoi((select v from p where nom = 'a'), 10, pg_temp.msg('après ouverture'), '2026-12-01 09:35+00') ->> 'code', 'suite', '6. Déjà ouverte : une suite reliée');
select is((select q.current_revision from prive.public_requests q where reference = (select v ->> 'reference' from p where nom = 'r')), 5, 'Le message lu n''a pas changé');
select is((select count(*)::int from prive.public_request_notices), 3, 'Chaque suite a son annonce');
select is(pg_temp.envoi((select v from p where nom = 'a'), 10, '{"origin":"ecoles","reply":"non","school_name":"[É]","town":"X"}', '2026-12-01 09:36+00', p_kind => 'absente'),
  '{"code":"cle_deja_utilisee"}'::jsonb, 'La même clé pour une autre nature : refusée, rien n''est enregistré');

-- Les bornes sous une clé (9) --------------------------------------------------------------------------------------------------------------------

select pg_temp.vider();
update p set v = pg_temp.passe() where nom = 'a';
select pg_temp.envoi((select v from p where nom = 'a'), g, pg_temp.msg('v' || g)) from generate_series(1, 8) g;
select is((select writes from prive.public_requests), 8, 'Huit écritures sous une clé');
insert into p values ('n', pg_temp.envoi((select v from p where nom = 'a'), 9, pg_temp.msg('v9')));
select is((select v ->> 'code' from p where nom = 'n'), 'limite_atteinte', '9. La neuvième est refusée');
select is((select v ->> 'reference' from p where nom = 'n'), (select reference from prive.public_requests), 'Le refus donne la référence de ce qui est enregistré');
select is((select limit_reached_at from prive.public_requests), timestamptz '2026-11-24 10:00+00', 'La limite est datée');
select pg_temp.envoi((select v from p where nom = 'a'), 10, pg_temp.msg('v10'), '2026-11-24 11:00+00');
select is((select limit_reached_at || '/' || (select count(*) from prive.public_request_events where what = 'limite') from prive.public_requests)::text,
  (timestamptz '2026-11-24 10:00+00')::text || '/1', 'Une seule fois');
select is(pg_temp.envoi((select v from p where nom = 'a'), 8, pg_temp.msg('v8')) ->> 'code', 'deja_enregistree', 'La répétition identique passe malgré la borne');
select is((select count(*)::int from prive.public_request_versions), 8, 'Les refus n''ont rien écrit');

select pg_temp.vider();
update p set v = pg_temp.passe() where nom = 'a';
update p set v = pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('v1')) where nom = 'r';
update prive.public_requests set opened_at = now(), opened_revision = 1, state = 'ouverte';
select is(string_agg(pg_temp.envoi((select v from p where nom = 'a'), g, pg_temp.msg('s' || g)) ->> 'code', ' ' order by g), 'suite suite suite limite_atteinte', 'Trois suites, la quatrième est refusée')
  from generate_series(2, 5) g;
select is(pg_temp.envoi((select v from p where nom = 'a'), 3, pg_temp.msg('s3')) ->> 'code', 'deja_enregistree', 'Renvoyer une suite connue passe');
select is(pg_temp.envoi((select v from p where nom = 'a'), 6, pg_temp.msg('s6')) ->> 'reference', (select v ->> 'reference' from p where nom = 'r'), 'Le refus donne la référence du premier message');
select pg_temp.vider();
update p set v = pg_temp.passe() where nom = 'a';
select pg_temp.envoi((select v from p where nom = 'a'), 20, pg_temp.msg('v20'));
select is(string_agg(pg_temp.envoi((select v from p where nom = 'a'), g, pg_temp.msg('t' || g)) ->> 'code', ' ' order by g),
  'version_ancienne version_ancienne version_ancienne version_ancienne version_ancienne version_ancienne version_ancienne limite_atteinte', 'Les versions en retard comptent aussi')
  from generate_series(1, 8) g;

-- Les bornes par connexion et d'ensemble -----------------------------------------------------------------------------------------------------------

select pg_temp.vider();
select is((select string_agg(distinct c, ' ') from (select pg_temp.envoi(pg_temp.passe(), 1, pg_temp.msg('x'), p_connexion => '197.0.2.1') ->> 'code' c from generate_series(1, 20)) x),
  'enregistree', 'Vingt créations dans l''heure pour une connexion');
insert into p values ('plein', pg_temp.passe());
select is(pg_temp.envoi((select v from p where nom = 'plein'), 1, pg_temp.msg('x'), p_connexion => '197.0.2.1'), '{"code":"trop_d_envois"}'::jsonb, 'La vingt et unième est refusée');
select is((select count(*)::int from prive.public_requests), 20, 'Le refus n''écrit rien');
select is((select n from prive.public_request_counters where bucket = 'E'), 20, 'Le refus d''une connexion ne consomme pas l''ensemble');
select is((select max(n) from prive.public_request_counters where bucket like 'e:%'), 20, 'Ni le compteur d''écritures de cette connexion');
select is(pg_temp.envoi((select v from p where nom = 'plein'), 1, pg_temp.msg('x'), p_connexion => '197.0.2.2') ->> 'code', 'enregistree', 'Une autre connexion passe');
select is(pg_temp.envoi((select v from p where nom = 'plein'), 1, pg_temp.msg('x'), p_connexion => '197.0.2.1') ->> 'code', 'deja_enregistree', 'La répétition identique est confirmée même connexion pleine');
select is(pg_temp.envoi(pg_temp.passe(), 1, pg_temp.msg('x'), '2026-11-24 11:00+00', '197.0.2.1') ->> 'code', 'enregistree', 'L''heure suivante, elle repasse');
select is((select count(*)::int from prive.public_request_counters where bucket ~ '197'), 0, 'Aucune adresse en clair');
select is((select count(*)::int from prive.public_request_salts), 1, 'Un sel par jour');

select pg_temp.vider();
update prive.public_request_settings set daily_creations_max = 5;
select pg_temp.envoi(pg_temp.passe(), 1, pg_temp.msg('x'), '2026-11-24 14:02+00') from generate_series(1, 4);
update p set v = pg_temp.passe() where nom = 'a';
select pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('le cinquième'), '2026-11-24 14:02+00');
select is(pg_temp.envoi(pg_temp.passe(), 1, pg_temp.msg('x'), '2026-11-24 15:00+00', '197.0.2.9'), '{"code":"plafond"}'::jsonb, 'Le plafond du jour : refusé, avec son propre code');
select is((select count(*)::int from prive.public_request_counters where bucket ~ '^[ce]:'), 0, 'Un refus d''ensemble ne consomme pas la connexion');
select is((select count(*)::int from prive.public_request_salts), 0, 'Ni n''écrit un sel');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('le cinquième'), '2026-11-24 15:00+00') ->> 'code', 'deja_enregistree', 'La répétition identique est confirmée malgré le plafond');
select is(pg_temp.envoi((select v from p where nom = 'a'), 2, pg_temp.msg('modifié'), '2026-11-24 15:00+00') ->> 'code', 'mise_a_jour', 'Une modification n''est pas une création : elle passe tant que les écritures le permettent');
select is((select filled_at from prive.public_request_counters where bucket = 'C'), timestamptz '2026-11-24 14:02+00', 'Le moment où le plafond est atteint se lit');
select is((select window_start from prive.public_request_counters where bucket = 'C'), timestamptz '2026-11-23 23:00+00', 'Le jour est celui de Brazzaville');
select is(pg_temp.envoi(pg_temp.passe('2026-11-24 23:30+00'), 1, pg_temp.msg('x'), '2026-11-24 23:30+00') ->> 'code', 'enregistree', 'Le lendemain, à Brazzaville, il repasse');
update prive.public_request_settings set daily_creations_max = 300;

-- L'adresse : rien tant qu'aucun en-tête n'est constaté fiable ---------------------------------------------------------------------------------------

select set_config('request.headers', '{"x-forwarded-for":"197.0.2.7","x-real-ip":"197.0.2.7"}', true);
select is(prive.public_request_connection(), null::inet, 'Sans en-tête constaté fiable, une adresse écrite par le client ne borne rien');
update prive.public_request_settings set trusted_connection_header = 'x-real-ip';
select is(prive.public_request_connection(), '197.0.2.7'::inet, 'Avec un en-tête déclaré fiable, l''adresse se lit');
select set_config('request.headers', '{"x-real-ip":"2001:db8:1:2:3:4:5:6"}', true);
select is(host(prive.public_request_connection()), '2001:db8:1:2::', 'Une adresse IPv6 compte pour son réseau');
select set_config('request.headers', '{"x-real-ip":"::ffff:197.0.2.7"}', true);
select is(prive.public_request_connection(), '197.0.2.7'::inet, 'Une IPv4 notée en IPv6 reste une IPv4');
select set_config('request.headers', '{"x-real-ip":"197.0.2.7, 10.0.0.1"}', true);
select is(prive.public_request_connection(), null::inet, 'Plusieurs adresses dans l''en-tête : douteux, donc inconnu');
select set_config('request.headers', '{"x-real-ip":"999.1.1.1"}', true);
select is(prive.public_request_connection(), null::inet, 'Une adresse impossible : inconnue, sans erreur');
select set_config('request.headers', '', true);
select is(prive.public_request_connection(), null::inet, 'Sans en-têtes : inconnue');
update prive.public_request_settings set trusted_connection_header = null;

-- Le piège, la fiche retirée ------------------------------------------------------------------------------------------------------------------------

select pg_temp.vider();
insert into p values ('piege', pg_temp.envoi(pg_temp.passe(), 1, pg_temp.msg('x'), p_piege => 'http://spam'));
select is((select v ->> 'code' from p where nom = 'piege'), 'enregistree', 'Le piège rempli : la même réponse');
select is((select state || ' ' || spam_since || ' ' || (select count(*) from prive.public_request_notices) from prive.public_requests), 'indesirable ' || timestamptz '2026-11-24 10:00+00' || ' 0',
  'Rangé dans les indésirables, sans annonce');
select is(pg_temp.envoi(pg_temp.passe(), 1, '{"origin":"fiche","reply":"non","campus_id":"d1200000-0000-4000-8000-000000000002","topic":"nom","correction":"x"}', p_kind => 'erreur'),
  '{"code":"ecole_inconnue"}'::jsonb, 'Une fiche qui n''est pas publiée : rien n''est enregistré, la page montre le nom');
update p set v = pg_temp.passe() where nom = 'a';
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, '{"origin":"fiche","reply":"non","campus_id":"d1200000-0000-4000-8000-000000000001","topic":"nom","correction":"x"}', p_kind => 'erreur') ->> 'code',
  'enregistree', 'Une fiche publiée : rattachée');
update public.campuses set publication = 'prete' where id = 'd1200000-0000-4000-8000-000000000001';
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, '{"origin":"fiche","reply":"non","campus_id":"d1200000-0000-4000-8000-000000000001","topic":"nom","correction":"x"}', p_kind => 'erreur') ->> 'code',
  'deja_enregistree', 'Retirée depuis : la répétition identique est confirmée quand même');

-- Le secret renouvelé, ou perdu -----------------------------------------------------------------------------------------------------------------------

select pg_temp.vider();
update p set v = pg_temp.passe('2026-12-02 10:00+00') where nom = 'a';
select prive.renew_public_request_secret('2026-12-02 11:00+00');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('x'), '2026-12-09 09:00+00') ->> 'code', 'enregistree', 'Secret renouvelé : un laissez-passer en cours reste bon ses 7 jours');
update p set v = pg_temp.passe('2026-12-09 12:00+00') where nom = 'a';
select prive.renew_public_request_secret('2026-12-09 13:00+00', p_revoke => true);
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('x'), '2026-12-09 14:00+00') ->> 'code', 'expiree', 'Secret révoqué (restauration) : expirée, jamais une erreur');
delete from prive.public_request_secrets;
select throws_ok($$select prive.issue_public_request_pass_at(now())$$, '55000', null, 'Sans secret, aucun laissez-passer');
select is(pg_temp.envoi((select v from p where nom = 'a'), 1, pg_temp.msg('x'), '2026-12-09 14:00+00') ->> 'code', 'expiree', 'Sans secret, un envoi expire, sans erreur');
select prive.renew_public_request_secret();

-- Les portes publiques, en visiteur ----------------------------------------------------------------------------------------------------------------------

update prive.public_request_settings set daily_creations_max = 300;
set local role anon;
select set_config('request.jwt.claims', '', true);
create function pg_temp.porte(p jsonb, p_rev integer, p_contenu jsonb) returns jsonb language sql as
  $$ select public.send_public_request((p || jsonb_build_object('revision', p_rev, 'kind', 'contact', 'request', p_contenu))::json) $$;
select set_config('test.passe', public.issue_public_request_pass()::text, true);
select is(pg_temp.porte(current_setting('test.passe')::jsonb, 1, pg_temp.msg('par la porte')) ->> 'code', 'enregistree', 'Un visiteur obtient un laissez-passer et envoie');
select is(pg_temp.porte(current_setting('test.passe')::jsonb, 1, pg_temp.msg('par la porte')) ->> 'code', 'deja_enregistree', 'Deux appuis : la même référence');
select is(public.send_public_request('{"key":"x"}'::json) ->> 'code', 'refusee', 'Un corps incomplet : une réponse, pas une erreur');
select is(public.send_public_request('[1,2]'::json), '{"code":"refusee","errors":{"request":"illisible"}}'::jsonb, 'Un corps qui n''est pas un objet');
select is(public.send_public_request('{"kind":"contact","revision":1,"request":{"message":"\u0000"}}'::json), '{"code":"refusee","errors":{"request":"illisible"}}'::jsonb,
  'Un caractère impossible se lit et se refuse ici, sans erreur du serveur');
select is(public.send_public_request(json_build_object('request', repeat('x', 9300))), '{"code":"refusee","errors":{"request":"trop_long"}}'::jsonb, 'Plus de 8 Ko : refusé avant d''être lu');
reset role;

-- Une contrainte violée ne recopie jamais la ligne : ni la réponse, ni l'erreur
alter table prive.public_request_versions add constraint essai_toujours_fausse check (content ->> 'message' is distinct from 'SECRETTEMOIN');
set local role anon;
select is(pg_temp.porte(public.issue_public_request_pass(), 1, pg_temp.msg('SECRETTEMOIN')), '{"code":"refusee","errors":{"request":"illisible"}}'::jsonb,
  'Une contrainte violée dans l''écriture : réponse neutre, sans aucune valeur');
reset role;
select is((select count(*)::int from prive.public_requests q join prive.public_request_versions v on v.request_id = q.id where v.content ->> 'message' = 'SECRETTEMOIN'), 0, 'Et rien n''est écrit');

select * from finish();
rollback;
