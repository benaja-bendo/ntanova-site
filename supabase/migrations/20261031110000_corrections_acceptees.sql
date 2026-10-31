-- Accepter une correction ferme aussi le relevé qu'elle corrige.
--
-- Avant : la fiche d'origine restait « à corriger » pour toujours, et une
-- correction d'une fiche déjà publiée créait une seconde école.
-- Maintenant :
--   - une correction met à jour l'école de la fiche d'origine, si elle en a une ;
--   - la fiche d'origine passe « acceptée », rattachée à la même école.
-- Mêmes paramètres et mêmes droits qu'avant (`create or replace` les garde).

create or replace function public.accepter_releve(releve uuid, ecole uuid default null) returns uuid
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare
  r public.releves;
  arrondissement smallint;
  base text;
  candidat text;
  n int := 1;
begin
  perform public.exiger_admin();

  select * into r from public.releves where id = releve for update;
  if not found then
    raise exception 'Relevé introuvable.' using errcode = 'P0002';
  end if;
  if r.statut = 'accepte' then
    return r.ecole_id;
  end if;
  if exists (select 1 from public.lots l where l.id = r.lot_id and l.essai) then
    raise exception 'Relevé du lot d''essai : il ne se publie jamais.' using errcode = '22023';
  end if;

  -- Une correction reprend l'école de la fiche qu'elle corrige.
  if ecole is null and r.corrige_releve_id is not null then
    select o.ecole_id into ecole from public.releves o where o.id = r.corrige_releve_id;
  end if;

  if ecole is null then
    select l.arrondissement_id into arrondissement from public.lots l where l.id = r.lot_id;
    if arrondissement is null and r.position is not null then
      select a.id into arrondissement
      from public.arrondissements a
      where extensions.st_covers(a.contour, r.position)
      limit 1;
    end if;
    if arrondissement is null then
      raise exception 'Arrondissement inconnu : rattacher le relevé à un lot.' using errcode = '22023';
    end if;

    base := public.slugifier(r.nom_enseigne);
    if base = '' then
      raise exception 'Le nom ne donne aucune adresse : le corriger avant de publier.' using errcode = '22023';
    end if;
    candidat := base;
    while exists (
      select 1 from public.ecoles e where e.arrondissement_id = arrondissement and e.slug = candidat
    ) loop
      n := n + 1;
      candidat := base || '-' || n;
    end loop;

    insert into public.ecoles (
      arrondissement_id, slug, nom, type_ecole, niveaux, repere, numero_enseigne, position,
      publication, publiee_le
    ) values (
      arrondissement, candidat, btrim(r.nom_enseigne), r.type_ecole, r.niveaux, r.repere,
      r.numero_enseigne, r.position, 'publiee', now()
    )
    returning id into ecole;
  else
    update public.ecoles e set
      nom = btrim(r.nom_enseigne),
      type_ecole = r.type_ecole,
      niveaux = r.niveaux,
      repere = coalesce(r.repere, e.repere),
      numero_enseigne = coalesce(r.numero_enseigne, e.numero_enseigne),
      position = coalesce(r.position, e.position)
    where e.id = ecole and e.etat <> 'verifiee';
    if not found and not exists (select 1 from public.ecoles e where e.id = ecole) then
      raise exception 'École introuvable.' using errcode = 'P0002';
    end if;
  end if;

  update public.releves set
    statut = 'accepte',
    ecole_id = ecole,
    motif = null,
    message_au_relais = null,
    decide_le = now()
  where id = releve;

  -- La fiche corrigée est close avec sa correction.
  if r.corrige_releve_id is not null then
    update public.releves o set
      statut = 'accepte',
      ecole_id = ecole,
      motif = null,
      message_au_relais = null,
      decide_le = now()
    where o.id = r.corrige_releve_id and o.statut <> 'accepte';
  end if;

  return ecole;
end;
$$;
