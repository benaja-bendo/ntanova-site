-- Les écoles « à situer » et les écoles confiées à un relais.
--
-- Des écoles connues autrement que par un relevé (par exemple pendant les
-- entretiens) entrent en brouillon, sans position et parfois sans arrondissement.
-- Jamais de position inventée : l'administration confie l'école à un relais, qui
-- va sur place et envoie une contre-visite ; en l'acceptant, l'école reçoit sa
-- vraie position et peut être publiée.

-- Une école à situer peut ne pas avoir d'arrondissement ; une école publiée en a un.
alter table public.ecoles alter column arrondissement_id drop not null;
alter table public.ecoles add constraint ecoles_publiee_dans_un_arrondissement
  check (publication <> 'publiee' or arrondissement_id is not null);

-- D'où vient une école qui n'est pas née d'un relevé (ex. : `ETB-007`). Privé : le
-- public ne doit pas savoir qu'une école a été interrogée.
create table prive.ecoles_sources (
  ecole_id uuid primary key references public.ecoles (id) on delete cascade,
  reference text not null unique check (length(reference) <= 40),
  importee_le timestamptz not null default now()
);
revoke all on prive.ecoles_sources from public, anon, authenticated;
alter table prive.ecoles_sources enable row level security;

-- Une contre-visite décrit une école connue : `doublon_de` est l'école visitée.
alter table public.releves add constraint releves_contre_visite_liee
  check (type <> 'contre_visite' or doublon_de is not null);

-- Les écoles confiées à un relais, une à la fois -----------------------------

create table public.ecoles_confiees (
  ecole_id uuid primary key references public.ecoles (id) on delete cascade,
  relais_id uuid not null references public.relais (id) on delete cascade,
  confiee_le timestamptz not null default now(),
  note text check (length(note) <= 500)
);
create index ecoles_confiees_relais on public.ecoles_confiees (relais_id);

revoke all on public.ecoles_confiees from anon, authenticated;
alter table public.ecoles_confiees enable row level security;
grant select, insert, update, delete on public.ecoles_confiees to authenticated;

create policy "L'administration confie les écoles"
  on public.ecoles_confiees for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

create policy "Le relais actif lit les écoles qu'on lui confie"
  on public.ecoles_confiees for select to authenticated
  using (relais_id = (select auth.uid()) and (select public.est_relais_actif()));

-- Le relais lit les écoles qu'on lui confie, même en brouillon.
create policy "Le relais lit les écoles qu'on lui confie"
  on public.ecoles for select to authenticated
  using (
    (select public.est_relais_actif())
    and exists (
      select 1 from public.ecoles_confiees c
      where c.ecole_id = ecoles.id and c.relais_id = (select auth.uid())
    )
  );

create function public.confier_ecole(ecole uuid, relais uuid, note text default null) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  if not exists (select 1 from public.relais r where r.id = relais and r.statut = 'actif') then
    raise exception 'Ce relais n''est pas actif : l''activer d''abord.' using errcode = '22023';
  end if;
  insert into public.ecoles_confiees (ecole_id, relais_id, note)
  values (ecole, relais, note)
  on conflict (ecole_id) do update
    set relais_id = excluded.relais_id, note = excluded.note, confiee_le = now();
end;
$$;

create function public.reprendre_ecole(ecole uuid) returns void
language plpgsql set search_path = '' as $$
#variable_conflict use_variable
begin
  perform public.exiger_admin();
  delete from public.ecoles_confiees c where c.ecole_id = ecole;
end;
$$;

revoke execute on function public.confier_ecole(uuid, uuid, text), public.reprendre_ecole(uuid)
  from public, anon;
grant execute on function public.confier_ecole(uuid, uuid, text), public.reprendre_ecole(uuid)
  to authenticated;

-- Accepter un relevé sur une école connue la situe, et la publie ------------
--
-- Comme avant, plus : une école sans arrondissement prend celui du relevé ; une
-- école en brouillon passe « publiée » ; la mission du relais sur cette école se termine.

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
      publication, publiee_le
    ) values (
      arrondissement, candidat, btrim(r.nom_enseigne), r.type_ecole, r.niveaux, r.repere,
      r.numero_enseigne, r.position, 'publiee', now()
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
    update public.ecoles e set
      nom = btrim(r.nom_enseigne),
      type_ecole = r.type_ecole,
      niveaux = r.niveaux,
      repere = coalesce(r.repere, e.repere),
      numero_enseigne = coalesce(r.numero_enseigne, e.numero_enseigne),
      position = coalesce(r.position, e.position),
      arrondissement_id = coalesce(e.arrondissement_id, arrondissement),
      publication = case when e.publication = 'brouillon' then 'publiee' else e.publication end
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
