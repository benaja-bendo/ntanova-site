-- Toutes les écoles, de la crèche au supérieur : types, niveaux et programme (ticket #12).
--
-- ADDITIVE : on ajoute des valeurs aux deux listes et une colonne, on n'en retire ni
-- n'en renomme aucune (des fiches dorment dans des téléphones, des pages sont
-- construites chaque nuit). Relâcher une liste ne casse aucune donnée.
--   - types : + « communautaire » et « autre » (« non_indique » reste le défaut) ;
--   - niveaux : + « creche » (crèche ou garderie) et « autre_formation » ;
--     « technique » s'écrit désormais « Technique ou professionnel » (le libellé change,
--     jamais la valeur) ;
--   - programme : une ligne libre et facultative (« programme français-congolais,
--     bilingue »), sur le relevé et sur l'école ; on la structurera plus tard, à partir
--     des mots qui reviennent.
-- À pousser (`db push`) AVANT la mise en ligne du code qui les utilise.

-- Les listes ----------------------------------------------------------------------------
--
-- « not valid » : PostgreSQL ne sait pas revalider une colonne en tableau (`niveaux` est un
-- `niveau[]`) et refuse « add constraint » sans lui (« cannot alter type "niveau" because
-- column "ecoles.niveaux" uses it »). Sans danger : élargir une liste ne peut invalider aucune
-- ligne, et la contrainte refuse quand même toute valeur inconnue dans les données qui arrivent.
-- C'est la forme de toute recette « ajouter une valeur » (supabase/schema.md).

alter domain public.type_ecole drop constraint type_ecole_check;
alter domain public.type_ecole add constraint type_ecole_check
  check (value in ('publique', 'privee', 'confessionnelle', 'communautaire', 'autre', 'non_indique'))
  not valid;

alter domain public.niveau drop constraint niveau_check;
alter domain public.niveau add constraint niveau_check
  check (value in ('creche', 'maternelle', 'primaire', 'college', 'lycee', 'technique', 'superieur', 'autre_formation'))
  not valid;

-- Le programme ------------------------------------------------------------------------------

alter table public.ecoles add column programme text check (length(programme) <= 200);
alter table public.releves add column programme text check (length(programme) <= 200);

-- Le téléphone du relais écrit cette colonne, comme les autres de ce qui se voit de la rue.
grant insert (programme) on public.releves to authenticated;

-- Ce que lit le site public : la vue gagne le programme (en dernière colonne).
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
  e.programme
from public.ecoles e
join public.arrondissements a on a.id = e.arrondissement_id
where e.publication = 'publiee';

-- Accepter un relevé -------------------------------------------------------------------------
--
-- Comme avant (voir 20261031150000_cycle_de_vie.sql), plus :
--   - le programme passe du relevé à l'école ;
--   - « Pas indiqué » et « aucun niveau » veulent dire « rien lu sur l'enseigne » : ils
--     n'effacent pas ce que l'école sait déjà (comme le repère et le numéro, qui restent
--     quand le relevé n'en a pas). Un relevé qui dit quelque chose remplace.

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
      publication
    ) values (
      arrondissement, candidat, btrim(r.nom_enseigne), r.type_ecole, r.niveaux, r.programme, r.repere,
      r.numero_enseigne, r.position, 'prete'
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
    -- une école à situer devient prête.
    update public.ecoles e set
      nom = btrim(r.nom_enseigne),
      type_ecole = case when r.type_ecole = 'non_indique' then e.type_ecole else r.type_ecole end,
      niveaux = case when cardinality(r.niveaux) = 0 then e.niveaux else r.niveaux end,
      programme = coalesce(r.programme, e.programme),
      repere = coalesce(r.repere, e.repere),
      numero_enseigne = coalesce(r.numero_enseigne, e.numero_enseigne),
      position = coalesce(r.position, e.position),
      arrondissement_id = coalesce(e.arrondissement_id, arrondissement),
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
