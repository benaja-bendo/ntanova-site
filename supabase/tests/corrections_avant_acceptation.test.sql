-- L’acceptation et les valeurs relues forment une seule décision ; l’original reste une preuve du terrain.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
set local role authenticated;
insert into public.field_submissions(id, kind, taken_at, position, sign_name, levels, school_kind, landmark)
values ('5a000000-0000-4000-8000-000000000001', 'releve', now() - interval '1 day', 'SRID=4326;POINT(0 0)', '[École mal écrite]', '{primaire}', 'privee', 'Ancien repère'),
       ('5a000000-0000-4000-8000-000000000002', 'releve', now() - interval '1 day', 'SRID=4326;POINT(0 0)', '[Deuxième école]', '{primaire}', 'privee', null);
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000001', p_changes => '{"sign_name":"[Correction interdite]"}')$$,
  '42501', null, 'Un relais ne peut pas accepter avec des corrections');
select is((select count(*)::int from public.submission_reviews), 0, 'Un relais ne voit aucune révision');
reset role;
update public.field_submissions set position = extensions.st_setsrid(extensions.st_makepoint(11.93, -4.80), 4326)
where id in ('5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000001',
  p_changes => '{"sign_name":"[École corrigée]","school_kind":"publique","levels":["college"],"curriculum_note":"Bilingue","landmark":null,"sign_phone":"242061234567"}')$$,
  'Les valeurs corrigées sont acceptées ensemble');
select is((select i.name || '|' || i.kind from public.institutions i join public.campuses c on c.institution_id = i.id
  join public.field_submissions s on s.campus_id = c.id where s.id = '5a000000-0000-4000-8000-000000000001'),
  '[École corrigée]|publique', 'Nom et type retenus pour la nouvelle institution');
select ok((select c.publication = 'prete' and c.landmark is null and c.sign_phone = '242061234567' and c.curriculum_note = 'Bilingue'
  from public.campuses c join public.field_submissions s on s.campus_id = c.id where s.id = '5a000000-0000-4000-8000-000000000001'),
  'Les valeurs facultatives sont corrigées ou effacées, sans publication');
select is((select string_agg(cc.cycle, ',') from public.campus_cycles cc join public.field_submissions s on s.campus_id = cc.campus_id
  where s.id = '5a000000-0000-4000-8000-000000000001'), 'college', 'Le niveau coché à tort n’est pas retenu');
select is((select sign_name || '|' || levels[1] || '|' || landmark from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001'),
  '[École mal écrite]|primaire|Ancien repère', 'Le relevé original reste intact');
select ok((select reviewed_by = public.current_user_id() and reviewed_at = now() and changes ->> 'sign_name' = '[École corrigée]'
  from public.submission_reviews where submission_id = '5a000000-0000-4000-8000-000000000001'), 'La révision garde l’auteur, la date serveur et les valeurs');
select lives_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000001', p_changes => '{"sign_name":"[Autre nom]"}')$$,
  'Une répétition de l’acceptation reste idempotente');
select is((select changes ->> 'sign_name' from public.submission_reviews where submission_id = '5a000000-0000-4000-8000-000000000001'),
  '[École corrigée]', 'Une répétition ne remplace pas la trace de la décision');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000002', p_changes => '{"keep":["landmark"]}')$$,
  '22023', null, 'On ne garde des valeurs actuelles qu’en complétant une fiche existante');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000002', p_programs => '[{"cycle":"lycee","title":"Série C"}]', p_changes => '{"levels":["college"]}')$$,
  '22023', null, 'Une formation d’un niveau retiré n’est pas ajoutée en cachette');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000002', p_changes => '{"sign_name":"  "}')$$,
  '22023', null, 'Un nom vide est refusé');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000002', p_changes => '{"position":null}')$$,
  '22023', null, 'Une correction ne peut pas inventer ou retirer la position');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000002', p_changes => '{"school_kind":"inconnu"}')$$,
  '23514', null, 'Les domaines SQL protègent aussi les valeurs corrigées');
select ok((select status = 'a_valider' and campus_id is null from public.field_submissions where id = '5a000000-0000-4000-8000-000000000002'),
  'Un échec ne crée ni école ni décision');
select is((select count(*)::int from public.submission_reviews), 1, 'Un échec n’écrit aucune révision');
select throws_ok($$update public.submission_reviews set reviewed_at = now()$$, '42501', null, 'La trace de la décision ne se réécrit pas');
reset role;
set local role anon;
select throws_ok($$select * from public.submission_reviews$$, '42501', null, 'Les révisions ne sont pas publiques');
reset role;

