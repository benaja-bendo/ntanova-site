-- Couche Supabase uniquement : le seau demeure privé. Pas de lecture des autres fichiers.
do $$ begin
  if to_regclass('storage.objects') is not null then
    grant usage on schema storage to anon;
    grant select on storage.objects to anon;
    create policy "Le public lit seulement les enseignes sélectionnées des écoles publiées"
    on storage.objects for select to anon,authenticated
    using(bucket_id='releves' and exists(select 1 from public.public_campus_photos p where p.storage_path=name));
  end if;
end $$;
