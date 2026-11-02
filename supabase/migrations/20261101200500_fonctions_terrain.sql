-- Les fonctions du terrain : ce que le relais appelle, et ce que l'administration décide.
--
-- Règle de prudence : une fonction `security definer` (qui s'exécute avec les droits de son propriétaire)
-- ne vérifie JAMAIS l'administration par `exiger_admin()` (le rôle `postgres` y serait reconnu à tort) mais
-- par `est_admin()`, qui lit l'identité du jeton. Les fonctions qui touchent le schéma `prive` sont
-- `security definer` : l'API n'a aucun droit direct dessus.
-- Les paramètres portent le préfixe `p_`, les variables locales `v_` : aucune ambiguïté avec les colonnes.

-- Les outils --------------------------------------------------------------------------------------------

-- L'adresse d'un campus : le nom (et l'implantation), unique dans sa division (`-2`, `-3`… si elle est prise).
create function public.unique_campus_slug(p_division uuid, p_text text) returns text
language plpgsql stable set search_path = '' as $$
declare
  v_base text := public.slugifier(coalesce(p_text, ''));
  v_candidate text;
  n int := 1;
begin
  if v_base = '' then
    raise exception 'Le nom ne donne aucune adresse : le corriger avant de publier.' using errcode = '22023';
  end if;
  v_candidate := v_base;
  while exists (
    select 1 from public.campuses c where c.division_id is not distinct from p_division and c.slug = v_candidate
  ) loop
    n := n + 1;
    v_candidate := v_base || '-' || n;
  end loop;
  return v_candidate;
end;
$$;

-- Ajoute des formations à un campus. `p_programs` : une liste d'objets
--   {"cycle": "lycee", "title": "Série C", "domain": "sciences-technologies", "bac_track": "c",
--    "diploma": "bac", "rhythms": ["jour"]}
-- Le cycle est créé s'il manque ; une formation déjà connue (même cycle, même titre à l'accent près)
-- n'est pas dédoublée. Rend le nombre de formations ajoutées.
create function public.upsert_programs(
  p_campus uuid, p_programs jsonb, p_origin public.origin_kind, p_submission uuid default null
) returns integer
language plpgsql set search_path = '' as $$
declare
  v_item jsonb;
  v_cycle public.niveau;
  v_cycle_id uuid;
  v_added integer := 0;
  v_rows integer;
begin
  if p_programs is null or jsonb_typeof(p_programs) <> 'array' then
    return 0;
  end if;
  for v_item in select * from jsonb_array_elements(p_programs) loop
    if coalesce(btrim(v_item ->> 'title'), '') = '' then
      raise exception 'Une formation sans titre : écris ce qui est affiché (« Série C », « BTS Gestion »…).' using errcode = '22023';
    end if;
    v_cycle := (v_item ->> 'cycle')::public.niveau;
    insert into public.campus_cycles (campus_id, cycle) values (p_campus, v_cycle)
    on conflict on constraint campus_cycles_un_par_cycle do nothing;
    select cc.id into v_cycle_id from public.campus_cycles cc where cc.campus_id = p_campus and cc.cycle = v_cycle;

    insert into public.campus_programs (campus_cycle_id, domain_id, title, bac_track, diploma, rhythms, origin, source_submission_id)
    values (
      v_cycle_id,
      (select d.id from public.education_domains d where d.slug = nullif(v_item ->> 'domain', '')),
      btrim(v_item ->> 'title'),
      nullif(v_item ->> 'bac_track', '')::public.bac_track,
      nullif(v_item ->> 'diploma', '')::public.diploma_kind,
      coalesce((select array_agg(x::public.study_rhythm) from jsonb_array_elements_text(v_item -> 'rhythms') x), '{}'),
      p_origin,
      p_submission
    )
    on conflict (campus_cycle_id, (public.norm_text(title))) do nothing;
    get diagnostics v_rows = row_count;
    v_added := v_added + v_rows;
  end loop;
  return v_added;
end;
$$;

-- Ce que le relais appelle ---------------------------------------------------------------------------------

-- Le contact de la direction : le relais l'envoie sans pouvoir le relire. Répond `recu` ou `deja_recu`.
create function public.send_contact(
  p_submission uuid,
  p_role public.fonction_direction default null,
  p_name text default null,
  p_whatsapp public.telephone default null,
  p_agreement boolean default false,
  p_agreement_at timestamptz default null,
  p_note text default null
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_relais_actif() then
    raise exception 'Compte relais inactif.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.field_submissions s
    where s.id = p_submission and s.relay_id = (select public.current_user_id())
  ) then
    raise exception 'Relevé inconnu : envoyer la fiche avant le contact.' using errcode = 'P0002';
  end if;

  insert into prive.direction_contacts (submission_id, role, name, whatsapp, contact_agreement, agreement_at, said_note)
  values (p_submission, p_role, nullif(btrim(p_name), ''), p_whatsapp, coalesce(p_agreement, false), p_agreement_at, nullif(btrim(p_note), ''))
  on conflict (submission_id) do nothing;

  return case when found then 'recu' else 'deja_recu' end;
end;
$$;

-- L'enregistrement d'une photo déjà déposée dans le stockage. Le chemin est CALCULÉ ici (`<relevé>/<photo>.<ext>`) :
-- le relais ne choisit jamais un chemin, et la base ne reçoit jamais d'adresse complète.
-- Rejouable : une photo déjà enregistrée répond `deja_recu`.
create function public.register_photo(
  p_photo uuid,
  p_submission uuid,
  p_role public.photo_role,
  p_mime text,
  p_bytes integer,
  p_width integer default null,
  p_height integer default null,
  p_taken_at timestamptz default null
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_relais_actif() then
    raise exception 'Compte relais inactif.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.field_submissions s
    where s.id = p_submission and s.relay_id = (select public.current_user_id())
  ) then
    raise exception 'Relevé inconnu : envoyer la fiche avant les photos.' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.field_submission_photos p where p.id = p_photo) then
    return 'deja_recu';
  end if;

  insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes, width, height, taken_at)
  values (
    p_photo, p_submission, p_role,
    p_submission::text || '/' || p_photo::text || case p_mime when 'image/webp' then '.webp' else '.jpg' end,
    p_mime, p_bytes, p_width, p_height, p_taken_at
  );
  return 'recu';
