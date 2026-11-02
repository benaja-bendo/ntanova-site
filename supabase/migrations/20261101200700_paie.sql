-- La paie des relais : combien, pour quoi, et jamais deux fois.
--
-- Les tarifs sont des DONNÉES datées, pas du code : un tarif change par une nouvelle ligne, les anciens
-- paiements gardent le leur. Le paiement lui-même (Mobile Money) se fait hors de la base, le vendredi soir :
-- la base CALCULE ce qui est dû, enregistre la clôture de la semaine et note « payé » avec la référence.
-- NTanova ne touche jamais aux frais de scolarité (ligne rouge du fondateur) : il ne s'agit que de payer
-- des relais.
--
-- Ce qui est dû (règles du livret des relais) :
--   * une fiche ACCEPTÉE : 500 FCFA. Pas si le relevé n'est pas payable (une école déjà relevée par un autre
--     relais) ; une correction ne se paie pas : la fiche qu'elle corrige porte la paie ;
--   * un contact de direction CONFIRMÉ (la personne a répondu sur WhatsApp et confirmé sa fonction) : +300 FCFA,
--     pas pour le secrétariat ;
--   * lot d'essai : trois fiches validées avec NTanova = 1 500 FCFA une fois, jamais plus ;
--   * chaque ligne n'est payée qu'une fois (contrainte d'unicité), et la semaine se clôt le vendredi.

create table public.payout_rates (
  id uuid primary key default gen_random_uuid(),
  valid_from date not null unique,
  per_submission_xaf integer not null check (per_submission_xaf >= 0),
  per_contact_xaf integer not null check (per_contact_xaf >= 0),
  trial_size smallint not null default 3 check (trial_size > 0),
  trial_total_xaf integer not null default 0 check (trial_total_xaf >= 0),
  note text check (length(note) <= 500),
  created_at timestamptz not null default now()
);
comment on table public.payout_rates is
  'Les tarifs des relais, datés. XAF : le franc CFA d''Afrique centrale (FCFA). Une nouvelle ligne remplace l''ancienne à partir de sa date.';

insert into public.payout_rates (valid_from, per_submission_xaf, per_contact_xaf, trial_size, trial_total_xaf, note)
values (date '2026-11-01', 500, 300, 3, 1500,
        'Fixés par le fondateur le 01/11/2026 : 500 FCFA par fiche acceptée, +300 FCFA par contact confirmé, paiement le vendredi soir ; lot d''essai : 3 fiches validées = 1 500 FCFA.');

create table public.payout_batches (
  id uuid primary key default gen_random_uuid(),
  friday date not null unique check (extract(isodow from friday) = 5),
  closed_at timestamptz not null default now(),
  closed_by uuid default public.current_user_id(),
  note text check (length(note) <= 500)
);

create table public.payout_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.payout_batches (id),
  relay_id uuid not null references public.relais (id),
  kind text not null check (kind in ('submission', 'contact', 'trial_bundle')),
  submission_id uuid references public.field_submissions (id),
  amount_xaf integer not null check (amount_xaf >= 0),
  created_at timestamptz not null default now(),
  constraint payout_lines_une_fois unique (submission_id, kind),
  constraint payout_lines_forme check ((kind = 'trial_bundle') = (submission_id is null))
);
create unique index payout_lines_essai_une_fois on public.payout_lines (relay_id) where kind = 'trial_bundle';
create index payout_lines_batch on public.payout_lines (batch_id);

create table public.payout_statements (
  batch_id uuid not null references public.payout_batches (id),
  relay_id uuid not null references public.relais (id),
  total_xaf integer not null check (total_xaf >= 0),
  paid_at timestamptz,
  reference text check (length(reference) <= 80),
  paid_by uuid,
  primary key (batch_id, relay_id),
  constraint payout_statements_payee_avec_reference check ((paid_at is null) = (reference is null))
);

-- Le numéro Mobile Money d'un relais : privé, lu par l'administration seule.
create table prive.relay_payment_details (
  relay_id uuid primary key references public.relais (id) on delete cascade,
  operator text not null check (operator in ('mtn', 'airtel', 'autre')),
  msisdn public.telephone not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Ce qui est dû jusqu'au vendredi donné (par défaut : le prochain vendredi, ou aujourd'hui s'il l'est).
-- Fin de journée à Brazzaville (UTC+1) : une fiche acceptée le samedi matin attend la semaine suivante.
create function public.payable_items(p_friday date default null)
returns table (relay_id uuid, kind text, submission_id uuid, amount_xaf integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_friday date := coalesce(
    p_friday,
    ((now() at time zone 'Africa/Brazzaville')::date + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7))
  );
  v_cutoff timestamptz := ((v_friday + 1)::timestamp at time zone 'Africa/Brazzaville');
  v_rate public.payout_rates;