-- Ticket 236 (27/11) : corriger aussi un nouveau site et une fiche complétée ; l'e-mail lu sur l'enseigne reste privé.
update public.campuses set landmark = 'Repère déjà publié', sign_phone = '242060000001'
where id = (select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001');
insert into public.field_submissions(id, relay_id, kind, taken_at, position, sign_name, levels, school_kind, landmark, sign_phone, acronym, duplicate_of_campus_id)
select '5a000000-0000-4000-8000-000000000003', relay_id, 'contre_visite', now(), extensions.st_setsrid(extensions.st_makepoint(11.9302, -4.8002), 4326),
       '[Nom relevé]', '{primaire}', 'confessionnelle', 'Repère du relais', '242060000002', 'ERP', campus_id
from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001';
insert into public.field_submissions(id, relay_id, kind, taken_at, position, sign_name, levels, school_kind, landmark, acronym)
select '5a000000-0000-4000-8000-000000000004', relay_id, 'releve', now(), extensions.st_setsrid(extensions.st_makepoint(11.95, -4.81), 4326),
       '[Nom relevé du site]', '{maternelle}', 'privee', 'Repère relevé', 'ERP2'
from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000003', p_mode => 'update_campus',
  p_campus => (select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001'),
  p_changes => '{"keep":["latitude"]}')$$, '22023', null, 'Une valeur à garder inconnue est refusée');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000003', p_mode => 'update_campus',
  p_campus => (select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001'),
  p_changes => '{"sign_email":"adresse sans arobase"}')$$, '22023', null, 'Un e-mail incomplet est refusé, et rien ne s’écrit');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000003', p_mode => 'update_campus',
  p_campus => (select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001'),
  p_changes => '{"founded_year":2999}')$$, '22023', null, 'Une année à venir est refusée');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000003', p_mode => 'add_cycle',
  p_campus => (select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001'),
  p_changes => '{"landmark":"[Autre]"}')$$, '22023', null, 'Ajouter des niveaux ne corrige rien');
select lives_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000003', p_mode => 'update_campus',
  p_campus => (select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000001'), p_label => 'Site du marché',
  p_changes => '{"keep":["sign_name","school_kind","levels","landmark","position"],"founded_year":2001,"sign_email":"Direction@exemple.cg","curriculum_note":"Corrigé par l’administration"}')$$,
  'Compléter une fiche, en gardant des valeurs et en corrigeant d’autres');
select is((select concat_ws('|', i.name, i.kind, i.founded_year, i.acronym, k.label, k.landmark, k.sign_phone, k.curriculum_note,
    round(extensions.st_x(k.position)::numeric, 4), (select string_agg(cc.cycle, ',') from public.campus_cycles cc where cc.campus_id = k.id))
  from public.campuses k join public.institutions i on i.id = k.institution_id
  join public.field_submissions s on s.campus_id = k.id where s.id = '5a000000-0000-4000-8000-000000000003'),
  '[École corrigée]|publique|2001|ERP|Site du marché|Repère déjà publié|242060000002|Corrigé par l’administration|11.9300|college',
  'Gardés : nom, type, niveaux, repère, position. Repris : numéro, programme corrigé ; ajoutés : année, sigle, nom du site');
select is((select count(*)::int from public.contacts_of_campus((select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000003'))
  where kind = 'email_ecole' and email = 'Direction@exemple.cg' and read_on = 'enseigne' and whatsapp is null), 1,
  'L’e-mail devient un contact privé du site');
select is((select count(*)::int from public.submission_reviews where submission_id = '5a000000-0000-4000-8000-000000000003'
  and changes ? 'keep' and not changes ? 'sign_email'), 1, 'La trace de la décision garde les choix, jamais l’e-mail');
select is(public.add_school_email((select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000003'),
  'direction@exemple.cg', 'facebook'), (select id from public.contacts_of_campus((select campus_id from public.field_submissions where id = '5a000000-0000-4000-8000-000000000003')) where kind = 'email_ecole'),
  'La même adresse ne se note pas deux fois');
select throws_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000004', p_mode => 'new_campus',
  p_institution => (select k.institution_id from public.campuses k join public.field_submissions s on s.campus_id = k.id where s.id = '5a000000-0000-4000-8000-000000000001'),
  p_changes => '{"sign_name":"[Autre]"}')$$, '22023', null, 'Un nouveau site ne change pas le nom de l’école');
select lives_ok($$select public.accept_reviewed_submission('5a000000-0000-4000-8000-000000000004', p_mode => 'new_campus', p_label => 'Site du lac',
  p_institution => (select k.institution_id from public.campuses k join public.field_submissions s on s.campus_id = k.id where s.id = '5a000000-0000-4000-8000-000000000001'),
  p_changes => '{"landmark":"Repère corrigé","levels":["maternelle","primaire"],"founded_year":1999}')$$,
  'Un nouveau site se corrige avant d’être accepté');
select is((select concat_ws('|', i.name, i.founded_year, i.acronym, k.label, k.landmark, (select count(*) from public.campus_cycles cc where cc.campus_id = k.id))
  from public.campuses k join public.institutions i on i.id = k.institution_id
  join public.field_submissions s on s.campus_id = k.id where s.id = '5a000000-0000-4000-8000-000000000004'),
  '[École corrigée]|2001|ERP|Site du lac|Repère corrigé|2',
  'Le site prend ses corrections ; l’année et le sigle déjà connus de l’école restent');
reset role;
set local role anon;
select throws_ok($$select * from public.contacts_of_campus('5a000000-0000-4000-8000-000000000001')$$, '42501', null,
  'L’e-mail d’une école ne se lit pas sans être administrateur');
select throws_ok($$select public.add_school_email('5a000000-0000-4000-8000-000000000001', 'a@exemple.cg', 'enseigne')$$, '42501', null,
  'Le public n’écrit aucun contact');
reset role;
select * from finish();
rollback;
