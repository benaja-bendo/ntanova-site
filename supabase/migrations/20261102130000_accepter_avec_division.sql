-- Accepter une fiche dont la position n'a aucune division connue, et le lot rendu à sa date (ticket n° 67, M5).
--
-- Décisions du fondateur, 02/11 : une école hors de toute zone ouverte s'accepte et se paie comme les autres ; quand aucun
-- contour connu ne contient sa position, l'administration choisit la division. Avant, `accept_submission` retombait sur la
-- division du lot du relais : une position à des milliers de kilomètres était rattachée à Tié-Tié, et un relais sans lot
-- recevait « rattacher le relevé à un lot ». Le choix de l'administration l'emporte aussi sur la division que dit la
-- position (un contour simplifié se trompe près d'une limite).
--
-- La signature change (un paramètre de plus, facultatif) : l'ancienne fonction est retirée, les appels qui ne donnent pas
-- `p_division` marchent comme avant. Le secteur d'un relais reste le repli d'un relevé SANS position.

drop function public.accept_submission(uuid, text, uuid, uuid, text, jsonb);

-- Accepte un relevé et le transforme dans le catalogue, en un geste :
--   new_institution  une nouvelle institution et son premier campus ;
--   new_campus       un nouveau campus d'une institution connue (p_institution) ;
--   update_campus    met à jour le campus donné (p_campus) : une correction, une contre-visite, un doublon fusionné ;
--   add_cycle        ajoute les cycles du relevé au campus donné, sans toucher au reste.
-- Sans mode, on le déduit : un campus donné ou repris d'une correction ou d'une contre-visite → update_campus ;
-- une institution donnée → new_campus ; sinon new_institution. `p_programs` : les formations lues sur les
-- photos (voir upsert_programs). `p_division` : la division choisie par l'administration (une ville, un arrondissement ou
-- un quartier), qui l'emporte sur celle de la position ; obligatoire quand aucun contour connu ne contient la position.
-- Rend l'identifiant du campus. Jamais pour le lot d'essai.
create function public.accept_submission(
  p_submission uuid,
  p_mode text default null,
  p_campus uuid default null,
  p_institution uuid default null,
  p_label text default null,
  p_programs jsonb default '[]'::jsonb,
  p_division uuid default null
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

  -- La division du relevé : celle que l'administration choisit ; sinon la plus fine qui contient sa position ;
  -- sinon, SANS position seulement, celle du lot du relais. Une position qu'aucun contour connu ne contient n'est plus
  -- rattachée d'office à la division du lot : elle pouvait être à des milliers de kilomètres (ticket n° 67).
  if p_division is not null
     and not exists (select 1 from public.geo_divisions d where d.id = p_division and d.level >= 2) then
    raise exception 'Division introuvable : choisissez une ville, un arrondissement ou un quartier.' using errcode = 'P0002';
  end if;
  v_division := coalesce(
    p_division,
    case when r.position is not null
         then public.division_of_position(extensions.st_y(r.position), extensions.st_x(r.position), 3::smallint) end,
    case when r.position is null
         then (select l.geo_division_id from public.lots l where l.id = r.batch_id) end
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


-- Un secteur est « rendu » quand l'administration le déclare terminé : `lots.rendu_le`, la date, à l'heure de Brazzaville.
-- Défaire (`p_returned` faux) remet le lot en cours. Décision du 02/11 : le secteur (lot fin) reste l'unité de la mesure de
-- complétude ; « rendu à sa date » veut dire déclaré terminé avant `a_rendre_le`.
create function public.mark_batch_returned(p_batch uuid, p_returned boolean default true) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  update public.lots set rendu_le = case when coalesce(p_returned, true)
                                         then (now() at time zone 'Africa/Brazzaville')::date
                                         else null end
  where id = p_batch;
  if not found then
    raise exception 'Lot introuvable.' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.mark_batch_returned(uuid, boolean) is
  'L''administration marque un lot rendu (à la date du jour, heure de Brazzaville) ou revient dessus.';

-- Les droits : retirés, puis donnés exactement -------------------------------------------------------------------------------
revoke all on function public.accept_submission(uuid, text, uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.accept_submission(uuid, text, uuid, uuid, text, jsonb, uuid) to authenticated;
revoke all on function public.mark_batch_returned(uuid, boolean) from public, anon, authenticated;
grant execute on function public.mark_batch_returned(uuid, boolean) to authenticated;
