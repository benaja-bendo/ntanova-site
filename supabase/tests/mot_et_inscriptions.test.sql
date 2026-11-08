begin;
create extension if not exists pgtap with schema extensions;
select plan(42);
select public.register_relay('00000000-0000-4000-8000-0000000000d1','google-mot-admin','[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1','google-mot-relais','[Relais]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
insert into public.institutions(id,name,kind) values
  ('85000000-0000-4000-8000-000000000001','[École mot]','privee'),
  ('85000000-0000-4000-8000-000000000002','[École gardée]','privee');
insert into public.campuses(id,institution_id,slug,division_id,origin,publication)
select v.id::uuid,v.inst::uuid,v.slug,d.id,'admin','brouillon'
from (values
  ('86000000-0000-4000-8000-000000000001','85000000-0000-4000-8000-000000000001','ecole-mot'),
  ('86000000-0000-4000-8000-000000000002','85000000-0000-4000-8000-000000000002','ecole-gardee')
) v(id,inst,slug), (select id from public.geo_divisions where level=3 limit 1) d;

create function pg_temp.mot(
  p_body text default 'Nous formons aux métiers de la gestion.', p_date date default current_date,
  p_role public.fonction_direction default 'directeur', p_canal text default 'whatsapp'
) returns void language sql as $$
  select public.set_campus_statement('86000000-0000-4000-8000-000000000001',p_body,p_date,p_role,p_canal);
$$;
create function pg_temp.limite(
  p_id uuid default null, p_annee text default '2026-2027', p_limite date default current_date+30, p_declaree date default current_date
) returns uuid language sql as $$
  select public.set_campus_enrollment_deadline('86000000-0000-4000-8000-000000000001',p_id,p_annee,p_limite,p_declaree);
$$;
create temporary table lignes(id uuid);
grant all on lignes to authenticated;

set local role anon;
select throws_ok($$select pg_temp.mot()$$,'42501',null,'Un visiteur n’écrit pas de mot');
select throws_ok($$select pg_temp.limite()$$,'42501',null,'Un visiteur n’écrit pas de date');
select throws_ok($$select public.remove_campus_enrollment_deadline('86000000-0000-4000-8000-000000000001',gen_random_uuid())$$,'42501',null,'Un visiteur ne retire pas de date');
select throws_ok($$select * from public.campus_statements$$,'42501',null,'Un visiteur ne lit pas la table des mots');
select throws_ok($$select * from prive.campus_statement_agreements$$,'42501',null,'L’accord reste privé');
select throws_ok($$select * from prive.campus_enrollment_history$$,'42501',null,'L’historique des dates reste privé');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
select throws_ok($$select pg_temp.mot()$$,'42501',null,'Un relais n’écrit pas de mot');
select throws_ok($$select pg_temp.limite()$$,'42501',null,'Un relais n’écrit pas de date');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select throws_ok($$select pg_temp.mot(repeat('a',401))$$,'22023',null,'Pas plus de 400 caractères');
select throws_ok($$select pg_temp.mot('Un mot',null)$$,'22023',null,'La date du mot est obligatoire');
select throws_ok($$select pg_temp.mot('Un mot',current_date+2)$$,'22023',null,'Pas de mot daté du futur');
select throws_ok($$select pg_temp.mot('Un mot',current_date,null)$$,'22023',null,'La fonction de l’accord est obligatoire');
select throws_ok($$select pg_temp.mot('Un mot',current_date,'directeur','pigeon')$$,'22023',null,'Le canal reste dans la liste');
select throws_ok($$select pg_temp.mot('   ',current_date)$$,'22023',null,'Un mot vide n’est pas un retrait avec une date');
select throws_ok($$select pg_temp.mot(null,null,null,null)$$,'P0002',null,'Rien à retirer : refusé');
select throws_ok($$insert into public.campus_statements(campus_id,body,stated_on) values ('86000000-0000-4000-8000-000000000001','x',current_date)$$,'42501',null,'Pas d’écriture directe du mot');
select lives_ok($$select pg_temp.mot()$$,'L’administration enregistre le mot');
select lives_ok($$select pg_temp.mot('Un autre mot, relu par la direction.')$$,'Une seconde saisie remplace la première');
select is((select body from public.campus_statements),'Un autre mot, relu par la direction.','Une seule ligne par école');
select throws_ok($$select pg_temp.limite(null,'  ')$$,'22023',null,'L’année scolaire est obligatoire');
select throws_ok($$select pg_temp.limite(null,'2026-2027',null)$$,'22023',null,'La date limite est obligatoire');
select throws_ok($$select pg_temp.limite(null,'2026-2027',current_date+3,current_date+5)$$,'22023',null,'Pas de déclaration datée du futur');
select throws_ok($$select pg_temp.limite(null,'2026-2027',current_date-5,current_date-1)$$,'22023',null,'La limite ne précède pas la déclaration');
select throws_ok($$select pg_temp.limite(gen_random_uuid())$$,'P0002',null,'Modification d’une ligne inconnue refusée');
select throws_ok($$insert into public.campus_enrollment_deadlines(campus_id,school_year,deadline,declared_on) values ('86000000-0000-4000-8000-000000000001','x',current_date,current_date)$$,'42501',null,'Pas d’écriture directe de la date');
insert into lignes select pg_temp.limite();
select is((select count(*)::int from public.campus_enrollment_deadlines),1,'La date est enregistrée');
select throws_ok($$select pg_temp.limite()$$,'22023',null,'Pas deux dates pour la même année');
select lives_ok($$select pg_temp.limite((select id from lignes),'2026-2027',current_date+60)$$,'La date se modifie');
select is((select verification_state::text from public.campuses where id='86000000-0000-4000-8000-000000000001'),'relevee','Ni le mot ni la date ne donnent de badge');
reset role;
set local role anon;
select is((select count(*)::int from public.public_campus_statements),0,'Fiche non publiée : pas de mot');
select is((select count(*)::int from public.campus_enrollment_deadlines),0,'Fiche non publiée : pas de date');
reset role;
update public.campuses set publication='publiee' where id='86000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from public.public_campus_statements),0,'Fiche publiée mais pas confirmée : pas de mot');
select is((select count(*)::int from public.campus_enrollment_deadlines),1,'La date paraît sans confirmation, comme les frais');
reset role;
update public.campuses set verification_state='verifiee',verified_on=current_date where id='86000000-0000-4000-8000-000000000001';
set local role anon;
select is((select body from public.public_campus_statements),'Un autre mot, relu par la direction.','Fiche confirmée : le mot paraît');
reset role;
select is((select count(*)::int from prive.campus_statement_agreements where channel='whatsapp' and agreed_role='directeur'),2,'L’accord de chaque version est gardé');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select throws_ok($$select public.merge_campuses('86000000-0000-4000-8000-000000000001','86000000-0000-4000-8000-000000000002')$$,'22023',null,'La fusion d’un doublon qui porte ces données est refusée');
select lives_ok($$select pg_temp.mot(null,null,null,null)$$,'Le retrait du mot est une commande');
select lives_ok($$select public.remove_campus_enrollment_deadline('86000000-0000-4000-8000-000000000001',(select id from lignes))$$,'Le retrait de la date est une commande');
reset role;
select is((select count(*)::int from prive.campus_enrollment_history),3,'Ajout, modification, retrait archivés');
select is((select count(*)::int from prive.campus_statement_agreements where body is null),1,'Le retrait du mot est tracé');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select public.trash_campus('86000000-0000-4000-8000-000000000001','erreur','Fiche de test');
select lives_ok($$select public.purge_campus('86000000-0000-4000-8000-000000000001')$$,'L’effacement définitif emporte l’historique');
reset role;
select is((select count(*)::int from prive.campus_statement_agreements where campus_id='86000000-0000-4000-8000-000000000001'),0,'Plus aucune trace d’accord après l’effacement');
select * from finish();
rollback;