begin
  perform public.exiger_admin_session();
  select r.* into v_rate from public.payout_rates r where r.valid_from <= v_friday order by r.valid_from desc limit 1;
  if not found then
    raise exception 'Aucun tarif ne vaut à cette date.' using errcode = '22023';
  end if;

  return query
  -- les fiches acceptées
  select s.relay_id, 'submission'::text, s.id, v_rate.per_submission_xaf
  from public.field_submissions s
  where s.status = 'accepte' and s.payable and s.kind in ('releve', 'contre_visite')
    and s.decided_at < v_cutoff
    and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)
    and not exists (select 1 from public.payout_lines pl where pl.submission_id = s.id and pl.kind = 'submission')
  union all
  -- les contacts confirmés (pas le secrétariat)
  select s.relay_id, 'contact'::text, s.id, v_rate.per_contact_xaf
  from public.field_submissions s
  where s.status = 'accepte' and s.contact_confirmed_at is not null
    and s.contact_confirmed_at < v_cutoff
    and s.contact_role is not null and s.contact_role <> 'secretariat'
    and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)
    and not exists (select 1 from public.payout_lines pl where pl.submission_id = s.id and pl.kind = 'contact')
  union all
  -- l'essai : trois fiches validées avec NTanova, payées une fois
  select s.relay_id, 'trial_bundle'::text, null::uuid, v_rate.trial_total_xaf
  from public.field_submissions s
  join public.lots l on l.id = s.batch_id and l.essai
  where s.trial_validated_at is not null and s.trial_validated_at < v_cutoff
  group by s.relay_id
  having count(*) >= v_rate.trial_size
     and not exists (select 1 from public.payout_lines pl where pl.relay_id = s.relay_id and pl.kind = 'trial_bundle');
end;
$$;

-- Le calcul de la semaine, relais par relais : ce qu'on paierait si on clôturait maintenant.
create function public.payout_preview(p_friday date default null)
returns table (
  relay_id uuid, first_name text, submissions integer, contacts integer, trial_bundles integer,
  total_xaf integer, has_payment_details boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select r.id, r.prenom,
         (count(*) filter (where i.kind = 'submission'))::integer,
         (count(*) filter (where i.kind = 'contact'))::integer,
         (count(*) filter (where i.kind = 'trial_bundle'))::integer,
         coalesce(sum(i.amount_xaf), 0)::integer,
         exists (select 1 from prive.relay_payment_details d where d.relay_id = r.id)
  from public.payable_items(p_friday) i
  join public.relais r on r.id = i.relay_id
  group by r.id, r.prenom
  order by r.prenom, r.id;
end;
$$;

-- Clôture la semaine du vendredi donné : une ligne par fiche et par contact dus, un total par relais.
-- Une semaine ne se clôt qu'une fois ; ce qui est accepté ensuite passe à la semaine suivante.
create function public.close_payout_week(p_friday date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_batch uuid;
begin
  perform public.exiger_admin_session();
  if p_friday is null or extract(isodow from p_friday) <> 5 then
    raise exception 'La semaine se clôt un vendredi.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payout_batches b where b.friday = p_friday) then
    raise exception 'La semaine du % est déjà clôturée.', p_friday using errcode = '22023';
  end if;
  insert into public.payout_batches (friday) values (p_friday) returning id into v_batch;

  insert into public.payout_lines (batch_id, relay_id, kind, submission_id, amount_xaf)
  select v_batch, i.relay_id, i.kind, i.submission_id, i.amount_xaf from public.payable_items(p_friday) i;

  insert into public.payout_statements (batch_id, relay_id, total_xaf)
  select v_batch, l.relay_id, sum(l.amount_xaf) from public.payout_lines l where l.batch_id = v_batch group by l.relay_id;
  return v_batch;
end;
$$;

-- Une fois le Mobile Money envoyé : la référence de l'opération, la date.
create function public.mark_statement_paid(p_batch uuid, p_relay uuid, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if coalesce(btrim(p_reference), '') = '' then
    raise exception 'Il faut la référence de l''opération Mobile Money.' using errcode = '22023';
  end if;
  update public.payout_statements s set paid_at = now(), reference = btrim(p_reference), paid_by = (select public.current_user_id())
  where s.batch_id = p_batch and s.relay_id = p_relay and s.paid_at is null;
  if not found then
    raise exception 'Paiement introuvable ou déjà noté.' using errcode = 'P0002';
  end if;
end;
$$;

create function public.set_relay_payment_details(p_relay uuid, p_operator text, p_msisdn public.telephone) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  insert into prive.relay_payment_details (relay_id, operator, msisdn, updated_by)
  values (p_relay, p_operator, p_msisdn, (select public.current_user_id()))
  on conflict (relay_id) do update set operator = excluded.operator, msisdn = excluded.msisdn,
    updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- Les paiements d'une semaine, avec le numéro à créditer (lu dans la partie privée).
create function public.payout_statements_of(p_batch uuid)
returns table (
  relay_id uuid, first_name text, total_xaf integer, submissions integer, contacts integer, trial_bundles integer,
  operator text, msisdn text, paid_at timestamptz, reference text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select s.relay_id, r.prenom, s.total_xaf,
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'trial_bundle'),
         d.operator, d.msisdn::text, s.paid_at, s.reference
  from public.payout_statements s
  join public.relais r on r.id = s.relay_id
  left join prive.relay_payment_details d on d.relay_id = s.relay_id
  where s.batch_id = p_batch
  order by r.prenom, s.relay_id;
end;
$$;
