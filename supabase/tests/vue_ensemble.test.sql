-- La « Vue d'ensemble » de l'administration (ticket #76) : `admin_overview()` rend, en un appel, où en est le relevé.
-- Administration seule, lecture seule, aucun seuil ; les relevés d'essai comptés à part ; les jours à l'heure de
-- Pointe-Noire. Les écoles par zone viennent de `divisions()`, pas d'ici.

begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

-- Mise en place -------------------------------------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where essai));

create function pg_temp.envoyer(p_relais uuid, p_id uuid, p_nom text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_relais, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.field_submissions (id, kind, taken_at, position, sign_name, levels, school_kind, landmark)
  values (p_id, 'releve', now() - interval '1 day', 'SRID=4326;POINT(0 0)'::extensions.geometry, p_nom, '{primaire}'::public.niveau[],
          'non_indique', 'Près du marché');
  reset role;
end $$;

-- Qui peut la lire ----------------------------------------------------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.admin_overview()$$, '42501', 'Réservé à l''administration.', 'Un relais ne lit pas la vue d''ensemble');
reset role;
set local role anon;
select throws_ok($$select public.admin_overview()$$, '42501', null, 'Un visiteur non plus');
reset role;
select is((select provolatile::text from pg_proc where proname = 'admin_overview'), 's', 'Elle ne fait que lire (stable)');

-- Le relevé vide ------------------------------------------------------------------------------------------------------------------------

select is((public.admin_overview()->'to_review'->>'count')::integer, 0, 'Rien à valider au départ');
select is(public.admin_overview()->'to_review'->'oldest_received_at', 'null'::jsonb, 'Pas de plus ancienne fiche quand la file est vide');
select is(jsonb_array_length(public.admin_overview()->'received_per_day'), 14, 'Quatorze jours par défaut, les jours sans relevé compris');
select is(jsonb_array_length(public.admin_overview(500)->'received_per_day'), 90, 'Au plus 90 jours');
select is(jsonb_array_length(public.admin_overview(0)->'received_per_day'), 1, 'Au moins un jour');

-- Trois fiches : deux d'Alice (lot ordinaire), une de Bastien (lot d'essai) -------------------------------------------------

select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '76000000-0000-4000-8000-000000000001', 'École [Une]');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000a1', '76000000-0000-4000-8000-000000000002', 'École [Deux]');
select pg_temp.envoyer('00000000-0000-4000-8000-0000000000b1', '76000000-0000-4000-8000-000000000003', 'École [Essai]');
-- La première attend depuis 30 heures : au-delà de la promesse faite aux relais.
update public.field_submissions set received_at = now() - interval '30 hours' where id = '76000000-0000-4000-8000-000000000001';

select is((public.admin_overview()->'to_review'->>'count')::integer, 3, 'Trois fiches à valider');
select is((public.admin_overview()->'to_review'->>'over_24h')::integer, 1, 'Une attend depuis plus de 24 heures');
select is((public.admin_overview()->'to_review'->>'oldest_received_at')::timestamptz,
  (select received_at from public.field_submissions where id = '76000000-0000-4000-8000-000000000001'),
  'La plus ancienne est celle de 30 heures');
select is((select sum((e->>'total')::integer)::integer from jsonb_array_elements(public.admin_overview()->'received_per_day') e), 3,
  'Les trois fiches sont comptées dans les jours');
select is((select sum((e->>'trial')::integer)::integer from jsonb_array_elements(public.admin_overview()->'received_per_day') e), 1,
  'Dont une du lot d''essai, à part');
select is((public.admin_overview()->'received_per_day'->-1->>'day')::date, (now() at time zone 'Africa/Brazzaville')::date,
  'Le dernier jour est aujourd''hui, à l''heure de Pointe-Noire');

-- Le délai de décision ---------------------------------------------------------------------------------------------------------------------

update public.field_submissions set received_at = now() - interval '3 hours' where id = '76000000-0000-4000-8000-000000000003';
select public.request_correction('76000000-0000-4000-8000-000000000003', 'photo_floue');
select is((public.admin_overview()->'decisions'->>'count')::integer, 1, 'Une décision rendue');
select is((public.admin_overview()->'decisions'->>'average_hours')::numeric, 3.0, 'Trois heures entre la réception et la décision');

-- La qualité : la photo de l'enseigne, les contacts confirmés ----------------------------------------------------------------------------

insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
values ('76100000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'signboard',
        '76000000-0000-4000-8000-000000000001/76100000-0000-4000-8000-000000000001.webp', 'image/webp', 1000);
select is((public.admin_overview()->'signboard'->>'with_photo')::integer, 1, 'Une fiche sur trois est arrivée avec la photo de l''enseigne');
select is((public.admin_overview()->'signboard'->>'total')::integer, 3, 'Sur trois nouvelles fiches');

update public.field_submissions set contact_confirmed_at = now() where id = '76000000-0000-4000-8000-000000000001';
update public.field_submissions set contact_confirmed_at = now() - interval '10 days' where id = '76000000-0000-4000-8000-000000000002';
select is((public.admin_overview()->'contacts'->>'confirmed_total')::integer, 2, 'Deux contacts confirmés en tout');
select is((public.admin_overview()->'contacts'->>'confirmed_7d')::integer, 1, 'Dont un cette semaine');

-- Les relais ---------------------------------------------------------------------------------------------------------------

select is(public.admin_overview()->'relays', '{"active": 2, "pending": 1, "suspended": 0, "sent_this_week": 2}'::jsonb,
  'Deux relais actifs, un compte en attente, deux relais ont envoyé une fiche cette semaine');

select * from finish();
rollback;
