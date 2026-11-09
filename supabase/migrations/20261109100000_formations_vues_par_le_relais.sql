-- Les séries et les filières que le relais coche sur place (audit de la fiche relais, 08/11/2026).
--
-- Avant : le relais écrivait une ligne libre (`observed_programs`) que l'administration relisait comme un indice ; rien
-- n'arrivait jamais à `campus_programs`, la seule table que le site public lit (13 cycles sans une formation, le 08/11).
-- Maintenant : le téléphone envoie aussi la liste de ce qu'il a coché, dans la même forme que celle que l'administration
-- donne à `accept_reviewed_submission` (`p_programs` : cycle, intitulé, série, diplôme, domaine). L'administration la voit
-- préremplie dans « À valider » et la corrige : **rien ne se publie seul**, collecter, accepter et publier restent trois gestes.
--
-- - La colonne a une valeur par défaut vide : un téléphone d'avant n'envoie rien et reste valable.
-- - La base ne juge ici que la forme (une liste, d'une taille raisonnable) ; les valeurs (série, diplôme, domaine, cycle des
--   niveaux de la fiche) sont jugées à l'acceptation par `upsert_programs`, et lues avec tolérance par l'application.
-- - `my_submissions()` la rend au relais (corriger une fiche, c'est la retrouver cochée). Une colonne de plus change le type
--   de retour : la fonction est refaite, avec les mêmes droits.

alter table public.field_submissions
  add column observed_formations jsonb not null default '[]'::jsonb
  check (
    jsonb_typeof(observed_formations) = 'array'
    and jsonb_array_length(observed_formations) <= 80
    and octet_length(observed_formations::text) <= 20000
  );
comment on column public.field_submissions.observed_formations is
  'Les séries et filières que le relais a cochées sur place : [{cycle, titre, serie, diplome, domaine}]. Préremplit « À valider » ; ne publie rien.';

-- Le relais n'écrit que les colonnes que le téléphone remplit : celle-ci s'ajoute à la liste.
grant insert (observed_formations) on public.field_submissions to authenticated;

-- `my_submissions()` : les mêmes colonnes qu'avant, et les formations cochées en dernier -------------------------------------------------------------
drop function public.my_submissions();
create function public.my_submissions()
returns table (
  id uuid, kind text, status text, reason text, message_to_relay text,
  corrects_submission_id uuid, campus_id uuid, duplicate_of_campus_id uuid,
  taken_at timestamptz, received_at timestamptz,
  sign_name text, levels text[], school_kind text, curriculum_note text,
  observed_programs text, programs_photographed boolean, landmark text, sign_phone text,
  latitude double precision, longitude double precision, accuracy_m real,
  direction_seen text, liaison_sheet_given boolean, come_back_note text,
  contact_confirmed_at timestamptz, contact_role text,
  has_contact boolean, photo_roles text[],
  observed_formations jsonb
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.kind::text, s.status::text, s.reason::text, s.message_to_relay,
         s.corrects_submission_id, s.campus_id, s.duplicate_of_campus_id,
         s.taken_at, s.received_at,
         s.sign_name, s.levels::text[], s.school_kind::text, s.curriculum_note,
         s.observed_programs, s.programs_photographed, s.landmark, s.sign_phone::text,
         extensions.st_y(s.position), extensions.st_x(s.position), s.accuracy_m,
         s.direction_seen::text, s.liaison_sheet_given, s.come_back_note,
         s.contact_confirmed_at, s.contact_role::text,
         -- Le contact lui-même (nom, numéro, ce qu'a dit la direction) reste dans `prive` : le relais sait seulement qu'il est arrivé.
         exists (select 1 from prive.direction_contacts d where d.submission_id = s.id),
         coalesce((select array_agg(distinct p.role::text order by p.role::text)
                   from public.field_submission_photos p where p.submission_id = s.id), '{}'),
         s.observed_formations
  from public.field_submissions s
  where public.est_relais_actif() and s.relay_id = (select public.current_user_id())
  order by s.taken_at desc
  limit 500;
$$;
comment on function public.my_submissions() is
  'Les fiches du relais connecté, avec tout ce qu''elles contiennent, la décision de NTanova, les photos par rôle (sans chemin), si le contact de la direction est arrivé (sans le contact) et les formations qu''il a cochées.';

revoke all on function public.my_submissions() from public, anon, authenticated;
grant execute on function public.my_submissions() to authenticated;
