-- Refonte publique, lot 3B1 (ticket 215) : les messages reçus par Contact et par l'annuaire. 1. Le stockage.
--
-- Quatre natures : un message (`contact`), une école absente, une erreur sur une fiche, un retrait d'information publiée.
-- Tout vit dans `prive` : aucun rôle de l'API n'a de droit sur ces tables, seules des fonctions `security definer` y touchent
-- (envoi : `…140100_messages_envoi.sql` ; administration : `…140200_messages_traitement.sql` ; annonces et purge :
-- `…140300_messages_annonces_et_purge.sql`). Un message ne change jamais une fiche.
--
-- Rien n'est activé : aucune page n'appelle ces fonctions, aucun courrier ne part. Additif : le site en ligne ne lit rien de
-- ce qui est ici. Règles et raisons : `supabase/schema.md`, « Les messages reçus ».

-- HMAC et tirages au hasard. Déjà là sur Supabase ; un PostgreSQL ordinaire l'a dans ses modules de confiance.
create extension if not exists pgcrypto with schema extensions;

-- Les listes ---------------------------------------------------------------------------------------------------------------------

create domain public.public_request_kind as text check (value in ('contact', 'absente', 'erreur', 'retrait'));
create domain public.public_request_state as text check (value in ('recue', 'indesirable', 'ouverte', 'en_attente', 'close'));
create domain public.public_request_origin as text
  check (value in ('accueil', 'ecoles', 'fiche', 'pied', 'pour-les-ecoles', 'fiabilite', 'villes', 'outils', 'contact', 'confidentialite', 'direct'));
create domain public.public_request_subject as text check (value in ('trouver', 'ecole', 'outils', 'donnees', 'site', 'autre'));
create domain public.public_request_level as text check (value in ('M', 'P', 'C', 'L', 'T', 'S'));
create domain public.public_request_topic as text
  check (value in ('nom', 'adresse', 'niveaux', 'frais', 'contact', 'photo', 'ferme', 'autre'));
create domain public.public_request_knowledge as text check (value in ('passage', 'document', 'ecole', 'autre'));
create domain public.public_request_removal as text check (value in ('tel', 'photo', 'personne', 'fiche', 'autre'));
create domain public.public_request_reply as text check (value in ('non', 'whatsapp', 'email'));
create domain public.public_request_reply_state as text check (value in ('non_demandee', 'a_faire', 'faite', 'impossible'));
create domain public.public_request_decision as text
  check (value in ('existe', 'deja_presente', 'introuvable', 'non_retenue', 'retenue', 'fiche_juste', 'traitee', 'a_l_annuaire', 'au_retrait',
    'indesirable', 'retiree', 'impossible_a_verifier', 'reorientee'));
create domain public.public_removal_check as text check (value in ('numero', 'direction', 'autre'));
create domain public.public_removal_target as text check (value in ('contact_public', 'numero_enseigne', 'photo', 'fiche', 'texte'));
create domain public.public_notice_state as text check (value in ('a_envoyer', 'en_cours', 'envoyee', 'abandonnee'));
create domain public.public_notice_error as text
  check (value in ('connexion', 'authentification', 'refus_temporaire', 'refus_definitif', 'delai', 'configuration'));

-- Les réglages : des valeurs de départ, qu'une migration change. Aucun écran -----------------------------------------------------------

create table prive.public_request_settings (
  only_row boolean primary key default true check (only_row),
  pass_validity interval not null default '7 days',
  spam_retention interval not null default '30 days',
  closed_retention interval not null default '12 months',
  key_writes_max integer not null default 8 check (key_writes_max > 0),
  key_followups_max integer not null default 3 check (key_followups_max >= 0),
  connection_creations_per_hour integer not null default 20 check (connection_creations_per_hour > 0),
  connection_writes_per_hour integer not null default 60 check (connection_writes_per_hour > 0),
  daily_creations_max integer not null default 300 check (daily_creations_max > 0),
  daily_writes_max integer not null default 1000 check (daily_writes_max > 0),
  trusted_connection_header text check (trusted_connection_header ~ '^[a-z0-9-]{1,40}$'),
  -- Ce qui rend toute empreinte inutile après la purge : un envoi expire toujours avant la plus courte conservation.
  constraint expire_avant_la_purge check (
    pass_validity > interval '0' and pass_validity < spam_retention and pass_validity < closed_retention
  )
);
comment on table prive.public_request_settings is
  'Les valeurs de départ des messages reçus (validité, conservation, bornes), une seule ligne ; une migration les change.';
comment on column prive.public_request_settings.trusted_connection_header is
  'L''en-tête HTTP qui porte l''adresse de la personne, quand on a CONSTATÉ que le client ne peut pas l''écrire. Nul : inconnu, '
  'aucune borne par connexion, seuls la clé et le plafond du jour tiennent (essai à faire avant l''ouverture, lot 3B2).';
insert into prive.public_request_settings default values;

