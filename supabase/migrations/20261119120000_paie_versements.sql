-- La paie des relais : un solde et des versements (décision du fondateur, 19/11/2026).
--
-- Jusqu'ici, « payer » voulait dire : clôturer une semaine un vendredi, pour tous les relais d'un coup, puis noter « payé »
-- pour le montant entier. Le geste n'a jamais servi en production (aucune semaine close au 19/11) : le fondateur paie quand
-- il peut, une partie ou tout. Le relais lisait donc « À payer vendredi » avec tout ce qu'il avait gagné depuis le début,
-- y compris ce qu'il avait déjà reçu.
--
-- Désormais : SOLDE = GAGNÉ − VERSÉ.
--   * GAGNÉ : le calcul de toujours (`prive.payable_items_for`, fiches, contacts, missions, essai), plus les lignes déjà
--     closes s'il y en a (`payout_lines`). Rien ne change dans les règles de ce qui est dû.
--   * VERSÉ (ou reçu) : `payout_transfers`, un versement noté par l'administration, à tout moment, tout ou partie. Jamais plus que le
--     solde (pas d'avance). Référence Mobile Money facultative. Une erreur s'ANNULE (date, motif, qui) : rien ne s'efface.
--     Une semaine close notée « payée » (l'ancien geste) compte aussi comme reçue.
--   * Une fiche est « payée » quand les versements la couvrent, les plus anciennes d'abord.
--   * GAIN AJOUTÉ (`payout_credits`, 19/11 au soir) : un travail fait hors de l'application (contacts du supérieur, mission
--     confiée de vive voix…), noté par l'administration avec son motif. Il compte dans le gagné et le relais le lit dans sa
--     facture. Comme un versement, il s'annule et ne s'efface pas.
--
-- Additive : les tables et fonctions des semaines restent, aucune n'est retirée ni renommée. `my_payout` gagne des colonnes
-- (le téléphone d'avant la mise à jour lit toujours les siennes).
--
-- Limite connue : ce qui n'est pas clos est compté au tarif en vigueur le prochain vendredi (règle de `payable_items_for`).
-- Un nouveau tarif changerait donc ce qui est gagné et non clos ; à revoir avant tout changement de tarif.

-- 1. Les versements ----------------------------------------------------------------------------------------------------------------------------------
create table public.payout_transfers (
  id uuid primary key default gen_random_uuid(),
  relay_id uuid not null references public.relais (id),
  amount_xaf integer not null check (amount_xaf > 0 and amount_xaf <= 10000000),
  paid_on date not null,
  reference text check (reference is null or char_length(btrim(reference)) between 1 and 80),
  note text check (note is null or char_length(note) <= 500),
  recorded_at timestamptz not null default now(),
  recorded_by uuid default public.current_user_id(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 2 and 200),
  constraint payout_transfers_annulation_complete check ((cancelled_at is null) = (cancel_reason is null))
);
comment on table public.payout_transfers is
  'Les versements Mobile Money faits aux relais, notés par l''administration (19/11/2026). Le solde d''un relais = ce qu''il a gagné − ses versements non annulés. Un versement ne s''efface jamais : il s''annule.';
create index payout_transfers_relais on public.payout_transfers (relay_id, paid_on desc);

alter table public.payout_transfers enable row level security;
revoke all on public.payout_transfers from public, anon, authenticated;
-- Aucune lecture directe : l'administration et le relais passent par les fonctions ci-dessous.

-- 1 bis. Les gains ajoutés à la main (travail hors de l'application) ------------------------------------------------------------------------------
create table public.payout_credits (
  id uuid primary key default gen_random_uuid(),
  relay_id uuid not null references public.relais (id),
  amount_xaf integer not null check (amount_xaf > 0 and amount_xaf <= 10000000),
  earned_on date not null,
  reason text not null check (char_length(btrim(reason)) between 2 and 120),
  recorded_at timestamptz not null default now(),
  recorded_by uuid default public.current_user_id(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 2 and 200),
  constraint payout_credits_annulation_complete check ((cancelled_at is null) = (cancel_reason is null))
);
comment on table public.payout_credits is
  'Un travail fait hors de l''application, payé par NTanova : noté par l''administration avec son motif (que le relais lit), compté dans le gagné. Ne s''efface jamais : il s''annule.';
create index payout_credits_relais on public.payout_credits (relay_id, earned_on desc);
alter table public.payout_credits enable row level security;
revoke all on public.payout_credits from public, anon, authenticated;

-- 2. Ce qu'un relais a gagné, élément par élément, avec sa date ---------------------------------------------------------------------------------------
-- La date sert à couvrir les plus anciens d'abord : acceptation de la fiche (ou de la fiche qui ferme la mission), confirmation
-- du contact ; l'essai passe avant tout (il vient en premier dans la vie d'un relais).
create function prive.relay_earned_items(p_relay uuid default null)
returns table (relay_id uuid, kind text, submission_id uuid, amount_xaf integer, earned_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with items as (
    select i.relay_id, i.kind, i.submission_id, i.amount_xaf from prive.payable_items_for(null) i
    where p_relay is null or i.relay_id = p_relay
    union all
    select l.relay_id, l.kind, l.submission_id, l.amount_xaf from public.payout_lines l
    where p_relay is null or l.relay_id = p_relay
  )
  select i.relay_id, i.kind, i.submission_id, i.amount_xaf,
         case when i.kind = 'contact' then coalesce(s.contact_confirmed_at, s.decided_at)
              when i.kind = 'trial_bundle' then '-infinity'::timestamptz
              else coalesce(s.decided_at, '-infinity'::timestamptz) end
  from items i
  left join public.field_submissions s on s.id = i.submission_id
  union all
  select c.relay_id, 'credit'::text, null::uuid, c.amount_xaf, (c.earned_on::timestamp at time zone 'Africa/Brazzaville')
  from public.payout_credits c
  where c.cancelled_at is null and (p_relay is null or c.relay_id = p_relay);
$$;
revoke all on function prive.relay_earned_items(uuid) from public, anon, authenticated;

-- 2 bis. Ce qu'un relais a reçu : ses versements non annulés, et les semaines closes notées « payées » (l'ancien geste, jamais
-- utilisé en production au 19/11, mais compté s'il l'est : de l'argent envoyé est de l'argent reçu).
create function prive.relay_received(p_relay uuid default null)
returns table (relay_id uuid, paid_on date, amount_xaf integer, reference text, recorded_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.relay_id, t.paid_on, t.amount_xaf, t.reference, t.recorded_at
  from public.payout_transfers t
  where t.cancelled_at is null and (p_relay is null or t.relay_id = p_relay)
  union all
  select st.relay_id, (st.paid_at at time zone 'Africa/Brazzaville')::date, st.total_xaf, st.reference, st.paid_at
  from public.payout_statements st
  where st.paid_at is not null and st.total_xaf > 0 and (p_relay is null or st.relay_id = p_relay);
$$;
revoke all on function prive.relay_received(uuid) from public, anon, authenticated;

-- 3. Le solde de chaque relais (administration) ----------------------------------------------------------------------------------------------------------
create function public.payout_balances()
returns table (
  relay_id uuid, first_name text, earned_xaf integer, paid_xaf integer, balance_xaf integer,
  operator text, msisdn text, holder_name text, last_paid_on date, last_paid_xaf integer
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  with gagne as (select e.relay_id, sum(e.amount_xaf)::integer as n from prive.relay_earned_items(null) e group by e.relay_id),
       verse as (select t.relay_id, sum(t.amount_xaf)::integer as n from prive.relay_received(null) t group by t.relay_id),
       dernier as (select distinct on (t.relay_id) t.relay_id, t.paid_on, t.amount_xaf from prive.relay_received(null) t
                   order by t.relay_id, t.paid_on desc, t.recorded_at desc)
  select r.id, r.prenom, coalesce(g.n, 0), coalesce(v.n, 0), coalesce(g.n, 0) - coalesce(v.n, 0),
         d.operator, d.msisdn::text, d.holder_name, x.paid_on, x.amount_xaf
  from public.relais r
  left join gagne g on g.relay_id = r.id
  left join verse v on v.relay_id = r.id
  left join dernier x on x.relay_id = r.id
  left join prive.relay_payment_details d on d.relay_id = r.id
  where g.n is not null or v.n is not null
  order by coalesce(g.n, 0) - coalesce(v.n, 0) desc, r.prenom, r.id;
end;
$$;
comment on function public.payout_balances() is
  'Pour l''administration : chaque relais qui a gagné ou reçu quelque chose, avec gagné, versé, reste dû (le plus grand d''abord), son numéro Mobile Money et son dernier versement.';
revoke all on function public.payout_balances() from public, anon, authenticated;
grant execute on function public.payout_balances() to authenticated;

-- 4. Noter un versement ---------------------------------------------------------------------------------------------------------------------------------
create function public.record_payout_transfer(
  p_relay uuid, p_amount_xaf integer, p_paid_on date default null, p_reference text default null, p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_aujourdhui date := (now() at time zone 'Africa/Brazzaville')::date;
  v_jour date := coalesce(p_paid_on, (now() at time zone 'Africa/Brazzaville')::date);
  v_solde integer;
  v_id uuid;
begin
  perform public.exiger_admin_session();
  -- Deux versements notés en même temps pour le même relais ne passent pas l'un à côté de l'autre.
  perform 1 from public.relais r where r.id = p_relay for update;
  if not found then
    raise exception 'Relais introuvable.' using errcode = 'P0002';
  end if;
  if p_amount_xaf is null or p_amount_xaf <= 0 then
    raise exception 'Le montant versé doit être plus grand que 0.' using errcode = '22023';
  end if;
  if v_jour > v_aujourdhui or v_jour < date '2026-10-01' then
    raise exception 'La date du versement ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  v_solde := coalesce((select sum(e.amount_xaf) from prive.relay_earned_items(p_relay) e), 0)
           - coalesce((select sum(t.amount_xaf) from prive.relay_received(p_relay) t), 0);
  if p_amount_xaf > v_solde then
    raise exception 'Plus que le reste dû (% FCFA). Une avance n''est pas permise.', greatest(v_solde, 0) using errcode = '22023';
  end if;
  insert into public.payout_transfers (relay_id, amount_xaf, paid_on, reference, note)
  values (p_relay, p_amount_xaf, v_jour, nullif(btrim(p_reference), ''), nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.record_payout_transfer(uuid, integer, date, text, text) is
  'Note un versement fait à un relais (tout ou partie de son reste dû, jamais plus). Rend son identifiant.';
revoke all on function public.record_payout_transfer(uuid, integer, date, text, text) from public, anon, authenticated;
grant execute on function public.record_payout_transfer(uuid, integer, date, text, text) to authenticated;

-- 5. Annuler un versement noté par erreur (il reste lisible) ----------------------------------------------------------------------------------------------
create function public.cancel_payout_transfer(p_transfer uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  if coalesce(char_length(btrim(p_reason)), 0) < 2 then
    raise exception 'Dites pourquoi ce versement est annulé.' using errcode = '22023';
  end if;
  update public.payout_transfers t
  set cancelled_at = now(), cancelled_by = (select public.current_user_id()), cancel_reason = btrim(p_reason)
  where t.id = p_transfer and t.cancelled_at is null;
  if not found then
    raise exception 'Versement introuvable ou déjà annulé.' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.cancel_payout_transfer(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_payout_transfer(uuid, text) to authenticated;

-- 6. Les derniers versements (administration), annulés compris -----------------------------------------------------------------------------------------
create function public.payout_transfers_list(p_limit integer default 100)
returns table (
  id uuid, relay_id uuid, first_name text, amount_xaf integer, paid_on date, reference text, note text,
  recorded_at timestamptz, recorded_by_name text, cancelled_at timestamptz, cancel_reason text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select t.id, t.relay_id, r.prenom, t.amount_xaf, t.paid_on, t.reference, t.note, t.recorded_at, a.prenom, t.cancelled_at, t.cancel_reason
  from public.payout_transfers t
  join public.relais r on r.id = t.relay_id
  left join public.relais a on a.id = t.recorded_by
  order by t.paid_on desc, t.recorded_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.payout_transfers_list(integer) from public, anon, authenticated;
grant execute on function public.payout_transfers_list(integer) to authenticated;

-- 6 bis. Ajouter un gain (travail hors de l'application), l'annuler, les lire -------------------------------------------------------------------
create function public.record_payout_credit(p_relay uuid, p_amount_xaf integer, p_earned_on date, p_reason text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.exiger_admin_session();
  perform 1 from public.relais r where r.id = p_relay for update;
  if not found then
    raise exception 'Relais introuvable.' using errcode = 'P0002';
  end if;
  if p_amount_xaf is null or p_amount_xaf <= 0 then
    raise exception 'Le montant doit être plus grand que 0.' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 2 then
    raise exception 'Dites pour quel travail : le relais le lira.' using errcode = '22023';
  end if;
  if p_earned_on is null or p_earned_on > (now() at time zone 'Africa/Brazzaville')::date or p_earned_on < date '2026-10-01' then
    raise exception 'La date du travail ne peut pas être dans le futur.' using errcode = '22023';
  end if;
  insert into public.payout_credits (relay_id, amount_xaf, earned_on, reason)
  values (p_relay, p_amount_xaf, p_earned_on, btrim(p_reason))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_payout_credit(uuid, integer, date, text) from public, anon, authenticated;
grant execute on function public.record_payout_credit(uuid, integer, date, text) to authenticated;

-- Annuler un gain : refusé s'il ferait passer le reçu au-dessus du gagné (il faudrait d'abord annuler un versement).
create function public.cancel_payout_credit(p_credit uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_relais uuid;
  v_montant integer;
begin
  perform public.exiger_admin_session();
  if coalesce(char_length(btrim(p_reason)), 0) < 2 then
    raise exception 'Dites pourquoi ce gain est annulé.' using errcode = '22023';
  end if;
  select c.relay_id, c.amount_xaf into v_relais, v_montant from public.payout_credits c
  where c.id = p_credit and c.cancelled_at is null;
  if not found then
    raise exception 'Gain introuvable ou déjà annulé.' using errcode = 'P0002';
  end if;
  perform 1 from public.relais r where r.id = v_relais for update;
  if coalesce((select sum(e.amount_xaf) from prive.relay_earned_items(v_relais) e), 0) - v_montant
     < coalesce((select sum(t.amount_xaf) from prive.relay_received(v_relais) t), 0) then
    raise exception 'Le relais a déjà reçu cet argent : annulez d''abord le versement qui le paie.' using errcode = '22023';
  end if;
  update public.payout_credits c
  set cancelled_at = now(), cancelled_by = (select public.current_user_id()), cancel_reason = btrim(p_reason)
  where c.id = p_credit;
end;
$$;
revoke all on function public.cancel_payout_credit(uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_payout_credit(uuid, text) to authenticated;

create function public.payout_credits_list(p_limit integer default 100)
returns table (
  id uuid, relay_id uuid, first_name text, amount_xaf integer, earned_on date, reason text,
  recorded_at timestamptz, recorded_by_name text, cancelled_at timestamptz, cancel_reason text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select c.id, c.relay_id, r.prenom, c.amount_xaf, c.earned_on, c.reason, c.recorded_at, a.prenom, c.cancelled_at, c.cancel_reason
  from public.payout_credits c
  join public.relais r on r.id = c.relay_id
  left join public.relais a on a.id = c.recorded_by
  order by c.earned_on desc, c.recorded_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function public.payout_credits_list(integer) from public, anon, authenticated;
grant execute on function public.payout_credits_list(integer) to authenticated;

-- 7. « Ma paie » : le solde, ce qui est reçu, et les fiches couvertes ------------------------------------------------------------------------------------
-- Les colonnes d'avant ne changent pas ; la ligne « acquis » porte en plus le solde et les versements (les semaines closes
-- les portent à null).
drop function public.my_payout(date);
create function public.my_payout(p_friday date default null)
returns table (
  friday date, state text, submissions integer, contacts integer, trial_bundles integer, total_xaf integer,
  not_payable integer, has_payment_details boolean, paid_at timestamptz, reference text, missions integer, lines jsonb,
  earned_xaf integer, received_xaf integer, balance_xaf integer, transfers jsonb, paid_submissions jsonb, credits jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_user_id());
  v_friday date := coalesce(
    p_friday,
    ((now() at time zone 'Africa/Brazzaville')::date + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7))
  );
  v_details boolean;
  v_gagne integer;
  v_recu integer;
  v_versements jsonb;
  v_couvertes jsonb;
  v_gains jsonb;
begin
  if not public.est_relais_actif() then
    return;
  end if;
  v_details := exists (select 1 from prive.relay_payment_details d where d.relay_id = v_me);
  v_gagne := coalesce((select sum(e.amount_xaf) from prive.relay_earned_items(v_me) e), 0);
  v_recu := coalesce((select sum(t.amount_xaf) from prive.relay_received(v_me) t), 0);
  -- Un versement annulé n'apparaît pas chez le relais.
  v_versements := coalesce((
    select jsonb_agg(jsonb_build_object('paid_on', t.paid_on, 'amount_xaf', t.amount_xaf, 'reference', t.reference)
                     order by t.paid_on desc, t.recorded_at desc)
    from prive.relay_received(v_me) t
  ), '[]'::jsonb);
  -- Les gains ajoutés à la main, avec leur motif (jamais les annulés).
  v_gains := coalesce((
    select jsonb_agg(jsonb_build_object('earned_on', c.earned_on, 'amount_xaf', c.amount_xaf, 'reason', c.reason)
                     order by c.earned_on, c.recorded_at)
    from public.payout_credits c where c.relay_id = v_me and c.cancelled_at is null
  ), '[]'::jsonb);
  -- Les fiches couvertes par les versements, les plus anciennes d'abord : une fiche est payée quand tout ce qui la précède
  -- et elle-même tiennent dans ce qui est reçu.
  v_couvertes := coalesce((
    select jsonb_agg(distinct c.submission_id)
    from (select e.submission_id,
                 sum(e.amount_xaf) over (order by e.earned_at, e.kind, e.submission_id rows unbounded preceding) as cumul
          from prive.relay_earned_items(v_me) e) c
    where c.submission_id is not null and c.cumul <= v_recu
  ), '[]'::jsonb);

  return query
  with items as (select i.* from prive.payable_items_for(v_friday) i where i.relay_id = v_me)
  select v_friday, 'acquis'::text,
         (select count(*)::integer from items i where i.kind = 'submission'),
         (select count(*)::integer from items i where i.kind = 'contact'),
         (select count(*)::integer from items i where i.kind = 'trial_bundle'),
         (select coalesce(sum(i.amount_xaf), 0)::integer from items i),
         (select count(*)::integer from public.field_submissions s
          where s.relay_id = v_me and s.status = 'accepte' and not s.payable and s.kind in ('releve', 'contre_visite')
            and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)),
         v_details, null::timestamptz, null::text,
         (select count(*)::integer from items i where i.kind = 'mission'),
         coalesce((
           select jsonb_agg(jsonb_build_object('kind', g.kind, 'unit_xaf', g.amount_xaf, 'count', g.n, 'submissions', g.ids)
                            order by g.ordre, g.amount_xaf desc)
           from (select i.kind, i.amount_xaf, count(*)::integer as n,
                        coalesce(jsonb_agg(i.submission_id) filter (where i.submission_id is not null), '[]'::jsonb) as ids,
                        array_position(array['submission', 'mission', 'contact', 'trial_bundle'], i.kind) as ordre
                 from items i group by i.kind, i.amount_xaf) g
         ), '[]'::jsonb),
         v_gagne, v_recu, v_gagne - v_recu, v_versements, v_couvertes, v_gains;

  return query
  select b.friday, (case when st.paid_at is null then 'a_payer' else 'paye' end)::text,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'trial_bundle'),
         st.total_xaf, 0, v_details, st.paid_at, st.reference,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'mission'),
         coalesce((
           select jsonb_agg(jsonb_build_object('kind', g.kind, 'unit_xaf', g.amount_xaf, 'count', g.n, 'submissions', g.ids)
                            order by g.ordre, g.amount_xaf desc)
           from (select l.kind, l.amount_xaf, count(*)::integer as n,
                        coalesce(jsonb_agg(l.submission_id) filter (where l.submission_id is not null), '[]'::jsonb) as ids,
                        array_position(array['submission', 'mission', 'contact', 'trial_bundle'], l.kind) as ordre
                 from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id
                 group by l.kind, l.amount_xaf) g
         ), '[]'::jsonb),
         null::integer, null::integer, null::integer, null::jsonb, null::jsonb, null::jsonb
  from public.payout_statements st
  join public.payout_batches b on b.id = st.batch_id
  where st.relay_id = v_me
  order by b.friday desc;
end;
$$;
comment on function public.my_payout(date) is
  'La paie du relais connecté. La ligne « acquis » : ce qui n''est pas clos (comme avant), et depuis le 19/11 le solde (gagné − reçu), les versements reçus (jamais les annulés) et les fiches qu''ils couvrent. Puis les semaines closes.';
revoke all on function public.my_payout(date) from public, anon, authenticated;
grant execute on function public.my_payout(date) to authenticated;
