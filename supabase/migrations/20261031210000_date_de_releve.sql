-- La date « Fiche relevée le … » est celle du relevé, pas celle de la dernière modification
-- (ticket #12).
--
-- Avant : la fiche publique affichait `mis_a_jour_le`, que le déclencheur remet à jour à
-- chaque modification. Publier une école, la corriger ou la modifier à la main la rajeunissait,
-- comme si un relais venait de repasser. Maintenant : `relevee_le` est posée quand un relevé est
-- accepté (la date de sa photo, `pris_le`) et ne bouge plus quand on publie ou corrige. Un relevé
-- plus récent l'avance, un relevé plus ancien ne la fait pas reculer.
-- Une école qu'aucun relevé n'a décrite (à situer) n'a pas de date de relevé.
-- À pousser (`db push`) AVANT la mise en ligne du code qui la lit.

alter table public.ecoles add column relevee_le timestamptz;

-- Les écoles déjà relevées : la date du relevé accepté le plus récent. Le déclencheur est
-- coupé pendant la mise à jour, pour ne pas rajeunir `mis_a_jour_le` de toutes les écoles.
alter table public.ecoles disable trigger ecoles_avant_modification;
update public.ecoles e set relevee_le = r.derniere
from (
  select ecole_id, max(pris_le) as derniere
  from public.releves
  where statut = 'accepte' and ecole_id is not null
  group by ecole_id
) r
where r.ecole_id = e.id;
alter table public.ecoles enable trigger ecoles_avant_modification;

-- Ce que lit le site public : la vue gagne la date de relevé (en dernière colonne).
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
  e.relevee_le
from public.ecoles e
join public.arrondissements a on a.id = e.arrondissement_id
where e.publication = 'publiee';

-- Accepter un relevé pose la date de relevé de l'école ------------------------------------------
--
-- Comme avant (voir 20261031190000_types_niveaux_programme.sql), plus `relevee_le`.

create or replace function public.accepter_releve(releve uuid, ecole uuid default null) returns uuid
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare
  r public.releves;
  arrondissement smallint;
  situe smallint;
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
  if r.statut = 'refuse' then
    raise exception 'Relevé refusé : un refus est définitif. Le relais peut envoyer une nouvelle fiche.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.lots l where l.id = r.lot_id and l.essai) then
    raise exception 'Relevé du lot d''essai : il ne se publie jamais.' using errcode = '22023';
  end if;

  -- Une correction reprend l'école de la fiche qu'elle corrige.
  if ecole is null and r.corrige_releve_id is not null then
    select o.ecole_id into ecole from public.releves o where o.id = r.corrige_releve_id;
  end if;

  -- L'arrondissement du relevé : celui qui contient sa position, sinon celui de son lot.
  if r.position is not null then
    select a.id into situe
    from public.arrondissements a
    where extensions.st_covers(a.contour, r.position)
    limit 1;
  end if;
  select coalesce(situe, l.arrondissement_id) into arrondissement
  from public.lots l where l.id = r.lot_id;
  arrondissement := coalesce(arrondissement, situe);

  if ecole is null then
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
      arrondissement_id, slug, nom, type_ecole, niveaux, programme, repere, numero_enseigne, position,
      publication, relevee_le
    ) values (
      arrondissement, candidat, btrim(r.nom_enseigne), r.type_ecole, r.niveaux, r.programme, r.repere,
      r.numero_enseigne, r.position, 'prete', r.pris_le
    )
    returning id into ecole;
  else
    if not exists (select 1 from public.ecoles e where e.id = ecole) then
      raise exception 'École introuvable.' using errcode = 'P0002';
    end if;
    if exists (select 1 from public.ecoles e where e.id = ecole and e.arrondissement_id is null)
       and arrondissement is null then
      raise exception 'Cette école n''est pas encore située : il faut un relevé avec une position.'
        using errcode = '22023';
    end if;
    -- Une école publiée le reste (la correction paraît à la prochaine construction) ;
    -- une école à situer devient prête. « Pas indiqué » et « aucun niveau » n'effacent rien.
    update public.ecoles e set
      nom = btrim(r.nom_enseigne),
      type_ecole = case when r.type_ecole = 'non_indique' then e.type_ecole else r.type_ecole end,
      niveaux = case when cardinality(r.niveaux) = 0 then e.niveaux else r.niveaux end,
      programme = coalesce(r.programme, e.programme),
      repere = coalesce(r.repere, e.repere),
      numero_enseigne = coalesce(r.numero_enseigne, e.numero_enseigne),
      position = coalesce(r.position, e.position),
      arrondissement_id = coalesce(e.arrondissement_id, arrondissement),
      -- Un relevé plus récent avance la date de relevé ; un plus ancien ne la fait pas reculer.
      relevee_le = greatest(e.relevee_le, r.pris_le),
      publication = case when e.publication = 'brouillon' then 'prete' else e.publication end
    where e.id = ecole and e.etat <> 'verifiee';
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

  -- L'école est relevée : la mission confiée au relais est terminée.
  delete from public.ecoles_confiees c where c.ecole_id = ecole;

  return ecole;
end;
$$;
