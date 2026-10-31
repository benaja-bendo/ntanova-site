-- L'administration situe une école, ou en ajoute une, depuis l'onglet « Écoles » (ticket #15,
-- décidé par le fondateur le 31/10).
--
-- Avant : une école ne recevait sa position que du relevé d'un relais, sur place. Les écoles
-- que le fondateur connaît restaient « à situer » tant qu'aucun relais n'y était passé, et la
-- carte restait vide. Maintenant, l'administration peut donner la position d'une école qu'elle
-- connaît (prise sur une carte, Google Maps par exemple) :
-- - `situer_ecole(ecole, latitude, longitude)` : une école connue reçoit sa position ;
-- - `ajouter_ecole(nom, latitude, longitude, …)` : une école qui n'est pas encore dans la base.
-- L'arrondissement est celui dont le contour contient la position ; hors de Tié-Tié et Ngoyo,
-- la base refuse. Une école brouillon devient prête : l'administration la publie ensuite.
--
-- Ce n'est pas un relevé : la base garde qui a donné la position et quand (`situee_par`,
-- `situee_le`), et la fiche publique d'une école qu'aucun relevé n'a décrite dit « Fiche
-- ajoutée par NTanova le … » (la vue `ecoles_publiees` gagne `situee_le`). Un relevé accepté
-- plus tard remplace la position et pose la date de relevé, comme avant.
-- À pousser AVANT la mise en ligne du code qui l'appelle.

alter table public.ecoles
  add column situee_le timestamptz,
  add column situee_par uuid,
  add constraint ecoles_situee_par_quelqu_un check ((situee_le is null) = (situee_par is null));

-- Une position donnée par l'administration : un point, et l'arrondissement ouvert qui le contient.
create function public.arrondissement_de_position(latitude double precision, longitude double precision)
returns smallint
language plpgsql stable set search_path = '' as $$
#variable_conflict use_variable
declare
  trouve smallint;
begin
  if latitude is null or longitude is null
     or latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception 'Position illisible : colle la latitude puis la longitude, par exemple -4.79105, 11.92500.'
      using errcode = '22023';
  end if;
  select a.id into trouve
  from public.arrondissements a
  where extensions.st_covers(
    a.contour, extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)
  )
  limit 1;
  if trouve is null then
    raise exception 'Cette position n''est dans aucun arrondissement ouvert (Tié-Tié, Ngoyo) : vérifie les coordonnées, la latitude d''abord.'
      using errcode = '22023';
  end if;
  return trouve;
end;
$$;

create function public.situer_ecole(ecole uuid, latitude double precision, longitude double precision)
returns text
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare
  e public.ecoles;
  arrondissement smallint;
  nom_arrondissement text;
begin
  perform public.exiger_admin();
  arrondissement := public.arrondissement_de_position(latitude, longitude);
  select a.nom into nom_arrondissement from public.arrondissements a where a.id = arrondissement;

  select * into e from public.ecoles x where x.id = ecole for update;
  if not found then
    raise exception 'École introuvable.' using errcode = 'P0002';
  end if;
  if e.publication = 'retiree' then
    raise exception 'Une école retirée ne se modifie plus : la republier d''abord.' using errcode = '22023';
  end if;
  -- L'adresse publique d'une fiche contient son arrondissement : une école publiée n'en change pas.
  if e.publication = 'publiee' and e.arrondissement_id <> arrondissement then
    raise exception 'Cette position est à %, pas dans l''arrondissement de la fiche : son adresse publique changerait. Vérifie les coordonnées, ou retire la fiche du site d''abord.',
      nom_arrondissement using errcode = '22023';
  end if;
  if e.arrondissement_id is distinct from arrondissement and exists (
    select 1 from public.ecoles x
    where x.arrondissement_id = arrondissement and x.slug = e.slug and x.id <> e.id
  ) then
    raise exception 'Une autre école de % a déjà cette adresse : change le nom de celle-ci d''abord.',
      nom_arrondissement using errcode = '22023';
  end if;

  update public.ecoles x set
    position = extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326),
    arrondissement_id = arrondissement,
    situee_le = now(),
    situee_par = (select auth.uid()),
    publication = case when x.publication = 'brouillon' then 'prete' else x.publication end
  where x.id = ecole;

  return nom_arrondissement;
end;
$$;

create function public.ajouter_ecole(
  nom text,
  latitude double precision default null,
  longitude double precision default null,
  type_ecole public.type_ecole default 'non_indique',
  niveaux public.niveau[] default '{}',
  programme text default null,
  repere text default null,
  numero_enseigne public.telephone default null,
  quartier text default null
) returns uuid
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare
  arrondissement smallint;
  situee boolean := latitude is not null or longitude is not null;
  base text;
  candidat text;
  n int := 1;
  nouvelle uuid;
begin
  perform public.exiger_admin();
  -- Sans position, l'école entre « à situer » (brouillon, sans arrondissement), comme un import.
  if situee then
    arrondissement := public.arrondissement_de_position(latitude, longitude);
  end if;

  base := public.slugifier(coalesce(nom, ''));
  if base = '' then
    raise exception 'Le nom ne donne aucune adresse : écris le nom de l''école.' using errcode = '22023';
  end if;
  candidat := base;
  while exists (
    select 1 from public.ecoles e
    where e.arrondissement_id is not distinct from arrondissement and e.slug = candidat
  ) loop
    n := n + 1;
    candidat := base || '-' || n;
  end loop;

  insert into public.ecoles (
    arrondissement_id, slug, nom, quartier, type_ecole, niveaux, programme, repere, numero_enseigne,
    position, publication, situee_le, situee_par
  ) values (
    arrondissement, candidat, btrim(nom), nullif(btrim(quartier), ''), type_ecole, niveaux,
    nullif(btrim(programme), ''), nullif(btrim(repere), ''), numero_enseigne,
    case when situee then extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326) end,
    case when situee then 'prete' else 'brouillon' end::public.publication,
    case when situee then now() end,
    case when situee then (select auth.uid()) end
  )
  returning id into nouvelle;
  return nouvelle;
end;
$$;

-- Ce que lit le site public : la vue gagne la date où l'administration a situé l'école (en
-- dernière colonne). Une fiche sans date de relevé dit « ajoutée par NTanova » à cette date.
create or replace view public.ecoles_publiees with (security_invoker = true) as
select
  e.id,
  a.slug as arrondissement,
  e.slug,
  e.nom,
  e.quartier,
  e.type_ecole,
  e.niveaux,
  e.repere,
  e.numero_enseigne,
  extensions.st_y(e.position) as latitude,
  extensions.st_x(e.position) as longitude,
  e.etat,
  e.mis_a_jour_le,
  e.programme,
  e.relevee_le,
  e.situee_le
from public.ecoles e
join public.arrondissements a on a.id = e.arrondissement_id
where e.publication = 'publiee';

-- Les droits : l'administration seulement (les fonctions le vérifient), jamais un visiteur.
revoke execute on function
  public.arrondissement_de_position(double precision, double precision),
  public.situer_ecole(uuid, double precision, double precision),
  public.ajouter_ecole(text, double precision, double precision, public.type_ecole, public.niveau[], text, text, public.telephone, text)
from public, anon;
grant execute on function
  public.arrondissement_de_position(double precision, double precision),
  public.situer_ecole(uuid, double precision, double precision),
  public.ajouter_ecole(text, double precision, double precision, public.type_ecole, public.niveau[], text, text, public.telephone, text)
to authenticated;
