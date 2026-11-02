-- Le terrain : tout ce que les relais envoient vit ici, jamais dans le catalogue public.
--
--   field_submissions        un relevé : ce qu'un relais a vu, daté, signé, avec sa position
--   field_submission_photos  ses photos (l'enseigne, puis au plus trois autres), par chemins relatifs
--   prive.direction_contacts le contact de la direction, que le relais envoie sans pouvoir le relire
--   missions                 une école connue, confiée à un relais pour qu'il la vérifie
--
-- `field_submissions` remplace `releves`, `missions` remplace `ecoles_confiees` : mêmes données,
-- reprises ici, puis les anciennes tables, vues et fonctions sont retirées. Le catalogue (`campuses`…)
-- ne reçoit rien d'un relais : c'est l'administration qui accepte un relevé et le transforme (voir
-- `accept_submission`, migration suivante).

-- Ce qui part ------------------------------------------------------------------------------------------

drop view public.releves_a_valider;
drop view public.ecoles_publiees;
drop view public.ecoles_redirections;

drop function public.accepter_releve(uuid, uuid);
drop function public.ajouter_ecole(text, double precision, double precision, public.type_ecole, public.niveau[], text, text, public.telephone, text);
drop function public.arrondissement_de_position(double precision, double precision);
drop function public.confier_ecole(uuid, uuid, text);
drop function public.confirmer_contact(uuid, public.fonction_direction);
drop function public.contact_du_releve(uuid);
drop function public.contact_recu(uuid);
drop function public.demander_correction(uuid, public.motif_decision, text);
drop function public.ecoles_avant_modification() cascade;
drop function public.effacer_contact(uuid, text);
drop function public.envoyer_contact(uuid, public.fonction_direction, text, public.telephone, boolean, timestamptz, text);
drop function public.fusionner_ecoles(uuid, uuid);
drop function public.noter_effacement_photo(uuid, text);
drop function public.publier_arrondissement(smallint);
drop function public.publier_ecole(uuid);
drop function public.publier_lot(uuid);
drop function public.refuser_releve(uuid, public.motif_decision, text);
drop function public.releves_avant_insertion() cascade;
drop function public.reprendre_ecole(uuid);
drop function public.retirer_ecole(uuid, public.motif_retrait, text);
drop function public.situer_ecole(uuid, double precision, double precision);
drop function prive.problemes_de_lots(text);
drop function prive.rattacher_releves_aux_lots_fins(text);

-- Les règles d'accès des photos (stockage) dépendent de `releves` : elles sont refaites dans la couche Supabase.
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "Le relais actif envoie la photo de son relevé" on storage.objects;
    drop policy if exists "L'administration voit les photos des relevés" on storage.objects;
  end if;
end
$$;

-- Les relevés ----------------------------------------------------------------------------------------

