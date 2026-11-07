-- La corbeille des écoles : mettre à la corbeille, restaurer, supprimer pour de bon (audit de l'administration, 06/11/2026).
-- Un retrait n'efface rien ; la corbeille cache l'école partout mais la garde ; la suppression définitive emporte l'école,
-- ses fiches, ses photos, ses contacts, ses frais et ses faits, laisse une trace, et refuse tant qu'une fiche est payée,
-- qu'un envoi attend ou qu'une fusion renvoie vers elle.

begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Mise en place : une relais, une administratrice, deux écoles --------------------------------------------------------------------

select public.register_relay('00000000-0000-4000-8000-0000000000a7', 'google-a7', 'Alice');
select public.register_relay('00000000-0000-4000-8000-0000000000d7', 'google-d7', 'Dominique');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d7');
select public.activer_relais('00000000-0000-4000-8000-0000000000a7', (select id from public.lots where nom = 'Tié-Tié'));

create function pg_temp.envoyer(p_id uuid, p_nom text, p_kind text default 'releve', p_campus uuid default null,
                                p_lon float8 default 11.93, p_lat float8 default -4.80) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
  execute 'set local role authenticated';
  insert into public.field_submissions (id, kind, duplicate_of_campus_id, taken_at, position, sign_name, levels, school_kind, landmark)
  values (p_id, p_kind, p_campus, now() - interval '1 day', 'SRID=4326;POINT(0 0)'::extensions.geometry,
          p_nom, '{primaire}'::public.niveau[], 'privee', 'Près du marché');
  reset role;
  update public.field_submissions set position = extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326) where id = p_id;
end $$;

select pg_temp.envoyer('71000000-0000-4000-8000-000000000001', '[École Corbeille A]');
select pg_temp.envoyer('71000000-0000-4000-8000-000000000002', '[École Corbeille B]', 'releve', null, 11.94, -4.81);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d7","role":"authenticated"}', true);
create temp table ecoles as select
  public.accept_submission('71000000-0000-4000-8000-000000000001') as a,
  public.accept_submission('71000000-0000-4000-8000-000000000002') as b;

-- Ce que l'école A a accumulé : une photo, un contact, des frais, un fait, une mission ------------------------------------------

insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'signboard', 'releves/a/enseigne.jpg', 'image/jpeg', 1000);
insert into prive.direction_contacts (submission_id, role, name, whatsapp, contact_agreement)
values ('71000000-0000-4000-8000-000000000001', 'directeur', 'Personne fictive', '242061234561', true);
insert into public.campus_fees (campus_id, cycle, minimum, maximum, period, declared_on)
select a, 'primaire', 10000, 20000, 'mois', current_date from ecoles;
insert into public.campus_facts (campus_id, key, value, source, observed_on)
select a, 'cloture', 'present', 'terrain', current_date from ecoles;
select public.assign_mission((select a from ecoles), '00000000-0000-4000-8000-0000000000a7', 'verify', 'Vérifier le nom.');
select public.publish_campus((select a from ecoles));

create temp table avant as
  select campuses from public.division_stats
  where division_id = (select division_id from public.campuses where id = (select a from ecoles));

-- Mettre à la corbeille ----------------------------------------------------------------------------------------------------------

select lives_ok($$select public.trash_campus((select a from ecoles), 'erreur', 'Fiche de test')$$, 'Mettre une école publiée à la corbeille');
select is((select publication || '|' || (trashed_at is not null)::text || '|' || trashed_from from public.campuses where id = (select a from ecoles)),
  'retiree|true|publiee', 'Elle est retirée, datée, et se souvient de son état d''avant');
select is((select retirement_reason || '|' || retirement_note from public.campuses where id = (select a from ecoles)), 'erreur|Fiche de test',
  'Le motif et la note du retrait sont gardés');
select is((select count(*)::int from public.public_campuses where id = (select a from ecoles)), 0, 'Elle disparaît du site');
select is((select status from public.missions where campus_id = (select a from ecoles)), 'cancelled', 'Sa mission en cours est fermée');
select is((select campuses from public.division_stats where division_id = (select division_id from public.campuses where id = (select a from ecoles))),
  (select campuses - 1 from avant), 'Les statistiques de la zone ne la comptent plus');
select throws_ok($$select public.trash_campus((select a from ecoles))$$, 'P0002', null, 'Deux fois à la corbeille : refusé');
select throws_ok($$select public.publish_campus((select a from ecoles))$$, '22023', null, 'Une école à la corbeille ne se publie pas : il faut la restaurer');

-- Restaurer -----------------------------------------------------------------------------------------------------------------------

select lives_ok($$select public.restore_campus((select a from ecoles))$$, 'Restaurer une école de la corbeille');
select is((select publication || '|' || (trashed_at is null)::text || '|' || (retirement_reason is null)::text from public.campuses where id = (select a from ecoles)),
  'prete|true|true', 'Elle repasse « prête » (jamais « publiée » toute seule), sans motif de retrait');
select is((select campuses from public.division_stats where division_id = (select division_id from public.campuses where id = (select a from ecoles))),
  (select campuses from avant), 'Les statistiques la comptent de nouveau');
select throws_ok($$select public.restore_campus((select a from ecoles))$$, 'P0002', null, 'Restaurer ce qui n''est pas à la corbeille : refusé');

-- Une école retirée puis mise à la corbeille reste retirée après restauration -------------------------------------------------------

select public.retire_campus((select b from ecoles), 'fermeture', 'Fermée.');
select public.trash_campus((select b from ecoles), 'erreur', 'Autre note');
select is((select retirement_reason from public.campuses where id = (select b from ecoles)), 'fermeture', 'Le motif d''un retrait déjà fait n''est pas écrasé');
select public.restore_campus((select b from ecoles));
select is((select publication || '|' || retirement_reason from public.campuses where id = (select b from ecoles)), 'retiree|fermeture',
  'Restaurée, elle redevient ce qu''elle était : retirée, avec son motif');

