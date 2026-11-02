-- Qui a le droit de quoi, et ce que lit le site : la version définitive.
--
-- Tout est d'abord retiré, puis donné table par table : en local, Supabase donne par défaut tous les droits
-- sur les nouvelles tables à `anon` et `authenticated` ; en ligne, il n'en donne aucun. Ainsi les deux bases
-- ont exactement les mêmes droits. Les rôles `anon` (visiteur) et `authenticated` (connecté) sont ceux que
-- PostgREST, Supabase ou un serveur à soi donnent aux requêtes de l'API.
--
-- SÉPARATION TERRAIN / PUBLIC :
--   * un relais n'écrit QUE dans `field_submissions` (et, par fonction, ses photos et son contact) ;
--     aucun droit d'écriture sur le catalogue, la géographie ou les lots ;
--   * le public ne lit que le catalogue publié (tables filtrées par leurs règles, vues `public_*`) ;
--   * le privé (`prive`) n'est lisible par aucun rôle de l'API : seules des fonctions le touchent ;
--   * jamais de suppression d'une institution, d'un campus ni d'un relevé par l'API.
-- Les tests pgTAP (supabase/tests/) vérifient chaque ligne de ce fichier.

-- Les règles d'avant, refaites ci-dessous avec `current_user_id()` ------------------------------------------

drop policy "Le relais actif lit son lot" on public.lots;
drop policy "L'administration gère les lots" on public.lots;
drop policy "Le relais lit sa ligne" on public.relais;
drop policy "L'administration lit les relais" on public.relais;
drop policy "L'administration modifie les relais" on public.relais;
drop policy "Le relais signale ses erreurs" on public.erreurs;
drop policy "L'administration lit les erreurs" on public.erreurs;
drop policy "L'administration gère les échanges" on public.echanges;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke all on all tables in schema prive from public, anon, authenticated;

-- Les règles d'accès sont actives sur toutes les tables, même celles que l'API ne voit pas.
alter table public.geo_divisions enable row level security;
alter table public.education_domains enable row level security;
alter table public.institutions enable row level security;
alter table public.campuses enable row level security;
alter table public.campus_cycles enable row level security;
alter table public.campus_programs enable row level security;
alter table public.field_submissions enable row level security;
alter table public.field_submission_photos enable row level security;
alter table public.missions enable row level security;
alter table public.lots enable row level security;
alter table public.relais enable row level security;
alter table public.echanges enable row level security;
alter table public.erreurs enable row level security;
alter table public.payout_rates enable row level security;
alter table public.payout_batches enable row level security;
alter table public.payout_lines enable row level security;
alter table public.payout_statements enable row level security;
alter table prive.admins enable row level security;
alter table prive.direction_contacts enable row level security;
alter table prive.campus_sources enable row level security;
alter table prive.erasures enable row level security;
alter table prive.verification_agreements enable row level security;
alter table prive.relay_payment_details enable row level security;

-- Le catalogue : le public lit ce qui est publié, l'administration fait tout (sauf supprimer) -------------------

grant select on public.geo_divisions, public.education_domains to anon, authenticated;
grant insert, update on public.geo_divisions, public.education_domains, public.institutions, public.campuses to authenticated;
grant select on public.institutions, public.campuses, public.campus_cycles, public.campus_programs to anon, authenticated;
grant insert, update, delete on public.campus_cycles, public.campus_programs to authenticated;

create policy "Tout le monde lit les divisions" on public.geo_divisions
  for select to anon, authenticated using (true);
create policy "L'administration gère les divisions" on public.geo_divisions
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

create policy "Tout le monde lit les domaines de formation" on public.education_domains
  for select to anon, authenticated using (true);
create policy "L'administration gère les domaines de formation" on public.education_domains
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

create policy "Tout le monde lit les campus publiés" on public.campuses
  for select to anon, authenticated using (publication = 'publiee');
create policy "L'administration gère les campus" on public.campuses
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

create policy "Tout le monde lit les institutions qui ont un campus publié" on public.institutions
  for select to anon, authenticated
  using (exists (
    select 1 from public.campuses c where c.institution_id = institutions.id and c.publication = 'publiee'));
create policy "L'administration gère les institutions" on public.institutions
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

