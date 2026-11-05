-- Un lot d'essai périmé ne se pose plus sur un relevé (05/11/2026).
--
-- Le téléphone envoie avec la fiche le lot qu'il a lu un jour (`batch_id`). Un relais activé sur le lot d'essai puis
-- sorti de l'essai par l'administration (« Sans lot ») pouvait donc envoyer, des jours plus tard, une fiche prise
-- quand il y était encore : elle arrivait « du lot d'essai », et l'administration ne pouvait ni l'accepter ni la
-- publier (« Relevé du lot d'essai : il ne se publie jamais »). Le relais n'y est pour rien et sa fiche était bonne.
--
-- La base remplace maintenant un lot d'essai par le lot ACTUEL du relais (nul s'il n'en a pas) quand ce n'est plus le
-- sien. Rien d'autre ne change : un relais encore en essai garde son lot d'essai, et un autre lot envoyé par le
-- téléphone reste tel quel (le lot est un secteur conseillé, jamais une barrière, ticket n° 67). Les fiches déjà reçues
-- ne sont pas touchées ici : celle qui était bloquée a été sortie de l'essai à la main, avec l'accord du fondateur.
--
-- Seul changement par rapport à la version du 02/11 (`20261102120000_zone_ouverte.sql`) : le bloc « Le lot d'essai
-- d'un téléphone qui n'est plus à jour » après le lot par défaut.
create or replace function public.field_submissions_avant_insertion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  area extensions.geometry;
  corrected_campus uuid;
begin
  new.relay_id := coalesce((select public.current_user_id()), new.relay_id);
  new.received_at := now();
  if (select public.current_user_id()) is not null then
    new.status := 'a_valider';
    new.reason := null;
    new.message_to_relay := null;
    new.decided_at := null;
    new.campus_id := null;
    new.accepted_as := null;
    new.contact_confirmed_at := null;
    new.contact_role := null;
    new.payable := true;
    new.trial_validated_at := null;
  end if;
  new.batch_id := coalesce(new.batch_id, (select r.lot_id from public.relais r where r.id = new.relay_id));

  -- Le lot d'essai d'un téléphone qui n'est plus à jour : si le relais n'y est plus, la fiche prend son lot actuel
  -- (ou aucun). Sinon elle resterait du lot d'essai pour toujours : ni acceptée, ni publiée.
  if exists (select 1 from public.lots l where l.id = new.batch_id and l.essai)
     and new.batch_id is distinct from (select r.lot_id from public.relais r where r.id = new.relay_id) then
    new.batch_id := (select r.lot_id from public.relais r where r.id = new.relay_id);
  end if;

  if new.corrects_submission_id is not null then
    select s.campus_id into corrected_campus
    from public.field_submissions s
    where s.id = new.corrects_submission_id and s.relay_id = new.relay_id;
    if not found then
      raise exception 'La fiche corrigée n''appartient pas à ce relais.' using errcode = '42501';
    end if;
  end if;

  -- Une information pour l'administration, pas une règle : la division que dit la position, et si elle est ouverte.
  new.division_id := case
    when new.position is null then null
    when extensions.st_y(new.position) not between -90 and 90
      or extensions.st_x(new.position) not between -180 and 180 then null
    else public.division_of_position(extensions.st_y(new.position), extensions.st_x(new.position), 3::smallint)
  end;
  new.in_open_zone := case
    when new.division_id is null then null
    else public.is_open_for_fieldwork(new.division_id)
  end;

  area := public.batch_area(new.batch_id);
  new.outside_batch := case
    when new.position is null or area is null then null
    else not extensions.st_dwithin(area::extensions.geography, new.position::extensions.geography, 50)
  end;

  new.possible_duplicate := new.position is not null and (
    exists (
      select 1 from public.campuses c
      where c.publication <> 'retiree'
        and c.position is not null
        and c.id is distinct from corrected_campus
        and extensions.st_dwithin(c.position::extensions.geography, new.position::extensions.geography, 40)
    )
    or exists (
      select 1 from public.field_submissions s
      where s.id <> new.id
        and s.id is distinct from new.corrects_submission_id
        and s.corrects_submission_id is distinct from coalesce(new.corrects_submission_id, new.id)
        and s.status <> 'refuse'
        and s.position is not null
        and extensions.st_dwithin(s.position::extensions.geography, new.position::extensions.geography, 40)
    )
  );

  return new;
end;
$$;