create table public.field_submissions (
  -- Créé sur le téléphone : un second envoi du même relevé est refusé (« déjà reçu »).
  id uuid primary key,
  relay_id uuid not null default public.current_user_id() references public.relais (id),
  batch_id uuid references public.lots (id),
  -- releve : une école vue. correction : un relevé qui en corrige un autre. contre_visite : le relais
  -- va situer et compléter une école déjà connue (une mission).
  kind public.type_releve not null default 'releve',
  corrects_submission_id uuid references public.field_submissions (id),

  -- Ajouter 1/3 : la position (et la photo, dans `field_submission_photos`)
  position extensions.geometry(Point, 4326),
  accuracy_m real check (accuracy_m >= 0),
  taken_at timestamptz not null,
  duplicate_answer public.reponse_doublon,
  duplicate_of_campus_id uuid references public.campuses (id),

  -- Ajouter 2/3 : ce qui se voit de la rue
  sign_name text not null check (length(btrim(sign_name)) between 1 and 200),
  levels public.niveau[] not null default '{}',
  school_kind public.type_ecole not null default 'non_indique',
  curriculum_note text check (length(curriculum_note) <= 200),
  landmark text check (length(landmark) <= 300),
  sign_phone public.telephone,
  -- Les séries ou filières lues sur l'enseigne, en quelques mots, et la mention « elles sont en photo ».
  observed_programs text check (length(observed_programs) <= 600),
  programs_photographed boolean not null default false,

  -- Ajouter 3/3 : ce que le relais peut relire. Le contact lui-même est dans prive.direction_contacts.
  direction_seen public.direction_vue,
  liaison_sheet_given boolean not null default false,
  liaison_code text check (liaison_code ~ '^[0-9]{4}$'),
  come_back_note text check (length(come_back_note) <= 200),

  -- Calculé par la base à l'arrivée
  received_at timestamptz not null default now(),
  outside_batch boolean,
  possible_duplicate boolean not null default false,

  -- La décision de l'administration
  status public.statut_releve not null default 'a_valider',
  reason public.motif_decision,
  message_to_relay text check (length(message_to_relay) <= 500),
  decided_at timestamptz,
  campus_id uuid references public.campuses (id),
  -- Comment le relevé a été accepté : une nouvelle institution, un nouveau campus d'une institution connue,
  -- la mise à jour d'un campus, ou un cycle ajouté à un campus.
  accepted_as text check (accepted_as in ('new_institution', 'new_campus', 'update_campus', 'add_cycle')),
  contact_confirmed_at timestamptz,
  contact_role public.fonction_direction,
  -- Pour la paie : la fiche compte-t-elle (une école déjà relevée par un autre ne se paie pas deux fois) ?
  payable boolean not null default true,
  -- Lot d'essai : validé avec le relais sans être publié ; compte pour la paie d'essai.
  trial_validated_at timestamptz,

  constraint field_submissions_correction_liee check ((kind = 'correction') = (corrects_submission_id is not null)),
  constraint field_submissions_contre_visite_liee check (kind <> 'contre_visite' or duplicate_of_campus_id is not null),
  constraint field_submissions_accepte_a_un_campus check (status <> 'accepte' or campus_id is not null)
);
comment on table public.field_submissions is
  'Ce qu''un relais envoie : une observation datée et signée. Un relevé n''est pas l''école : l''administration l''accepte ou non, et le transforme en institution, campus ou cycle. Un relais n''écrit que dans cette table.';
create index field_submissions_position on public.field_submissions using gist (position);
create index field_submissions_position_geog on public.field_submissions using gist ((position::extensions.geography));
create index field_submissions_relay on public.field_submissions (relay_id);
create index field_submissions_batch on public.field_submissions (batch_id);
create index field_submissions_campus on public.field_submissions (campus_id);
create index field_submissions_a_valider on public.field_submissions (received_at) where status = 'a_valider';

insert into public.field_submissions (
  id, relay_id, batch_id, kind, corrects_submission_id, position, accuracy_m, taken_at,
  duplicate_answer, duplicate_of_campus_id, sign_name, levels, school_kind, curriculum_note, landmark,
  sign_phone, direction_seen, liaison_sheet_given, liaison_code, come_back_note, received_at,
  outside_batch, possible_duplicate, status, reason, message_to_relay, decided_at, campus_id,
  contact_confirmed_at, contact_role
)
select
  r.id, r.relais_id, r.lot_id, r.type, r.corrige_releve_id, r.position, r.precision_m, r.pris_le,
  r.reponse_doublon, r.doublon_de, r.nom_enseigne, r.niveaux, r.type_ecole, r.programme, r.repere,
  r.numero_enseigne, r.direction, r.fiche_liaison_remise, r.code_liaison, r.repasser, r.recu_le,
  r.hors_lot, r.doublon_possible, r.statut, r.motif, r.message_au_relais, r.decide_le, r.ecole_id,
  r.contact_confirme_le, r.contact_fonction
from public.releves r;

-- La formation lue sur un relevé garde son origine.
alter table public.campus_programs add constraint campus_programs_source_submission_fkey
  foreign key (source_submission_id) references public.field_submissions (id);

