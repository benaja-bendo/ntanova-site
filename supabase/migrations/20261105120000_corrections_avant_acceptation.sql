-- Corriger les informations d’une nouvelle école dans la même transaction que son acceptation.
-- Le relevé du relais reste intact ; la révision garde les valeurs explicites, l’auteur et la date serveur.
-- L’appel historique reste disponible pour les téléphones et administrations déjà ouverts.
create table public.submission_reviews (
  submission_id uuid primary key references public.field_submissions(id) on delete cascade,
  changes jsonb not null check (jsonb_typeof(changes) = 'object'),
  reviewed_by uuid not null default public.current_user_id(),
  reviewed_at timestamptz not null default now()
);
alter table public.submission_reviews enable row level security;
revoke all on public.submission_reviews from public, anon, authenticated;
grant select on public.submission_reviews to authenticated;
grant insert (submission_id, changes) on public.submission_reviews to authenticated;
create policy "L’administration lit les révisions" on public.submission_reviews
  for select to authenticated using (public.est_admin());
create policy "L’administration inscrit sa révision" on public.submission_reviews
  for insert to authenticated with check (public.est_admin() and reviewed_by = public.current_user_id());

create function public.accept_reviewed_submission(
  p_submission uuid,
  p_mode text default null,
  p_campus uuid default null,
  p_institution uuid default null,
  p_label text default null,
  p_programs jsonb default '[]'::jsonb,
  p_division uuid default null,
  p_changes jsonb default '{}'::jsonb
) returns uuid
language plpgsql set search_path = '' as $$
declare
  r public.field_submissions;
  v_orig public.field_submissions;
  c public.campuses;
  v_position extensions.geometry;
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

  -- Seule une nouvelle institution est corrigée ici : un campus connu se modifie dans « Écoles ».
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_changes) k
                where k not in ('sign_name', 'school_kind', 'levels', 'curriculum_note', 'landmark', 'sign_phone')) then
    raise exception 'Valeurs de correction inconnues.' using errcode = '22023';
  end if;
  if p_changes <> '{}'::jsonb then
    if v_mode <> 'new_institution' then
      raise exception 'Les corrections avant acceptation concernent une nouvelle école.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_each(p_changes) x
               where (x.key in ('sign_name', 'school_kind') and jsonb_typeof(x.value) <> 'string')
                  or (x.key = 'levels' and jsonb_typeof(x.value) <> 'array')
                  or (x.key in ('curriculum_note', 'landmark', 'sign_phone') and jsonb_typeof(x.value) not in ('string', 'null'))) then
      raise exception 'Valeur de correction illisible.' using errcode = '22023';
    end if;
    -- Le record local est corrigé, jamais la ligne envoyée par le relais. Les domaines SQL contrôlent les listes et le téléphone.
    r := jsonb_populate_record(r, p_changes);
    if r.sign_name is null or r.sign_name !~ '\S' or length(btrim(r.sign_name)) > 200
       or r.school_kind is null or r.levels is null or array_position(r.levels, null) is not null
       or length(r.curriculum_note) > 200 or length(r.landmark) > 300 then
      raise exception 'Vérifie le nom, les niveaux, le programme et le repère.' using errcode = '22023';
    end if;
    if p_changes ? 'levels' and exists (
      select 1 from jsonb_array_elements(p_programs) p where not ((p ->> 'cycle') = any(r.levels))
    ) then
      raise exception 'Une formation ne correspond plus aux niveaux retenus.' using errcode = '22023';
    end if;
  end if;

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
  v_position := coalesce(r.position, v_orig.position);
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
      v_division, r.landmark, r.sign_phone, v_position, 'prete', 'field', r.curriculum_note, r.taken_at
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

  if p_changes <> '{}'::jsonb then
    insert into public.submission_reviews (submission_id, changes) values (r.id, p_changes);
  end if;
  return v_campus;
end;
$$;

revoke all on function public.accept_reviewed_submission(uuid, text, uuid, uuid, text, jsonb, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.accept_reviewed_submission(uuid, text, uuid, uuid, text, jsonb, uuid, jsonb) to authenticated;

-- Un seul moteur de décision, y compris pour les anciens clients sans corrections.
create or replace function public.accept_submission(
  p_submission uuid, p_mode text default null, p_campus uuid default null,
  p_institution uuid default null, p_label text default null,
  p_programs jsonb default '[]'::jsonb, p_division uuid default null
) returns uuid language sql set search_path = '' as $$
  select public.accept_reviewed_submission(p_submission, p_mode, p_campus, p_institution, p_label, p_programs, p_division, '{}'::jsonb)
$$;
