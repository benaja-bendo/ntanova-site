-- La couche Supabase : l'adresse du relais (ticket #78).
--
-- Le déclencheur de la première connexion donne maintenant l'adresse du compte à `register_relay` (migration
-- précédente : le cœur la garde dans la partie privée). Les relais déjà inscrits reçoivent leur adresse une fois, ici :
-- la lecture de `auth.users` n'existe que sur Supabase, donc elle vit dans cette couche, jamais dans le cœur. Sur un
-- PostgreSQL sans `auth`, cette migration ne fait rien.

create or replace function supabase_layer.register_relay_from_auth() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.register_relay(
    new.id,
    case when new.raw_app_meta_data ->> 'provider' = 'google' then
      coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub')
    end,
    coalesce(
      new.raw_user_meta_data ->> 'given_name',
      split_part(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), ' ', 1)
    ),
    new.email
  );
  return new;
end;
$$;
revoke all on function supabase_layer.register_relay_from_auth() from public, anon, authenticated;

-- Les relais déjà inscrits : leur adresse vient de leur compte. Rejouable sans danger (on ne touche pas à une adresse
-- déjà gardée) ; rend le nombre d'adresses ajoutées.
create or replace function supabase_layer.backfill_relay_identities() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ajoutees integer := 0;
begin
  if to_regclass('auth.users') is null then
    return 0;
  end if;
  execute $q$
    insert into prive.relay_identity (relay_id, email)
    select r.id, lower(btrim(u.email))
    from public.relais r
    join auth.users u on u.id = r.id
    where btrim(coalesce(u.email, '')) <> ''
    on conflict (relay_id) do nothing
  $q$;
  get diagnostics v_ajoutees = row_count;
  return v_ajoutees;
end;
$$;
revoke all on function supabase_layer.backfill_relay_identities() from public, anon, authenticated;

select supabase_layer.backfill_relay_identities();
