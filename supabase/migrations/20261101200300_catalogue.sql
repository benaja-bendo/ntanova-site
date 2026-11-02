-- Le catalogue : une école n'est plus une ligne, c'est une institution qui a des implantations
-- (campus), chacune avec ses cycles (maternelle, primaire, collège, lycée…) et, dans chaque cycle, ses
-- formations (séries du bac, diplômes, domaines, rythmes).
--
--   institutions  « Complexe scolaire X », « Université Y » : le nom et le genre
--     └─ campuses  une implantation physique : où elle est, sa position, son état de publication
--          └─ campus_cycles    les cycles enseignés dans cette implantation
--               └─ campus_programs   les formations de ce cycle (série C, BTS, licence en gestion…)
--
-- Les écoles d'avant (`ecoles`) deviennent chacune une institution et un campus, avec le MÊME
-- identifiant : rien ne change pour les liens, les relevés ni les adresses. La migration suivante
-- reprend les relevés ; la table `ecoles` n'est retirée qu'à la fin de celle-ci.

-- Le catalogue des domaines de formation ---------------------------------------------------------

create table public.education_domains (
  id smallint generated always as identity primary key,
  slug public.slug not null unique,
  name text not null check (length(btrim(name)) between 1 and 80),
  parent_id smallint references public.education_domains (id),
  sort_order smallint not null default 100,
  created_at timestamptz not null default now()
);
comment on table public.education_domains is
  'Les domaines de formation (Informatique, Gestion, BTP, Santé…). On en ajoute, on n''en retire ni n''en renomme jamais : pour changer un mot, on change le nom affiché.';

insert into public.education_domains (slug, name, sort_order) values
  ('informatique', 'Informatique', 10),
  ('gestion', 'Gestion', 20),
  ('comptabilite-finance', 'Comptabilité et finance', 30),
  ('commerce-marketing', 'Commerce et marketing', 40),
  ('secretariat-administration', 'Secrétariat et administration', 50),
  ('btp', 'BTP', 60),
  ('electricite-electronique', 'Électricité et électronique', 70),
  ('mecanique-maintenance', 'Mécanique et maintenance', 80),
  ('energie-petrole-mines', 'Énergie, pétrole et mines', 90),
  ('sante', 'Santé', 100),
  ('agriculture-environnement', 'Agriculture et environnement', 110),
  ('hotellerie-tourisme', 'Hôtellerie et tourisme', 120),
  ('transport-logistique', 'Transport et logistique', 130),
  ('droit', 'Droit et sciences politiques', 140),
  ('economie', 'Sciences économiques', 150),
  ('sciences-technologies', 'Sciences et technologies', 160),
  ('lettres-langues', 'Lettres et langues', 170),
  ('communication', 'Communication et journalisme', 180),
  ('arts-mode', 'Arts, couture et mode', 190),
  ('education', 'Éducation et enseignement', 200),
  ('sciences-sociales', 'Sciences sociales', 210),
  ('sport', 'Sport', 220),
  ('autre', 'Autre', 999);

-- Les institutions ---------------------------------------------------------------------------------

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  kind public.type_ecole not null default 'non_indique',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.institutions is
  'Un établissement : un complexe scolaire (plusieurs cycles) ou une université, un groupe (plusieurs implantations). Le nom et le genre ; le lieu est dans `campuses`.';
create index institutions_nom_trgm on public.institutions
  using gin (public.norm_text(name) extensions.gin_trgm_ops);

-- Les campus -----------------------------------------------------------------------------------------

