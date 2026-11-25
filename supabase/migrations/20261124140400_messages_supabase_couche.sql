-- Refonte publique, lot 3B1 (ticket 215) : les messages reçus. 5. Ce qui n'existe que sur Supabase : la planification de la purge.
--
-- Chaque instruction est gardée : sur un PostgreSQL sans `pg_cron`, cette migration ne fait rien. Elle se rejoue sans doublon : une
-- restauration n'emporte pas les planifications (`cron` est hors de `public` et `prive`), il suffit de rejouer ce fichier.
-- Aucun appel réseau, aucun courrier : le service d'annonce viendra avec le lot 3B2.

do $$
begin
  if to_regprocedure('cron.schedule(text, text, text)') is null
     and to_regnamespace('auth') is not null
     and exists (select 1 from pg_available_extensions e where e.name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
  if to_regprocedure('cron.schedule(text, text, text)') is not null then
    -- 1 h 40 UTC, avant la sauvegarde de la nuit.
    perform cron.schedule('ntanova-purge-messages', '40 1 * * *', 'select prive.purge_public_requests()');
    -- Le journal des planifications ne se nettoie pas seul.
    perform cron.schedule('ntanova-journal-planification', '50 1 * * *',
      'delete from cron.job_run_details where end_time < now() - interval ''30 days''');
  end if;
end
$$;