end;
$$;

-- Le lot du relais : son nom, sa date, et son contour en GeoJSON (celui du lot, sinon celui de sa division).
create function public.my_batch()
returns table (id uuid, nom text, essai boolean, a_rendre_le date, contour_geojson text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.nom, l.essai, l.a_rendre_le,
         extensions.st_asgeojson(public.batch_area(l.id))
  from public.lots l
  where public.est_relais_actif() and l.id = public.mon_lot();
$$;

-- Les écoles connues autour du lot du relais, pour que l'alerte « doublon possible à moins de 40 m »
-- marche sans réseau : le nom et la position, rien d'autre. On y trouve les campus (publiés, prêts, en
-- brouillon, jamais les retirés) ET les relevés pas encore acceptés, de tous les relais du lot : deux relais
-- qui relèvent la même école se voient avant de l'envoyer deux fois.
-- Le périmètre : le contour du lot (à 100 m près) ; sans contour connu, tout ce qui est sous sa division.
create function public.known_places_in_my_batch()
returns table (kind text, id uuid, name text, latitude double precision, longitude double precision)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_batch uuid;
  v_division uuid;
  v_area extensions.geometry;
  v_path extensions.ltree;
begin
  if not public.est_relais_actif() then
    return;
  end if;
  v_batch := public.mon_lot();
  select l.geo_division_id into v_division from public.lots l where l.id = v_batch;
  if v_division is null then
    return;
  end if;
  v_area := public.batch_area(v_batch);
  select d.path into v_path from public.geo_divisions d where d.id = v_division;

  return query
  select 'campus'::text, c.id,
         i.name || coalesce(' — ' || c.label, ''),
         extensions.st_y(c.position), extensions.st_x(c.position)
  from public.campuses c
  join public.institutions i on i.id = c.institution_id
  left join public.geo_divisions d on d.id = c.division_id
  where c.publication <> 'retiree'
    and c.position is not null
    and (
      (v_area is not null and extensions.st_dwithin(v_area::extensions.geography, c.position::extensions.geography, 100))
      or (v_area is null and d.path operator(extensions.<@) v_path)
    )
  union all
  select 'submission'::text, s.id, s.sign_name, extensions.st_y(s.position), extensions.st_x(s.position)
  from public.field_submissions s
  where s.status in ('a_valider', 'a_corriger')
    and s.position is not null
    and (
      s.batch_id = v_batch
      or (v_area is not null and extensions.st_dwithin(v_area::extensions.geography, s.position::extensions.geography, 100))
    )
  limit 5000;