create table public.campuses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id),
  -- « Campus de Loandjili » : vide pour une implantation unique ou principale.
  label text check (length(btrim(label)) between 1 and 120),
  -- L'adresse de la fiche : unique dans sa division (ntanova.com/ecoles/<division>/<slug>/).
  slug public.slug not null,
  -- Où : une division de niveau 2 à 4 au plus fin connu. Vide : l'implantation est « à situer ».
  division_id uuid references public.geo_divisions (id),
  -- Le quartier tel qu'on le dit sur place (texte libre), le repère de rue et le numéro de l'enseigne.
  neighbourhood text check (length(neighbourhood) <= 100),
  landmark text check (length(landmark) <= 300),
  sign_phone public.telephone,
  position extensions.geometry(Point, 4326),
  -- « Relevée » : constatée sur place. « Vérifiée » : en plus, la direction a validé la fiche, à une date.
  verification_state public.etat_ecole not null default 'relevee',
  verified_on date,
  verified_role public.fonction_direction,
  publication public.publication not null default 'brouillon',
  -- D'où vient la fiche. Sans cela, les écoles ajoutées depuis l'administration se mêleraient aux écoles
  -- relevées par les relais.
  origin public.origin_kind not null,
  curriculum_note text check (length(curriculum_note) <= 200),
  surveyed_at timestamptz,
  located_at timestamptz,
  located_by uuid,
  published_at timestamptz,
  retired_at timestamptz,
  retirement_reason public.motif_retrait,
  retirement_note text check (length(retirement_note) <= 500),
  replaced_by_campus_id uuid references public.campuses (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campuses_adresse_unique unique (division_id, slug),
  constraint campuses_pas_remplace_par_lui_meme check (replaced_by_campus_id <> id),
  constraint campuses_publie_dans_une_division check (publication <> 'publiee' or division_id is not null),
  constraint campuses_retire_avec_motif check (publication <> 'retiree' or retirement_reason is not null),
  constraint campuses_situe_par_quelquun check ((located_at is null) = (located_by is null)),
  constraint campuses_verifie_avec_date check (verification_state <> 'verifiee' or verified_on is not null)
);
comment on table public.campuses is
  'Une implantation physique d''une institution : sa position, sa division, son état de publication. La fiche publique est celle d''un campus.';
create index campuses_institution on public.campuses (institution_id);
create index campuses_division on public.campuses (division_id);
create index campuses_position on public.campuses using gist (position);
create index campuses_position_geog on public.campuses using gist ((position::extensions.geography));
create index campuses_repere_trgm on public.campuses using gin (public.norm_text(landmark) extensions.gin_trgm_ops);
create index campuses_quartier_trgm on public.campuses using gin (public.norm_text(neighbourhood) extensions.gin_trgm_ops);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger institutions_avant_modification before update on public.institutions
for each row execute function public.touch_updated_at();

create function public.campuses_avant_modification() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.publication = 'publiee' and old.publication is distinct from 'publiee' then
    new.published_at := now();
  end if;
  return new;
end;
$$;

create trigger campuses_avant_modification before update on public.campuses
for each row execute function public.campuses_avant_modification();

-- Les cycles et les formations -------------------------------------------------------------------------

create table public.campus_cycles (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses (id) on delete cascade,
  cycle public.niveau not null,
  created_at timestamptz not null default now(),
  constraint campus_cycles_un_par_cycle unique (campus_id, cycle)
);
comment on table public.campus_cycles is
  'Les cycles enseignés dans un campus : crèche, maternelle, primaire, collège, lycée, technique ou professionnel, supérieur, autre formation.';

create table public.campus_programs (
  id uuid primary key default gen_random_uuid(),
  campus_cycle_id uuid not null references public.campus_cycles (id) on delete cascade,
  domain_id smallint references public.education_domains (id),
  -- Le titre tel qu'il est écrit : « Série C », « BTS Informatique de gestion », « Licence en droit ».
  title text not null check (length(btrim(title)) between 1 and 160),
  bac_track public.bac_track,
  diploma public.diploma_kind,
  rhythms public.study_rhythm[] not null default '{}',
  origin public.origin_kind not null default 'admin',
  -- Le relevé d'où vient la formation, quand un relais l'a lue (clé étrangère ajoutée avec les relevés).
  source_submission_id uuid,
  created_at timestamptz not null default now()
);
comment on table public.campus_programs is
  'Une formation d''un cycle : série de bac, diplôme, domaine, rythme (jour, soir, week-end). C''est ce qui rend les écoles cherchables par formation.';
create unique index campus_programs_un_titre on public.campus_programs (campus_cycle_id, public.norm_text(title));
create index campus_programs_domaine on public.campus_programs (domain_id);
create index campus_programs_serie on public.campus_programs (bac_track) where bac_track is not null;
create index campus_programs_diplome on public.campus_programs (diploma) where diploma is not null;
create index campus_programs_rythmes on public.campus_programs using gin (rhythms);
create index campus_programs_titre_trgm on public.campus_programs
  using gin (public.norm_text(title) extensions.gin_trgm_ops);