-- À l'arrivée d'un relevé : l'auteur, l'heure, le statut viennent de la base, jamais du téléphone ; elle
-- calcule « hors du lot » (à plus de 50 m du contour) et « doublon possible » (à moins de 40 m d'une école
-- ou d'un autre relevé). Le téléphone prévient, la base tranche.
create function public.batch_area(p_batch uuid) returns extensions.geometry
language sql stable set search_path = '' as $$
  -- Le contour du lot, sinon celui de sa division ou, à défaut, de la division connue la plus proche au-dessus.
  select coalesce(
    l.contour,
    (select a.boundary
       from public.geo_divisions a
       join public.geo_divisions d on d.path operator(extensions.<@) a.path
      where d.id = l.geo_division_id and a.boundary is not null
      order by a.level desc
      limit 1)
  )
  from public.lots l where l.id = p_batch;
$$;

create function public.field_submissions_avant_insertion() returns trigger
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

create trigger field_submissions_avant_insertion
before insert on public.field_submissions
for each row execute function public.field_submissions_avant_insertion();

-- Les photos ---------------------------------------------------------------------------------------

create table public.field_submission_photos (
  -- Créé sur le téléphone, comme le relevé : un second enregistrement répond « déjà reçu ».
  id uuid primary key,
  submission_id uuid not null references public.field_submissions (id),
  role public.photo_role not null,
  -- Le chemin RELATIF du fichier dans le stockage (`<relevé>/<photo>.webp`), jamais une adresse complète :
  -- aucun nom de serveur n'entre en base, le stockage se change sans toucher une ligne.
  storage_path text not null unique
    check (storage_path ~ '^[a-z0-9][a-z0-9_./-]{0,200}$'
           and storage_path !~ '(\.\.|//|supabase|https?)'),
  mime text not null check (mime in ('image/webp', 'image/jpeg')),
  bytes integer not null check (bytes between 1 and 2097152),
  width smallint check (width > 0),
  height smallint check (height > 0),
  taken_at timestamptz,
  received_at timestamptz not null default now(),
  -- Une photo est privée tant que l'administration n'a pas vérifié qu'elle est publiable (sans enfant,
  -- sans nom ni numéro de personne) : jamais publique d'office, jamais lisible par un relais.
  is_public boolean not null default false,
  child_free_checked_at timestamptz,
  constraint field_submission_photos_publique_verifiee check (not is_public or child_free_checked_at is not null)
);
comment on table public.field_submission_photos is
  'Les photos d''un relevé : l''enseigne (une seule, obligatoire), puis au plus trois autres (panneau des formations, prospectus, vue du bâtiment). Des chemins relatifs, jamais d''adresse de serveur.';
create unique index field_submission_photos_une_enseigne on public.field_submission_photos (submission_id)
  where role = 'signboard';
create index field_submission_photos_submission on public.field_submission_photos (submission_id);

create function public.field_submission_photos_avant_insertion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.role <> 'signboard' and (
    select count(*) from public.field_submission_photos p
    where p.submission_id = new.submission_id and p.role <> 'signboard'
  ) >= 3 then
    raise exception 'Une fiche a au plus trois photos en plus de l''enseigne.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger field_submission_photos_avant_insertion
before insert on public.field_submission_photos
for each row execute function public.field_submission_photos_avant_insertion();

-- La partie privée ------------------------------------------------------------------------------------

-- Le contact de la direction : seul l'administrateur le lit, jamais le relais, jamais l'API publique.
create table prive.direction_contacts (
  submission_id uuid primary key references public.field_submissions (id) on delete cascade,
  role public.fonction_direction,
  name text check (length(name) <= 120),
  whatsapp public.telephone,
  contact_agreement boolean not null default false,
  agreement_at timestamptz,
  said_note text check (length(said_note) <= 1000),
  received_at timestamptz not null default now(),
  -- Sans l'accord de la personne, on ne note pas son numéro.
  constraint direction_contacts_numero_avec_accord check (whatsapp is null or contact_agreement)
);
insert into prive.direction_contacts (submission_id, role, name, whatsapp, contact_agreement, agreement_at, said_note, received_at)
select c.releve_id, c.fonction, c.nom, c.whatsapp, c.accord_contact, c.accord_le, c.ce_qui_a_ete_dit, c.recu_le
from prive.contacts_direction c;

