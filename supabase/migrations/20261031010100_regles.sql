-- Les règles de la base : qui est qui, ce qui se calcule à l'arrivée d'un relevé,
-- et les décisions de l'administration. Elles survivront à un changement de serveur.

-- Qui est qui ---------------------------------------------------------------

create function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from prive.admins a where a.id = (select auth.uid()));
$$;

create function public.est_relais_actif() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.relais r where r.id = (select auth.uid()) and r.statut = 'actif'
  );
$$;

create function public.mon_lot() returns uuid
language sql stable security definer set search_path = '' as $$
  select r.lot_id from public.relais r where r.id = (select auth.uid());
$$;

-- Dans une fonction de l'administration : refuse tout appel qui ne vient ni d'un
-- administrateur (par l'API) ni du rôle `postgres` (l'éditeur SQL de Supabase Studio).
create function public.exiger_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not (public.est_admin() or current_user = 'postgres') then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
end;
$$;

-- Le relais naît à sa première connexion, en attente ------------------------

create function public.creer_relais() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.relais (id, google_sub, prenom)
  values (
    new.id,
    case when new.raw_app_meta_data ->> 'provider' = 'google' then
      coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub')
    end,
    left(coalesce(
      new.raw_user_meta_data ->> 'given_name',
      split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)
    ), 60)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger creer_relais
after insert on auth.users
for each row execute function public.creer_relais();

-- À l'arrivée d'un relevé ---------------------------------------------------

create function public.releves_avant_insertion() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  contour extensions.geometry;
  ecole_corrigee uuid;
begin
  -- L'auteur, l'heure de réception et le statut viennent de la base, jamais du téléphone.
  new.relais_id := coalesce((select auth.uid()), new.relais_id);
  new.recu_le := now();
  if (select auth.uid()) is not null then
    new.statut := 'a_valider';
    new.motif := null;
    new.message_au_relais := null;
    new.decide_le := null;
    new.ecole_id := null;
    new.contact_confirme_le := null;
    new.contact_fonction := null;
  end if;
  new.lot_id := coalesce(new.lot_id, (select r.lot_id from public.relais r where r.id = new.relais_id));

  if new.corrige_releve_id is not null then
    select r.ecole_id into ecole_corrigee
    from public.releves r
    where r.id = new.corrige_releve_id and r.relais_id = new.relais_id;
    if not found then
      raise exception 'La fiche corrigée n''appartient pas à ce relais.' using errcode = '42501';
    end if;
  end if;

  -- Hors du lot : la position n'est pas dans le contour du lot (ou de son arrondissement).
  select coalesce(l.contour, a.contour) into contour
  from public.lots l
  join public.arrondissements a on a.id = l.arrondissement_id
  where l.id = new.lot_id;

  new.hors_lot := case
    when new.position is null or contour is null then null
    else not extensions.st_covers(contour, new.position)
  end;

  -- Doublon possible : une école ou un autre relevé à moins de 40 m.
  new.doublon_possible := new.position is not null and (
    exists (
      select 1 from public.ecoles e
      where e.publication <> 'retiree'
        and e.position is not null
        and e.id is distinct from ecole_corrigee
        and extensions.st_dwithin(e.position::extensions.geography, new.position::extensions.geography, 40)
    )
    or exists (
      select 1 from public.releves r
      where r.id <> new.id
        and r.id is distinct from new.corrige_releve_id
        and r.corrige_releve_id is distinct from coalesce(new.corrige_releve_id, new.id)
        and r.statut <> 'refuse'
        and r.position is not null
        and extensions.st_dwithin(r.position::extensions.geography, new.position::extensions.geography, 40)
    )
  );

  return new;
end;
$$;

create trigger releves_avant_insertion
before insert on public.releves
for each row execute function public.releves_avant_insertion();

create function public.ecoles_avant_modification() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.mis_a_jour_le := now();
  if new.publication = 'publiee' and old.publication is distinct from 'publiee' then
    new.publiee_le := now();
  end if;
  return new;
end;
$$;

create trigger ecoles_avant_modification
before update on public.ecoles
for each row execute function public.ecoles_avant_modification();

-- Le contact de la direction : le relais l'envoie, sans pouvoir le relire ----

create function public.envoyer_contact(
  releve uuid,
  fonction public.fonction_direction default null,
  nom text default null,
  whatsapp public.telephone default null,
  accord boolean default false,
  accord_le timestamptz default null,
  note text default null
) returns text
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.est_relais_actif() then
    raise exception 'Compte relais inactif.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.releves r where r.id = releve and r.relais_id = (select auth.uid())
  ) then
    raise exception 'Relevé inconnu : envoyer la fiche avant le contact.' using errcode = 'P0002';
  end if;

  insert into prive.contacts_direction (releve_id, fonction, nom, whatsapp, accord_contact, accord_le, ce_qui_a_ete_dit)
  values (releve, fonction, nullif(btrim(nom), ''), whatsapp, coalesce(accord, false), accord_le, nullif(btrim(note), ''))
  on conflict (releve_id) do nothing;

  return case when found then 'recu' else 'deja_recu' end;
