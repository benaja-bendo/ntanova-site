-- Ticket 236 (retours du 27/11), point 10 : avertir au moment de publier quand la direction a refusé. Décision du 27/11 : une
-- école dont la direction a dit ne pas vouloir apparaître est retirée ; quatre fiches avaient été publiées sans que l'écran le
-- rappelle (le mot n'était que dans la carte privée « Contacts de l'école »).
--
-- Une seule règle : un relevé ACCEPTÉ du site (et ceux qu'il corrige) qui dit « refus » à la rencontre, ou un mot de la
-- direction noté par le relais. Elle alimente l'avertissement des écrans (`publication_warnings`) et les trois publications :
--   * `publish_campus` refuse sans la confirmation explicite `p_despite_refusal` ;
--   * `publish_batch` et `publish_division` laissent de côté les écoles averties, sauf celles que la confirmation nomme.
-- Rien n'est bloqué pour toujours. Le mot reste privé : jamais sur le site public.
--
-- Compatible avec l'administration en ligne : ses appels restent valables ; publier une école avertie y affiche le refus de la
-- base, sans la publier, jusqu'à la mise en ligne de la nouvelle administration.

create function prive.alertes_de_publication(p_campuses uuid[])
returns table (
  campus_id uuid, submission_id uuid, taken_at timestamptz, refused boolean, word text, relay_first_name text
)
language sql stable security definer set search_path = '' as $$
  with recursive fiches(campus_id, fid, profondeur) as (
    select s.campus_id, s.id, 0 from public.field_submissions s
    where s.campus_id = any (p_campuses) and s.status = 'accepte'
    union
    select f.campus_id, s.corrects_submission_id, f.profondeur + 1
    from fiches f join public.field_submissions s on s.id = f.fid
    where s.corrects_submission_id is not null and f.profondeur < 20
  ),
  -- Une fiche corrigée peut se retrouver par deux chemins : une seule ligne par site et par fiche.
  uniques as (select distinct x.campus_id, x.fid from fiches x)
  select u.campus_id, s.id, s.taken_at, coalesce(s.direction_seen = 'refus', false), nullif(btrim(d.said_note), ''),
         nullif(btrim(r.prenom), '')
  from uniques u
  join public.field_submissions s on s.id = u.fid
  left join prive.direction_contacts d
    on d.submission_id = s.id and d.source = 'relais' and nullif(btrim(d.said_note), '') is not null
  left join public.relais r on r.id = s.relay_id
  where s.direction_seen = 'refus' or d.id is not null
$$;
revoke all on function prive.alertes_de_publication(uuid[]) from public, anon, authenticated, service_role;

create function public.publication_warnings(p_campuses uuid[])
returns table (
  campus_id uuid, submission_id uuid, taken_at timestamptz, refused boolean, word text, relay_first_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
    select a.campus_id, a.submission_id, a.taken_at, a.refused, a.word, a.relay_first_name
    from prive.alertes_de_publication(p_campuses) a
    order by a.campus_id, a.taken_at desc, a.submission_id;
end;
$$;
comment on function public.publication_warnings(uuid[]) is
  'Avant de publier : les relevés acceptés de ces sites où la direction a refusé, ou a laissé un mot au relais. Privé : administration seule.';
revoke all on function public.publication_warnings(uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.publication_warnings(uuid[]) to authenticated;

-- Un paramètre de plus : l'ancienne signature part d'abord, pour qu'un appel sans lui reste sans ambiguïté. Les trois
-- publications restent en `security invoker` (`exiger_admin` lit le rôle de l'appelant) : elles passent par la lecture
-- réservée à l'administration, `publication_warnings`, et gardent leurs droits d'avant.
drop function public.publish_campus(uuid);
create function public.publish_campus(p_campus uuid, p_despite_refusal boolean default false) returns void
language plpgsql set search_path = '' as $$
begin
  perform public.exiger_admin();
  if exists (select 1 from public.campuses c where c.id = p_campus and c.trashed_at is not null) then
    raise exception 'Cette école est à la corbeille : restaure-la d''abord.' using errcode = '22023';
  end if;
  if not coalesce(p_despite_refusal, false) and exists (select 1 from public.publication_warnings(array[p_campus])) then
    raise exception 'La direction a dit non, ou a laissé un mot au relais : relis-le, puis confirme la publication.'
      using errcode = '22023';
  end if;
  update public.campuses c set
    publication = 'publiee', retired_at = null, retirement_reason = null, retirement_note = null
  where c.id = p_campus and c.publication in ('prete', 'retiree') and c.replaced_by_campus_id is null;
  if not found then
    raise exception 'Seul un campus prêt ou retiré se publie (un campus à situer attend sa position).' using errcode = '22023';
  end if;
end;
$$;
comment on function public.publish_campus(uuid, boolean) is
  'Publie un site prêt ou retiré. Après un refus (ou un mot de la direction) noté par un relais, il faut `p_despite_refusal`.';
revoke all on function public.publish_campus(uuid, boolean) from public, anon, authenticated;
grant execute on function public.publish_campus(uuid, boolean) to authenticated, service_role;

drop function public.publish_division(uuid);
create function public.publish_division(p_division uuid, p_despite_refusal uuid[] default '{}') returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
  v_pretes uuid[];
begin
  perform public.exiger_admin();
  select coalesce(array_agg(c.id), '{}') into v_pretes from public.campuses c
  where c.publication = 'prete'
    and c.division_id in (
      select d.id from public.geo_divisions d
      join public.geo_divisions a on d.path operator(extensions.<@) a.path
      where a.id = p_division
    );
  update public.campuses c set publication = 'publiee'
  where c.id = any (v_pretes)
    and (c.id = any (coalesce(p_despite_refusal, '{}'))
         or c.id not in (select a.campus_id from public.publication_warnings(v_pretes) a));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.publish_division(uuid, uuid[]) is
  'Publie les sites prêts d''une zone, sauf ceux qu''un refus ou un mot de la direction retient, à moins qu''ils soient nommés dans `p_despite_refusal`. Rend le nombre publié.';
revoke all on function public.publish_division(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_division(uuid, uuid[]) to authenticated, service_role;

drop function public.publish_batch(uuid);
create function public.publish_batch(p_batch uuid, p_despite_refusal uuid[] default '{}') returns integer
language plpgsql set search_path = '' as $$
declare
  n integer;
  v_pretes uuid[];
begin
  perform public.exiger_admin();
  select coalesce(array_agg(c.id), '{}') into v_pretes from public.campuses c
  where c.publication = 'prete'
    and exists (
      select 1 from public.field_submissions s
      where s.campus_id = c.id and s.status = 'accepte' and s.batch_id = p_batch
    );
  update public.campuses c set publication = 'publiee'
  where c.id = any (v_pretes)
    and (c.id = any (coalesce(p_despite_refusal, '{}'))
         or c.id not in (select a.campus_id from public.publication_warnings(v_pretes) a));
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function public.publish_batch(uuid, uuid[]) is
  'Publie les sites prêts relevés dans un lot, sauf ceux qu''un refus ou un mot de la direction retient, à moins qu''ils soient nommés dans `p_despite_refusal`. Rend le nombre publié.';
revoke all on function public.publish_batch(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.publish_batch(uuid, uuid[]) to authenticated, service_role;
