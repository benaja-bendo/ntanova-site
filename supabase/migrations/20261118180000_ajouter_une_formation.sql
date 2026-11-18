-- 18/11 : ajouter une formation depuis la fiche d'une école.
-- Jusqu'ici une formation n'entrait que par un relevé (`accept_submission`) ou à la création de l'école : une université
-- créée sans formation n'en recevait jamais, et la page « Formations » de sa fiche le disait sans rien proposer.
-- Une fonction seule, aucune table touchée : la formation naît avec son intitulé dans un cycle que le site enseigne déjà
-- (un cycle s'ajoute dans « En bref », pas en passant par ici) ; tout le reste se dit ensuite avec `save_program_sheet`.
-- L'ajout est gardé dans `prive.program_identity_history` (avant : rien), comme chaque changement d'identité.

create function public.add_campus_program(p_campus uuid, p_cycle public.niveau, p_title text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_titre text := nullif(btrim(p_title), '');
  v_cycle uuid;
  v_id uuid;
  v_apres jsonb;
begin
  perform public.exiger_gestion_site(p_campus);
  if v_titre is null then
    raise exception 'Écris l''intitulé de la formation.' using errcode = '22023';
  end if;
  if length(v_titre) > 160 then
    raise exception 'L''intitulé tient en 160 caractères.' using errcode = '22023';
  end if;
  if p_cycle not in ('superieur', 'technique', 'autre_formation') then
    raise exception 'Ce cycle n''a pas de formations à détailler.' using errcode = '22023';
  end if;
  perform 1 from public.campuses c where c.id = p_campus and c.trashed_at is null for update;
  if not found then raise exception 'École introuvable.' using errcode = 'P0002'; end if;
  select cc.id into v_cycle from public.campus_cycles cc where cc.campus_id = p_campus and cc.cycle = p_cycle;
  if v_cycle is null then
    raise exception 'Ce site n''enseigne pas ce cycle : ajoute-le d''abord dans « En bref ».' using errcode = '22023';
  end if;
  begin
    insert into public.campus_programs (campus_cycle_id, title, origin)
    values (v_cycle, v_titre, 'admin')
    returning id, to_jsonb(campus_programs.*) into v_id, v_apres;
  exception when unique_violation then
    raise exception 'Une formation de ce cycle porte déjà cet intitulé.' using errcode = '23505';
  end;
  update public.campuses set updated_at = now() where id = p_campus;
  insert into prive.program_identity_history (program_id, campus_id, before_data, after_data, recorded_by)
  values (v_id, p_campus, null, v_apres, public.current_user_id());
  return v_id;
end;
$$;
comment on function public.add_campus_program(uuid, public.niveau, text) is
  'Ajoute une formation (son intitulé) à un cycle du supérieur, du technique ou d''une autre formation que le site enseigne déjà. 18/11.';
revoke all on function public.add_campus_program(uuid, public.niveau, text) from public, anon, authenticated, service_role;
grant execute on function public.add_campus_program(uuid, public.niveau, text) to authenticated;
