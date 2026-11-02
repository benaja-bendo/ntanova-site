-- La couche Supabase : tout ce qui n'existe que sur la plateforme Supabase, et nulle part ailleurs.
--
-- C'est ici, et seulement ici, que l'on touche `auth` (les comptes) et `storage` (les fichiers). Le cœur de la base
-- (`public`, `prive`) n'en dépend plus : un `pg_dump` de ces deux schémas se restaure sur un PostgreSQL ordinaire.
-- Pour changer de serveur, on remplace cette couche :
--   * les comptes : tout serveur d'identité appelle `public.register_relay(id, google_sub, prénom)` ;
--   * les photos : le fichier va dans le stockage de son choix (S3, MinIO, un dossier), au chemin que donne la
--     base (`field_submission_photos.storage_path`, relatif) ; la base ne retient jamais une adresse complète.
-- Chaque instruction est gardée : sur un PostgreSQL sans `auth` ni `storage`, cette migration ne fait rien.

-- Un relais naît à sa première connexion Google, en attente --------------------------------------------------

create schema if not exists supabase_layer;

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
    )
  );
  return new;
end;
$$;
revoke all on function supabase_layer.register_relay_from_auth() from public, anon, authenticated;

do $$
begin
  if to_regclass('auth.users') is not null then
    drop trigger if exists creer_relais on auth.users;
    create trigger creer_relais
      after insert on auth.users
      for each row execute function supabase_layer.register_relay_from_auth();
  end if;
end
$$;

-- Les photos : le seau `releves`, privé, et ses règles -------------------------------------------------------------

do $$
begin
  if to_regclass('storage.objects') is not null then
    -- Du WebP (plus léger) ou du JPEG, jamais plus de 2 Mo : l'application allège chaque photo à moins de 200 Ko.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('releves', 'releves', false, 2097152, array['image/webp', 'image/jpeg'])
    on conflict (id) do update
      set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

    -- Chemin : <relevé>/<photo>.webp (ou .jpg), pour un relevé déjà reçu et envoyé par ce relais. Sans
    -- écrasement : un second envoi du même fichier est refusé (« déjà reçu »).
    drop policy if exists "Le relais actif envoie les photos de ses relevés" on storage.objects;
    create policy "Le relais actif envoie les photos de ses relevés"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'releves'
        and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
        and (select public.est_relais_actif())
        and exists (
          select 1 from public.field_submissions s
          where s.id::text = (storage.foldername(name))[1]
            and s.relay_id = (select public.current_user_id())
        )
      );

    drop policy if exists "L'administration voit les photos des relevés" on storage.objects;
    create policy "L'administration voit les photos des relevés"
      on storage.objects for select to authenticated
      using (bucket_id = 'releves' and (select public.est_admin()));

    -- Les photos envoyées avant cette migration (chemin `<relevé>/enseigne.jpg`) entrent dans le catalogue des photos.
    insert into public.field_submission_photos (id, submission_id, role, storage_path, mime, bytes, received_at)
    select gen_random_uuid(), s.id, 'signboard', o.name, 'image/jpeg',
           greatest(coalesce((o.metadata ->> 'size')::integer, 1), 1), coalesce(o.created_at, now())
    from storage.objects o
    join public.field_submissions s on s.id::text = (storage.foldername(o.name))[1]
    where o.bucket_id = 'releves'
      and storage.filename(o.name) = 'enseigne.jpg'
      and not exists (select 1 from public.field_submission_photos p where p.storage_path = o.name);
  end if;
end
$$;
