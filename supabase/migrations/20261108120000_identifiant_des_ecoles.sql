-- Ticket 147 (décision du fondateur du 08/11/2026, arbitrage 1) : un identifiant NTanova permanent par implantation, et
-- l'historique de ses adresses.
--
-- - `campuses.public_number` : six chiffres tirés au hasard par la base (100000 à 999999), sans lieu dedans. Il ne change
--   jamais, et il n'est jamais réutilisé : chaque numéro tiré reste dans `campus_public_numbers`, même quand l'école est
--   effacée. La fiche vit à `/ecoles/<nom>-<identifiant>/`, le lien court `/ecoles/<identifiant>/` y renvoie.
-- - Le tirage passe par un déclencheur (`security definer`) : personne ne peut appeler la fonction pour « brûler » des
--   numéros, et aucun appel d'insertion existant ne change.
-- - `campus_former_addresses` garde chaque ancienne adresse d'une implantation (son ancien `slug`, son ancienne division)
--   quand elle change : une fiche renommée ou déplacée garde un renvoi depuis l'adresse déjà partagée.
-- - Les vues publiques donnent le numéro (`public_campuses`), les anciennes adresses des fiches publiées
--   (`public_campus_former_addresses`) et, pour un doublon fusionné, les deux numéros (`public_campus_redirects`).

-- Le registre des numéros tirés : jamais lu par le site, jamais vidé.
create table public.campus_public_numbers (
  number integer primary key check (number between 100000 and 999999),
  drawn_at timestamptz not null default now()
);
alter table public.campus_public_numbers enable row level security;
revoke all on public.campus_public_numbers from anon, authenticated;

create function public.draw_campus_public_number() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  loop
    n := 100000 + floor(random() * 900000)::integer;
    insert into public.campus_public_numbers (number) values (n) on conflict do nothing;
    if found then
      return n;
    end if;
  end loop;
end $$;
revoke all on function public.draw_campus_public_number() from public, anon, authenticated;

alter table public.campuses add column public_number integer;

-- Les implantations déjà là reçoivent leur numéro, une par une (chaque tirage voit les précédents), sans toucher à leur
-- date de mise à jour : recevoir un identifiant ne change rien à ce que la fiche dit.
alter table public.campuses disable trigger campuses_avant_modification;
do $$
declare
  c record;
begin
  for c in select id from public.campuses order by created_at, id loop
    update public.campuses set public_number = public.draw_campus_public_number() where id = c.id;
  end loop;
end $$;
alter table public.campuses enable trigger campuses_avant_modification;

alter table public.campuses
  alter column public_number set not null,
  add constraint campuses_public_number_key unique (public_number),
  add constraint campuses_public_number_check check (public_number between 100000 and 999999);

-- À la naissance, la base tire le numéro (une valeur fournie est ignorée : personne ne choisit son identifiant) ; ensuite,
-- il ne bouge plus.
create function public.campus_public_number_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.public_number := public.draw_campus_public_number();
  elsif new.public_number is distinct from old.public_number then
    raise exception 'L''identifiant d''une école ne change jamais'
      using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.campus_public_number_guard() from public, anon, authenticated;

create trigger campuses_public_number
before insert or update of public_number on public.campuses
for each row execute function public.campus_public_number_guard();

-- Les anciennes adresses : un renvoi depuis chacune, tant que l'école est publiée.
create table public.campus_former_addresses (
  campus_id uuid not null references public.campuses (id) on delete cascade,
  slug text not null,
  division_id uuid not null references public.geo_divisions (id) on delete cascade,
  replaced_at timestamptz not null default now(),
  primary key (campus_id, slug, division_id)
);
alter table public.campus_former_addresses enable row level security;
revoke all on public.campus_former_addresses from anon, authenticated;

create function public.remember_campus_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Une école « à situer » n'avait pas encore d'adresse publique (pas de division) : rien à garder.
  if old.division_id is not null
     and (new.slug is distinct from old.slug or new.division_id is distinct from old.division_id) then
    insert into public.campus_former_addresses (campus_id, slug, division_id)
    values (old.id, old.slug, old.division_id)
    on conflict do nothing;
  end if;
  return null;
end $$;
revoke all on function public.remember_campus_address() from public, anon, authenticated;

create trigger campuses_former_address
after update of slug, division_id on public.campuses
for each row execute function public.remember_campus_address();

-- La vue de la fiche publique, avec le numéro en dernier (définition du 04/11, `20261104200000_declaration_ecole.sql`).
create or replace view public.public_campuses with (security_invoker = true) as
select
  c.id,
  c.institution_id,
  i.name as institution_name,
  c.label,
  i.kind,
  c.slug,
  c.division_id,
  d.path::text as division_path,
  (select array_agg(a.slug::text order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_slugs,
  (select array_agg(a.name order by a.level)
     from public.geo_divisions a where d.path operator(extensions.<@) a.path) as division_names,
  c.neighbourhood,
  c.landmark,
  c.sign_phone,
  extensions.st_y(c.position) as latitude,
  extensions.st_x(c.position) as longitude,
  c.verification_state,
  c.verified_on,
  c.curriculum_note,
  c.surveyed_at,
  c.located_at,
  c.origin,
  c.updated_at,
  c.public_phone,
  c.public_phone_agreed_on,
  c.school_declared_on,
  c.public_number
from public.campuses c
join public.institutions i on i.id = c.institution_id
join public.geo_divisions d on d.id = c.division_id
where c.publication = 'publiee';

-- Les doublons fusionnés : les mêmes colonnes, plus les deux numéros (le lien court du doublon mène à l'école gardée).
create or replace view public.public_campus_redirects with (security_invoker = false) as
select dd.path::text as from_division_path, e.slug as from_slug,
       dg.path::text as to_division_path, g.slug as to_slug,
       e.public_number as from_number, g.public_number as to_number
from public.campuses e
join public.geo_divisions dd on dd.id = e.division_id
join public.campuses g on g.id = e.replaced_by_campus_id and g.publication = 'publiee'
join public.geo_divisions dg on dg.id = g.division_id
where e.publication = 'retiree' and e.retirement_reason = 'doublon';

-- Les anciennes adresses des fiches publiées, et rien d'autre (ni date, ni identifiant interne) : la vue s'exécute avec les
-- droits de son propriétaire, la table reste fermée.
create view public.public_campus_former_addresses with (security_invoker = false) as
select f.slug as former_slug, d.path::text as former_division_path, c.public_number
from public.campus_former_addresses f
join public.campuses c on c.id = f.campus_id and c.publication = 'publiee'
join public.geo_divisions d on d.id = f.division_id;

revoke all on public.public_campus_former_addresses from anon, authenticated;
grant select on public.public_campuses, public.public_campus_redirects, public.public_campus_former_addresses
  to anon, authenticated;