end;
$$;

-- Les écoles confiées au relais (ses missions ouvertes), avec ce que la base en sait.
create function public.my_missions()
returns table (
  mission_id uuid, campus_id uuid, name text, label text, neighbourhood text, school_kind text,
  cycles text[], curriculum_note text, landmark text, sign_phone text, note text, kind text
)
language sql stable security definer set search_path = '' as $$
  select m.id, c.id, i.name, c.label, c.neighbourhood, i.kind::text,
         coalesce((select array_agg(cc.cycle::text order by cc.cycle) from public.campus_cycles cc where cc.campus_id = c.id), '{}'),
         c.curriculum_note, c.landmark, c.sign_phone::text, m.note, m.kind::text
  from public.missions m
  join public.campuses c on c.id = m.campus_id
  join public.institutions i on i.id = c.institution_id
  where public.est_relais_actif() and m.status = 'open' and m.relay_id = (select public.current_user_id())
  order by m.created_at;
$$;

-- Ce que l'administration décide -------------------------------------------------------------------------------

-- Accepte un relevé et le transforme dans le catalogue, en un geste :
--   new_institution  une nouvelle institution et son premier campus ;
--   new_campus       un nouveau campus d'une institution connue (p_institution) ;
--   update_campus    met à jour le campus donné (p_campus) : une correction, une contre-visite, un doublon fusionné ;
--   add_cycle        ajoute les cycles du relevé au campus donné, sans toucher au reste.
-- Sans mode, on le déduit : un campus donné ou repris d'une correction ou d'une contre-visite → update_campus ;
-- une institution donnée → new_campus ; sinon new_institution. `p_programs` : les formations lues sur les
-- photos (voir upsert_programs). Rend l'identifiant du campus. Jamais pour le lot d'essai.
create function public.accept_submission(
  p_submission uuid,
  p_mode text default null,
  p_campus uuid default null,
  p_institution uuid default null,
  p_label text default null,
  p_programs jsonb default '[]'::jsonb
) returns uuid
language plpgsql set search_path = '' as $$
declare
  r public.field_submissions;
  c public.campuses;
  v_mode text := p_mode;
  v_campus uuid := p_campus;
  v_institution uuid := p_institution;
  v_division uuid;
  v_name text;
  v_payable boolean;
