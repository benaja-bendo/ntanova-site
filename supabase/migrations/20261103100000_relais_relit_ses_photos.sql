-- Un relais relit les photos de SES fiches (ticket #72).
--
-- Quand NTanova renvoie une fiche, le relais qui la corrige doit voir ce que NTanova a déjà reçu : ses photos. Jusqu'ici
-- les photos ne se lisaient que par l'administration, et `my_submissions` ne rendait que leurs rôles (« une enseigne est
-- arrivée »), jamais leur chemin. Le relais ne pouvait donc pas revoir ce qu'il avait envoyé, ni savoir que sa photo
-- n'était jamais arrivée.
--
-- Cette fonction rend, pour UNE fiche du relais connecté, l'identifiant, le rôle et le chemin relatif de chacune de ses
-- photos. C'est tout ce qu'il faut à l'application pour demander une adresse de lecture temporaire au stockage (la règle
-- du seau est dans `20261103100100_supabase_couche_lecture_photos.sql`). Rien d'autre ne sort : ni la table des photos
-- (pas de lecture directe : `is_public` et la vérification « sans enfant » restent à l'administration), ni les photos
-- d'une fiche d'un autre relais. Une photo effacée (chemin rendu à l'application) n'est plus rendue.
--
-- `security definer`, comme `my_submissions` : la table des photos ne se lit pas avec les droits du relais ; la fonction
-- filtre elle-même sur le relais connecté, actif.

create function public.my_submission_photos(p_submission uuid)
returns table (id uuid, role text, storage_path text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.role::text, p.storage_path
  from public.field_submission_photos p
  join public.field_submissions s on s.id = p.submission_id
  where public.est_relais_actif()
    and s.id = p_submission
    and s.relay_id = (select public.current_user_id())
    and p.storage_path is not null
  order by p.received_at, p.id;
$$;
comment on function public.my_submission_photos(uuid) is
  'Les photos d''une fiche du relais connecté : identifiant, rôle, chemin relatif. Rien pour la fiche d''un autre, ni pour un relais inactif.';

revoke all on function public.my_submission_photos(uuid) from public, anon, authenticated;
grant execute on function public.my_submission_photos(uuid) to authenticated;
