-- L'administration reconnaît un compte en attente (ticket #78).
--
-- Un relais naît « en attente » à sa première connexion Google, avec son prénom seulement. Une fois la connexion ouverte à
-- tous, trois « Marie » sont indiscernables : on ne peut pas relier un compte à la conversation WhatsApp. On garde donc
-- l'adresse de connexion, DANS LA PARTIE PRIVÉE (une adresse est une donnée personnelle : loi n° 29-2019) : aucun rôle de
-- l'API ne la lit, ni le relais ni un visiteur ; seule l'administration, par une fonction qui commence par
-- `exiger_admin_session()`.
--
-- Le cœur reste portable : rien ici ne touche `auth`. Le serveur d'identité (la couche Supabase, migration suivante) donne
-- l'adresse à `register_relay` ; un autre serveur d'identité fait de même. L'appel à trois paramètres, d'avant, marche
-- toujours (sans adresse, rien n'est gardé).

create table prive.relay_identity (
  relay_id uuid primary key references public.relais (id) on delete cascade,
  -- Toujours sous sa forme nettoyée : sans espaces, en minuscules.
  email text not null check (email = lower(btrim(email)) and length(email) between 3 and 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table prive.relay_identity is
  'L''adresse de connexion d''un relais, pour que l''administration relie un compte à une personne. Jamais lisible par un relais.';
revoke all on prive.relay_identity from public, anon, authenticated;

create function public.register_relay(p_id uuid, p_google_sub text, p_first_name text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  perform public.register_relay(p_id, p_google_sub, p_first_name);
  if v_email <> '' then
    insert into prive.relay_identity (relay_id, email) values (p_id, v_email)
    on conflict (relay_id) do update set email = excluded.email, updated_at = now();
  end if;
end;
$$;
comment on function public.register_relay(uuid, text, text, text) is
  'Inscrit un relais (en attente) et garde son adresse dans la partie privée. Aucun rôle de l''API ne l''appelle.';
revoke all on function public.register_relay(uuid, text, text, text) from public, anon, authenticated;

-- L'administration lit les adresses, pour les afficher à côté de chaque relais.
create function public.relay_identities() returns table (relay_id uuid, email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query select i.relay_id, i.email from prive.relay_identity i;
end;
$$;
comment on function public.relay_identities() is
  'Les adresses de connexion des relais. Administration seule.';
revoke all on function public.relay_identities() from public, anon;
grant execute on function public.relay_identities() to authenticated;