-- Le secret du laissez-passer : tiré par la base, renouvelé par elle, jamais lu par personne. Aucun au départ : sans secret, aucun
-- laissez-passer, donc aucun envoi. Ouvrir les formulaires est un geste du fondateur : `select prive.renew_public_request_secret()` -------------------------------------------

create table prive.public_request_secrets (
  id bigint generated always as identity primary key,
  secret bytea not null check (octet_length(secret) = 32),
  created_at timestamptz not null default now()
);
comment on table prive.public_request_secrets is
  'Le secret qui scelle l''heure d''un envoi. Vide : les envois sont fermés. Une restauration ramène l''ancien : le renouveler avant de rouvrir.';

-- Les messages ---------------------------------------------------------------------------------------------------------------------

create table prive.public_requests (
  id bigint generated always as identity primary key,
  -- Deux groupes de quatre signes sans ambiguïté (ni 0, 1, I, O). Elle se rappelle à l'équipe ; elle n'ouvre rien.
  reference text not null unique check (reference ~ '^[CAR]-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$'),
  kind public.public_request_kind not null,
  -- L'empreinte de la clé d'envoi (SHA-256), jamais la clé.
  key_hash bytea not null unique check (octet_length(key_hash) = 32),
  state public.public_request_state not null default 'recue',
  received_at timestamptz not null,
  current_revision integer not null check (current_revision between 1 and 1000),
  writes integer not null default 1 check (writes >= 1),
  followups integer not null default 0 check (followups >= 0),
  limit_reached_at timestamptz,
  opened_at timestamptz,
  opened_revision integer,
  campus_id uuid references public.campuses (id) on delete set null,
  decision public.public_request_decision,
  decision_note text check (length(decision_note) <= 300),
  decided_at timestamptz,
  reply_channel public.public_request_reply not null,
  reply_state public.public_request_reply_state not null,
  replied_on date,
  spam_since timestamptz,
  closed_at timestamptz,
  -- Une suite (la personne a réécrit après l'ouverture) ou une réorientation : le lien se vide, la demande reste.
  follows_id bigint references prive.public_requests (id) on delete set null,
  redirected_from_id bigint references prive.public_requests (id) on delete set null,
  row_version integer not null default 1,
  constraint public_requests_reference_de_sa_nature check (
    left(reference, 1) = case kind when 'contact' then 'C' when 'retrait' then 'R' else 'A' end
  ),
  -- Ouvrir fige : la révision lue reste la révision courante.
  constraint public_requests_ouverte_figee check (
    (opened_at is null) = (opened_revision is null) and (opened_revision is null or opened_revision = current_revision)
  ),
  constraint public_requests_close_datee check ((state = 'close') = (closed_at is not null)),
  constraint public_requests_indesirable_datee check ((state = 'indesirable') = (spam_since is not null)),
  constraint public_requests_decision_datee check ((decision is null) = (decided_at is null)),
  constraint public_requests_reponse_demandee check ((reply_channel = 'non') = (reply_state = 'non_demandee')),
  constraint public_requests_reponse_datee check ((reply_state = 'faite') = (replied_on is not null)),
  constraint public_requests_retrait_joignable check (kind <> 'retrait' or reply_channel <> 'non'),
  constraint public_requests_close_complete check (state <> 'close' or (decision is not null and reply_state <> 'a_faire'))
);
comment on table prive.public_requests is
  'Un message reçu par Contact ou par l''annuaire, privé. Effacé avec toutes ses copies 12 mois après sa clôture (indésirable : 30 jours).';
create index public_requests_a_purger on prive.public_requests (closed_at) where closed_at is not null;
create index public_requests_indesirables on prive.public_requests (spam_since) where spam_since is not null;
create index public_requests_campus on prive.public_requests (campus_id) where campus_id is not null;
create index public_requests_suites on prive.public_requests (follows_id) where follows_id is not null;
create index public_requests_reorientations on prive.public_requests (redirected_from_id) where redirected_from_id is not null;

-- Chaque écriture change le numéro de la ligne : un geste de l'administration porte celui qu'il a lu.
create function prive.public_requests_numero() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;
create trigger public_requests_numero before update on prive.public_requests
for each row execute function prive.public_requests_numero();

-- Ce que la personne a écrit, révision par révision. Rien ne s'écrase.
create table prive.public_request_versions (
  request_id bigint not null references prive.public_requests (id) on delete cascade,
  revision integer not null check (revision between 1 and 1000),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 8192),
  content_hash bytea not null check (octet_length(content_hash) = 32),
  late boolean not null default false,
  received_at timestamptz not null,
  primary key (request_id, revision)
);
comment on column prive.public_request_versions.late is 'Arrivée après une révision plus récente : gardée, jamais courante.';

