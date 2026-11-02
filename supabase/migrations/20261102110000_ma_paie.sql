-- « Ma paie » (ticket #55, PR 5 ; ticket #24) : le relais lit sa propre paie.
--
-- Le Mobile Money du vendredi est promis dans le livret ; sans rien lire dans l'application, le relais doit nous croire
-- sur parole. `my_payout` lui rend, en lecture seule et pour lui seul :
--   * l'ACQUIS : ce qui lui serait payé le prochain vendredi si la semaine se clôturait maintenant (fiches acceptées,
--     contacts confirmés, essai), avec les fiches acceptées mais non payables (une école déjà relevée par un autre
--     relais), pour qu'il comprenne pourquoi une fiche acceptée ne rapporte rien ;
--   * l'HISTORIQUE : les semaines closes, « à payer » ou « payées » avec la référence de l'opération ;
--   * si NTanova a son numéro Mobile Money (jamais le numéro).
-- Les montants sont ceux de l'administration, par la même règle : le calcul de `payable_items` passe dans une fonction
-- privée (`prive.payable_items_for`) que les deux appellent, au lieu d'être recopié.
--
-- Additive : `payable_items` garde sa signature, ses droits et son résultat (il vérifie toujours l'administration).
-- Rien n'est renommé ni retiré. Ce que le relais lit est un acquis estimé : « à payer vendredi si rien ne change ».

-- 1. Le calcul commun, privé : ce qui est dû jusqu'au vendredi donné, pour tous les relais ----------------------------------------------------------
create function prive.payable_items_for(p_friday date default null)
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
comment on function prive.payable_items_for(date) is
  'Le calcul de la paie, commun à l''administration (payable_items) et au relais (my_payout) : ce qui est dû jusqu''au vendredi donné. Privé : aucun rôle de l''API ne l''appelle.';

-- 2. L'administration appelle le même calcul : même signature, mêmes droits, même résultat -----------------------------------------------------------
create or replace function public.payable_items(p_friday date default null)
returns table (relay_id uuid, kind text, submission_id uuid, amount_xaf integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query select * from prive.payable_items_for(p_friday);
end;
$$;

-- 3. Ma paie ---------------------------------------------------------------------------------------------------------------------------------------
create function public.my_payout(p_friday date default null)
returns table (
  friday date, state text, submissions integer, contacts integer, trial_bundles integer, total_xaf integer,
  not_payable integer, has_payment_details boolean, paid_at timestamptz, reference text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_user_id());
  v_friday date := coalesce(
    p_friday,
    ((now() at time zone 'Africa/Brazzaville')::date + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7))
  );
  v_details boolean;
begin
  if not public.est_relais_actif() then
    return;
  end if;
  v_details := exists (select 1 from prive.relay_payment_details d where d.relay_id = v_me);

  -- L'acquis : toujours une ligne, même à zéro (« 0 FCFA », pas une page vide).
  return query
  select v_friday, 'acquis'::text,
         (count(*) filter (where i.kind = 'submission'))::integer,
         (count(*) filter (where i.kind = 'contact'))::integer,
         (count(*) filter (where i.kind = 'trial_bundle'))::integer,
         coalesce(sum(i.amount_xaf), 0)::integer,
         -- acceptées mais non payables : une école déjà relevée par un autre relais (hors lot d'essai)
         (select count(*)::integer from public.field_submissions s
          where s.relay_id = v_me and s.status = 'accepte' and not s.payable and s.kind in ('releve', 'contre_visite')
            and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)),
         v_details, null::timestamptz, null::text
  from prive.payable_items_for(v_friday) i
  where i.relay_id = v_me;

  -- L'historique : les semaines closes, la plus récente d'abord.
  return query
  select b.friday, (case when st.paid_at is null then 'a_payer' else 'paye' end)::text,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'trial_bundle'),
         st.total_xaf, 0, v_details, st.paid_at, st.reference
  from public.payout_statements st
  join public.payout_batches b on b.id = st.batch_id
  where st.relay_id = v_me
  order by b.friday desc;
end;
$$;
comment on function public.my_payout(date) is
  'La paie du relais connecté, en lecture seule : l''acquis du prochain vendredi (ou du vendredi donné), puis les semaines closes (à payer, payées avec la référence). Jamais le numéro Mobile Money.';

-- Les droits : retirés, puis donnés exactement --------------------------------------------------------------------------------------------------------
revoke all on function prive.payable_items_for(date) from public, anon, authenticated;
revoke all on function public.my_payout(date) from public, anon, authenticated;
grant execute on function public.my_payout(date) to authenticated;
