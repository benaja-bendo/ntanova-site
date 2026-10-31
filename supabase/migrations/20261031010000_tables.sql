-- Le socle de la base de NTanova : schémas, listes fermées, tables.
-- Les règles (fonctions, déclencheurs) et les droits sont dans les migrations suivantes.
-- Carte et raisons : supabase/schema.md.

create extension if not exists postgis with schema extensions;

-- Le schéma `prive` n'est pas exposé par l'API de Supabase : ce qui y vit ne se lit
-- ni ne s'écrit par le réseau, sauf par les fonctions prévues pour cela.
create schema prive;
revoke all on schema prive from public;

-- Les listes fermées. src/modele/listes.ts en garde une copie, qu'un test compare.
create domain public.type_ecole as text
  check (value in ('publique', 'privee', 'confessionnelle', 'non_indique'));
create domain public.niveau as text
  check (value in ('maternelle', 'primaire', 'college', 'lycee', 'technique', 'superieur'));
create domain public.fonction_direction as text
  check (value in ('promoteur', 'directeur_general', 'directeur', 'gestionnaire_comptable', 'secretariat', 'autre'));
create domain public.motif_decision as text
  check (value in ('photo_floue', 'hors_lot', 'doublon', 'enfant_sur_photo', 'autre'));
create domain public.statut_releve as text
  check (value in ('a_valider', 'a_corriger', 'accepte', 'refuse'));
create domain public.type_releve as text
  check (value in ('releve', 'correction', 'contre_visite'));
create domain public.statut_relais as text
  check (value in ('en_attente', 'actif', 'suspendu'));
create domain public.direction_vue as text
  check (value in ('vue', 'absente', 'refus'));
create domain public.reponse_doublon as text
  check (value in ('la_meme', 'une_autre'));
create domain public.etat_ecole as text
  check (value in ('relevee', 'verifiee'));
create domain public.publication as text
  check (value in ('brouillon', 'publiee', 'retiree'));
create domain public.type_echange as text
  check (value in ('appel', 'rendez_vous'));

-- Un numéro de téléphone : chiffres seulement, indicatif compris (norme E.164).
create domain public.telephone as text
  check (value ~ '^[1-9][0-9]{7,14}$');