-- Reprise des écoles d'avant ----------------------------------------------------------------------------

-- Une école = une institution et un campus, du même identifiant. L'origine se déduit de l'histoire :
-- un relevé accepté la décrit (« field »), sinon l'import l'a amenée, sinon l'administration l'a ajoutée.
insert into public.institutions (id, name, kind, created_at, updated_at)
select e.id, e.nom, e.type_ecole, e.cree_le, e.mis_a_jour_le from public.ecoles e;

insert into public.campuses (
  id, institution_id, slug, division_id, neighbourhood, landmark, sign_phone, position,
  verification_state, publication, origin, curriculum_note, surveyed_at, located_at, located_by,
  published_at, retired_at, retirement_reason, retirement_note, replaced_by_campus_id, created_at, updated_at
)
select
  e.id, e.id, e.slug,
  (select g.id
     from public.arrondissements a
     join public.geo_divisions g
       on g.level = 3 and g.slug = a.slug and g.path::text like 'congo.pointe_noire.pointe_noire.%'
    where a.id = e.arrondissement_id),
  e.quartier, e.repere, e.numero_enseigne, e.position,
  e.etat, e.publication,
  case
    when exists (select 1 from public.releves r where r.ecole_id = e.id and r.statut = 'accepte') then 'field'
    when exists (select 1 from prive.ecoles_sources s where s.ecole_id = e.id) then 'import'
    else 'admin'
  end::public.origin_kind,
  e.programme, e.relevee_le, e.situee_le, e.situee_par,
  e.publiee_le, e.retiree_le, e.motif_retrait, e.note_retrait, e.remplacee_par, e.cree_le, e.mis_a_jour_le
from public.ecoles e;

insert into public.campus_cycles (campus_id, cycle)
select e.id, c from public.ecoles e, unnest(e.niveaux) as c;

-- Rien ne doit se perdre : si un compte ne tombe pas juste, toute la migration est annulée.
do $$
begin
  if (select count(*) from public.campuses) <> (select count(*) from public.ecoles)
     or (select count(*) from public.institutions) <> (select count(*) from public.ecoles)
     or (select count(*) from public.campus_cycles) <> (select coalesce(sum(cardinality(niveaux)), 0) from public.ecoles)
     or (select count(*) from public.campuses where division_id is null)
        <> (select count(*) from public.ecoles where arrondissement_id is null) then
    raise exception 'Reprise des écoles : les comptes ne tombent pas juste.' using errcode = '22023';
  end if;
end
$$;

-- Les lots se posent sur une division (arrondissement ou quartier, ou une ville sans arrondissement) ----

alter table public.lots add column geo_division_id uuid references public.geo_divisions (id);
update public.lots l set geo_division_id = g.id
from public.arrondissements a
join public.geo_divisions g
  on g.level = 3 and g.slug = a.slug and g.path::text like 'congo.pointe_noire.pointe_noire.%'
where a.id = l.arrondissement_id;
alter table public.lots alter column geo_division_id set not null;
alter table public.lots drop column arrondissement_id;
create index lots_division on public.lots (geo_division_id);

-- Un lot est posé sur une ville (si elle n'a pas d'arrondissement), un arrondissement ou un quartier.
create function public.lots_avant_ecriture() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (select d.level from public.geo_divisions d where d.id = new.geo_division_id) < 2 then
    raise exception 'Un lot se pose sur une ville, un arrondissement ou un quartier, pas sur un pays ni un département.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger lots_avant_ecriture before insert or update of geo_division_id on public.lots
for each row execute function public.lots_avant_ecriture();

-- Les échanges avec la direction, rattachés au campus ---------------------------------------------------

alter table public.echanges rename column ecole_id to campus_id;
alter table public.echanges drop constraint echanges_ecole_id_fkey;
alter table public.echanges add constraint echanges_campus_id_fkey
  foreign key (campus_id) references public.campuses (id) on delete cascade;
