-- La saisie (ticket 205, décisions du fondateur du 20/11), après la saisie des écoles du supérieur.
--
-- - A22 : un agrément « cité par l'école, document pas encore vu » se note sans la date du document ; un document vu garde
--   sa date. `set_campus_accreditation` reçoit la preuve dans le même appel (paramètre nouveau, à la fin).
-- - A29 : ingénieur, bachelor, DUT et CQP dans la liste des diplômes ; rien n'est retiré.
-- - A28 : le canal « fondateur » (l'accord donné au fondateur), partout où un accord se note, avec la fonction et la date.
-- - A32 : `set_campus_cover` : une image de la galerie passe en couverture, l'ancienne repasse dans la galerie.
-- - A34 : `campus_media.source_note`, d'où vient une image (privé : la table ne se lit pas hors de l'administration).
-- - A6 : un document (prospectus, tarifs) parmi les images de l'école, jamais public.
-- - A8 et A19 : le numéro de l'école, lu sur un document ou sur l'enseigne, dans les contacts privés de l'école, sans accord de
--   personne ; un numéro illisible en partie se garde en mots. Jamais dans `campuses`, que le visiteur lit colonne par colonne.
-- - A25 : plusieurs rentrées dans une même année, chacune avec un libellé.
-- - A21 : la page Facebook de l'école (`institutions.facebook_url`).

-- A29 : les diplômes ------------------------------------------------------------------------------------------------------------------------------
alter domain public.diploma_kind drop constraint diploma_kind_check;
alter domain public.diploma_kind add constraint diploma_kind_check check (value in (
  'cepe', 'bepc', 'bac', 'bt', 'bts', 'licence', 'master', 'doctorat', 'cap', 'certificat', 'autre',
  'ingenieur', 'bachelor', 'dut', 'cqp'
));

-- A21 : la page Facebook de l'école ------------------------------------------------------------------------------------------------------------
alter table public.institutions
  add column facebook_url text check (facebook_url ~ '^https://([a-z]+\.)?facebook\.com/[^\s]{1,200}$');
comment on column public.institutions.facebook_url is 'La page Facebook de l''école (https://…facebook.com/…). Pas encore montrée sur le site.';

-- A28 : l'accord donné au fondateur --------------------------------------------------------------------------------------------------------------
alter table prive.verification_agreements drop constraint verification_agreements_channel_check,
  add constraint verification_agreements_channel_check check (channel in ('whatsapp', 'appel', 'sur_place', 'autre', 'fondateur'));
alter table prive.public_contact_agreements drop constraint public_contact_agreements_channel_check,
  add constraint public_contact_agreements_channel_check check (channel in ('whatsapp', 'appel', 'sur_place', 'autre', 'fondateur'));
alter table prive.campus_statement_agreements drop constraint campus_statement_agreements_channel_check,
  add constraint campus_statement_agreements_channel_check check (channel in ('whatsapp', 'appel', 'sur_place', 'autre', 'fondateur'));
alter table prive.post_agreements drop constraint post_agreements_channel_check,
  add constraint post_agreements_channel_check check (channel in ('whatsapp', 'appel', 'sur_place', 'autre', 'fondateur'));

-- Les trois fonctions qui vérifient le canal (contact public, mot de la direction, nouvelle) gardent leur corps : seule la
-- liste des canaux s'allonge. Leurs droits ne changent pas (`create or replace`).
do $$
declare
  f regprocedure;
  n integer := 0;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.prosrc like '%''sur_place'', ''autre'')%'
  loop
    execute replace(pg_get_functiondef(f), '''sur_place'', ''autre'')', '''sur_place'', ''autre'', ''fondateur'')');
    n := n + 1;
  end loop;
  if n <> 3 then
    raise exception 'Trois fonctions vérifient le canal d''un accord ; % trouvées.', n;
  end if;
end;
$$;

-- A22 : l'agrément cité par l'école, sans date --------------------------------------------------------------------------------------------------
alter table public.campus_accreditations alter column issued_on drop not null,
  add constraint campus_accreditations_date_sauf_si_cite check (issued_on is not null or evidence = 'dit_ecole');
comment on column public.campus_accreditations.issued_on is
  'La date du document ; nulle seulement quand l''agrément est cité par l''école sans document vu (`evidence` = dit_ecole).';

