-- La zone ouverte, pas le lot, est la limite du relais (ticket n° 67).
--
-- Un relais se déplace, trouve une école et la relève là où il est. Le lot devient un secteur conseillé (un nom, une
-- date, un objectif), jamais une barrière : la base ne refuse rien hors du lot (elle ne l'a jamais fait) et ne s'en
-- sert plus que comme information. Trois choses se séparent :
--   - où est l'école : la position GPS. La division qui la contient est calculée à l'ARRIVÉE du relevé
--     (`division_id`), plus seulement à son acceptation ;
--   - où NTanova envoie des relais : la zone ouverte (`geo_divisions.open_for_fieldwork`), déjà un réglage.
--     `in_open_zone` le dit pour la position du relevé. Il vaut NUL quand aucun contour connu ne contient la
--     position : « zone inconnue » n'est pas « hors zone » (la base n'a de contours qu'à Pointe-Noire pour l'instant) ;
--   - ce qu'on confie à quelqu'un : le lot, facultatif (`relais.lot_id` et `field_submissions.batch_id` sont nuls
--     sans secteur ; `activer_relais(relais, null)` marche telle qu'elle est).
--
-- Rien n'est retiré : `my_batch()` et `known_places_in_my_batch()` restent, pour qu'un téléphone déjà installé
-- continue d'envoyer et de lire. On les retirera dans une migration ultérieure, une fois l'ancienne version partie.

-- Ce que la base calcule, jamais le téléphone -----------------------------------------------------------------------

alter table public.field_submissions
  add column division_id uuid references public.geo_divisions (id),
  add column in_open_zone boolean;
comment on column public.field_submissions.division_id is
  'La division la plus fine (arrondissement ou plus bas) dont le contour contient la position du relevé. Calculée à l''arrivée par la base. Nulle sans position, ou quand aucun contour connu ne la contient.';
comment on column public.field_submissions.in_open_zone is
  'La position est-elle dans une zone ouverte aux relais ? Calculée à l''arrivée par la base. Nulle quand la division est inconnue : « zone inconnue » n''est pas « hors zone ». Une information pour l''administration : ni un refus, ni une condition de paie.';
create index field_submissions_division on public.field_submissions (division_id);

-- Le déclencheur d'arrivée garde tout ce qu'il faisait (auteur, heure, statut, « hors du lot », doublon) et calcule
-- en plus la division et la zone ouverte. Seul changement par rapport à la version du 01/11 : les deux lignes
-- `new.division_id` et `new.in_open_zone`.
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

-- Les relevés déjà reçus reçoivent leur division et leur zone (se rejoue sans rien changer).
update public.field_submissions s set
  division_id = public.division_of_position(extensions.st_y(s.position), extensions.st_x(s.position), 3::smallint)
where s.position is not null
  and s.division_id is null
  and extensions.st_y(s.position) between -90 and 90
  and extensions.st_x(s.position) between -180 and 180;
update public.field_submissions s set in_open_zone = public.is_open_for_fieldwork(s.division_id)
where s.division_id is not null and s.in_open_zone is null;

-- L'administration le voit ----------------------------------------------------------------------------------------------------

-- Deux colonnes de plus, à la fin : `create or replace view` n'accepte rien d'autre.
create or replace view public.submissions_to_review with (security_invoker = true) as
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
  public.contact_received(s.id) as contact_received,
  s.in_open_zone,
  s.division_id
from public.field_submissions s
join public.relais rl on rl.id = s.relay_id
left join public.lots l on l.id = s.batch_id
where s.status = 'a_valider';

-- Le cache des écoles connues : toutes les zones ouvertes, plus le secteur du relais -------------------------------------------

-- Pour que l'alerte « doublon possible à moins de 40 m » marche sans réseau PARTOUT où un relais peut se trouver, pas
-- seulement dans son lot : le nom et la position, rien d'autre. On y trouve les campus (publiés, prêts, en brouillon,
-- jamais les retirés ni ceux qui n'ont pas de position) ET les relevés pas encore acceptés, de tous les relais.
-- Le périmètre : toutes les zones ouvertes (une zone ouverte ouvre tout ce qu'elle contient), plus le secteur du relais
-- s'il en a un, à 100 m près (le lot d'essai peut être hors des zones ouvertes) ; sans contour connu pour son lot, tout
-- ce qui est sous sa division. Un relais sans secteur reçoit les zones ouvertes. Au plus 5 000 lignes.
create function public.known_places_for_me()
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
  v_area := public.batch_area(v_batch);
  select d.path into v_path from public.geo_divisions d where d.id = v_division;

  return query
  with open_divisions as (
    select d.id
    from public.geo_divisions d
    join public.geo_divisions a on d.path operator(extensions.<@) a.path
    where a.open_for_fieldwork
  )
  select 'campus'::text, c.id,
         i.name || coalesce(' — ' || c.label, ''),
         extensions.st_y(c.position), extensions.st_x(c.position)
  from public.campuses c
  join public.institutions i on i.id = c.institution_id
  left join public.geo_divisions d on d.id = c.division_id
  where c.publication <> 'retiree'
    and c.position is not null
    and (
      c.division_id in (select o.id from open_divisions o)
      or (v_area is not null and extensions.st_dwithin(v_area::extensions.geography, c.position::extensions.geography, 100))
      or (v_area is null and v_path is not null and d.path operator(extensions.<@) v_path)
    )
  union all
  select 'submission'::text, s.id, s.sign_name, extensions.st_y(s.position), extensions.st_x(s.position)
  from public.field_submissions s
  where s.status in ('a_valider', 'a_corriger')
    and s.position is not null
    and (
      s.division_id in (select o.id from open_divisions o)
      or s.batch_id = v_batch
      or (v_area is not null and extensions.st_dwithin(v_area::extensions.geography, s.position::extensions.geography, 100))
    )
  limit 5000;
end;
$$;
comment on function public.known_places_for_me() is
  'Les écoles connues autour du relais connecté, pour l''alerte « doublon possible à moins de 40 m » sans réseau : toutes les zones ouvertes, plus son secteur s''il en a un. Nom et position, rien d''autre.';

-- Les droits : retirés, puis donnés exactement ---------------------------------------------------------------------------------
revoke all on function public.known_places_for_me() from public, anon, authenticated;
grant execute on function public.known_places_for_me() to authenticated;