-- Ce qui s'est passé : un mot d'une liste, une date, jamais ce que la personne a écrit.
create table prive.public_request_events (
  id bigint generated always as identity primary key,
  request_id bigint not null references prive.public_requests (id) on delete cascade,
  what text not null check (what in (
    'recue', 'mise_a_jour', 'version_ancienne', 'suite', 'limite', 'ouverte', 'en_attente', 'reprise', 'rattachee', 'detachee', 'decidee',
    'reponse_faite', 'reponse_impossible', 'close', 'rouverte', 'indesirable', 'pas_indesirable', 'reorientee', 'annonce_relancee',
    'retrait_verifie', 'retrait_impossible', 'retrait_cible', 'retrait_base', 'retrait_mise_en_ligne', 'retrait_constate')),
  detail text check (length(detail) <= 120),
  at timestamptz not null,
  by_user uuid
);
create index public_request_events_request on prive.public_request_events (request_id);

-- L'annonce à envoyer au fondateur : écrite avec le message, dans la même transaction.
create table prive.public_request_notices (
  request_id bigint primary key references prive.public_requests (id) on delete cascade,
  state public.public_notice_state not null default 'a_envoyer',
  -- Le même à chaque essai : un second envoi se reconnaît.
  message_id uuid not null default gen_random_uuid(),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null,
  first_attempt_at timestamptz,
  lease_token uuid unique,
  lease_until timestamptz,
  last_error public.public_notice_error,
  sent_at timestamptz,
  constraint public_request_notices_bail check ((state = 'en_cours') = (lease_token is not null) and (lease_token is null) = (lease_until is null)),
  constraint public_request_notices_envoyee check ((state = 'envoyee') = (sent_at is not null))
);
create index public_request_notices_a_envoyer on prive.public_request_notices (next_attempt_at) where state in ('a_envoyer', 'en_cours');

-- Le suivi d'un retrait : ce qui a été fait, à quelle date. Jamais l'information retirée.
create table prive.public_request_removals (
  request_id bigint primary key references prive.public_requests (id) on delete cascade,
  outcome text check (outcome in ('concernee', 'impossible', 'reorientee')),
  check_kind public.public_removal_check,
  check_note text check (length(check_note) <= 160),
  checked_at timestamptz,
  targets public.public_removal_target[],
  target_campus_id uuid references public.campuses (id) on delete set null,
  -- Sans clé étrangère : effacer la photo ne doit pas effacer la trace de ce qu'on a retiré.
  target_photo_id uuid,
  removed_at timestamptz,
  publish_requested_at timestamptz,
  publish_run text check (publish_run ~ '^[0-9]{1,20}$'),
  production_seen_on date,
  essai_seen_on date,
  seen_at timestamptz,
  constraint public_request_removals_verifiee check (
    (outcome is null) = (checked_at is null) and (outcome is distinct from 'concernee') = (check_kind is null)
  ),
  constraint public_request_removals_autre_notee check (check_kind is distinct from 'autre' or check_note is not null),
  constraint public_request_removals_dans_l_ordre check (
    (removed_at is null or (outcome = 'concernee' and targets is not null))
    and (publish_requested_at is null or removed_at is not null)
    and (seen_at is null or (publish_requested_at is not null and production_seen_on is not null and essai_seen_on is not null))
  )
);
create index public_request_removals_campus on prive.public_request_removals (target_campus_id) where target_campus_id is not null;

-- Les bornes ---------------------------------------------------------------------------------------------------------------------

create table prive.public_request_counters (
  bucket text not null check (length(bucket) <= 70),
  window_start timestamptz not null,
  n integer not null check (n > 0),
  filled_at timestamptz,
  primary key (bucket, window_start)
);
comment on table prive.public_request_counters is
  'Les écritures comptées par connexion (empreinte salée du jour) et pour l''ensemble ; effacées à 48 h.';

create table prive.public_request_salts (
  day date primary key,
  salt bytea not null check (octet_length(salt) = 16)
);
comment on table prive.public_request_salts is 'Le sel du jour : l''adresse d''une personne n''est jamais gardée, ni retrouvable après 48 h.';

-- Les passages des tâches (annonces, purge) : un silence se voit.
create table prive.public_request_runs (
  task text primary key check (task in ('annonces', 'purge')),
  last_run_at timestamptz not null,
  last_count integer not null default 0
);

-- Le journal des effacements garde aussi le retrait demandé d'une information publiée : quoi, quand, par qui, quelle fiche.
alter table prive.erasures drop constraint erasures_what_check;
alter table prive.erasures add constraint erasures_what_check
  check (what in ('contact', 'photo', 'merge', 'campus', 'trash', 'restore', 'zone', 'institution', 'public_info'));

-- Les droits : aucun ---------------------------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['public_request_settings', 'public_request_secrets', 'public_requests', 'public_request_versions',
    'public_request_events', 'public_request_notices', 'public_request_removals', 'public_request_counters', 'public_request_salts',
    'public_request_runs']
  loop
    execute format('alter table prive.%I enable row level security', t);
    execute format('revoke all on table prive.%I from public, anon, authenticated, service_role', t);
  end loop;
  foreach t in array array['public_request_secrets_id_seq', 'public_requests_id_seq', 'public_request_events_id_seq']
  loop
    execute format('revoke all on sequence prive.%I from public, anon, authenticated, service_role', t);
  end loop;
end
$$;
revoke all on function prive.public_requests_numero() from public, anon, authenticated, service_role;
