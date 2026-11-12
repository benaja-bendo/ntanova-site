-- M2. Le relevé du relais : le socle et le bonus (canevas « Espace relais », 12/11/2026 ; validé par le fondateur le 13/11).
--
-- Ce que le canevas demande au relais, et qui n'avait pas de place :
-- - étape 1, « On y voit » : l'enseigne, le portail, le bâtiment (rôles de photo) ;
-- - étape 2 : le sigle s'il est écrit ; « Vous la reconnaissez ? » (le même endroit, un autre site de cette école, une autre
--   école, je ne sais pas) et, pour « un autre site », l'école choisie ;
-- - étape 3 : « Qui ? » gagne « Enseignant » ; la remarque libre ;
-- - bonus : les équipements vus (« vu » seulement, jamais « absent »), la clôture oui / non (seule exception : elle se voit de
--   la rue), des photos de lieux vides pour la page, et des photos de travail (prospectus, programmes, affiche d'inscription)
--   pour NTanova seulement.
--
-- Règles de la base, pas seulement de l'écran :
-- - six photos par relevé au plus : l'enseigne et cinq autres (décision du 12/11) ;
-- - **une photo de travail ne peut jamais être publique** : `photo_role_is_public()` dit quels rôles le sont, et une contrainte
--   l'impose à `field_submission_photos` (aucune ligne en production ne la viole, vérifié le 13/11) ;
-- - à l'acceptation, le bonus préremplit ; l'administration coche ce qu'elle garde (`p_facts`, choix C3), et ne peut garder
--   que ce que le relais a vu.
-- Tout est additif : un téléphone d'avant n'envoie aucune colonne nouvelle et reste valable.

-- Les listes ---------------------------------------------------------------------------------------------------------------------------------------
alter domain public.photo_role drop constraint photo_role_check;
alter domain public.photo_role add constraint photo_role_check check (value in ('signboard', 'programs_board', 'brochure', 'building', 'entrance', 'courtyard', 'room_empty', 'sports_ground', 'enrollment_poster')) not valid;

alter domain public.equipment_key drop constraint equipment_key_check;
alter domain public.equipment_key add constraint equipment_key_check check (value in ('electricite', 'eau', 'cantine', 'transport', 'bibliotheque', 'informatique', 'terrain_sport', 'cloture', 'autre', 'toilettes')) not valid;

alter domain public.fonction_direction drop constraint fonction_direction_check;
alter domain public.fonction_direction add constraint fonction_direction_check check (value in ('promoteur', 'directeur_general', 'directeur', 'gestionnaire_comptable', 'secretariat', 'autre', 'enseignant')) not valid;

alter domain public.reponse_doublon drop constraint reponse_doublon_check;
alter domain public.reponse_doublon add constraint reponse_doublon_check check (value in ('la_meme', 'une_autre', 'autre_site', 'autre_ecole', 'ne_sait_pas')) not valid;

-- Quels rôles de photo peuvent devenir publics : une seule définition, que la contrainte et les médias (M3) utilisent ------------------------------
create function public.photo_role_is_public(p_role text) returns boolean
language sql immutable parallel safe set search_path = '' as $$
  select p_role in ('signboard', 'entrance', 'building', 'courtyard', 'room_empty', 'sports_ground')
$$;
comment on function public.photo_role_is_public(text) is
  'Vrai pour une photo de lieu (enseigne, portail, bâtiment, cour, salle vide, terrain). Prospectus, programmes et affiche d''inscription sont des photos de travail : jamais publiques.';
grant execute on function public.photo_role_is_public(text) to anon, authenticated;

alter table public.field_submission_photos
  add constraint field_submission_photos_travail_jamais_publique check (not is_public or public.photo_role_is_public(role));

-- Six photos par relevé : l'enseigne et cinq autres ----------------------------------------------------------------------------------------------
create or replace function public.field_submission_photos_avant_insertion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role <> 'signboard' and (
    select count(*) from public.field_submission_photos p
    where p.submission_id = new.submission_id and p.role <> 'signboard'
  ) >= 5 then
    raise exception 'Une fiche a au plus cinq photos en plus de l''enseigne.' using errcode = '22023';
  end if;
  return new;
end;
$$;

-- Le relevé : sigle, remarque, bonus, école d'un « autre site » -----------------------------------------------------------------------------------
alter table public.institutions
  add column acronym text check (length(btrim(acronym)) between 1 and 20);
comment on column public.institutions.acronym is 'Le sigle de l''école (« CSLP »), qui remplit le rond de son logo par défaut.';

alter table public.field_submissions
  add column acronym text check (length(btrim(acronym)) between 1 and 20),
  add column relay_note text check (length(btrim(relay_note)) between 1 and 300),
  add column seen_equipment public.equipment_key[] not null default '{}' check (cardinality(seen_equipment) <= 12),
  add column fence text check (fence in ('oui', 'non')),
  add column duplicate_of_institution_id uuid references public.institutions (id) on delete set null;
comment on column public.field_submissions.acronym is 'Le sigle s''il est écrit sur l''enseigne.';
comment on column public.field_submissions.relay_note is 'La remarque du relais (étape « La rencontre »). `come_back_note` reste pour relire les fiches d''avant.';
comment on column public.field_submissions.seen_equipment is 'Bonus : les équipements que le relais a vus. « Vu » seulement : ne rien cocher ne veut pas dire « absent ».';
comment on column public.field_submissions.fence is 'Bonus : la clôture, vue de la rue (oui, non) ; vide = pas vu.';
comment on column public.field_submissions.duplicate_of_institution_id is '« Un autre site de [école] » : l''école que le relais a reconnue. Un indice pour l''administration, qui décide.';

grant insert (acronym, relay_note, seen_equipment, fence, duplicate_of_institution_id) on public.field_submissions to authenticated;

-- Le terrain peut dire « vu » pour tout équipement, et « absent » seulement pour la clôture ------------------------------------------------------
alter table public.campus_facts drop constraint campus_facts_terrain_visible;
alter table public.campus_facts add constraint campus_facts_terrain_visible
  check (source <> 'terrain' or value = 'present' or (value = 'absent' and key = 'cloture'));

CREATE OR REPLACE FUNCTION public.set_school_fact(p_campus uuid, p_fact uuid, p_key equipment_key, p_label text, p_value equipment_state, p_source fact_source, p_observed_on date, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare v_before jsonb;v_after jsonb;v_id uuid;
begin
  perform public.exiger_admin_session();
  if p_key is null or p_value is null or p_source is null or p_observed_on is null
    or p_observed_on>(current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'Équipement, état, source et date réelle sont requis.' using errcode='22023';
  end if;
  if p_key='autre' and nullif(btrim(p_label),'') is null then
    raise exception 'Précise cet autre équipement.' using errcode='22023';
  end if;
  if p_source='terrain' and not (p_value='present' or (p_value='absent' and p_key='cloture')) then
    raise exception 'Le terrain dit seulement ce qu''il a vu : « il y en a ». Une absence se déclare par l’école (sauf la clôture, visible de la rue).' using errcode='22023';
  end if;
  if not exists (select 1 from public.campuses where id=p_campus) then raise exception 'École introuvable.' using errcode='P0002';end if;
  if p_fact is not null then
    select to_jsonb(f) into v_before from public.campus_facts f where id=p_fact and campus_id=p_campus for update;
    if not found then raise exception 'Équipement introuvable.' using errcode='P0002';end if;
    update public.campus_facts f set key=p_key,custom_label=case when p_key='autre' then nullif(btrim(p_label),'') else null end,
      value=p_value,source=p_source,observed_on=p_observed_on,note=nullif(btrim(p_note),'')
      where id=p_fact returning id,to_jsonb(f) into v_id,v_after;
  else
    insert into public.campus_facts(campus_id,key,custom_label,value,source,observed_on,note)
      values(p_campus,p_key,case when p_key='autre' then nullif(btrim(p_label),'') else null end,p_value,p_source,p_observed_on,nullif(btrim(p_note),''))
      returning id,to_jsonb(campus_facts) into v_id,v_after;
  end if;
  insert into prive.campus_fact_history(fact_id,campus_id,action,before_data,after_data,recorded_by)
    values(v_id,p_campus,case when p_fact is null then 'ajout' else 'modification' end,v_before,v_after,public.current_user_id());
  return v_id;
exception when unique_violation then
  raise exception 'Cet équipement existe déjà : modifie sa ligne.' using errcode='22023';
end;
$$;

-- Ce que le relais relit de ses fiches : les colonnes nouvelles, en dernier (le type de retour change : la fonction est refaite) ---------------
drop function public.my_submissions();
create function public.my_submissions()
returns table (
  id uuid, kind text, status text, reason text, message_to_relay text,
  corrects_submission_id uuid, campus_id uuid, duplicate_of_campus_id uuid,
  taken_at timestamptz, received_at timestamptz,
  sign_name text, levels text[], school_kind text, curriculum_note text,
  observed_programs text, programs_photographed boolean, landmark text, sign_phone text,
  latitude double precision, longitude double precision, accuracy_m real,
  direction_seen text, liaison_sheet_given boolean, come_back_note text,
  contact_confirmed_at timestamptz, contact_role text,
  has_contact boolean, photo_roles text[],
  observed_formations jsonb,
  acronym text, relay_note text, seen_equipment text[], fence text, duplicate_answer text, duplicate_of_institution_id uuid
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.kind::text, s.status::text, s.reason::text, s.message_to_relay,
         s.corrects_submission_id, s.campus_id, s.duplicate_of_campus_id,
         s.taken_at, s.received_at,
         s.sign_name, s.levels::text[], s.school_kind::text, s.curriculum_note,
         s.observed_programs, s.programs_photographed, s.landmark, s.sign_phone::text,
         extensions.st_y(s.position), extensions.st_x(s.position), s.accuracy_m,
         s.direction_seen::text, s.liaison_sheet_given, s.come_back_note,
         s.contact_confirmed_at, s.contact_role::text,
         exists (select 1 from prive.direction_contacts d where d.submission_id = s.id),
         coalesce((select array_agg(distinct p.role::text order by p.role::text)
                   from public.field_submission_photos p where p.submission_id = s.id), '{}'),
         s.observed_formations,
         s.acronym, s.relay_note, s.seen_equipment::text[], s.fence, s.duplicate_answer::text, s.duplicate_of_institution_id
  from public.field_submissions s
  where public.est_relais_actif() and s.relay_id = (select public.current_user_id())
  order by s.taken_at desc
  limit 500;
$$;
comment on function public.my_submissions() is
  'Les fiches du relais connecté, avec tout ce qu''elles contiennent : décision de NTanova, photos par rôle (sans chemin), contact arrivé (sans le contact), formations cochées, sigle, remarque, bonus et réponse « vous la reconnaissez ? ».';
revoke all on function public.my_submissions() from public, anon, authenticated;
grant execute on function public.my_submissions() to authenticated;

-- L'acceptation : le sigle dans les corrections, et le bonus gardé (`p_facts`) ----------------------------------------------------------------------
-- `accept_submission` (l'ancien appel) délègue toujours, par position, avec les huit premiers paramètres.
drop function public.accept_reviewed_submission(uuid, text, uuid, uuid, text, jsonb, uuid, jsonb, double precision, double precision);
create function public.accept_reviewed_submission(p_submission uuid, p_mode text DEFAULT NULL::text, p_campus uuid DEFAULT NULL::uuid, p_institution uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_programs jsonb DEFAULT '[]'::jsonb, p_division uuid DEFAULT NULL::uuid, p_changes jsonb DEFAULT '{}'::jsonb, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_facts jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  r public.field_submissions;
  v_orig public.field_submissions;
  c public.campuses;
  v_position extensions.geometry;
  v_given extensions.geometry;
  v_mode text := p_mode;
  v_campus uuid := p_campus;
  v_institution uuid := p_institution;
  v_division uuid;
  v_name text;
  v_payable boolean;
  v_fact jsonb;
  v_key text;
  v_value text;
  v_existing public.campus_facts;
  v_observed date;
begin
  perform public.exiger_admin();

  -- La position saisie par l'administration (ticket 144) : les deux valeurs ensemble, dans les bornes de la Terre.
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Une position se donne avec sa latitude et sa longitude.' using errcode = '22023';
  end if;
  if p_latitude is not null and not (p_latitude between -90 and 90 and p_longitude between -180 and 180) then
    raise exception 'Position illisible : la latitude va de -90 à 90, la longitude de -180 à 180.' using errcode = '22023';
  end if;

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
  if r.corrects_submission_id is not null then
    select x.* into v_orig from public.field_submissions x where x.id = r.corrects_submission_id;
    if v_campus is null then
      v_campus := v_orig.campus_id;
    end if;
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

  -- Une position saisie ne remplace jamais celle du relais, ni ne s'ajoute à de simples niveaux ; elle ne se perd pas non plus
  -- en silence : elle est posée comme « Situer » le ferait, avec qui l'a posée et quand.
  if p_latitude is not null then
    if v_mode = 'add_cycle' then
      raise exception 'Ajouter des niveaux ne change pas la position de l''école.' using errcode = '22023';
    end if;
    if coalesce(r.position, v_orig.position) is not null then
      raise exception 'Cette fiche a déjà une position, mesurée par le relais : elle fait foi. Pour la changer, utilise « Écoles › Position » après l''acceptation.'
        using errcode = '22023';
    end if;
    v_given := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326);
  end if;

  -- Seule une nouvelle institution est corrigée ici : un campus connu se modifie dans « Écoles ».
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_changes) k
                where k not in ('sign_name', 'school_kind', 'levels', 'curriculum_note', 'landmark', 'sign_phone', 'acronym')) then
    raise exception 'Valeurs de correction inconnues.' using errcode = '22023';
  end if;
  if p_changes <> '{}'::jsonb then
    if v_mode <> 'new_institution' then
      raise exception 'Les corrections avant acceptation concernent une nouvelle école.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_each(p_changes) x
               where (x.key in ('sign_name', 'school_kind') and jsonb_typeof(x.value) <> 'string')
                  or (x.key = 'levels' and jsonb_typeof(x.value) <> 'array')
                  or (x.key in ('curriculum_note', 'landmark', 'sign_phone', 'acronym') and jsonb_typeof(x.value) not in ('string', 'null'))) then
      raise exception 'Valeur de correction illisible.' using errcode = '22023';
    end if;
    -- Le record local est corrigé, jamais la ligne envoyée par le relais. Les domaines SQL contrôlent les listes et le téléphone.
    r := jsonb_populate_record(r, p_changes);
    if r.sign_name is null or r.sign_name !~ '\S' or length(btrim(r.sign_name)) > 200
       or r.school_kind is null or r.levels is null or array_position(r.levels, null) is not null
       or length(r.curriculum_note) > 200 or length(r.landmark) > 300 or length(btrim(r.acronym)) > 20 then
      raise exception 'Vérifie le nom, les niveaux, le programme et le repère.' using errcode = '22023';
    end if;
    if p_changes ? 'levels' and exists (
      select 1 from jsonb_array_elements(p_programs) p where not ((p ->> 'cycle') = any(r.levels))
    ) then
      raise exception 'Une formation ne correspond plus aux niveaux retenus.' using errcode = '22023';
    end if;
  end if;

  -- Le bonus gardé par l'administration (choix C3 du 13/11) : seulement ce que le relais a vu, « présent » ; la clôture seule
  -- peut être dite absente, parce qu'elle se voit de la rue. Rien d'autre ne passe : l'administration coche, elle n'invente pas.
  if p_facts is null or jsonb_typeof(p_facts) <> 'array' or jsonb_array_length(p_facts) > 12 then
    raise exception 'Équipements gardés illisibles.' using errcode = '22023';
  end if;
  for v_fact in select x from jsonb_array_elements(p_facts) x loop
    v_key := v_fact ->> 'key';
    v_value := v_fact ->> 'value';
    if jsonb_typeof(v_fact) <> 'object' or v_key is null or v_value not in ('present', 'absent')
       or not (
         (v_value = 'present' and (v_key = any (r.seen_equipment::text[]) or (v_key = 'cloture' and r.fence = 'oui')))
         or (v_value = 'absent' and v_key = 'cloture' and r.fence = 'non')
       ) then
      raise exception 'Un équipement gardé n''a pas été vu par le relais : %.', coalesce(v_key, '?') using errcode = '22023';
    end if;
  end loop;

  -- La division du relevé : celle que l'administration choisit ; sinon la plus fine qui contient sa position ;
  -- sinon, SANS position seulement, celle du lot du relais. Une position qu'aucun contour connu ne contient n'est plus
  -- rattachée d'office à la division du lot : elle pouvait être à des milliers de kilomètres (ticket n° 67).
  if p_division is not null
     and not exists (select 1 from public.geo_divisions d where d.id = p_division and d.level >= 2) then
    raise exception 'Division introuvable : choisissez une ville, un arrondissement ou un quartier.' using errcode = 'P0002';
  end if;
  -- Une correction d'une fiche pas encore acceptée (le relais qui reprend sa photo après un « à corriger ») n'a pas de
  -- position : « corriger pour la photo » ne la redemande pas. Elle reprend celle de la fiche d'origine, et son secteur
  -- (ticket #89) ; l'école n'était pas créée, c'est cette correction qui la crée.
  v_position := coalesce(r.position, v_orig.position, v_given);
  v_division := coalesce(
    p_division,
    case when v_position is not null
         then public.division_of_position(extensions.st_y(v_position), extensions.st_x(v_position), 3::smallint) end,
    case when v_position is null
         then (select l.geo_division_id from public.lots l where l.id = coalesce(r.batch_id, v_orig.batch_id)) end
  );

  if v_mode in ('new_institution', 'new_campus') then
    if v_division is null then
      raise exception 'Division inconnue : la position n''est dans aucune division connue (ou le relevé n''a ni position ni lot). Choisissez la division de l''école.'
        using errcode = '22023';
    end if;
    v_name := btrim(r.sign_name);
    if v_mode = 'new_institution' then
      insert into public.institutions (name, kind, acronym) values (v_name, r.school_kind, nullif(btrim(r.acronym), ''))
      returning id into v_institution;
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
      v_division, r.landmark, r.sign_phone, v_position, 'prete', 'field', r.curriculum_note, r.taken_at
    ) returning id into v_campus;
    insert into public.campus_cycles (campus_id, cycle)
    select v_campus, x from unnest(r.levels) x
    on conflict on constraint campus_cycles_un_par_cycle do nothing;
    if v_given is not null then
      update public.campuses k set located_at = now(), located_by = public.current_user_id() where k.id = v_campus;
    end if;
  else
    select k.* into c from public.campuses k where k.id = v_campus for update;
    if not found then
      raise exception 'Campus introuvable.' using errcode = 'P0002';
    end if;
    if c.division_id is null and v_division is null and v_given is null then
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
    -- Une position saisie pour une école connue passe par « Situer » : division détectée ou choisie, école retirée refusée,
    -- adresse publique protégée. Un relevé ne déplace pas une école vérifiée par la direction.
    if v_given is not null then
      if c.verification_state = 'verifiee' then
        raise exception 'Une école vérifiée par la direction ne se déplace pas par un relevé : utilise « Écoles › Position ».'
          using errcode = '22023';
      end if;
      perform public.locate_campus(v_campus, p_latitude, p_longitude, p_division);
    end if;
  end if;

  perform public.upsert_programs(v_campus, p_programs, 'field', r.id);

  -- Le sigle lu sur l'enseigne remplit celui de l'école s'il manque ; il ne remplace jamais un sigle déjà connu.
  if nullif(btrim(r.acronym), '') is not null then
    update public.institutions i set acronym = btrim(r.acronym)
    where i.id = (select k.institution_id from public.campuses k where k.id = v_campus) and i.acronym is null;
  end if;

  -- Les équipements gardés entrent comme faits du terrain, datés du jour de la photo. Une déclaration de l'école l'emporte :
  -- on n'y touche pas ; un fait du terrain plus ancien est seulement redaté.
  v_observed := (r.taken_at at time zone 'Africa/Brazzaville')::date;
  for v_fact in select x from jsonb_array_elements(p_facts) x loop
    select f.* into v_existing from public.campus_facts f
    where f.campus_id = v_campus and f.key = (v_fact ->> 'key') and f.custom_label is null;
    if not found then
      perform public.set_school_fact(v_campus, null, (v_fact ->> 'key')::public.equipment_key, null,
                                     (v_fact ->> 'value')::public.equipment_state, 'terrain', v_observed, null);
    elsif v_existing.source = 'terrain' and v_existing.observed_on < v_observed then
      perform public.set_school_fact(v_campus, v_existing.id, v_existing.key, null,
                                     (v_fact ->> 'value')::public.equipment_state, 'terrain', v_observed, v_existing.note);
    end if;
  end loop;

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

  if p_changes <> '{}'::jsonb or v_given is not null or p_facts <> '[]'::jsonb then
    insert into public.submission_reviews (submission_id, changes)
    values (r.id, p_changes || case when v_given is not null
      then jsonb_build_object('position', jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude))
      else '{}'::jsonb end
      || case when p_facts <> '[]'::jsonb then jsonb_build_object('facts', p_facts) else '{}'::jsonb end);
  end if;
  return v_campus;
end;
$$;
comment on function public.accept_reviewed_submission(uuid, text, uuid, uuid, text, jsonb, uuid, jsonb, double precision, double precision, jsonb) is
  'Accepte un relevé, avec les corrections de l''administration (dont le sigle), la position saisie si le téléphone n''en avait pas, et les équipements du bonus que l''administration garde (`p_facts` : [{key, value}], vus par le relais seulement).';
revoke all on function public.accept_reviewed_submission(uuid, text, uuid, uuid, text, jsonb, uuid, jsonb, double precision, double precision, jsonb) from public, anon, authenticated;
grant execute on function public.accept_reviewed_submission(uuid, text, uuid, uuid, text, jsonb, uuid, jsonb, double precision, double precision, jsonb) to authenticated;
