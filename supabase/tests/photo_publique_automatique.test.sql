begin;
create extension if not exists pgtap with schema extensions;
select plan(13);
select public.register_relay('00000000-0000-4000-8000-0000000000d1','google-photo-admin','[Admin]');
select public.register_relay('00000000-0000-4000-8000-0000000000a1','google-photo-relais','[Relais]');
insert into prive.admins(id) values('00000000-0000-4000-8000-0000000000d1');
insert into public.institutions(id,name) values('a9000000-0000-4000-8000-000000000001','[École photo]');
insert into public.campuses(id,institution_id,slug,division_id,publication,origin)
select 'b9000000-0000-4000-8000-000000000001','a9000000-0000-4000-8000-000000000001','ecole-photo',id,'brouillon','admin' from public.geo_divisions where level=3 limit 1;
insert into public.field_submissions(id,relay_id,taken_at,sign_name,status,campus_id)
values('c9000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',now(),'[École photo]','accepte','b9000000-0000-4000-8000-000000000001');
insert into public.field_submission_photos(id,submission_id,role,storage_path,mime,bytes)
values('d9000000-0000-4000-8000-000000000001','c9000000-0000-4000-8000-000000000001','signboard','c9000000-0000-4000-8000-000000000001/enseigne.webp','image/webp',10000),
('d9000000-0000-4000-8000-000000000002','c9000000-0000-4000-8000-000000000001','brochure','c9000000-0000-4000-8000-000000000001/prive.webp','image/webp',10000);
insert into storage.objects(bucket_id,name) values('releves','c9000000-0000-4000-8000-000000000001/enseigne.webp'),('releves','c9000000-0000-4000-8000-000000000001/prive.webp');
create function pg_temp.choisir(p_photo uuid default 'd9000000-0000-4000-8000-000000000001',p_ok boolean default true) returns void language sql as $$select public.set_campus_public_photo('b9000000-0000-4000-8000-000000000001',p_photo,p_ok)$$;

update public.campuses set publication='publiee' where id='b9000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from public.public_campus_photos),0,'Sans contrôle, aucun fallback');
reset role;
update public.field_submission_photos set child_free_checked_at=now();
set local role anon;
select is((select id::text from public.public_campus_photos),'d9000000-0000-4000-8000-000000000001','Enseigne contrôlée exposée sans sélection');
select is((select count(*)::int from storage.objects where bucket_id='releves'),1,'Seul le fichier du fallback est lisible');
reset role;
insert into public.field_submission_photos(id,submission_id,role,storage_path,mime,bytes,child_free_checked_at,taken_at)
values('d9000000-0000-4000-8000-000000000003','c9000000-0000-4000-8000-000000000001','building','c9000000-0000-4000-8000-000000000001/batiment.webp','image/webp',10000,now(),'2026-10-01');
set local role anon;
select is((select id::text from public.public_campus_photos),'d9000000-0000-4000-8000-000000000003','Première prise de vue contrôlée : ordre stable');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select pg_temp.choisir();
reset role;
set local role anon;
select is((select id::text from public.public_campus_photos),'d9000000-0000-4000-8000-000000000001','Choix explicite prioritaire sur fallback');
reset role;
update public.field_submission_photos set is_public=false where id='d9000000-0000-4000-8000-000000000001';
set local role anon;
select is((select count(*)::int from public.public_campus_photos),0,'Un choix invalidé ne bascule jamais vers une autre photo contrôlée');
reset role;
update public.field_submission_photos set is_public=true where id='d9000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000d1","role":"authenticated"}',true);
select pg_temp.choisir(null,false);
reset role;
set local role anon;
select is((select count(*)::int from public.public_campus_photos),0,'Retrait explicite empêche tout fallback');
select is((select count(*)::int from storage.objects where bucket_id='releves'),0,'Retrait coupe aussi la lecture du fichier');
reset role;
delete from prive.campus_photo_choices;
update public.field_submissions set status='refuse';
set local role anon;
select is((select count(*)::int from public.public_campus_photos),0,'Relevé refusé exclu même contrôlé');
reset role;
update public.field_submissions set status='accepte';
update public.campuses set publication='prete';
set local role anon;
select is((select count(*)::int from public.public_campus_photos),0,'Campus non publié exclu');
reset role;
update public.campuses set publication='publiee';
update public.field_submission_photos set child_free_checked_at=null where role in ('signboard','building');
set local role anon;
select is((select count(*)::int from public.public_campus_photos),0,'Retirer le contrôle retire le fallback ; prospectus toujours exclu');
select throws_ok($$select * from public.field_submission_photos$$,'42501',null,'Photos terrain toujours privées');
reset role;
select ok((select surveyed_at is null and verified_on is null from public.campuses where id='b9000000-0000-4000-8000-000000000001'),'Fallback ne crée ni passage ni confirmation');
select * from finish();
rollback;
