-- Ticket 236 (retours du 27/11), points 2 et 3 : corriger avant d'accepter, pour une nouvelle école, un nouveau site ou une
-- fiche complétée ; en complétant une fiche, rien d'existant n'est remplacé sans un choix ; l'e-mail lu sur une enseigne
-- devient un contact PRIVÉ du site, jamais publié.
--
-- Compatible avec l'administration déjà en ligne : ses appels (sans les nouvelles clés) font ce qu'ils faisaient, sauf qu'une
-- mise à jour avec des corrections, hier refusée, est désormais acceptée. Rien n'est public de plus.
--
--   * `prive.direction_contacts` gagne le genre `email_ecole` et la colonne `email` ;
--   * `add_school_email(site, adresse, lu sur)` (administration) ; `contacts_of_campus` rend aussi l'e-mail ;
--   * `accept_reviewed_submission` (mêmes paramètres) lit dans `p_changes` : `founded_year`, `sign_email`, et `keep` (les
--     valeurs actuelles à garder, en complétant une fiche) ; les corrections valent pour les trois modes.

-- 1. L'e-mail d'une école, privé ----------------------------------------------------------------------------------------------------------
alter table prive.direction_contacts
  add column email text check (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  drop constraint direction_contacts_kind_check,
  add constraint direction_contacts_kind_check check (kind in ('personne', 'numero_ecole', 'email_ecole')),
  drop constraint direction_contacts_numero_de_l_ecole,
  add constraint direction_contacts_numero_de_l_ecole check (
    kind = 'personne' and read_on is null and not illegible and email is null
    or kind = 'numero_ecole' and read_on is not null and role is null and name is null and not contact_agreement
       and submission_id is null and email is null
       and (case when illegible then whatsapp is null and said_note is not null else whatsapp is not null end)
    or kind = 'email_ecole' and email is not null and read_on is not null and role is null and name is null
       and whatsapp is null and not contact_agreement and not illegible and submission_id is null
  );
comment on column prive.direction_contacts.email is
  'L''adresse e-mail d''une école, lue sur son enseigne ou un document (genre `email_ecole`) : privée, jamais publiée.';

create function public.add_school_email(p_campus uuid, p_email text, p_read_on text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_email text := nullif(btrim(p_email), '');
begin
  perform public.exiger_admin_session();
  if not exists (select 1 from public.campuses c where c.id = p_campus) then
    raise exception 'Site introuvable.' using errcode = 'P0002';
  end if;
  if p_read_on is null or p_read_on not in ('prospectus', 'enseigne', 'site_web', 'facebook', 'autre') then
    raise exception 'Dis où l''adresse a été lue.' using errcode = '22023';
  end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'Cette adresse e-mail ne semble pas complète.' using errcode = '22023';
  end if;
  -- La même adresse, déjà notée pour ce site, ne se double pas.
  select c.id into v_id from prive.direction_contacts c
  where c.campus_id = p_campus and c.kind = 'email_ecole' and lower(c.email) = lower(v_email);
  if v_id is not null then
    return v_id;
  end if;
  insert into prive.direction_contacts (campus_id, kind, read_on, email, source, added_by)
  values (p_campus, 'email_ecole', p_read_on, v_email, 'administration', (select public.current_user_id()))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.add_school_email(uuid, text, text) is
  'L''adresse e-mail d''une école, lue sur l''enseigne, un document, son site ou sa page : privée, jamais publiée. 27/11.';
revoke all on function public.add_school_email(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.add_school_email(uuid, text, text) to authenticated;

-- Le type de retour change : l'ancienne fonction part d'abord.
drop function public.contacts_of_campus(uuid);
create function public.contacts_of_campus(p_campus uuid)
returns table (
  id uuid, role public.fonction_direction, role_detail text, name text, whatsapp public.telephone,
  contact_agreement boolean, agreement_at timestamptz, said_note text, received_at timestamptz, source text,
  submission_id uuid, submission_taken_at timestamptz, relay_first_name text,
  kind text, read_on text, illegible boolean, email text
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
           c.kind, c.read_on, c.illegible, c.email
    from prive.direction_contacts c
    left join public.field_submissions s on s.id = c.submission_id
    left join public.relais r on r.id = s.relay_id
    where c.submission_id in (select f.fid from fiches f)
       or (c.submission_id is null and c.campus_id = p_campus)
    -- Les personnes d'abord, puis le numéro puis l'e-mail de l'école ; ceux qui ont un numéro d'abord, puis le plus récent.
    order by (c.kind = 'email_ecole'), (c.kind = 'numero_ecole'), (c.whatsapp is null), c.received_at desc, c.id;
end;
$$;
comment on function public.contacts_of_campus(uuid) is
  'Les contacts privés d''un site : les personnes (relevés et administration), le numéro et l''e-mail de l''école lus sur un document. 27/11.';
revoke all on function public.contacts_of_campus(uuid) from public, anon, authenticated, service_role;
grant execute on function public.contacts_of_campus(uuid) to authenticated;

-- 2. L'acceptation (mêmes paramètres, `create or replace` : les droits restent) --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_reviewed_submission(p_submission uuid, p_mode text DEFAULT NULL::text, p_campus uuid DEFAULT NULL::uuid, p_institution uuid DEFAULT NULL::uuid, p_label text DEFAULT NULL::text, p_programs jsonb DEFAULT '[]'::jsonb, p_division uuid DEFAULT NULL::uuid, p_changes jsonb DEFAULT '{}'::jsonb, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_facts jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_keep text[] := '{}';
  v_year integer;
  v_trace jsonb;
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

  -- Les valeurs relues par l'administration (ticket 236, 27/11). `keep` : en complétant une fiche existante, les valeurs
  -- actuelles à garder. Un site nouveau d'une école connue ne change ni son nom ni son type. L'année et l'e-mail ne sont pas
  -- des colonnes du relevé : l'année complète l'école, l'e-mail devient un contact privé.
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_changes) k
                where k not in ('sign_name', 'school_kind', 'levels', 'curriculum_note', 'landmark', 'sign_phone', 'acronym',
                                'founded_year', 'sign_email', 'keep')) then
    raise exception 'Valeurs de correction inconnues.' using errcode = '22023';
  end if;
  if p_changes ? 'keep' then
    if v_mode <> 'update_campus' then
      raise exception 'On ne garde des valeurs actuelles qu''en complétant une fiche existante.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_changes -> 'keep') <> 'array' then
      raise exception 'Valeurs à garder illisibles.' using errcode = '22023';
    end if;
    v_keep := array(select jsonb_array_elements_text(p_changes -> 'keep'));
    if not v_keep <@ array['sign_name', 'school_kind', 'levels', 'curriculum_note', 'landmark', 'sign_phone', 'position', 'acronym'] then
      raise exception 'Valeurs à garder inconnues.' using errcode = '22023';
    end if;
  end if;
  if p_changes - 'keep' <> '{}'::jsonb then
    if v_mode = 'add_cycle' then
      raise exception 'Ajouter des niveaux ne corrige rien : choisis « Compléter sa fiche ».' using errcode = '22023';
    end if;
    if v_mode = 'new_campus' and (p_changes ? 'sign_name' or p_changes ? 'school_kind') then
      raise exception 'Le nom et le type d''un nouveau site sont ceux de l''école : change-les dans sa fiche.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_each(p_changes) x
               where (x.key in ('sign_name', 'school_kind', 'sign_email') and jsonb_typeof(x.value) <> 'string')
                  or (x.key = 'levels' and jsonb_typeof(x.value) <> 'array')
                  or (x.key in ('curriculum_note', 'landmark', 'sign_phone', 'acronym') and jsonb_typeof(x.value) not in ('string', 'null'))
                  or (x.key = 'founded_year' and jsonb_typeof(x.value) not in ('number', 'null'))) then
      raise exception 'Valeur de correction illisible.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_changes -> 'founded_year') = 'number' then
      if (p_changes ->> 'founded_year')::numeric <> trunc((p_changes ->> 'founded_year')::numeric)
         or (p_changes ->> 'founded_year')::numeric < 1800
         or (p_changes ->> 'founded_year')::numeric > extract(year from current_timestamp at time zone 'Africa/Brazzaville') then
        raise exception 'L''année de création est passée, à partir de 1800.' using errcode = '22023';
      end if;
      v_year := (p_changes ->> 'founded_year')::numeric::integer;
    end if;
    -- Le record local est corrigé, jamais la ligne envoyée par le relais. Les domaines SQL contrôlent les listes et le téléphone.
    r := jsonb_populate_record(r, p_changes - 'founded_year' - 'sign_email' - 'keep');
    if r.sign_name is null or r.sign_name !~ '\S' or length(btrim(r.sign_name)) > 200
       or r.school_kind is null or r.levels is null or array_position(r.levels, null) is not null
       or length(r.curriculum_note) > 200 or length(r.landmark) > 300 or length(btrim(r.acronym)) > 20 then
      raise exception 'Vérifie le nom, les niveaux, le programme et le repère.' using errcode = '22023';
    end if;
    if p_changes ? 'levels' and v_mode <> 'update_campus' and exists (
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
      insert into public.institutions (name, kind, acronym, founded_year)
      values (v_name, r.school_kind, nullif(btrim(r.acronym), ''), v_year)
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
    -- Une formation d'un niveau que la fiche n'aura pas (niveaux gardés, ou corrigés) ne l'ajoute pas en cachette.
    if v_mode = 'update_campus' and (p_changes ? 'levels' or 'levels' = any(v_keep)) and exists (
      select 1 from jsonb_array_elements(p_programs) p
      where not exists (select 1 from public.campus_cycles cc where cc.campus_id = v_campus and cc.cycle = p ->> 'cycle')
        and ('levels' = any(v_keep) or not ((p ->> 'cycle') = any(r.levels)))
    ) then
      raise exception 'Une formation ne correspond plus aux niveaux retenus.' using errcode = '22023';
    end if;
    -- Un campus vérifié par la direction n'est plus modifié par un relevé.
    if c.verification_state <> 'verifiee' then
      if v_mode = 'update_campus' then
        -- Ticket 236 : une valeur que l'administration garde (`keep`) ne bouge pas ; le nom du site ne remplit qu'un vide.
        update public.institutions i set
          name = case
                   when not ('sign_name' = any(v_keep))
                        and (select count(*) from public.campuses k where k.institution_id = i.id) = 1
                   then btrim(r.sign_name) else i.name end,
          kind = case when r.school_kind = 'non_indique' or 'school_kind' = any(v_keep) then i.kind else r.school_kind end
        where i.id = c.institution_id;
        update public.campuses k set
          curriculum_note = case when 'curriculum_note' = any(v_keep) then k.curriculum_note
                                 else coalesce(r.curriculum_note, k.curriculum_note) end,
          landmark = case when 'landmark' = any(v_keep) then k.landmark else coalesce(r.landmark, k.landmark) end,
          sign_phone = case when 'sign_phone' = any(v_keep) then k.sign_phone else coalesce(r.sign_phone, k.sign_phone) end,
          position = case when 'position' = any(v_keep) then k.position else coalesce(r.position, k.position) end,
          label = coalesce(k.label, nullif(btrim(p_label), '')),
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
      if not ('levels' = any(v_keep)) then
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

  -- Le sigle lu sur l'enseigne remplit celui de l'école s'il manque ; il ne remplace jamais un sigle déjà connu. L'année de
  -- création aussi (ticket 236).
  if nullif(btrim(r.acronym), '') is not null and not ('acronym' = any(v_keep)) then
    update public.institutions i set acronym = btrim(r.acronym)
    where i.id = (select k.institution_id from public.campuses k where k.id = v_campus) and i.acronym is null;
  end if;
  if v_year is not null then
    update public.institutions i set founded_year = v_year
    where i.id = (select k.institution_id from public.campuses k where k.id = v_campus) and i.founded_year is null;
  end if;
  -- L'e-mail lu sur l'enseigne : un contact privé du site, jamais publié.
  if p_changes ? 'sign_email' then
    perform public.add_school_email(v_campus, p_changes ->> 'sign_email', 'enseigne');
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

  -- La trace de la décision garde ce qui a été relu ; jamais l'e-mail, qui est privé et s'efface sur demande.
  v_trace := p_changes - 'sign_email';
  if v_trace <> '{}'::jsonb or v_given is not null or p_facts <> '[]'::jsonb then
    insert into public.submission_reviews (submission_id, changes)
    values (r.id, v_trace || case when v_given is not null
      then jsonb_build_object('position', jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude))
      else '{}'::jsonb end
      || case when p_facts <> '[]'::jsonb then jsonb_build_object('facts', p_facts) else '{}'::jsonb end);
  end if;
  return v_campus;
end;
$function$;
