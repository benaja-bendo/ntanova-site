-- Les séries et les filières que le relais coche sur place (audit de la fiche relais, 08/11/2026) : la colonne, ses bornes,
-- le droit d'écrire, ce que le relais relit de lui-même, et ce que les autres ne voient pas. Rien ne se publie ici :
-- l'acceptation, qui écrit `campus_programs`, reste un geste de l'administration.

begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-fv-a', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-fv-b', 'Bastien');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Tié-Tié'));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- Alice envoie un relevé avec ce qu'elle a coché, et un autre à l'ancienne (sans la colonne) -----------------------------------------------------

select lives_ok($$insert into public.field_submissions (id, taken_at, sign_name, levels, observed_formations)
    values ('71000000-0000-4000-8000-000000000001', now(), '[Lycée d''Alice]', '{lycee,superieur}',
      '[{"cycle":"lycee","titre":"Série C","serie":"c","diplome":"bac","domaine":null},
        {"cycle":"superieur","titre":"BTS Gestion","serie":null,"diplome":"bts","domaine":"gestion"}]')$$,
  'Un relais actif envoie ce qu''il a coché');
select lives_ok($$insert into public.field_submissions (id, taken_at, sign_name)
    values ('71000000-0000-4000-8000-000000000002', now(), '[Relevé à l''ancienne]')$$,
  'Un téléphone d''avant n''envoie pas la colonne : le relevé reste valable');
select is((select observed_formations::text from public.my_submissions() where id = '71000000-0000-4000-8000-000000000002'), '[]',
  'Sans rien coché, la valeur par défaut est une liste vide');

-- Les bornes : une liste, de taille raisonnable ---------------------------------------------------------------------------------------------------

select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name, observed_formations)
    values ('71000000-0000-4000-8000-000000000003', now(), 'x', '{"cycle":"lycee"}')$$,
  '23514', null, 'Une valeur qui n''est pas une liste est refusée');
select throws_ok($$insert into public.field_submissions (id, taken_at, sign_name, observed_formations)
    values ('71000000-0000-4000-8000-000000000004', now(), 'x',
      (select jsonb_agg(jsonb_build_object('cycle', 'superieur', 'titre', 'Filière ' || n)) from generate_series(1, 81) n))$$,
  '23514', null, 'Plus de quatre-vingts formations dans un relevé sont refusées');

-- Ce qu'Alice relit de ses fiches, et ce que Bastien n'en voit pas -------------------------------------------------------------------------------

select is((select jsonb_array_length(observed_formations) from public.my_submissions() where id = '71000000-0000-4000-8000-000000000001'), 2,
  'Alice relit ses deux formations cochées : corriger une fiche, c''est la retrouver cochée');
select is((select observed_formations -> 1 ->> 'titre' from public.my_submissions() where id = '71000000-0000-4000-8000-000000000001'), 'BTS Gestion',
  'Elles sont rendues telles qu''elles ont été envoyées');

select throws_ok($$update public.field_submissions set observed_formations = '[]' where id = '71000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'Le relais n''a pas le droit de les modifier une fois envoyées (rien n''est réécrit après coup)');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
select is((select count(*)::int from public.my_submissions() where id = '71000000-0000-4000-8000-000000000001'), 0,
  'Bastien ne relit pas les fiches d''Alice');

reset role;
select ok(not has_column_privilege('anon', 'public.field_submissions', 'observed_formations', 'select'),
  'Un visiteur ne lit jamais les formations d''un relevé');

select * from finish();
rollback;