-- La suppression définitive : ce qui la bloque ---------------------------------------------------------------------------------------

select is((public.campus_purge_preview((select a from ecoles)) ->> 'blocked'), 'Mets l''école à la corbeille d''abord.',
  'Pas de suppression sans corbeille : l''aperçu le dit');
select throws_ok($$select public.purge_campus((select a from ecoles))$$, '22023', null, 'Et la suppression refuse');

select public.trash_campus((select a from ecoles), 'erreur', 'Test');

insert into public.payout_batches (id, friday) values ('73000000-0000-4000-8000-000000000001', date '2026-11-06');
insert into public.payout_lines (id, batch_id, relay_id, kind, submission_id, amount_xaf)
values ('74000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a7', 'submission',
        '71000000-0000-4000-8000-000000000001', 500);
select ok((public.campus_purge_preview((select a from ecoles)) ->> 'blocked') ~ 'paie', 'Une fiche payée bloque la suppression');
select throws_ok($$select public.purge_campus((select a from ecoles))$$, '22023', null, 'Et la suppression refuse');
delete from public.payout_lines where id = '74000000-0000-4000-8000-000000000001';

select pg_temp.envoyer('71000000-0000-4000-8000-000000000003', '[Contre-visite A]', 'contre_visite', (select a from ecoles));
select ok((public.campus_purge_preview((select a from ecoles)) ->> 'blocked') ~ 'en attente', 'Un envoi en attente bloque la suppression');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d7","role":"authenticated"}', true);
select public.refuse_submission('71000000-0000-4000-8000-000000000003', 'autre', 'Test');

-- L'aperçu avant de supprimer ------------------------------------------------------------------------------------------------------

select is((public.campus_purge_preview((select a from ecoles)) ->> 'blocked'), null, 'Plus rien ne bloque');
select is((public.campus_purge_preview((select a from ecoles)) -> 'submissions')::text, '2', 'L''aperçu compte les fiches (la fiche et la contre-visite refusée)');
select is((public.campus_purge_preview((select a from ecoles)) -> 'photos')::text, '1', 'Il compte les photos');
select is((public.campus_purge_preview((select a from ecoles)) -> 'contacts')::text, '1', 'Il compte les contacts');
select is((public.campus_purge_preview((select a from ecoles)) -> 'paths')::text, '["releves/a/enseigne.jpg"]',
  'Il donne les fichiers du stockage à effacer avec l''école');

-- Les droits : seule l'administration ----------------------------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a7","role":"authenticated"}', true);
select throws_ok($$select public.purge_campus((select a from ecoles))$$, '42501', null, 'Une relais ne supprime rien');
select throws_ok($$select public.trash_campus((select b from ecoles))$$, '42501', null, 'Une relais ne met rien à la corbeille');
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d7","role":"authenticated"}', true);

-- Une école vers laquelle une fusion renvoie ne se supprime pas -----------------------------------------------------------------

select pg_temp.envoyer('71000000-0000-4000-8000-000000000005', '[École gardée C]', 'releve', null, 11.935, -4.805);
select pg_temp.envoyer('71000000-0000-4000-8000-000000000006', '[Doublon D]', 'releve', null, 11.945, -4.815);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000d7","role":"authenticated"}', true);
create temp table fusion as select public.accept_submission('71000000-0000-4000-8000-000000000005') as c,
                                   public.accept_submission('71000000-0000-4000-8000-000000000006') as d;
select public.merge_campuses((select d from fusion), (select c from fusion));
select public.trash_campus((select c from fusion), 'erreur', 'Test');
select ok((public.campus_purge_preview((select c from fusion)) ->> 'blocked') ~ 'fusionnées', 'Une fusion qui y renvoie bloque la suppression');

-- Supprimer pour de bon -----------------------------------------------------------------------------------------------------------

select lives_ok($$select public.purge_campus((select a from ecoles))$$, 'Supprimer définitivement une école à la corbeille');
select is((select count(*)::int from public.campuses where id = (select a from ecoles)), 0, 'L''école n''existe plus');
select is((select count(*)::int from public.field_submissions where id in ('71000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000003')), 0,
  'Ses fiches non plus');
select is((select count(*)::int from public.field_submission_photos where id = '72000000-0000-4000-8000-000000000001')
        + (select count(*)::int from prive.direction_contacts where submission_id = '71000000-0000-4000-8000-000000000001')
        + (select count(*)::int from public.campus_fees where campus_id = (select a from ecoles))
        + (select count(*)::int from public.campus_facts where campus_id = (select a from ecoles)), 0,
  'Ni ses photos, ni son contact, ni ses frais, ni ses faits');
select is((select count(*)::int from public.campuses where id = (select b from ecoles)), 1, 'Les autres écoles ne bougent pas');
select ok((select note from prive.erasures where what = 'campus' order by id desc limit 1) ~ 'École supprimée : .*\[École Corbeille A\].*2 fiches, 1 photos, 1 contacts',
  'La trace dit quelle école, combien de fiches, de photos et de contacts');

select is((select count(*)::int from public.institutions where name = '[École Corbeille A]'), 0, 'Son institution, sans autre campus, disparaît avec elle');
select is((select count(*)::int from public.missions where campus_id = (select a from ecoles)), 0, 'Ses missions aussi');
select ok((select count(*) from prive.erasures where what in ('trash', 'restore')) >= 4, 'Chaque mise à la corbeille et chaque restauration laisse sa trace');

select * from finish();
rollback;
