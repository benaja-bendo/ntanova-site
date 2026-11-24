-- Refonte publique, lot 3B2 (ticket 217) : l'alerte e-mail. Ce qui n'existe que sur Supabase : sonner au service toutes les cinq minutes.
--
-- INACTIF sans sa configuration : tant que `pg_net` n'est pas installée et que les deux secrets ne sont pas posés dans le coffre (Vault),
-- la fonction ne fait rien, n'appelle rien et n'écrit aucun passage (l'administration dit alors « pas activées »). Cette migration
-- n'installe aucune extension, ne pose aucun secret et n'ouvre pas les envois. Activer : `supabase/schema.md`, « Activer l'alerte ».
--
-- Elle vit dans son propre schéma, hors de `public` et de `prive` : un PostgreSQL ordinaire ne la reçoit pas, et le cœur ne cite ni `net`
-- ni `vault` (`portabilite.test.sql`). Une restauration ne l'emporte donc pas : rejouer ce fichier suffit, il ne crée aucun doublon.
--
-- `pg_net` n'est qu'une sonnette : sa file ne survit pas à un arrêt brutal. Le stock d'annonces reste dans nos tables ; le passage suivant
-- reprend. Le jeton est propre à cette sonnette : ni la clé de l'API, ni le mot de passe de la boîte ne passent par la base.

do $couche$
begin
  if to_regnamespace('auth') is null then
    return;
  end if;
  create schema if not exists ntanova_supabase;
  revoke all on schema ntanova_supabase from public, anon, authenticated, service_role;

  create or replace function ntanova_supabase.ring_public_request_notices() returns text
  language plpgsql set search_path = '' as $f$
  declare
    v_url text;
    v_jeton text;
  begin
    if to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') is null or to_regclass('vault.decrypted_secrets') is null then
      return 'non_configuree';
    end if;
    execute $q$select (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'ntanova_alerte_url'),
                      (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'ntanova_alerte_jeton')$q$
      into v_url, v_jeton;
    if nullif(btrim(v_url), '') is null or nullif(btrim(v_jeton), '') is null then
      return 'non_configuree';
    end if;
    -- Jamais en clair sur le réseau, jamais un jeton trop court pour en être un.
    if v_url !~ '^https://[a-z0-9.-]+/functions/v1/alerte-messages$' or length(v_jeton) < 32 then
      return 'configuration';
    end if;
    execute $q$select net.http_post(url := $1, body := '{}'::jsonb, params := '{}'::jsonb,
                                    headers := jsonb_build_object('content-type', 'application/json', 'x-ntanova-jeton', $2),
                                    timeout_milliseconds := 120000)$q$
      using v_url, v_jeton;
    return 'sonnee';
  end;
  $f$;
  comment on function ntanova_supabase.ring_public_request_notices() is
    'Sonne au service d''alerte (toutes les cinq minutes). Ne fait rien sans pg_net et sans ses deux secrets du coffre.';
  revoke all on function ntanova_supabase.ring_public_request_notices() from public, anon, authenticated, service_role;

  if to_regprocedure('cron.schedule(text, text, text)') is not null then
    perform cron.schedule('ntanova-alerte-messages', '*/5 * * * *', 'select ntanova_supabase.ring_public_request_notices()');
  end if;
end
$couche$;