create policy "Tout le monde lit les cycles des campus publiés" on public.campus_cycles
  for select to anon, authenticated
  using (exists (
    select 1 from public.campuses c where c.id = campus_cycles.campus_id and c.publication = 'publiee'));
create policy "L'administration gère les cycles" on public.campus_cycles
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

create policy "Tout le monde lit les formations des campus publiés" on public.campus_programs
  for select to anon, authenticated
  using (exists (
    select 1
    from public.campus_cycles cc join public.campuses c on c.id = cc.campus_id
    where cc.id = campus_programs.campus_cycle_id and c.publication = 'publiee'));
create policy "L'administration gère les formations" on public.campus_programs
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Lots : le relais actif lit le sien ------------------------------------------------------------------------------

grant select, insert, update, delete on public.lots to authenticated;
create policy "Le relais actif lit son lot" on public.lots
  for select to authenticated
  using ((select public.est_relais_actif()) and id = (select public.mon_lot()));
create policy "L'administration gère les lots" on public.lots
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Relais : chacun lit sa ligne (même en attente) ; l'administration les gère ----------------------------------------

grant select on public.relais to authenticated;
grant update (prenom, statut, lot_id, active_le) on public.relais to authenticated;
create policy "Le relais lit sa ligne" on public.relais
  for select to authenticated using (id = (select public.current_user_id()));
create policy "L'administration lit les relais" on public.relais
  for select to authenticated using ((select public.est_admin()));
create policy "L'administration modifie les relais" on public.relais
  for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Relevés : le relais actif crée les siens et les relit ; jamais ceux des autres -------------------------------------

grant select on public.field_submissions to authenticated;
-- Seulement les colonnes que le téléphone remplit : ni l'auteur, ni le statut, ni les calculs, ni la paie.
grant insert (
  id, batch_id, kind, corrects_submission_id,
  position, accuracy_m, taken_at, duplicate_answer, duplicate_of_campus_id,
  sign_name, levels, school_kind, curriculum_note, landmark, sign_phone,
  observed_programs, programs_photographed,
  direction_seen, liaison_sheet_given, liaison_code, come_back_note
) on public.field_submissions to authenticated;
-- Pour l'administration (les règles ci-dessous écartent les relais).
grant update (
  batch_id, status, reason, message_to_relay, decided_at, campus_id, accepted_as,
  contact_confirmed_at, contact_role, payable, trial_validated_at
) on public.field_submissions to authenticated;

create policy "Le relais lit ses relevés" on public.field_submissions
  for select to authenticated using (relay_id = (select public.current_user_id()));
create policy "Le relais actif envoie ses relevés" on public.field_submissions
  for insert to authenticated
  with check (relay_id = (select public.current_user_id()) and (select public.est_relais_actif()));
create policy "L'administration lit les relevés" on public.field_submissions
  for select to authenticated using ((select public.est_admin()));
create policy "L'administration décide" on public.field_submissions
  for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Photos : l'administration seule les lit. Le relais les enregistre par `register_photo`, sans les relire. ---------

grant select on public.field_submission_photos to authenticated;
grant update (is_public, child_free_checked_at) on public.field_submission_photos to authenticated;
create policy "L'administration lit les photos" on public.field_submission_photos
  for select to authenticated using ((select public.est_admin()));
create policy "L'administration valide les photos publiables" on public.field_submission_photos
  for update to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Missions : l'administration seule (le relais lit les siennes par `my_missions`) -----------------------------------

grant select, insert, update on public.missions to authenticated;
create policy "L'administration gère les missions" on public.missions
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Échanges : l'administration seule -----------------------------------------------------------------------------------

grant select, insert, update, delete on public.echanges to authenticated;
create policy "L'administration gère les échanges" on public.echanges
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));

-- Erreurs : tout relais connecté écrit, l'administration lit ------------------------------------------------------------

grant insert (id, survenue_le, ecran, code, detail, version_app, appareil) on public.erreurs to authenticated;
grant select on public.erreurs to authenticated;
create policy "Le relais signale ses erreurs" on public.erreurs
  for insert to authenticated with check (relais_id = (select public.current_user_id()));
create policy "L'administration lit les erreurs" on public.erreurs
  for select to authenticated using ((select public.est_admin()));

-- Paie : l'administration seule ----------------------------------------------------------------------------------------------