drop function public.set_campus_accreditation(uuid, uuid, public.accreditation_kind, text, text, date, text, text, date);
create function public.set_campus_accreditation(
  p_campus uuid, p_program uuid, p_kind public.accreditation_kind, p_custom_kind text, p_reference text,
  p_issued_on date, p_source_label text, p_source_url text, p_checked_on date, p_evidence text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_aujourdhui date := (current_timestamp at time zone 'Africa/Brazzaville')::date;
  v_precision text := case when p_kind = 'autre' then nullif(btrim(p_custom_kind), '') end;
  v_reference text := nullif(btrim(p_reference), '');
  v_source text := nullif(btrim(p_source_label), '');
  v_lien text := nullif(btrim(p_source_url), '');
  v_ancienne public.campus_accreditations;
  v_preuve text;
  v_id uuid;
  v_avant jsonb;
  v_apres jsonb;
begin
  perform public.exiger_admin_session();
  if p_evidence is not null and p_evidence not in ('document_vu', 'dit_ecole') then
    raise exception 'Ici, la preuve est le document vu ou l''école qui le cite ; la photo se joint ensuite.' using errcode = '22023';
  end if;
  perform 1 from public.campuses where id = p_campus for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  select a.* into v_ancienne from public.campus_accreditations a
  where a.campus_id = p_campus and a.program_id is not distinct from p_program for update;
  v_preuve := coalesce(p_evidence, v_ancienne.evidence);
  if p_kind is null or v_reference is null or v_source is null or p_checked_on is null
    or (p_issued_on is null and v_preuve is distinct from 'dit_ecole')
    or p_issued_on > v_aujourdhui or p_checked_on > v_aujourdhui or p_checked_on < p_issued_on
    or (p_kind = 'autre' and v_precision is null)
    or (v_lien is not null and v_lien !~ '^https://[^[:space:]]+$') then
    raise exception 'Indique l’intitulé, la référence, la source, le jour où tu l’as vu (ou où l’école l’a dit) et la date du document, sauf s’il est cité par l’école sans document vu ; un lien commence par https://.'
      using errcode = '22023';
  end if;
  if p_evidence is not null and (v_ancienne.proof_photo_id is not null or v_ancienne.proof_path is not null) then
    raise exception 'Cet agrément a une photo pour preuve : retire-la d''abord.' using errcode = '22023';
  end if;
  if p_program is not null and not exists (
    select 1 from public.campus_programs p join public.campus_cycles cc on cc.id = p.campus_cycle_id
    where p.id = p_program and cc.campus_id = p_campus
  ) then
    raise exception 'Cette filière n’appartient pas à cette école.' using errcode = '22023';
  end if;
  v_id := v_ancienne.id;
  v_avant := case when v_id is not null then to_jsonb(v_ancienne) end;
  if v_id is null then
    insert into public.campus_accreditations (campus_id, program_id, kind, custom_kind, reference, issued_on, source_label, source_url,
                                              checked_on, evidence)
    values (p_campus, p_program, p_kind, v_precision, v_reference, p_issued_on, v_source, v_lien, p_checked_on, p_evidence)
    returning id, to_jsonb(campus_accreditations) into v_id, v_apres;
  else
    update public.campus_accreditations a set kind = p_kind, custom_kind = v_precision, reference = v_reference,
      issued_on = p_issued_on, source_label = v_source, source_url = v_lien, checked_on = p_checked_on,
      evidence = coalesce(p_evidence, a.evidence)
    where a.id = v_id returning to_jsonb(a) into v_apres;
  end if;
  update public.campuses set updated_at = now() where id = p_campus;
  insert into prive.campus_accreditation_history (accreditation_id, campus_id, action, before_data, after_data, recorded_by)
  values (v_id, p_campus, case when v_avant is null then 'ajout' else 'modification' end, v_avant, v_apres, public.current_user_id());
  return v_id;
end;
$$;
comment on function public.set_campus_accreditation(uuid, uuid, public.accreditation_kind, text, text, date, text, text, date, text) is
  'Un agrément (de l''école ou d''une formation). La preuve peut se dire ici : document vu, ou cité par l''école (alors sans date). 20/11.';
revoke all on function public.set_campus_accreditation(uuid, uuid, public.accreditation_kind, text, text, date, text, text, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_campus_accreditation(uuid, uuid, public.accreditation_kind, text, text, date, text, text, date, text)
  to authenticated;

-- Le tiroir d'une formation dit la preuve de son autorisation dans le même appel : « dit par l'école » n'a plus besoin de date.
do $$
declare
  v_def text := pg_get_functiondef('public.save_program_sheet(uuid, jsonb)'::regprocedure);
  v_avant text := 'null, v_aujourdhui);';
begin
  if (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant) <> 1 then
    raise exception 'save_program_sheet : l''appel à set_campus_accreditation n''est pas celui attendu.';
  end if;
  execute replace(v_def, v_avant, 'null, v_aujourdhui, nullif(v_preuve, ''photo''));');
end;
$$;

-- A6 et A34 : un document, jamais public ; d'où vient une image ---------------------------------------------------------------------------------
alter domain public.media_kind drop constraint media_kind_check;
alter domain public.media_kind add constraint media_kind_check check (value in ('logo', 'cover', 'gallery', 'document'));
alter domain public.media_subject drop constraint media_subject_check;
alter domain public.media_subject add constraint media_subject_check check (value in (
  'logo', 'enseigne', 'portail', 'batiment', 'cour', 'salle', 'terrain', 'activite', 'autre', 'prospectus'
));
alter table public.campus_media
  add column source_note text check (length(btrim(source_note)) between 1 and 300),
  add constraint campus_media_document_jamais_public check (kind <> 'document' or not is_public),
  add constraint campus_media_document_pas_de_releve check (kind <> 'document' or source_photo_id is null);
comment on column public.campus_media.source_note is
  'D''où vient l''image (un lien, la page Facebook, « remise par l''école »…) : pour répondre à une demande de retrait. Jamais publiée.';

create function public.set_campus_media_source(p_media uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.campus_media;
  v_after jsonb;
begin
  select x.* into m from public.campus_media x where x.id = p_media for update;
  if not found then raise exception 'Image introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(coalesce(m.campus_id,
    (select c.id from public.campuses c where c.institution_id = m.institution_id order by c.created_at limit 1)));
  if length(btrim(coalesce(p_note, ''))) > 300 then
    raise exception 'D''où vient l''image : 300 caractères au plus.' using errcode = '22023';
  end if;
  update public.campus_media x set source_note = nullif(btrim(p_note), '') where x.id = p_media returning to_jsonb(x) into v_after;
  insert into prive.campus_media_history (media_id, campus_id, institution_id, action, before_data, after_data, recorded_by)
  values (m.id, m.campus_id, m.institution_id, 'modification', to_jsonb(m), v_after, public.current_user_id());
end;
$$;
comment on function public.set_campus_media_source(uuid, text) is 'D''où vient une image (privé) ; un texte vide l''efface. 20/11.';
revoke all on function public.set_campus_media_source(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_campus_media_source(uuid, text) to authenticated;

-- A32 : « En couverture » -------------------------------------------------------------------------------------------------------------------------
-- L'échange garde le nombre d'images de la galerie : le plafond de douze ne le refuse pas, même galerie pleine.
create or replace function public.campus_media_avant_ecriture() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.field_submission_photos;
  v_campus uuid;
  v_status text;
begin
  if new.source_photo_id is not null then
    select x.* into p from public.field_submission_photos x where x.id = new.source_photo_id;
    select s.campus_id, s.status into v_campus, v_status from public.field_submissions s where s.id = p.submission_id;
    if not public.photo_role_is_public(p.role) then
      raise exception 'Une photo de travail (prospectus, programmes, affiche) ne devient jamais une image de l''école.' using errcode = '22023';
    end if;
    if v_status <> 'accepte' or v_campus is distinct from new.campus_id then
      raise exception 'La photo doit venir d''un relevé accepté de ce site.' using errcode = '22023';
    end if;
    if new.storage_path <> p.storage_path then
      raise exception 'Une image de relevé garde le chemin de sa photo.' using errcode = '22023';
    end if;
  elsif new.storage_path !~ '^ecoles/' or (new.thumb_path is not null and new.thumb_path !~ '^ecoles/') then
    raise exception 'Un fichier ajouté se range sous ecoles/.' using errcode = '22023';
  end if;
  if new.kind = 'gallery' and (tg_op = 'INSERT' or old.kind <> 'gallery')
     and coalesce(current_setting('ntanova.echange_de_couverture', true), '') <> 'oui'
     and (select count(*) from public.campus_media m where m.campus_id = new.campus_id and m.kind = 'gallery' and m.id <> new.id) >= 12 then
    raise exception 'Douze images au plus dans la galerie d''un site.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create function public.set_campus_cover(p_media uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.campus_media;
  v_ancienne public.campus_media;
begin
  select x.* into m from public.campus_media x where x.id = p_media for update;
  if not found then raise exception 'Image introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(m.campus_id);
  if m.kind <> 'gallery' then
    raise exception 'Seule une image de la galerie passe en couverture.' using errcode = '22023';
  end if;
  select x.* into v_ancienne from public.campus_media x where x.campus_id = m.campus_id and x.kind = 'cover' for update;
  perform set_config('ntanova.echange_de_couverture', 'oui', true);
  if v_ancienne.id is not null then
    update public.campus_media x set kind = 'gallery', sort_order = m.sort_order where x.id = v_ancienne.id;
  end if;
  update public.campus_media x set kind = 'cover', sort_order = 0 where x.id = m.id;
  perform set_config('ntanova.echange_de_couverture', '', true);
  insert into prive.campus_media_history (media_id, campus_id, institution_id, action, before_data, after_data, recorded_by)
  select x.id, x.campus_id, x.institution_id, 'modification',
         case when x.id = m.id then to_jsonb(m) else to_jsonb(v_ancienne) end, to_jsonb(x), public.current_user_id()
  from public.campus_media x where x.id in (m.id, v_ancienne.id);
  update public.campuses set updated_at = now() where id = m.campus_id;
end;
$$;
comment on function public.set_campus_cover(uuid) is
  '« En couverture » : une image de la galerie devient la couverture du site ; l''ancienne couverture prend sa place dans la galerie. 20/11.';
revoke all on function public.set_campus_cover(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_campus_cover(uuid) to authenticated;

-- A8 et A19 : le numéro de l'école ---------------------------------------------------------------------------------------------------------------
alter table prive.direction_contacts
  add column kind text not null default 'personne' check (kind in ('personne', 'numero_ecole')),
  add column read_on text check (read_on in ('prospectus', 'enseigne', 'site_web', 'facebook', 'autre')),
  add column illegible boolean not null default false,
  drop constraint direction_contacts_numero_avec_accord,
  add constraint direction_contacts_numero_avec_accord check (whatsapp is null or contact_agreement or kind = 'numero_ecole'),
  add constraint direction_contacts_numero_de_l_ecole check (
    kind = 'personne' and read_on is null and not illegible
    or kind = 'numero_ecole' and read_on is not null and role is null and name is null and not contact_agreement
       and submission_id is null
       and (case when illegible then whatsapp is null and said_note is not null else whatsapp is not null end)
  );
comment on column prive.direction_contacts.kind is
  'Une personne (avec son accord), ou le numéro de l''école lu sur un document ou sur l''enseigne (privé, sans accord de personne).';

create function public.add_school_number(p_campus uuid, p_number public.telephone, p_read_on text, p_illegible boolean, p_note text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_note text := nullif(btrim(p_note), '');
begin
  perform public.exiger_admin_session();
  if not exists (select 1 from public.campuses c where c.id = p_campus) then
    raise exception 'Site introuvable.' using errcode = 'P0002';
  end if;
  if p_read_on is null or p_read_on not in ('prospectus', 'enseigne', 'site_web', 'facebook', 'autre') then
    raise exception 'Dis où le numéro a été lu.' using errcode = '22023';
  end if;
  if coalesce(p_illegible, false) and v_note is null then
    raise exception 'Écris ce qu''on lit du numéro, même incomplet.' using errcode = '22023';
  end if;
  if not coalesce(p_illegible, false) and p_number is null then
    raise exception 'Écris le numéro, ou coche « Illisible en partie ».' using errcode = '22023';
  end if;
  insert into prive.direction_contacts (campus_id, kind, read_on, illegible, whatsapp, said_note, source, added_by)
  values (p_campus, 'numero_ecole', p_read_on, coalesce(p_illegible, false),
          case when coalesce(p_illegible, false) then null else p_number end, left(v_note, 1000), 'administration',
          (select public.current_user_id()))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.add_school_number(uuid, public.telephone, text, boolean, text) is
  'Le numéro de l''école, lu sur un prospectus, l''enseigne, son site ou sa page Facebook : privé, sans accord de personne ; illisible en partie, il se garde en mots. 20/11.';
revoke all on function public.add_school_number(uuid, public.telephone, text, boolean, text) from public, anon, authenticated, service_role;
grant execute on function public.add_school_number(uuid, public.telephone, text, boolean, text) to authenticated;

drop function public.contacts_of_campus(uuid);
create function public.contacts_of_campus(p_campus uuid)
returns table (
  id uuid, role public.fonction_direction, role_detail text, name text, whatsapp public.telephone,
  contact_agreement boolean, agreement_at timestamptz, said_note text, received_at timestamptz, source text,
  submission_id uuid, submission_taken_at timestamptz, relay_first_name text,
  kind text, read_on text, illegible boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
    with recursive fiches(fid, profondeur) as (
      select s.id, 0 from public.field_submissions s
      where s.campus_id = p_campus or s.duplicate_of_campus_id = p_campus
      union
      select s.corrects_submission_id, f.profondeur + 1
      from fiches f join public.field_submissions s on s.id = f.fid
      where s.corrects_submission_id is not null and f.profondeur < 20
    )
    select c.id, c.role, c.role_detail, c.name, c.whatsapp, c.contact_agreement, c.agreement_at, c.said_note,
           c.received_at, c.source, c.submission_id, s.taken_at, nullif(btrim(r.prenom), ''),
           c.kind, c.read_on, c.illegible
    from prive.direction_contacts c
    left join public.field_submissions s on s.id = c.submission_id
    left join public.relais r on r.id = s.relay_id
    where c.submission_id in (select f.fid from fiches f)
       or (c.submission_id is null and c.campus_id = p_campus)
    -- Les personnes d'abord, puis le numéro de l'école ; ceux qui ont un numéro d'abord, puis le plus récent.
    order by (c.kind = 'numero_ecole'), (c.whatsapp is null), c.received_at desc, c.id;
end;
$$;
comment on function public.contacts_of_campus(uuid) is
  'Les contacts privés d''un site : les personnes (relevés et administration) et le numéro de l''école lu sur un document. 20/11.';
revoke all on function public.contacts_of_campus(uuid) from public, anon, authenticated, service_role;
grant execute on function public.contacts_of_campus(uuid) to authenticated;

-- A25 : plusieurs rentrées -----------------------------------------------------------------------------------------------------------------------
alter table public.campus_admission_steps
  add column label text check (length(btrim(label)) between 1 and 40),
  add constraint campus_admission_steps_libelle_de_rentree check (label is null or step = 'rentree'),
  drop constraint campus_admission_steps_pkey;
create unique index campus_admission_steps_une_par_etape
  on public.campus_admission_steps (campus_id, school_year, step, coalesce(label, ''));
comment on column public.campus_admission_steps.label is
  'Le libellé d''une rentrée de plus (« 2e rentrée », « Master ») ; nul pour la rentrée principale et pour les autres étapes.';

create or replace function public.set_campus_admission(
  p_campus uuid, p_school_year text, p_documents text[], p_where_to_apply text, p_on_site_only boolean, p_declared_on date,
  p_steps jsonb default '[]'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_annee text := nullif(btrim(p_school_year), '');
  v_before jsonb;
  v_after jsonb;
  v_step jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if not exists (select 1 from public.campuses c where c.id = p_campus and c.trashed_at is null) then
    raise exception 'École introuvable.' using errcode = 'P0002';
  end if;
  if v_annee is null or p_declared_on is null or p_declared_on > (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'L''année scolaire et la date réelle où l''école l''a dit sont requises.' using errcode = '22023';
  end if;
  -- Trois étapes et jusqu'à cinq rentrées.
  if p_steps is null or jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 8 then
    raise exception 'Calendrier illisible.' using errcode = '22023';
  end if;
  select to_jsonb(a) into v_before from public.campus_admissions a where a.campus_id = p_campus and a.school_year = v_annee;
  insert into public.campus_admissions (campus_id, school_year, documents, where_to_apply, on_site_only, declared_on)
  values (p_campus, v_annee,
          coalesce((select array_agg(btrim(d)) from unnest(coalesce(p_documents, '{}')) d where nullif(btrim(d), '') is not null), '{}'),
          nullif(btrim(p_where_to_apply), ''), coalesce(p_on_site_only, false), p_declared_on)
  on conflict (campus_id, school_year) do update set documents = excluded.documents, where_to_apply = excluded.where_to_apply,
    on_site_only = excluded.on_site_only, declared_on = excluded.declared_on;
  delete from public.campus_admission_steps s where s.campus_id = p_campus and s.school_year = v_annee;
  for v_step in select x from jsonb_array_elements(p_steps) x loop
    insert into public.campus_admission_steps (campus_id, school_year, step, starts_on, ends_on, label)
    values (p_campus, v_annee, (v_step ->> 'step')::public.admission_step, (v_step ->> 'starts_on')::date, (v_step ->> 'ends_on')::date,
            nullif(btrim(v_step ->> 'label'), ''));
  end loop;
  select to_jsonb(a) || jsonb_build_object('steps', p_steps) into v_after
  from public.campus_admissions a where a.campus_id = p_campus and a.school_year = v_annee;
  insert into prive.campus_admission_history (campus_id, school_year, action, before_data, after_data, recorded_by)
  values (p_campus, v_annee, 'enregistrement', v_before, v_after, public.current_user_id());
exception
  when check_violation or unique_violation or invalid_datetime_format or not_null_violation then
    raise exception 'Vérifie les pièces (10 au plus), le lieu de dépôt (300 caractères) et le calendrier (une date par étape, la fin après le début ; une rentrée de plus porte un libellé, 40 caractères).'
      using errcode = '22023';
end;
$$;

create or replace view public.public_campus_admissions with (security_barrier = true) as
select a.campus_id, a.school_year, a.documents, a.where_to_apply, a.on_site_only, a.declared_on,
       coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'starts_on', s.starts_on, 'ends_on', s.ends_on, 'label', s.label)
                                  order by s.starts_on, s.step)
                 from public.campus_admission_steps s where s.campus_id = a.campus_id and s.school_year = a.school_year), '[]') as steps
from public.campus_admissions a
join public.campuses c on c.id = a.campus_id
where c.publication = 'publiee' and c.trashed_at is null;

-- A11 : l'import d'une formation dit sa durée, le niveau demandé et le jour où l'école l'a dit ------------------------------------
-- Les mêmes règles que `set_program_details` : un détail porte sa date réelle. Un relevé de relais n'envoie rien de tout cela.
create or replace function public.upsert_programs(p_campus uuid, p_programs jsonb, p_origin public.origin_kind, p_submission uuid default null)
returns integer
language plpgsql set search_path = '' as $$
declare
  v_item jsonb;
  v_cycle public.niveau;
  v_cycle_id uuid;
  v_added integer := 0;
  v_rows integer;
  v_duree numeric;
  v_niveau text;
  v_dit_le date;
begin
  if p_programs is null or jsonb_typeof(p_programs) <> 'array' then
    return 0;
  end if;
  for v_item in select * from jsonb_array_elements(p_programs) loop
    if coalesce(btrim(v_item ->> 'title'), '') = '' then
      raise exception 'Une formation sans titre : écris ce qui est affiché (« Série C », « BTS Gestion »…).' using errcode = '22023';
    end if;
    v_duree := nullif(v_item ->> 'duration_years', '')::numeric;
    v_niveau := nullif(btrim(v_item ->> 'admission_level'), '');
    v_dit_le := nullif(v_item ->> 'declared_on', '')::date;
    if (v_duree is not null or v_niveau is not null) and v_dit_le is null then
      raise exception 'La formation « % » a une durée ou un niveau demandé : dis le jour où l''école l''a dit.', btrim(v_item ->> 'title')
        using errcode = '22023';
    end if;
    if v_dit_le > (current_timestamp at time zone 'Africa/Brazzaville')::date then
      raise exception 'Le jour où l''école l''a dit ne peut pas être dans le futur.' using errcode = '22023';
    end if;
    v_cycle := (v_item ->> 'cycle')::public.niveau;
    insert into public.campus_cycles (campus_id, cycle) values (p_campus, v_cycle)
    on conflict on constraint campus_cycles_un_par_cycle do nothing;
    select cc.id into v_cycle_id from public.campus_cycles cc where cc.campus_id = p_campus and cc.cycle = v_cycle;

    insert into public.campus_programs (campus_cycle_id, domain_id, title, bac_track, diploma, rhythms, origin, source_submission_id,
                                        duration_years, admission_level, details_declared_on)
    values (
      v_cycle_id,
      (select d.id from public.education_domains d where d.slug = nullif(v_item ->> 'domain', '')),
      btrim(v_item ->> 'title'),
      nullif(v_item ->> 'bac_track', '')::public.bac_track,
      nullif(v_item ->> 'diploma', '')::public.diploma_kind,
      coalesce((select array_agg(x::public.study_rhythm) from jsonb_array_elements_text(v_item -> 'rhythms') x), '{}'),
      p_origin,
      p_submission,
      v_duree,
      v_niveau,
      case when v_duree is not null or v_niveau is not null then v_dit_le end
    )
    on conflict (campus_cycle_id, (public.norm_text(title))) do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;
  return v_added;
end;
$$;
