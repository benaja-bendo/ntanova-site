-- M12. Lot H (13/11/2026) : le relais lit et modifie son propre numéro Mobile Money, depuis « Compte › Pour recevoir la paie ».
--
-- La table `prive.relay_payment_details` existe depuis la paie (20261101200700) ; seule l'administration l'écrivait
-- (`set_relay_payment_details`). Décision du fondateur du 13/11 : pas de nouvelle table ; deux fonctions pour le relais actif
-- connecté, qui ne voit et ne change que **sa** ligne. Le numéro reste dans le schéma privé : aucune vue, aucune lecture directe.
-- `updated_by` dit qui l'a posé (le relais lui-même, ou l'administration) ; l'administration garde sa fonction.

create function public.my_payment_details()
returns table (operator text, msisdn text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_relais_actif() then
    return;
  end if;
  return query
  select d.operator, d.msisdn::text, d.updated_at
  from prive.relay_payment_details d
  where d.relay_id = (select public.current_user_id());
end;
$$;
comment on function public.my_payment_details() is
  'Le numéro Mobile Money du relais connecté (opérateur, numéro), ou rien. Jamais celui d''un autre relais.';
revoke all on function public.my_payment_details() from public, anon, authenticated;
grant execute on function public.my_payment_details() to authenticated;

create function public.set_my_payment_details(p_operator text, p_msisdn text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_user_id());
begin
  if not public.est_relais_actif() then
    raise exception 'Seul un relais actif enregistre son numéro de paie.' using errcode = '42501';
  end if;
  if p_operator is null or p_operator not in ('mtn', 'airtel', 'autre') then
    raise exception 'L''opérateur est MTN, Airtel ou autre.' using errcode = '22023';
  end if;
  if p_msisdn is null or p_msisdn !~ '^[1-9][0-9]{7,14}$' then
    raise exception 'Le numéro s''écrit avec l''indicatif, sans + ni espace (242…).' using errcode = '22023';
  end if;
  insert into prive.relay_payment_details (relay_id, operator, msisdn, updated_by)
  values (v_me, p_operator, p_msisdn::public.telephone, v_me)
  on conflict (relay_id) do update set operator = excluded.operator, msisdn = excluded.msisdn,
    updated_at = now(), updated_by = excluded.updated_by;
end;
$$;
comment on function public.set_my_payment_details(text, text) is
  'Le relais actif connecté pose ou change son numéro Mobile Money (mtn, airtel, autre ; numéro avec indicatif).';
revoke all on function public.set_my_payment_details(text, text) from public, anon, authenticated;
grant execute on function public.set_my_payment_details(text, text) to authenticated;
