-- M1 (20261113100000) : la mission porte sa tâche, sa date et son montant ; elle se paie une fois, au relais qui l'avait ;
-- « Je n'ai pas pu » ferme sans paie, avec son motif ; la prime de contact vaut 0 à partir du 13/11, l'ancien tarif reste.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-pm-admin', '[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-pm-a', '[Alice]');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-pm-b', '[Bastien]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Tié-Tié'));
insert into public.institutions(id, name) values ('e1000000-0000-4000-8000-000000000001', '[École mission]'),
                                                 ('e1000000-0000-4000-8000-000000000002', '[École sans paie]');
insert into public.campuses(id, institution_id, slug, division_id, publication, origin)
select x.id, x.inst, x.slug, d.id, 'prete', 'admin'
from (values ('e2000000-0000-4000-8000-000000000001'::uuid, 'e1000000-0000-4000-8000-000000000001'::uuid, 'ecole-mission'),
             ('e2000000-0000-4000-8000-000000000002'::uuid, 'e1000000-0000-4000-8000-000000000002'::uuid, 'ecole-sans-paie')) x(id, inst, slug)
cross join (select id from public.geo_divisions where level = 3 limit 1) d;

-- Les tarifs ----------------------------------------------------------------------------------------------------------------------------------
select is((select per_contact_xaf from public.payout_rates where valid_from = '2026-11-13'), 0, 'Le tarif du 13/11 met la prime de contact à 0');
select is((select per_contact_xaf from public.payout_rates where valid_from = '2026-11-01'), 300, 'Le tarif du 01/11 reste tel quel');
select is((select per_submission_xaf from public.payout_rates where valid_from = '2026-11-13'), 500, 'La fiche acceptée vaut toujours 500 FCFA');

-- Confier : l'ancien appel marche, le nouveau porte tout -------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select lives_ok($$select public.assign_mission('e2000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', 'verify', null)$$,
  'L''ancien appel à quatre paramètres marche toujours');
select throws_ok($$select public.assign_mission('e2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'complete',
    null, 1000, '2020-01-01', 'Photographier le prospectus', null)$$, '22023', null, 'Une date limite passée est refusée');
select lives_ok($$select public.assign_mission('e2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'complete',
    null, 1000, (now() + interval '7 days')::date, 'Photographier le prospectus des frais, en entier.', 'La ligne de la 3e était illisible.')$$,
  'Une mission avec sa tâche, sa raison, sa date et son montant');
select throws_ok($$select public.assign_mission('e2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', 'complete',
    null, -5, null, null, null)$$, '23514', null, 'Un montant négatif est refusé');

-- Ce qu'Alice lit -----------------------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select pay_xaf from public.my_missions()), 1000, 'Alice lit le montant de sa mission');
select is((select task from public.my_missions()), 'Photographier le prospectus des frais, en entier.', 'Et ce qu''il faut faire');
select throws_ok($$select public.mission_not_done((select id from public.missions where relay_id = '00000000-0000-4000-8000-0000000000b1'), 'ferme')$$,
  'P0002', null, 'Alice ne ferme pas la mission de Bastien');

-- Bastien n'a pas pu : la mission se ferme sans paie, avec son motif -------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select throws_ok($$select public.mission_not_done((select mission_id from public.my_missions()), 'autre')$$, '22023', null,
  '« Autre » sans précision est refusé');
select lives_ok($$select public.mission_not_done((select mission_id from public.my_missions()), 'ferme', null)$$, '« Fermé » ferme la mission');
reset role;
select is((select status::text || '/' || not_done_reason::text from public.missions where campus_id = 'e2000000-0000-4000-8000-000000000002'),
  'not_done/ferme', 'Le motif est gardé');

-- Alice fait sa mission : la fiche acceptée ferme la mission, qui se paie 1 000 FCFA à la place des 500 ------------------------------------------------
-- (Le serveur réécrit l'auteur et l'état d'un relevé envoyé avec un jeton : on écrit ici sans jeton, comme l'administration le ferait.)
select set_config('request.jwt.claims', '', true);
insert into public.field_submissions(id, relay_id, taken_at, sign_name, status, campus_id, decided_at, payable)
values ('e3000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', now(), '[École mission]', 'accepte',
        'e2000000-0000-4000-8000-000000000001', now() - interval '1 hour', true);
update public.missions set status = 'done', closed_at = now(), closed_by_submission_id = 'e3000000-0000-4000-8000-000000000001'
where campus_id = 'e2000000-0000-4000-8000-000000000001' and status = 'open';
select is((select string_agg(kind || ':' || amount_xaf, ',' order by kind) from prive.payable_items_for((now() + interval '7 days')::date)
           where relay_id = '00000000-0000-4000-8000-0000000000a1'),
  'mission:1000', 'La mission se paie à son montant, et sa fiche ne se paie pas une seconde fois');
select is((select count(*)::int from prive.payable_items_for((now() + interval '7 days')::date) where relay_id = '00000000-0000-4000-8000-0000000000b1'),
  0, 'La mission « je n''ai pas pu » ne se paie pas');

-- La prime de contact : rien après le 13/11 -----------------------------------------------------------------------------------------------------------
update public.field_submissions set contact_confirmed_at = now() - interval '1 hour', contact_role = 'directeur'
where id = 'e3000000-0000-4000-8000-000000000001';
select is((select count(*)::int from prive.payable_items_for((now() + interval '7 days')::date) where kind = 'contact'), 0,
  'Un contact confirmé après le 13/11 ne crée aucune ligne de paie');

-- La paie du relais et de l'administration comptent les missions -----------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
select is((select missions || '/' || total_xaf from public.my_payout((now() + interval '7 days')::date) where state = 'acquis'), '1/1000',
  'Alice lit une mission et 1 000 FCFA');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}', true);
select is((select missions from public.payout_preview((now() + interval '7 days')::date) where relay_id = '00000000-0000-4000-8000-0000000000a1'), 1,
  'L''administration voit la mission dans l''aperçu de la paie');
reset role;
-- Clore la semaine écrit la ligne de mission, une fois.
select lives_ok($$select public.close_payout_week(((now() at time zone 'Africa/Brazzaville')::date
  + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7))::date)$$, 'La semaine se clôt');
select is((select count(*)::int from public.payout_lines where kind = 'mission' and relay_id = '00000000-0000-4000-8000-0000000000a1'), 1,
  'Une ligne de mission, une seule');

select * from finish();
rollback;