begin
  perform public.exiger_admin();

  select s.* into r from public.field_submissions s where s.id = p_submission for update;
  if not found then
    raise exception 'Relevé introuvable.' using errcode = 'P0002';
  end if;
  if r.status = 'accepte' then
    return r.campus_id;
  end if;
  if r.status = 'refuse' then
    raise exception 'Relevé refusé : un refus est définitif. Le relais peut envoyer une nouvelle fiche.' using errcode = '22023';
  end if;
  if exists (select 1 from public.lots l where l.id = r.batch_id and l.essai) then
    raise exception 'Relevé du lot d''essai : il ne se publie jamais (le valider pour la paie d''essai).' using errcode = '22023';
  end if;

  -- Une correction reprend le campus de la fiche qu'elle corrige ; une contre-visite, celui qu'elle visite.
  if v_campus is null and r.corrects_submission_id is not null then
    select o.campus_id into v_campus from public.field_submissions o where o.id = r.corrects_submission_id;
  end if;
  if v_campus is null and r.kind = 'contre_visite' then
    v_campus := r.duplicate_of_campus_id;
  end if;

  v_mode := coalesce(v_mode, case
    when v_campus is not null then 'update_campus'
    when v_institution is not null then 'new_campus'
    else 'new_institution' end);
  if v_mode not in ('new_institution', 'new_campus', 'update_campus', 'add_cycle') then
    raise exception 'Mode inconnu : %.', v_mode using errcode = '22023';
  end if;
  if v_mode in ('update_campus', 'add_cycle') and v_campus is null then
    raise exception 'Il faut dire quel campus mettre à jour.' using errcode = '22023';
  end if;
  if v_mode = 'new_campus' and v_institution is null then
    raise exception 'Il faut dire à quelle institution rattacher le nouveau campus.' using errcode = '22023';
  end if;

  -- La division du relevé : la plus fine qui contient sa position, sinon celle de son lot.
  v_division := coalesce(
    case when r.position is not null
         then public.division_of_position(extensions.st_y(r.position), extensions.st_x(r.position), 3::smallint) end,
    (select l.geo_division_id from public.lots l where l.id = r.batch_id)
  );

  if v_mode in ('new_institution', 'new_campus') then
    if v_division is null then
      raise exception 'Division inconnue : rattacher le relevé à un lot.' using errcode = '22023';
    end if;
    v_name := btrim(r.sign_name);
    if v_mode = 'new_institution' then
      insert into public.institutions (name, kind) values (v_name, r.school_kind) returning id into v_institution;
    elsif not exists (select 1 from public.institutions i where i.id = v_institution) then
      raise exception 'Institution introuvable.' using errcode = 'P0002';
    else
      select i.name into v_name from public.institutions i where i.id = v_institution;
    end if;
    insert into public.campuses (
      institution_id, label, slug, division_id, landmark, sign_phone, position, publication, origin,
      curriculum_note, surveyed_at
    ) values (
      v_institution, nullif(btrim(p_label), ''),
      public.unique_campus_slug(v_division, v_name || ' ' || coalesce(btrim(p_label), '')),
      v_division, r.landmark, r.sign_phone, r.position, 'prete', 'field', r.curriculum_note, r.taken_at
    ) returning id into v_campus;
    insert into public.campus_cycles (campus_id, cycle)
    select v_campus, x from unnest(r.levels) x
    on conflict on constraint campus_cycles_un_par_cycle do nothing;
  else
    select k.* into c from public.campuses k where k.id = v_campus for update;
    if not found then
      raise exception 'Campus introuvable.' using errcode = 'P0002';
    end if;
    if c.division_id is null and v_division is null then
      raise exception 'Ce campus n''est pas encore situé : il faut un relevé avec une position.' using errcode = '22023';
    end if;
    -- Un campus vérifié par la direction n'est plus modifié par un relevé.
    if c.verification_state <> 'verifiee' then
      if v_mode = 'update_campus' then
        update public.institutions i set
          name = case
                   when (select count(*) from public.campuses k where k.institution_id = i.id) = 1
                   then btrim(r.sign_name) else i.name end,
          kind = case when r.school_kind = 'non_indique' then i.kind else r.school_kind end
        where i.id = c.institution_id;
        update public.campuses k set
          curriculum_note = coalesce(r.curriculum_note, k.curriculum_note),
          landmark = coalesce(r.landmark, k.landmark),
          sign_phone = coalesce(r.sign_phone, k.sign_phone),
          position = coalesce(r.position, k.position),
          division_id = coalesce(k.division_id, v_division),
          surveyed_at = greatest(k.surveyed_at, r.taken_at),
          publication = case when k.publication = 'brouillon' then 'prete' else k.publication end
        where k.id = v_campus;
      else
        update public.campuses k set
          landmark = coalesce(k.landmark, r.landmark),
          sign_phone = coalesce(k.sign_phone, r.sign_phone),
          surveyed_at = greatest(k.surveyed_at, r.taken_at)
        where k.id = v_campus;
      end if;
      insert into public.campus_cycles (campus_id, cycle)
      select v_campus, x from unnest(r.levels) x
      on conflict on constraint campus_cycles_un_par_cycle do nothing;
      -- Une correction dit la vérité : un cycle coché à tort, sans formation, disparaît.
      if r.kind = 'correction' and cardinality(r.levels) > 0 then
        delete from public.campus_cycles cc
        where cc.campus_id = v_campus
          and cc.cycle <> all (r.levels)
          and not exists (select 1 from public.campus_programs p where p.campus_cycle_id = cc.id);
      end if;
    end if;
  end if;

  perform public.upsert_programs(v_campus, p_programs, 'field', r.id);

  -- Une école déjà relevée par un autre relais ne se paie pas deux fois ; une correction ne se paie pas :
  -- la fiche qu'elle corrige porte la paie.
  v_payable := r.kind <> 'correction' and not exists (
    select 1 from public.field_submissions o
    where o.campus_id = v_campus and o.status = 'accepte' and o.id <> r.id
      and o.kind <> 'correction' and o.relay_id <> r.relay_id
  );

  update public.field_submissions set
    status = 'accepte', campus_id = v_campus, accepted_as = v_mode, reason = null,
    message_to_relay = null, decided_at = now(), payable = v_payable
  where id = r.id;

  -- La fiche corrigée est close avec sa correction.
  if r.corrects_submission_id is not null then
    update public.field_submissions o set
      status = 'accepte', campus_id = v_campus, accepted_as = v_mode, reason = null,
      message_to_relay = null, decided_at = now(),
      payable = not exists (
        select 1 from public.field_submissions x
        where x.campus_id = v_campus and x.status = 'accepte' and x.id <> o.id
          and x.kind <> 'correction' and x.relay_id <> o.relay_id
      )
    where o.id = r.corrects_submission_id and o.status <> 'accepte';
  end if;

  -- Le campus est relevé : la mission confiée au relais est terminée.
  update public.missions m set status = 'done', closed_at = now(), closed_by_submission_id = r.id
  where m.campus_id = v_campus and m.status = 'open';

  return v_campus;
