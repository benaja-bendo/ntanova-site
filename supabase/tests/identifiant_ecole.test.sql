-- Ticket 147 : l'identifiant NTanova d'une implantation (six chiffres, tiré par la base, jamais changé, jamais réutilisé)
-- et les anciennes adresses d'une fiche (renvois depuis un lien déjà partagé).

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into public.institutions (id, name) values ('74000000-0000-4000-8000-000000000001', '[École identifiant]');
insert into public.campuses (id, institution_id, slug, division_id, origin, public_number)
values ('75000000-0000-4000-8000-000000000001', '74000000-0000-4000-8000-000000000001', 'ecole-identifiant',
        (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'admin', 111111);

select ok((select public_number between 100000 and 999999 from public.campuses
           where id = '75000000-0000-4000-8000-000000000001'),
  'Une nouvelle implantation reçoit six chiffres');
select ok((select public_number <> 111111 or exists (select 1 from public.campus_public_numbers where number = 111111)
           from public.campuses where id = '75000000-0000-4000-8000-000000000001'),
  'Un numéro proposé à l''insertion est ignoré : la base le tire');
select ok((select exists (select 1 from public.campus_public_numbers n join public.campuses c on c.public_number = n.number
           where c.id = '75000000-0000-4000-8000-000000000001')),
  'Le numéro tiré est inscrit au registre');
select is((select count(*) from public.campuses where public_number is null), 0::bigint,
  'Aucune implantation sans numéro');
select col_is_unique('public', 'campuses', 'public_number', 'Deux implantations n''ont jamais le même numéro');

select throws_ok($$update public.campuses set public_number = public_number + 1
  where id = '75000000-0000-4000-8000-000000000001'$$,
  '22023', null, 'Le numéro ne change jamais');

-- Effacer une école ne libère pas son numéro.
create temporary table numero_efface on commit drop as
select public_number as n from public.campuses where id = '75000000-0000-4000-8000-000000000001';
delete from public.campuses where id = '75000000-0000-4000-8000-000000000001';
select ok(exists (select 1 from public.campus_public_numbers where number = (select n from numero_efface)),
  'Le numéro d''une école effacée reste au registre : il ne sera pas tiré de nouveau');

-- Une fiche renommée garde son ancienne adresse.
insert into public.campuses (id, institution_id, slug, division_id, origin, publication)
values ('75000000-0000-4000-8000-000000000002', '74000000-0000-4000-8000-000000000001', 'ancien-nom',
        (select id from public.geo_divisions where path::text = 'congo.pointe_noire.pointe_noire.tie_tie'), 'admin',
        'publiee');
update public.campuses set slug = 'nouveau-nom' where id = '75000000-0000-4000-8000-000000000002';
select is((select former_slug from public.public_campus_former_addresses
           where public_number = (select public_number from public.campuses
                                  where id = '75000000-0000-4000-8000-000000000002')),
  'ancien-nom', 'Le renommage garde l''ancienne adresse');
select is((select former_division_path from public.public_campus_former_addresses
           where former_slug = 'ancien-nom'),
  'congo.pointe_noire.pointe_noire.tie_tie', 'Avec sa division d''alors');
update public.campuses set neighbourhood = '[Quartier]' where id = '75000000-0000-4000-8000-000000000002';
select is((select count(*) from public.public_campus_former_addresses where former_slug in ('ancien-nom', 'nouveau-nom')),
  1::bigint, 'Une modification qui ne touche pas l''adresse n''ajoute rien');

-- Les vues publiques : le numéro de la fiche, rien du registre.
set local role anon;
select ok((select public_number is not null from public.public_campuses
           where id = '75000000-0000-4000-8000-000000000002'),
  'La fiche publique donne son numéro');
select throws_ok($$select * from public.campus_public_numbers$$, '42501', null,
  'Le registre des numéros reste fermé au public');
reset role;

select * from finish();
rollback;
