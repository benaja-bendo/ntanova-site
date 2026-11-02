-- Ce que le relais peut relire de lui-même (ticket #55, PR 3).
--
-- Pour préremplir « Compléter » et « Corriger » sans tout redemander, le téléphone doit savoir ce que NTanova sait déjà :
--   * pour chaque école qu'on lui confie (`my_missions`) : sa position, son état de vérification, quelles photos existent
--     (par rôle), si le contact de la direction est déjà confirmé ;
--   * pour chacune de ses fiches (`my_submissions`) : tout ce qu'elle contient, la décision de NTanova, quelles photos
--     existent (par rôle), si le contact est arrivé.
--
-- Rien de privé ne sort : ni le chemin d'une photo (les photos sont privées tant que l'administration n'a pas vérifié
-- qu'elles sont publiables), ni le contact de la direction (seulement qu'il existe), ni les fiches des autres. Les deux
-- fonctions sont `security definer` parce que les photos et les contacts ne se lisent pas avec les droits du relais ;
-- elles filtrent elles-mêmes sur le relais connecté, comme `my_missions` le faisait.
--
-- Additive : `my_missions` garde ses colonnes, dans le même ordre, et en gagne cinq à la fin. L'application en ligne,
-- qui lit les premières par leur nom, n'est pas touchée. Rien n'est renommé ni retiré.

-- Les missions du relais : ce qu'il y avait, puis ce que NTanova sait déjà de l'école ---------------------------------------------------------
-- Les colonnes d'une fonction ne s'ajoutent pas en place : on la recrée (même transaction), et on redonne ses droits.
drop function public.my_missions();
create function public.my_missions()
returns table (
  mission_id uuid, campus_id uuid, name text, label text, neighbourhood text, school_kind text,
  cycles text[], curriculum_note text, landmark text, sign_phone text, note text, kind text,
  latitude double precision, longitude double precision, verification_state text,
  photo_roles text[], contact_confirmed boolean
)
language sql stable security definer set search_path = '' as $$
  select m.id, c.id, i.name, c.label, c.neighbourhood, i.kind::text,
         coalesce((select array_agg(cc.cycle::text order by cc.cycle) from public.campus_cycles cc where cc.campus_id = c.id), '{}'),
         c.curriculum_note, c.landmark, c.sign_phone::text, m.note, m.kind::text,
         extensions.st_y(c.position), extensions.st_x(c.position), c.verification_state::text,
         -- Les photos de l'école : celles de ses relevés acceptés, par rôle, sans leur chemin.
         coalesce((select array_agg(distinct p.role::text order by p.role::text)
                   from public.field_submission_photos p
                   join public.field_submissions s on s.id = p.submission_id
                   where s.campus_id = c.id and s.status = 'accepte'), '{}'),
         exists (select 1 from public.field_submissions s
                 where s.campus_id = c.id and s.status = 'accepte' and s.contact_confirmed_at is not null)
  from public.missions m
  join public.campuses c on c.id = m.campus_id
  join public.institutions i on i.id = c.institution_id
  where public.est_relais_actif() and m.status = 'open' and m.relay_id = (select public.current_user_id())
  order by m.created_at;
$$;
comment on function public.my_missions() is
  'Les écoles confiées au relais connecté, avec ce que NTanova en sait : position, état de vérification, photos par rôle (sans chemin), contact de la direction confirmé ou non.';

-- Les fiches du relais, en entier -----------------------------------------------------------------------------------------------------------------
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
  has_contact boolean, photo_roles text[]
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
                   from public.field_submission_photos p where p.submission_id = s.id), '{}')
  from public.field_submissions s
  where public.est_relais_actif() and s.relay_id = (select public.current_user_id())
  order by s.taken_at desc
  limit 500;
$$;
comment on function public.my_submissions() is
  'Les fiches du relais connecté, avec tout ce qu''elles contiennent, la décision de NTanova, les photos par rôle (sans chemin) et si le contact de la direction est arrivé (sans le contact).';

-- Les droits : retirés, puis donnés exactement ------------------------------------------------------------------------------------------------------
revoke all on function public.my_missions() from public, anon, authenticated;
revoke all on function public.my_submissions() from public, anon, authenticated;
grant execute on function public.my_missions(), public.my_submissions() to authenticated;