end;
$$;

-- Demande une correction au relais (« la photo est floue, reprenez-la de face »).
create function public.request_correction(p_submission uuid, p_reason public.motif_decision, p_message text default null)
returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.field_submissions s set
    status = 'a_corriger', reason = p_reason, message_to_relay = p_message, decided_at = now()
  where s.id = p_submission and s.status in ('a_valider', 'a_corriger');
  if not found then
    raise exception 'Relevé introuvable ou déjà décidé.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.refuse_submission(p_submission uuid, p_reason public.motif_decision, p_message text default null)
returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.field_submissions s set
    status = 'refuse', reason = p_reason, message_to_relay = p_message, decided_at = now()
  where s.id = p_submission and s.status in ('a_valider', 'a_corriger');
  if not found then
    raise exception 'Relevé introuvable ou déjà décidé.' using errcode = 'P0002';
  end if;
end;
$$;

-- La personne a confirmé sa fonction à NTanova sur WhatsApp : c'est ce qui compte pour la paie du relais.
create function public.confirm_contact(p_submission uuid, p_role public.fonction_direction) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.field_submissions s set contact_confirmed_at = now(), contact_role = p_role
  where s.id = p_submission;
  if not found then
    raise exception 'Relevé introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- L'administration lit le contact d'un relevé (l'écran « À valider »).