grant select on public.payout_batches, public.payout_lines, public.payout_statements to authenticated;
grant select, insert, update on public.payout_rates to authenticated;
create policy "L'administration lit les tarifs et les paiements" on public.payout_rates
  for all to authenticated using ((select public.est_admin())) with check ((select public.est_admin()));
create policy "L'administration lit les semaines clôturées" on public.payout_batches
  for select to authenticated using ((select public.est_admin()));
create policy "L'administration lit les lignes de paie" on public.payout_lines
  for select to authenticated using ((select public.est_admin()));
create policy "L'administration lit les paiements" on public.payout_statements
  for select to authenticated using ((select public.est_admin()));

-- Les vues ---------------------------------------------------------------------------------------------------------------------------

-- Ce que lit le site public à la construction : les campus publiés, avec leur institution et leur lieu.
-- `division_slugs` : les adresses des ancêtres, du pays à la division du campus (l'adresse publique en est tirée).
create view public.public_campuses with (security_invoker = true) as
select
  c.id,
  c.institution_id,
  i.name as institution_name,
  c.label,
  i.kind,
  c.slug,
  c.division_id,
  d.path::text as division_path,
  (select array_agg(a.slug::text order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_slugs,
  (select array_agg(a.name order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_names,
  c.neighbourhood,
  c.landmark,
  c.sign_phone,
  extensions.st_y(c.position) as latitude,
  extensions.st_x(c.position) as longitude,
  c.verification_state,
  c.verified_on,
  c.curriculum_note,
  c.surveyed_at,
  c.located_at,
  c.origin,
  c.updated_at
from public.campuses c
join public.institutions i on i.id = c.institution_id
join public.geo_divisions d on d.id = c.division_id
where c.publication = 'publiee';

create view public.public_campus_cycles with (security_invoker = true) as
select cc.campus_id, cc.cycle
from public.campus_cycles cc
join public.campuses c on c.id = cc.campus_id
where c.publication = 'publiee';

create view public.public_campus_programs with (security_invoker = true) as
select cc.campus_id, cc.cycle, p.title, ed.slug as domain_slug, ed.name as domain_name,
       p.bac_track, p.diploma, p.rhythms
from public.campus_programs p
join public.campus_cycles cc on cc.id = p.campus_cycle_id
join public.campuses c on c.id = cc.campus_id
left join public.education_domains ed on ed.id = p.domain_id
where c.publication = 'publiee';

-- L'ancienne adresse d'un campus fusionné renvoie vers celui qu'on garde. Elle voit des campus retirés (que les
-- règles d'accès cachent) : la vue s'exécute avec les droits de son propriétaire, et ne montre que des adresses.
create view public.public_campus_redirects with (security_invoker = false) as
select dd.path::text as from_division_path, e.slug as from_slug,
       dg.path::text as to_division_path, g.slug as to_slug
from public.campuses e
join public.geo_divisions dd on dd.id = e.division_id
join public.campuses g on g.id = e.replaced_by_campus_id and g.publication = 'publiee'
join public.geo_divisions dg on dg.id = g.division_id
where e.publication = 'retiree' and e.retirement_reason = 'doublon';

-- La file de l'administration : les relevés à valider, avec ce qui aide à décider.
create view public.submissions_to_review with (security_invoker = true) as
select
  s.id,
  s.received_at,
  s.kind,
  s.sign_name,
  rl.prenom as relay,
  l.nom as batch,
  coalesce(l.essai, false) as trial,
  s.outside_batch,
  s.possible_duplicate,
  s.duplicate_answer,
  s.accuracy_m,
  (select count(*) from public.field_submission_photos p where p.submission_id = s.id)::integer as photos,
  exists (select 1 from public.field_submission_photos p where p.submission_id = s.id and p.role = 'signboard') as signboard_received,
  (s.observed_programs is not null or s.programs_photographed) as has_programs_hint,
  public.contact_received(s.id) as contact_received
from public.field_submissions s
join public.relais rl on rl.id = s.relay_id
left join public.lots l on l.id = s.batch_id
where s.status = 'a_valider';

-- Les compteurs de chaque relais : fiches envoyées, acceptées, contacts confirmés.
create view public.relay_counters with (security_invoker = true) as
select
  rl.id as relay_id,
  rl.prenom as first_name,
  rl.statut as status,
  l.nom as batch,
  count(s.id)::integer as sent,
  (count(s.id) filter (where s.status = 'a_valider'))::integer as to_review,
  (count(s.id) filter (where s.status = 'a_corriger'))::integer as to_correct,
  (count(s.id) filter (where s.status = 'accepte' and s.kind <> 'correction'))::integer as accepted,
  (count(s.id) filter (where s.status = 'refuse'))::integer as refused,
  (count(s.id) filter (where s.contact_confirmed_at is not null))::integer as contacts_confirmed
from public.relais rl
left join public.lots l on l.id = rl.lot_id
left join public.field_submissions s on s.relay_id = rl.id
group by rl.id, rl.prenom, rl.statut, l.nom;

-- Où en est-on, division par division : combien de campus, d'où ils viennent, et si la zone est ouverte.
create view public.division_stats with (security_invoker = true) as
select
  d.id as division_id, d.path::text as path, d.level, d.name, d.open_for_fieldwork,
  count(c.id)::integer as campuses,
  (count(c.id) filter (where c.publication = 'publiee'))::integer as published,
  (count(c.id) filter (where c.origin = 'field'))::integer as from_field,
  (count(c.id) filter (where c.origin = 'admin'))::integer as from_admin,
  (count(c.id) filter (where c.origin = 'import'))::integer as from_import
from public.geo_divisions d
left join public.campuses c on c.division_id = d.id
group by d.id, d.path, d.level, d.name, d.open_for_fieldwork;

grant select on public.public_campuses, public.public_campus_cycles, public.public_campus_programs,
                public.public_campus_redirects to anon, authenticated;
grant select on public.submissions_to_review, public.relay_counters, public.division_stats to authenticated;

-- Les fonctions -----------------------------------------------------------------------------------------------------------------------

-- Utiles à tous (les règles d'accès les appellent, le site et la recherche aussi).
grant execute on function
  public.current_user_id(),
  public.norm_text(text),
  public.slugifier(text),
  public.division_of_position(double precision, double precision, smallint),
  public.is_open_for_fieldwork(uuid),
  public.search_campuses(text, public.niveau, public.bac_track, public.diploma_kind, text, public.study_rhythm,
                         text, double precision, double precision, integer, integer)
to anon, authenticated;

-- Pour les connectés : chaque fonction vérifie elle-même le rôle qui l'appelle.
grant execute on function
  public.est_admin(),
  public.est_relais_actif(),
  public.mon_lot(),
  public.exiger_admin(),
  public.exiger_admin_session(),
  -- le relais
  public.send_contact(uuid, public.fonction_direction, text, public.telephone, boolean, timestamptz, text),
  public.register_photo(uuid, uuid, public.photo_role, text, integer, integer, integer, timestamptz),
  public.my_batch(),
  public.known_places_in_my_batch(),
  public.my_missions(),
  -- l'administration
  public.activer_relais(uuid, uuid),
  public.accept_submission(uuid, text, uuid, uuid, text, jsonb),
  public.request_correction(uuid, public.motif_decision, text),
  public.refuse_submission(uuid, public.motif_decision, text),
  public.confirm_contact(uuid, public.fonction_direction),
  public.contact_of_submission(uuid),
  public.contact_received(uuid),
  public.validate_trial_submission(uuid),
  public.publish_campus(uuid),
  public.publish_division(uuid),
  public.publish_batch(uuid),
  public.retire_campus(uuid, public.motif_retrait, text),
  public.merge_campuses(uuid, uuid),
  public.locate_campus(uuid, double precision, double precision, uuid),
  public.assign_mission(uuid, uuid, public.mission_kind, text),
  public.cancel_mission(uuid),
  public.record_verification(uuid, date, public.fonction_direction, text, text),
  public.erase_contact(uuid, text),
  public.erase_photo(uuid, text),
  public.create_catalog_entry(jsonb, public.origin_kind),
  public.import_catalog(jsonb, boolean, public.origin_kind),
  public.create_lot(text, uuid, date, boolean),
  public.set_division_open(uuid, boolean),
  public.unique_campus_slug(uuid, text),
  public.upsert_programs(uuid, jsonb, public.origin_kind, uuid),
  public.payable_items(date),
  public.payout_preview(date),
  public.close_payout_week(date),
  public.mark_statement_paid(uuid, uuid, text),
  public.set_relay_payment_details(uuid, text, public.telephone),
  public.payout_statements_of(uuid)
to authenticated;