-- Les références des écoles importées (identifiants anonymes `ETB-…`), jamais publiées.
create table prive.campus_sources (
  campus_id uuid primary key references public.campuses (id) on delete cascade,
  reference text not null unique check (length(reference) <= 40),
  imported_at timestamptz not null default now()
);
insert into prive.campus_sources (campus_id, reference, imported_at)
select s.ecole_id, s.reference, s.importee_le from prive.ecoles_sources s;

-- Les effacements (droit d'effacement, loi n° 29-2019) et les fusions : quoi, par qui, quand.
create table prive.erasures (
  id bigint generated always as identity primary key,
  what text not null check (what in ('contact', 'photo', 'merge')),
  submission_id uuid references public.field_submissions (id) on delete set null,
  campus_id uuid references public.campuses (id) on delete set null,
  by_user uuid not null,
  at timestamptz not null default now(),
  note text check (length(note) <= 500)
);
insert into prive.erasures (what, submission_id, campus_id, by_user, at, note)
select case e.quoi when 'fusion' then 'merge' else e.quoi end, e.releve_id, e.ecole_id, e.par, e.le, e.note
from prive.effacements e order by e.id;

-- L'accord daté de la direction pour le badge « Vérifié » : la preuve, jamais publiée.
create table prive.verification_agreements (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  agreed_on date not null,
  agreed_role public.fonction_direction,
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'appel', 'sur_place', 'autre')),
  note text check (length(note) <= 500),
  recorded_by uuid,
  recorded_at timestamptz not null default now()
);
create index verification_agreements_campus on prive.verification_agreements (campus_id);

-- Les missions ----------------------------------------------------------------------------------------

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  relay_id uuid not null references public.relais (id) on delete cascade,
  kind public.mission_kind not null default 'verify',
  status public.mission_status not null default 'open',
  note text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  created_by uuid default public.current_user_id(),
  closed_at timestamptz,
  closed_by_submission_id uuid references public.field_submissions (id),
  constraint missions_fermee_datee check ((status = 'open') = (closed_at is null))
);
comment on table public.missions is
  'Une école déjà enregistrée, confiée à un relais pour qu''il la situe, la vérifie ou la complète sur place.';
create unique index missions_une_ouverte_par_campus on public.missions (campus_id) where status = 'open';
create index missions_relay on public.missions (relay_id) where status = 'open';
insert into public.missions (campus_id, relay_id, kind, note, created_at)
select c.ecole_id, c.relais_id,
       case when ca.position is null then 'locate' else 'verify' end::public.mission_kind,
       c.note, c.confiee_le
from public.ecoles_confiees c join public.campuses ca on ca.id = c.ecole_id;

-- Rien ne doit se perdre ---------------------------------------------------------------------------------

do $$
begin
  if (select count(*) from public.field_submissions) <> (select count(*) from public.releves)
     or (select count(*) from prive.direction_contacts) <> (select count(*) from prive.contacts_direction)
     or (select count(*) from prive.campus_sources) <> (select count(*) from prive.ecoles_sources)
     or (select count(*) from prive.erasures) <> (select count(*) from prive.effacements)
     or (select count(*) from public.missions) <> (select count(*) from public.ecoles_confiees) then
    raise exception 'Reprise du terrain : les comptes ne tombent pas juste.' using errcode = '22023';
  end if;
end
$$;

-- Les anciennes tables partent ------------------------------------------------------------------------------

-- `cascade` emporte les règles d'accès d'avant qui se renvoient d'une table à l'autre (par exemple celle
-- des écoles confiées) : tout ce qui dépend de ces tables est ancien, les règles d'accès actuelles sont
-- refaites dans la migration des droits.
drop table prive.contacts_direction cascade;
drop table prive.ecoles_sources cascade;
drop table prive.effacements cascade;
drop table public.ecoles_confiees cascade;
drop table public.releves cascade;
drop table public.ecoles cascade;
drop table public.arrondissements cascade;