create function public.contact_of_submission(p_submission uuid)
returns table (
  role public.fonction_direction, name text, whatsapp public.telephone,
  contact_agreement boolean, agreement_at timestamptz, said_note text, received_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  return query
    select c.role, c.name, c.whatsapp, c.contact_agreement, c.agreement_at, c.said_note, c.received_at
    from prive.direction_contacts c
    where c.submission_id = p_submission;
end;
$$;

-- Un contact a-t-il été reçu pour ce relevé ? Oui ou non, rien de son contenu.
create function public.contact_received(p_submission uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from prive.direction_contacts c where c.submission_id = p_submission);
$$;

-- Le lot d'essai : on valide les fiches avec le relais sans les publier ; elles comptent pour la paie d'essai.
create function public.validate_trial_submission(p_submission uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.field_submissions s set trial_validated_at = coalesce(s.trial_validated_at, now())
  where s.id = p_submission and s.status in ('a_valider', 'a_corriger')
    and exists (select 1 from public.lots l where l.id = s.batch_id and l.essai);
  if not found then
    raise exception 'Seul un relevé du lot d''essai, encore ouvert, se valide ainsi.' using errcode = '22023';
  end if;
end;
$$;

-- Le cycle de vie d'un campus ---------------------------------------------------------------------------------

create function public.publish_campus(p_campus uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.campuses c set
    publication = 'publiee', retired_at = null, retirement_reason = null, retirement_note = null
  where c.id = p_campus and c.publication in ('prete', 'retiree') and c.replaced_by_campus_id is null;
  if not found then
    raise exception 'Seul un campus prêt ou retiré se publie (un campus à situer attend sa position).' using errcode = '22023';
  end if;
end;
$$;

-- Tous les campus prêts d'une division et de tout ce qu'elle contient ; rend leur nombre.
create function public.publish_division(p_division uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  perform public.exiger_admin();
  update public.campuses c set publication = 'publiee'
  where c.publication = 'prete'
    and c.division_id in (
      select d.id from public.geo_divisions d
      join public.geo_divisions a on d.path operator(extensions.<@) a.path
      where a.id = p_division
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Les campus prêts relevés dans un lot (par un relevé accepté) ; rend leur nombre.
create function public.publish_batch(p_batch uuid) returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
begin
  perform public.exiger_admin();
  update public.campuses c set publication = 'publiee'
  where c.publication = 'prete'
    and exists (
      select 1 from public.field_submissions s
      where s.campus_id = c.id and s.status = 'accepte' and s.batch_id = p_batch
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.retire_campus(p_campus uuid, p_reason public.motif_retrait, p_note text default null)
returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.campuses c set
    publication = 'retiree', retired_at = now(), retirement_reason = p_reason, retirement_note = p_note
  where c.id = p_campus and c.publication in ('prete', 'publiee');
  if not found then
    raise exception 'Seul un campus prêt ou publié se retire.' using errcode = '22023';
  end if;
  update public.missions m set status = 'cancelled', closed_at = now()
  where m.campus_id = p_campus and m.status = 'open';
end;
$$;

-- Deux fiches décrivaient le même campus : le premier est retiré (motif « doublon ») et renvoie vers le second ;
-- ses relevés aussi.
create function public.merge_campuses(p_duplicate uuid, p_kept uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if p_duplicate = p_kept then
    raise exception 'Un campus ne se fusionne pas avec lui-même.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campuses c where c.id = p_kept and c.publication <> 'retiree') then
    raise exception 'Le campus gardé doit exister et ne pas être retiré.' using errcode = '22023';
  end if;
  update public.campuses c set
    publication = 'retiree', retired_at = now(), retirement_reason = 'doublon', replaced_by_campus_id = p_kept
  where c.id = p_duplicate;
  if not found then
    raise exception 'Campus introuvable.' using errcode = 'P0002';
  end if;
  update public.field_submissions s set campus_id = p_kept where s.campus_id = p_duplicate;
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_duplicate and m.status = 'open';
  insert into prive.erasures (what, campus_id, by_user, note)
  values ('merge', p_duplicate, (select public.current_user_id()), 'Fusionné dans ' || p_kept::text);
end;
$$;

-- Donne (ou corrige) la position d'un campus connu, prise sur une carte. Rend le nom de la division où il tombe.
-- Sans `p_division`, on la cherche dans les contours connus ; sans contour, on garde celle du campus, sinon il faut la dire.
-- Un campus publié ne change pas de division (son adresse publique changerait) ; un campus retiré ne se modifie plus.
create function public.locate_campus(p_campus uuid, p_latitude double precision, p_longitude double precision, p_division uuid default null)
returns text
language plpgsql set search_path = '' as $$
declare
  c public.campuses;
  v_division uuid;
  v_name text;
begin
  perform public.exiger_admin();
  select k.* into c from public.campuses k where k.id = p_campus for update;
  if not found then
    raise exception 'Campus introuvable.' using errcode = 'P0002';
  end if;
  if c.publication = 'retiree' then
    raise exception 'Un campus retiré ne se modifie plus : le republier d''abord.' using errcode = '22023';
  end if;
  v_division := coalesce(
    p_division,
    public.division_of_position(p_latitude, p_longitude, 3::smallint),
    c.division_id
  );
  if v_division is null then
    raise exception 'Cette position n''est dans aucune division connue : choisis la division.' using errcode = '22023';
  end if;
  if c.publication = 'publiee' and c.division_id is distinct from v_division then
    raise exception 'Cette position est dans une autre division que la fiche : son adresse publique changerait. Retire la fiche du site d''abord.'
      using errcode = '22023';
  end if;
  if c.division_id is distinct from v_division and exists (
    select 1 from public.campuses x where x.division_id = v_division and x.slug = c.slug and x.id <> c.id
  ) then
    raise exception 'Un autre campus de cette division a déjà cette adresse : change le nom d''abord.' using errcode = '22023';
  end if;
  select d.name into v_name from public.geo_divisions d where d.id = v_division;

  update public.campuses k set
    position = extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326),
    division_id = v_division,
    located_at = now(),
    located_by = (select public.current_user_id()),
    publication = case when k.publication = 'brouillon' then 'prete' else k.publication end
  where k.id = p_campus;
  return v_name;
end;
$$;

-- Les missions : confier un campus connu à un relais actif, avec ce qu'il doit vérifier.
create function public.assign_mission(
  p_campus uuid, p_relay uuid, p_kind public.mission_kind default 'verify', p_note text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.exiger_admin();
  if not exists (select 1 from public.relais r where r.id = p_relay and r.statut = 'actif') then
    raise exception 'Ce relais n''est pas actif : l''activer d''abord.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campuses c where c.id = p_campus and c.publication <> 'retiree') then
    raise exception 'Campus introuvable ou retiré.' using errcode = 'P0002';
  end if;
  -- Un campus n'a qu'une mission ouverte : on reprend la précédente.
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_campus and m.status = 'open';
  insert into public.missions (campus_id, relay_id, kind, note) values (p_campus, p_relay, p_kind, p_note)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.cancel_mission(p_campus uuid) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_campus and m.status = 'open';
end;
$$;

-- Le badge « Vérifié » : l'existence est constatée par un relais ET la direction a validé la fiche, à une date.
-- Il ne s'achète jamais, et ne se pose jamais sans accord daté. La preuve reste dans le schéma privé.
create function public.record_verification(
  p_campus uuid, p_agreed_on date, p_role public.fonction_direction,
  p_channel text default 'whatsapp', p_note text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if p_agreed_on is null or p_agreed_on > current_date then
    raise exception 'Il faut la date de l''accord de la direction, pas dans le futur.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.field_submissions s
    where s.campus_id = p_campus and s.status = 'accepte' and s.kind <> 'correction'
  ) then
    raise exception 'Aucun relais n''a constaté ce campus sur place : le badge « Vérifié » exige les deux.' using errcode = '22023';
  end if;
  insert into prive.verification_agreements (campus_id, agreed_on, agreed_role, channel, note, recorded_by)
  values (p_campus, p_agreed_on, p_role, coalesce(p_channel, 'whatsapp'), p_note, (select public.current_user_id()));
  update public.campuses c set verification_state = 'verifiee', verified_on = p_agreed_on, verified_role = p_role
  where c.id = p_campus;
  if not found then
    raise exception 'Campus introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- Les effacements (loi n° 29-2019) ------------------------------------------------------------------------------

create function public.erase_contact(p_submission uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  delete from prive.direction_contacts c where c.submission_id = p_submission;
  if not found then
    raise exception 'Aucun contact pour ce relevé.' using errcode = 'P0002';
  end if;
  update public.field_submissions s set contact_confirmed_at = null, contact_role = null where s.id = p_submission;
  insert into prive.erasures (what, submission_id, by_user, note)
  values ('contact', p_submission, (select public.current_user_id()), p_note);
end;
$$;

-- Efface l'enregistrement d'une photo et rend son chemin : l'application supprime ensuite le fichier.
create function public.erase_photo(p_photo uuid, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
  v_submission uuid;
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  delete from public.field_submission_photos p where p.id = p_photo
  returning p.storage_path, p.submission_id into v_path, v_submission;
  if not found then
    raise exception 'Photo introuvable.' using errcode = 'P0002';
  end if;
  insert into prive.erasures (what, submission_id, by_user, note)
  values ('photo', v_submission, (select public.current_user_id()), p_note);
  return v_path;
end;
$$;