end;
$$;

-- Les décisions de l'administration ----------------------------------------

create function public.slugifier(texte text) returns text
language sql immutable set search_path = '' as $$
  select btrim(
    regexp_replace(
      translate(
        replace(replace(lower(texte), 'œ', 'oe'), 'æ', 'ae'),
        'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ',
        'aaaaaaceeeeiiiinooooouuuuyy'
      ),
      '[^a-z0-9]+', '-', 'g'
    ),
    '-'
  );
$$;

-- Accepte un relevé et publie sa fiche relevée. Sans école donnée, en crée une ;
-- avec une école (fusion, correction), la met à jour, sauf si elle est déjà vérifiée.
create function public.accepter_releve(releve uuid, ecole uuid default null) returns uuid
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

  return ecole;
end;
$$;

-- Demande une correction au relais (« la photo est floue, reprenez-la de face »).
create function public.demander_correction(
  releve uuid,
  motif public.motif_decision,
  message text default null
) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  update public.releves r set
    statut = 'a_corriger', motif = motif, message_au_relais = message, decide_le = now()
  where r.id = releve and r.statut in ('a_valider', 'a_corriger');
  if not found then
    raise exception 'Relevé introuvable ou déjà décidé.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.refuser_releve(
  releve uuid,
  motif public.motif_decision,
  message text default null
) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  update public.releves r set
    statut = 'refuse', motif = motif, message_au_relais = message, decide_le = now()
  where r.id = releve and r.statut in ('a_valider', 'a_corriger');
  if not found then
    raise exception 'Relevé introuvable ou déjà décidé.' using errcode = 'P0002';
  end if;
end;
$$;

-- La personne a confirmé sa fonction à NTanova sur WhatsApp.
create function public.confirmer_contact(releve uuid, fonction public.fonction_direction) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  update public.releves r set contact_confirme_le = now(), contact_fonction = fonction
  where r.id = releve;
  if not found then
    raise exception 'Relevé introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

-- Active un relais, après sa formation, et lui donne un lot.
create function public.activer_relais(relais uuid, lot uuid) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  update public.relais r set statut = 'actif', lot_id = lot, active_le = coalesce(r.active_le, now())
  where r.id = relais;
  if not found then
    raise exception 'Relais introuvable : il doit s''être connecté une première fois.' using errcode = 'P0002';
  end if;
end;
$$;

-- L'administration lit le contact d'un relevé (l'écran « À valider »).
create function public.contact_du_releve(releve uuid)
returns table (
  fonction public.fonction_direction,
  nom text,
  whatsapp public.telephone,
  accord_contact boolean,
  accord_le timestamptz,
  ce_qui_a_ete_dit text,
  recu_le timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
begin
  if not public.est_admin() then
    raise exception 'Réservé à l''administration.' using errcode = '42501';
  end if;
  return query
    select c.fonction, c.nom, c.whatsapp, c.accord_contact, c.accord_le, c.ce_qui_a_ete_dit, c.recu_le
    from prive.contacts_direction c
    where c.releve_id = releve;
end;
$$;

-- Un contact a-t-il été reçu pour ce relevé ? Oui ou non, rien de son contenu.
create function public.contact_recu(releve uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from prive.contacts_direction c where c.releve_id = releve);
$$;

-- Les vues ------------------------------------------------------------------

-- Ce que lit le site public à la construction.
create view public.ecoles_publiees with (security_invoker = true) as
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
  e.mis_a_jour_le
from public.ecoles e
join public.arrondissements a on a.id = e.arrondissement_id
where e.publication = 'publiee';

-- La file de l'administration (et de Supabase Studio, lundi).
create view public.releves_a_valider with (security_invoker = true) as
select
  r.id,
  r.recu_le,
  r.type,
  r.nom_enseigne,
  rl.prenom as relais,
  l.nom as lot,
  l.essai,
  r.hors_lot,
  r.doublon_possible,
  r.reponse_doublon,
  r.precision_m,
  exists (
    select 1 from storage.objects o
    where o.bucket_id = 'releves' and o.name = r.id::text || '/enseigne.jpg'
  ) as photo_recue,
  public.contact_recu(r.id) as contact_recu
from public.releves r
join public.relais rl on rl.id = r.relais_id
left join public.lots l on l.id = r.lot_id
where r.statut = 'a_valider';