create domain public.slug as text
  check (value ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

create table public.arrondissements (
  id smallint generated always as identity primary key,
  nom text not null unique,
  slug public.slug not null unique,
  ville text not null,
  osm_relation bigint unique,
  contour extensions.geometry(MultiPolygon, 4326) not null
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  arrondissement_id smallint not null references public.arrondissements (id),
  -- Vide : le lot couvre tout son arrondissement.
  contour extensions.geometry(MultiPolygon, 4326),
  a_rendre_le date,
  rendu_le date,
  -- Le lot de formation : ses relevés ne sont jamais publiés ni payés.
  essai boolean not null default false
);

create table public.relais (
  id uuid primary key references auth.users (id) on delete cascade,
  -- L'identifiant Google (`sub`) : il survivra à un changement de serveur.
  google_sub text unique,
  prenom text not null default '' check (length(prenom) <= 60),
  statut public.statut_relais not null default 'en_attente',
  lot_id uuid references public.lots (id) on delete set null,
  cree_le timestamptz not null default now(),
  active_le timestamptz
);

-- Ce qui peut être publié. Le privé d'une école vivra dans une autre table.
create table public.ecoles (
  id uuid primary key default gen_random_uuid(),
  arrondissement_id smallint not null references public.arrondissements (id),
  slug public.slug not null,
  nom text not null check (length(btrim(nom)) between 1 and 200),
  -- Le quartier tel qu'on le dit sur place.
  quartier text check (length(quartier) <= 100),
  type_ecole public.type_ecole not null default 'non_indique',
  niveaux public.niveau[] not null default '{}',
  repere text check (length(repere) <= 300),
  numero_enseigne public.telephone,
  position extensions.geometry(Point, 4326),
  etat public.etat_ecole not null default 'relevee',
  publication public.publication not null default 'brouillon',
  cree_le timestamptz not null default now(),
  mis_a_jour_le timestamptz not null default now(),
  publiee_le timestamptz,
  unique (arrondissement_id, slug)
);
create index ecoles_position on public.ecoles using gist (position);

-- Ce qu'un relais envoie. Un relevé n'est pas l'école : l'administration l'accepte ou non.
create table public.releves (
  -- Créé sur le téléphone : un second envoi du même relevé est refusé (« déjà reçu »).
  id uuid primary key,
  relais_id uuid not null default auth.uid() references public.relais (id),
  lot_id uuid references public.lots (id),
  type public.type_releve not null default 'releve',
  corrige_releve_id uuid references public.releves (id),

  -- Ajouter 1/3 : photo et position
  position extensions.geometry(Point, 4326),
  precision_m real check (precision_m >= 0),
  pris_le timestamptz not null,
  reponse_doublon public.reponse_doublon,
  doublon_de uuid references public.ecoles (id),

  -- Ajouter 2/3 : ce qui se voit de la rue
  nom_enseigne text not null check (length(btrim(nom_enseigne)) between 1 and 200),
  niveaux public.niveau[] not null default '{}',
  type_ecole public.type_ecole not null default 'non_indique',
  repere text check (length(repere) <= 300),
  numero_enseigne public.telephone,

  -- Ajouter 3/3 : ce que le relais peut relire. Le contact lui-même est dans prive.contacts_direction.
  direction public.direction_vue,
  fiche_liaison_remise boolean not null default false,
  code_liaison text check (code_liaison ~ '^[0-9]{4}$'),
  repasser text check (length(repasser) <= 200),

  -- Calculé par la base à l'arrivée
  recu_le timestamptz not null default now(),
  hors_lot boolean,
  doublon_possible boolean not null default false,

  -- La décision de l'administration
  statut public.statut_releve not null default 'a_valider',
  motif public.motif_decision,
  message_au_relais text check (length(message_au_relais) <= 500),
  decide_le timestamptz,
  ecole_id uuid references public.ecoles (id),
  contact_confirme_le timestamptz,
  contact_fonction public.fonction_direction,

  constraint releves_correction_liee check ((type = 'correction') = (corrige_releve_id is not null)),
  constraint releves_accepte_a_une_ecole check (statut <> 'accepte' or ecole_id is not null)
);
create index releves_position on public.releves using gist (position);
create index releves_relais on public.releves (relais_id);

-- Les dates des échanges avec la direction de chaque école. Jamais leur contenu.
create table public.echanges (
  ecole_id uuid primary key references public.ecoles (id) on delete cascade,
  premier_message_le date,
  reponse_le date,
  reponse_fonction public.fonction_direction,
  echange_decideur_le date,
  echange_decideur_type public.type_echange,
  derniere_relance_le date,
  relances smallint not null default 0 check (relances >= 0)
);

-- Le journal de l'application relais. Aucune donnée personnelle.
create table public.erreurs (
  id uuid primary key,
  relais_id uuid not null default auth.uid() references public.relais (id) on delete cascade,
  survenue_le timestamptz not null,
  recu_le timestamptz not null default now(),
  ecran text check (length(ecran) <= 60),
  code text not null check (length(code) <= 60),
  detail text check (length(detail) <= 500),
  version_app text check (length(version_app) <= 40),
  appareil text check (length(appareil) <= 200)
);

-- Les comptes de l'administration. On s'y inscrit à la main, après sa première connexion.
create table prive.admins (
  id uuid primary key references auth.users (id) on delete cascade
);

-- La partie privée d'un relevé : seul l'administrateur la lit, jamais le relais.
create table prive.contacts_direction (
  releve_id uuid primary key references public.releves (id) on delete cascade,
  fonction public.fonction_direction,
  nom text check (length(nom) <= 120),
  whatsapp public.telephone,
  accord_contact boolean not null default false,
  accord_le timestamptz,
  ce_qui_a_ete_dit text check (length(ce_qui_a_ete_dit) <= 1000),
  recu_le timestamptz not null default now(),
  -- Sans l'accord de la personne, on ne note pas son numéro.
  constraint contacts_numero_avec_accord check (whatsapp is null or accord_contact)
);
