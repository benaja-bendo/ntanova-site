-- La couche Supabase : un relais relit les fichiers des photos de SES relevés (ticket #72).
--
-- Même règle que l'envoi (`20261101200900_supabase_couche.sql`) : le dossier du fichier est un de ses relevés. Sans
-- elle, le stockage refuse de fabriquer l'adresse de lecture temporaire que l'application demande après
-- `my_submission_photos`. Un relais ne lit rien d'un autre relais ; un relais en attente ne lit rien ; le seau reste
-- privé. Gardée : sur un PostgreSQL sans `storage`, cette migration ne fait rien.

do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists "Le relais actif relit les photos de ses relevés" on storage.objects;
    create policy "Le relais actif relit les photos de ses relevés"
      on storage.objects for select to authenticated
      using (
        bucket_id = 'releves'
        and (select public.est_relais_actif())
        and exists (
          select 1 from public.field_submissions s
          where s.id::text = (storage.foldername(name))[1]
            and s.relay_id = (select public.current_user_id())
        )
      );
  end if;
end
$$;
