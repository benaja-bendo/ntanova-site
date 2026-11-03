-- L'administration reconnaît un compte en attente (ticket #78) : l'adresse de connexion du relais est gardée dans la
-- partie privée, lisible par l'administration seule. Un relais ne lit jamais une adresse, pas même la sienne ; un appel
-- sans adresse (l'ancien) marche toujours.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- Mise en place -------------------------------------------------------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice', '  Alice@Exemple.TEST ');
select public.register_relay('00000000-0000-4000-8000-0000000000b1', 'google-b1', 'Bastien');
select public.register_relay('00000000-0000-4000-8000-0000000000c1', 'google-c1', 'Chloé', '   ');
select public.register_relay('00000000-0000-4000-8000-0000000000d1', 'google-d1', 'Dominique', 'd@exemple.test');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');

-- Ce qui est gardé ----------------------------------------------------------------------------------------------------------------------

select is((select email from prive.relay_identity where relay_id = '00000000-0000-4000-8000-0000000000a1'), 'alice@exemple.test',
  'L''adresse est gardée, sans espaces ni majuscules');
select is((select count(*)::integer from prive.relay_identity where relay_id = '00000000-0000-4000-8000-0000000000b1'), 0,
  'L''ancien appel, sans adresse, marche toujours : rien n''est gardé');
select is((select count(*)::integer from prive.relay_identity where relay_id = '00000000-0000-4000-8000-0000000000c1'), 0,
  'Une adresse vide n''est pas gardée');
select is((select statut from public.relais where id = '00000000-0000-4000-8000-0000000000b1'), 'en_attente',
  'Un relais inscrit reste en attente, avec ou sans adresse');

select public.register_relay('00000000-0000-4000-8000-0000000000a1', 'google-a1', 'Alice', 'alice2@exemple.test');
select is((select email from prive.relay_identity where relay_id = '00000000-0000-4000-8000-0000000000a1'), 'alice2@exemple.test',
  'Une nouvelle connexion met l''adresse à jour');
select is((select prenom from public.relais where id = '00000000-0000-4000-8000-0000000000a1'), 'Alice',
  'et ne touche pas au relais déjà inscrit');

-- Qui peut la lire ----------------------------------------------------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select * from prive.relay_identity$$, '42501', null, 'Un relais ne lit pas la table privée, pas même sa propre adresse');
select throws_ok($$select * from public.relay_identities()$$, '42501', 'Réservé à l''administration.', 'Ni par la fonction de l''administration');
reset role;
set local role anon;
select throws_ok($$select * from public.relay_identities()$$, '42501', null, 'Un visiteur non plus');
reset role;
set local role anon;
select throws_ok($$select public.register_relay('00000000-0000-4000-8000-0000000000f1', 'x', 'Intrus', 'intrus@exemple.test')$$, '42501', null,
  'Personne ne s''inscrit lui-même par l''API : seul le serveur d''identité appelle register_relay');
reset role;

-- L'administration -------------------------------------------------------------------------------------------------------------------

select is((select count(*)::integer from public.relay_identities()), 2, 'L''administration lit les adresses gardées');
select is((select email from public.relay_identities() where relay_id = '00000000-0000-4000-8000-0000000000d1'), 'd@exemple.test',
  'Chacune avec son relais');

select * from finish();
rollback;
