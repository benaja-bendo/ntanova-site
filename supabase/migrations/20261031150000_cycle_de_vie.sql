-- Le cycle de vie d'une école et d'un relevé (ticket #10, décidé le 31/10/2026).
--
-- École : brouillon → prête → publiée → retirée (→ publiée de nouveau).
--   - Accepter un relevé rend l'école « prête » : la donnée est juste.
--   - Publier est un geste à part : une école, un arrondissement, ou un lot.
--   - Retirer du site, avec un motif ; une école retirée se republie.
-- Relevé : un refus est définitif.
-- Supprimer : jamais une école ni un relevé. Trois effacements, tracés : le
-- contact d'une direction, la photo d'une enseigne, et la fusion de deux fiches
-- en doublon (l'une est retirée et renvoie vers l'autre).
-- La carte des états : supabase/schema.md, « Le cycle de vie ».

-- Les états d'une école ---------------------------------------------------------

alter domain public.publication drop constraint publication_check;
alter domain public.publication add constraint publication_check
  check (value in ('brouillon', 'prete', 'publiee', 'retiree'));

create domain public.motif_retrait as text
  check (value in ('demande_ecole', 'erreur', 'fermeture', 'doublon', 'autre'));

alter table public.ecoles
  add column retiree_le timestamptz,
  add column motif_retrait public.motif_retrait,
  add column note_retrait text check (length(note_retrait) <= 500),
  add column remplacee_par uuid references public.ecoles (id),
  add constraint ecoles_retiree_avec_motif
    check (publication <> 'retiree' or motif_retrait is not null),
  add constraint ecoles_pas_remplacee_par_elle_meme check (remplacee_par <> id);

-- Personne ne supprime une école par l'API : on la retire.
revoke delete on public.ecoles from authenticated;

-- Le journal des effacements (droit d'effacement, doublons). Privé.
create table prive.effacements (
  id bigint generated always as identity primary key,
  quoi text not null check (quoi in ('contact', 'photo', 'fusion')),
  releve_id uuid references public.releves (id) on delete set null,
  ecole_id uuid references public.ecoles (id) on delete set null,
  par uuid not null,
  le timestamptz not null default now(),
  note text check (length(note) <= 500)
);
revoke all on prive.effacements from public, anon, authenticated;
alter table prive.effacements enable row level security;

-- Accepter : l'école devient « prête », et un refus est définitif ---------------

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
      arrondissement_id, slug, nom, type_ecole, niveaux, repere, numero_enseigne, position,
      publication
    ) values (
      arrondissement, candidat, btrim(r.nom_enseigne), r.type_ecole, r.niveaux, r.repere,
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
      type_ecole = r.type_ecole,
      niveaux = r.niveaux,
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

-- Publier : une école, un arrondissement, un lot ---------------------------------

create function public.publier_ecole(ecole uuid) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  update public.ecoles e set
    publication = 'publiee', retiree_le = null, motif_retrait = null, note_retrait = null
  where e.id = ecole and e.publication in ('prete', 'retiree') and e.remplacee_par is null;
  if not found then
    raise exception 'Seule une école prête ou retirée se publie (une école à situer attend sa contre-visite).'
      using errcode = '22023';
  end if;
end;
$$;

-- Toutes les écoles prêtes d'un arrondissement. Rend le nombre d'écoles publiées.
create function public.publier_arrondissement(arrondissement smallint) returns integer
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare
  n integer;
begin
  perform public.exiger_admin();
  update public.ecoles e set publication = 'publiee'
  where e.arrondissement_id = arrondissement and e.publication = 'prete';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Les écoles prêtes relevées dans un lot (par un relevé accepté de ce lot).
create function public.publier_lot(lot uuid) returns integer
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
declare
  n integer;
begin
  perform public.exiger_admin();
  update public.ecoles e set publication = 'publiee'
  where e.publication = 'prete'
    and exists (
      select 1 from public.releves r
      where r.ecole_id = e.id and r.statut = 'accepte' and r.lot_id = lot
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Retirer du site, avec un motif -----------------------------------------------------

create function public.retirer_ecole(
  ecole uuid,
  motif public.motif_retrait,
  note text default null
) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  update public.ecoles e set
    publication = 'retiree', retiree_le = now(), motif_retrait = motif, note_retrait = note
  where e.id = ecole and e.publication in ('prete', 'publiee');
  if not found then
    raise exception 'Seule une école prête ou publiée se retire.' using errcode = '22023';
  end if;
  delete from public.ecoles_confiees c where c.ecole_id = ecole;
end;
$$;

-- Fusionner deux fiches en doublon : la première est retirée et renvoie vers la seconde.
create function public.fusionner_ecoles(doublon uuid, gardee uuid) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  if doublon = gardee then
    raise exception 'Une école ne se fusionne pas avec elle-même.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ecoles e where e.id = gardee and e.publication <> 'retiree') then
    raise exception 'L''école gardée doit exister et ne pas être retirée.' using errcode = '22023';
  end if;
  update public.ecoles e set
    publication = 'retiree', retiree_le = now(), motif_retrait = 'doublon', remplacee_par = gardee
  where e.id = doublon;
  if not found then
    raise exception 'École introuvable.' using errcode = 'P0002';
  end if;
  -- Les relevés décrivaient la même école : ils renvoient à celle qu'on garde.
  update public.releves r set ecole_id = gardee where r.ecole_id = doublon;
  delete from public.ecoles_confiees c where c.ecole_id = doublon;
  insert into prive.effacements (quoi, ecole_id, par, note)
  values ('fusion', doublon, (select auth.uid()), 'Fusionnée dans ' || gardee::text);
end;
$$;

-- Effacer le contact d'une direction (droit d'effacement, loi n° 29-2019) --------

create function public.effacer_contact(releve uuid, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  delete from prive.contacts_direction c where c.releve_id = releve;
  if not found then
    raise exception 'Aucun contact pour ce relevé.' using errcode = 'P0002';
  end if;
  update public.releves r set contact_confirme_le = null, contact_fonction = null where r.id = releve;
  insert into prive.effacements (quoi, releve_id, par, note)
  values ('contact', releve, (select auth.uid()), note);
end;
$$;

-- La photo s'efface par l'API du stockage (le fichier avec sa ligne) ; la base note
-- seulement l'effacement. L'administration a le droit de supprimer ces photos.
create function public.noter_effacement_photo(releve uuid, note text default null) returns void
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  insert into prive.effacements (quoi, releve_id, par, note)
  values ('photo', releve, (select auth.uid()), note);
end;
$$;

create policy "L'administration efface les photos des relevés"
  on storage.objects for delete to authenticated
  using (bucket_id = 'releves' and (select public.est_admin()));

-- Les adresses des fiches fusionnées : le site public y met un renvoi. Seulement
-- les doublons (même école), jamais une école retirée pour une autre raison.
create view public.ecoles_redirections with (security_invoker = false) as
select
  a1.slug as de_arrondissement,
  e.slug as de_slug,
  a2.slug as vers_arrondissement,
  g.slug as vers_slug
from public.ecoles e
join public.arrondissements a1 on a1.id = e.arrondissement_id
join public.ecoles g on g.id = e.remplacee_par and g.publication = 'publiee'
join public.arrondissements a2 on a2.id = g.arrondissement_id
where e.publication = 'retiree' and e.motif_retrait = 'doublon';

revoke all on public.ecoles_redirections from public, anon, authenticated;
grant select on public.ecoles_redirections to anon, authenticated;

revoke execute on function
  public.publier_ecole(uuid),
  public.publier_arrondissement(smallint),
  public.publier_lot(uuid),
  public.retirer_ecole(uuid, public.motif_retrait, text),
  public.fusionner_ecoles(uuid, uuid),
  public.effacer_contact(uuid, text),
  public.noter_effacement_photo(uuid, text)
from public, anon;
grant execute on function
  public.publier_ecole(uuid),
  public.publier_arrondissement(smallint),
  public.publier_lot(uuid),
  public.retirer_ecole(uuid, public.motif_retrait, text),
  public.fusionner_ecoles(uuid, uuid),
  public.effacer_contact(uuid, text),
  public.noter_effacement_photo(uuid, text)
to authenticated;
