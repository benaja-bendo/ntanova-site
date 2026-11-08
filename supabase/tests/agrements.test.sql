begin;
create extension if not exists pgtap with schema extensions;
select plan(40);
select public.register_relay('00000000-0000-4000-8000-0000000000d1','google-agrement-admin','[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1','google-agrement-relais','[Relais]');
insert into prive.admins(id) values ('00000000-0000-4000-8000-0000000000d1');
insert into public.institutions(id,name,kind) values
  ('81000000-0000-4000-8000-000000000001','[Institut agrément]','privee'),
  ('81000000-0000-4000-8000-000000000002','[Autre institut]','privee');
insert into public.campuses(id,institution_id,slug,division_id,origin,publication)
select v.id::uuid,v.inst::uuid,v.slug,d.id,'admin','brouillon'
from (values
  ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','institut-agrement'),
  ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','autre-institut')
) v(id,inst,slug), (select id from public.geo_divisions where level=3 limit 1) d;
insert into public.campus_cycles(id,campus_id,cycle) values
  ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','superieur'),
  ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000002','superieur');
insert into public.campus_programs(id,campus_cycle_id,title) values
  ('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','BTS Exemple'),
  ('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000002','BTS Autre');

create function pg_temp.agrement(
  p_program uuid default null, p_kind public.accreditation_kind default 'agrement', p_custom text default null,
  p_ref text default 'arrêté n° [référence]', p_issued date default '2024-03-12', p_source text default 'Journal officiel [numéro]',
  p_url text default null, p_checked date default current_date
) returns uuid language sql as $$
  select public.set_campus_accreditation('82000000-0000-4000-8000-000000000001',p_program,p_kind,p_custom,p_ref,p_issued,p_source,p_url,p_checked);
$$;

set local role anon;
select throws_ok($$select pg_temp.agrement()$$,'42501',null,'Un visiteur n’écrit pas d’agrément');
select throws_ok($$select public.remove_campus_accreditation(gen_random_uuid())$$,'42501',null,'Un visiteur ne retire pas d’agrément');
select throws_ok($$select * from public.campus_accreditations$$,'42501',null,'Un visiteur ne lit pas la table');
select throws_ok($$select * from prive.campus_accreditation_history$$,'42501',null,'L’historique est inaccessible au visiteur');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
select throws_ok($$select pg_temp.agrement()$$,'42501',null,'Un relais n’enregistre pas d’agrément');
select throws_ok($$select public.remove_campus_accreditation(gen_random_uuid())$$,'42501',null,'Un relais ne retire pas d’agrément');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'   ')$$,'22023',null,'La référence est obligatoire');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref',null)$$,'22023',null,'La date du document est obligatoire');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref',current_date+2)$$,'22023',null,'Pas de document daté du futur');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref','2024-03-12','  ')$$,'22023',null,'La source est obligatoire, même sans lien');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref','2024-03-12','src',null,null)$$,'22023',null,'Le jour du contrôle est obligatoire');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref','2024-03-12','src',null,'2024-01-01')$$,'22023',null,'Un contrôle ne précède pas le document');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref','2024-03-12','src',null,current_date+2)$$,'22023',null,'Pas de contrôle dans le futur');
select throws_ok($$select pg_temp.agrement(null,'autre',null)$$,'22023',null,'« Autre » doit être précisé');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref','2024-03-12','src','http://exemple.cg/doc')$$,'22023',null,'Un lien non https est refusé');
select throws_ok($$select pg_temp.agrement(null,'agrement',null,'ref','2024-03-12','src','https://exemple.cg/un doc')$$,'22023',null,'Un lien avec une espace est refusé');
select throws_ok($$select pg_temp.agrement('84000000-0000-4000-8000-000000000002')$$,'22023',null,'La filière d’une autre école est refusée');
select throws_ok($$insert into public.campus_accreditations(campus_id,kind,reference,issued_on,source_label,checked_on) values ('82000000-0000-4000-8000-000000000001','agrement','r',current_date,'s',current_date)$$,'42501',null,'Pas d’écriture directe');
select throws_ok($$update public.campus_accreditations set reference='x'$$,'42501',null,'Pas de modification directe');
select throws_ok($$delete from public.campus_accreditations$$,'42501',null,'Pas de suppression directe');
select lives_ok($$select pg_temp.agrement()$$,'L’administration enregistre l’agrément de l’établissement');
select lives_ok($$select pg_temp.agrement(null,'autorisation_ouverture',null,'décret n° [référence]','2024-03-12','Copie remise par l’établissement')$$,'Une seconde saisie remplace la première');
select is((select count(*)::int from public.campus_accreditations where program_id is null),1,'Une seule ligne pour l’établissement');
select is((select kind::text from public.campus_accreditations where program_id is null),'autorisation_ouverture','L’intitulé suit le document');
select lives_ok($$select pg_temp.agrement('84000000-0000-4000-8000-000000000001',p_url=>'https://exemple.cg/arrete')$$,'L’administration enregistre l’agrément d’une filière');
select is((select count(*)::int from public.campus_accreditations),2,'Établissement et filière ont chacun leur ligne');
select is((select verification_state::text from public.campuses where id='82000000-0000-4000-8000-000000000001'),'relevee','Un agrément ne donne aucun badge');
reset role;
set local role anon;
select is((select count(*)::int from public.public_campus_accreditations),0,'Rien de visible sur une fiche non publiée');
reset role;
update public.campuses set publication='publiee' where id='82000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from public.public_campus_accreditations),2,'Visible sur une fiche publiée');
select is((select count(*)::int from public.public_campus_programs where program_id='84000000-0000-4000-8000-000000000001'),1,'La vue des filières donne son identifiant');
reset role;
select hasnt_column('public','public_campus_accreditations','checked_on','Le jour du contrôle reste hors de la vue publique');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
select is((select count(*)::int from public.campus_accreditations),0,'Un relais ne lit pas la table');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select throws_ok($$delete from public.campus_programs where id='84000000-0000-4000-8000-000000000001'$$,'22023',null,'Une filière agréée ne part pas sans bruit');
select throws_ok($$delete from public.campus_cycles where id='83000000-0000-4000-8000-000000000001'$$,'22023',null,'Son cycle non plus');
select throws_ok($$select public.merge_campuses('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002')$$,'22023',null,'La fusion d’un doublon agréé est refusée');
select lives_ok($$select public.remove_campus_accreditation((select id from public.campus_accreditations where program_id='84000000-0000-4000-8000-000000000001'))$$,'Retrait par commande tracée');
reset role;
select is((select count(*)::int from prive.campus_accreditation_history),4,'Ajout, modification, ajout, retrait archivés');
select is((select count(*)::int from prive.campus_accreditation_history where recorded_by<>'00000000-0000-4000-8000-0000000000d1'),0,'L’auteur de chaque geste est tracé');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select public.trash_campus('82000000-0000-4000-8000-000000000001','erreur','Fiche de test');
select lives_ok($$select public.purge_campus('82000000-0000-4000-8000-000000000001')$$,'L’effacement définitif emporte l’agrément');
reset role;
select is((select count(*)::int from public.campus_accreditations where campus_id='82000000-0000-4000-8000-000000000001'),0,'Plus aucune ligne après l’effacement');
select * from finish();
rollback;
