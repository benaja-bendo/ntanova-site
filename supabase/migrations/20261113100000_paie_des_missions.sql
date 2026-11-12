-- M1. La paie : missions payées, prime de contact à zéro (proposition du 12/11/2026, validée par le fondateur le 13/11).
--
-- Décisions du fondateur :
-- - la prime de 300 FCFA par contact de direction confirmé est supprimée « pour le moment » (12/11, au registre) : un
--   nouveau tarif daté du 13/11/2026 la met à 0. L'ancien tarif reste : une semaine close garde le sien ;
-- - on paie la fiche acceptée (500 FCFA, inchangé) et la mission, dont NTanova fixe le montant en la confiant ;
-- - une mission « Je n'ai pas pu » n'est pas payée (choix C2), mais son motif est gardé.
--
-- Une mission payée remplace la paie de la fiche qui la ferme : la fiche est le travail de la mission, elle ne se paie pas deux
-- fois. Une mission sans montant (toutes celles d'avant) ne change rien : sa fiche se paie comme avant.

-- Le tarif du 13/11 : tout reprend le tarif précédent, sauf le contact -------------------------------------------------------------------------
insert into public.payout_rates (valid_from, per_submission_xaf, per_contact_xaf, trial_size, trial_total_xaf, note)
select '2026-11-13', r.per_submission_xaf, 0, r.trial_size, r.trial_total_xaf,
       'Décision du fondateur du 12/11/2026 : la prime de contact confirmé est supprimée (0 FCFA). Le reste est inchangé ; la mission se paie au montant fixé en la confiant.'
from public.payout_rates r
where r.valid_from < '2026-11-13' and not exists (select 1 from public.payout_rates x where x.valid_from = '2026-11-13')
order by r.valid_from desc
limit 1;

-- La mission porte ce que le relais doit savoir --------------------------------------------------------------------------------------------------
alter domain public.mission_status drop constraint mission_status_check;
alter domain public.mission_status add constraint mission_status_check check (value in ('open', 'done', 'cancelled', 'not_done')) not valid;

create domain public.mission_blocker as text check (value in ('ferme', 'pas_de_prospectus', 'refus', 'autre'));

alter table public.missions
  add column pay_xaf integer check (pay_xaf between 0 and 100000),
  add column due_on date,
  add column task text check (length(btrim(task)) between 1 and 200),
  add column reason text check (length(btrim(reason)) between 1 and 300),
  add column not_done_reason public.mission_blocker,
  add column not_done_note text check (length(btrim(not_done_note)) between 1 and 300),
  add constraint missions_non_faite_avec_motif check ((status = 'not_done') = (not_done_reason is not null)),
  add constraint missions_autre_motif_precise check (not_done_reason is distinct from 'autre' or not_done_note is not null);
comment on column public.missions.pay_xaf is 'Le montant de la mission, fixé par NTanova en la confiant (FCFA). Nul : une mission d''avant, sans paie propre.';
comment on column public.missions.not_done_reason is '« Je n''ai pas pu » : fermé, pas de prospectus, refus, autre (précisé). Une telle mission n''est pas payée.';

alter table public.payout_lines drop constraint payout_lines_kind_check;
alter table public.payout_lines add constraint payout_lines_kind_check check (kind in ('submission', 'contact', 'trial_bundle', 'mission'));

-- Confier une mission : les anciens appels marchent toujours (les paramètres nouveaux ont une valeur par défaut) -----------------------------
drop function public.assign_mission(uuid, uuid, public.mission_kind, text);
create function public.assign_mission(
  p_campus uuid, p_relay uuid, p_kind public.mission_kind default 'verify', p_note text default null,
  p_pay_xaf integer default null, p_due_on date default null, p_task text default null, p_reason text default null
) returns uuid
language plpgsql set search_path = '' as $$
declare
  v_id uuid;
begin
  perform public.exiger_admin();
  if not exists (select 1 from public.relais r where r.id = p_relay and r.statut = 'actif') then
    raise exception 'Ce relais n''est pas actif : l''activer d''abord.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.campuses c where c.id = p_campus and c.publication <> 'retiree') then
    raise exception 'Campus introuvable ou retiré.' using errcode = 'P0002';
  end if;
  if p_due_on is not null and p_due_on < (current_timestamp at time zone 'Africa/Brazzaville')::date then
    raise exception 'La date limite est déjà passée.' using errcode = '22023';
  end if;
  -- Un campus n'a qu'une mission ouverte : on reprend la précédente.
  update public.missions m set status = 'cancelled', closed_at = now() where m.campus_id = p_campus and m.status = 'open';
  insert into public.missions (campus_id, relay_id, kind, note, pay_xaf, due_on, task, reason)
  values (p_campus, p_relay, p_kind, p_note, p_pay_xaf, p_due_on, nullif(btrim(p_task), ''), nullif(btrim(p_reason), ''))
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.assign_mission(uuid, uuid, public.mission_kind, text, integer, date, text, text) is
  'Confie une école à un relais : le genre, la tâche (« ce qu''il faut faire »), la raison, la date limite et le montant. Une seule mission ouverte par école.';
revoke all on function public.assign_mission(uuid, uuid, public.mission_kind, text, integer, date, text, text) from public, anon, authenticated;
grant execute on function public.assign_mission(uuid, uuid, public.mission_kind, text, integer, date, text, text) to authenticated;

-- « Je n'ai pas pu » : le relais ferme sa mission avec son motif ---------------------------------------------------------------------------------
create function public.mission_not_done(p_mission uuid, p_reason public.mission_blocker, p_note text default null)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_relais_actif() then
    raise exception 'Compte relais inactif.' using errcode = '42501';
  end if;
  if p_reason is null or (p_reason = 'autre' and nullif(btrim(p_note), '') is null) then
    raise exception 'Dites ce qui vous a empêché (et précisez « autre »).' using errcode = '22023';
  end if;
  update public.missions m set
    status = 'not_done', closed_at = now(), not_done_reason = p_reason, not_done_note = nullif(btrim(p_note), '')
  where m.id = p_mission and m.relay_id = (select public.current_user_id()) and m.status = 'open';
  if not found then
    raise exception 'Mission introuvable ou déjà fermée.' using errcode = 'P0002';
  end if;
end;
$$;
comment on function public.mission_not_done(uuid, public.mission_blocker, text) is
  'Le relais dit qu''il n''a pas pu faire sa mission (fermé, pas de prospectus, refus, autre) : elle se ferme, sans paie, avec son motif.';
revoke all on function public.mission_not_done(uuid, public.mission_blocker, text) from public, anon, authenticated;
grant execute on function public.mission_not_done(uuid, public.mission_blocker, text) to authenticated;

-- Le calcul de la paie, unique pour l'administration et le relais -------------------------------------------------------------------------------
create or replace function prive.payable_items_for(p_friday date default null)
returns table (relay_id uuid, kind text, submission_id uuid, amount_xaf integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_friday date := coalesce(
    p_friday,
    ((now() at time zone 'Africa/Brazzaville')::date + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7))
  );
  v_cutoff timestamptz := ((v_friday + 1)::timestamp at time zone 'Africa/Brazzaville');
  v_rate public.payout_rates;
begin
  select r.* into v_rate from public.payout_rates r where r.valid_from <= v_friday order by r.valid_from desc limit 1;
  if not found then
    raise exception 'Aucun tarif ne vaut à cette date.' using errcode = '22023';
  end if;

  return query
  -- les fiches acceptées, sauf celle qui ferme une mission payée (la mission la paie)
  select s.relay_id, 'submission'::text, s.id, v_rate.per_submission_xaf
  from public.field_submissions s
  where s.status = 'accepte' and s.payable and s.kind in ('releve', 'contre_visite')
    and s.decided_at < v_cutoff
    and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)
    and not exists (select 1 from public.missions m
                    where m.closed_by_submission_id = s.id and m.status = 'done' and m.pay_xaf is not null and m.relay_id = s.relay_id)
    and not exists (select 1 from public.payout_lines pl where pl.submission_id = s.id and pl.kind = 'submission')
  union all
  -- les contacts confirmés (pas le secrétariat), tant que leur tarif n'est pas nul
  select s.relay_id, 'contact'::text, s.id, v_rate.per_contact_xaf
  from public.field_submissions s
  where v_rate.per_contact_xaf > 0
    and s.status = 'accepte' and s.contact_confirmed_at is not null and s.contact_confirmed_at < v_cutoff
    and s.contact_role is not null and s.contact_role <> 'secretariat'
    and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)
    and not exists (select 1 from public.payout_lines pl where pl.submission_id = s.id and pl.kind = 'contact')
  union all
  -- les missions faites par le relais qui les avait, au montant fixé en les confiant
  select m.relay_id, 'mission'::text, s.id, m.pay_xaf
  from public.missions m
  join public.field_submissions s on s.id = m.closed_by_submission_id
  where m.status = 'done' and m.pay_xaf is not null and s.relay_id = m.relay_id
    and s.status = 'accepte' and s.decided_at < v_cutoff
    and not exists (select 1 from public.payout_lines pl where pl.submission_id = s.id and pl.kind = 'mission')
  union all
  -- l'essai : trois fiches validées avec NTanova, payées une fois
  select s.relay_id, 'trial_bundle'::text, null::uuid, v_rate.trial_total_xaf
  from public.field_submissions s
  join public.lots l on l.id = s.batch_id and l.essai
  where s.trial_validated_at is not null and s.trial_validated_at < v_cutoff
  group by s.relay_id
  having count(*) >= v_rate.trial_size
     and not exists (select 1 from public.payout_lines pl where pl.relay_id = s.relay_id and pl.kind = 'trial_bundle');
end;
$$;
revoke all on function prive.payable_items_for(date) from public, anon, authenticated;

-- Ce que le relais lit de sa paie : une colonne de plus, les missions (le type de retour change : la fonction est refaite) ---------------------
drop function public.my_payout(date);
create function public.my_payout(p_friday date default null)
returns table (
  friday date, state text, submissions integer, contacts integer, trial_bundles integer, total_xaf integer,
  not_payable integer, has_payment_details boolean, paid_at timestamptz, reference text, missions integer
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := (select public.current_user_id());
  v_friday date := coalesce(
    p_friday,
    ((now() at time zone 'Africa/Brazzaville')::date + ((5 - extract(isodow from (now() at time zone 'Africa/Brazzaville'))::int + 7) % 7))
  );
  v_details boolean;
begin
  if not public.est_relais_actif() then
    return;
  end if;
  v_details := exists (select 1 from prive.relay_payment_details d where d.relay_id = v_me);

  return query
  select v_friday, 'acquis'::text,
         (count(*) filter (where i.kind = 'submission'))::integer,
         (count(*) filter (where i.kind = 'contact'))::integer,
         (count(*) filter (where i.kind = 'trial_bundle'))::integer,
         coalesce(sum(i.amount_xaf), 0)::integer,
         (select count(*)::integer from public.field_submissions s
          where s.relay_id = v_me and s.status = 'accepte' and not s.payable and s.kind in ('releve', 'contre_visite')
            and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)),
         v_details, null::timestamptz, null::text,
         (count(*) filter (where i.kind = 'mission'))::integer
  from prive.payable_items_for(v_friday) i
  where i.relay_id = v_me;

  return query
  select b.friday, (case when st.paid_at is null then 'a_payer' else 'paye' end)::text,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'trial_bundle'),
         st.total_xaf, 0, v_details, st.paid_at, st.reference,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'mission')
  from public.payout_statements st
  join public.payout_batches b on b.id = st.batch_id
  where st.relay_id = v_me
  order by b.friday desc;
end;
$$;
comment on function public.my_payout(date) is
  'La paie du relais connecté : l''acquis du prochain vendredi, puis les semaines closes. Fiches, contacts (0 FCFA depuis le 13/11), essai, missions.';
revoke all on function public.my_payout(date) from public, anon, authenticated;
grant execute on function public.my_payout(date) to authenticated;

drop function public.payout_preview(date);
create function public.payout_preview(p_friday date default null)
returns table (relay_id uuid, first_name text, submissions integer, contacts integer, trial_bundles integer, total_xaf integer,
               has_payment_details boolean, missions integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select r.id, r.prenom,
         (count(*) filter (where i.kind = 'submission'))::integer,
         (count(*) filter (where i.kind = 'contact'))::integer,
         (count(*) filter (where i.kind = 'trial_bundle'))::integer,
         coalesce(sum(i.amount_xaf), 0)::integer,
         exists (select 1 from prive.relay_payment_details d where d.relay_id = r.id),
         (count(*) filter (where i.kind = 'mission'))::integer
  from public.payable_items(p_friday) i
  join public.relais r on r.id = i.relay_id
  group by r.id, r.prenom
  order by r.prenom, r.id;
end;
$$;
revoke all on function public.payout_preview(date) from public, anon, authenticated;
grant execute on function public.payout_preview(date) to authenticated;

drop function public.payout_statements_of(uuid);
create function public.payout_statements_of(p_batch uuid)
returns table (relay_id uuid, first_name text, total_xaf integer, submissions integer, contacts integer, trial_bundles integer,
               operator text, msisdn text, paid_at timestamptz, reference text, missions integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.exiger_admin_session();
  return query
  select s.relay_id, r.prenom, s.total_xaf,
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'trial_bundle'),
         d.operator, d.msisdn::text, s.paid_at, s.reference,
         (select count(*)::integer from public.payout_lines l where l.batch_id = s.batch_id and l.relay_id = s.relay_id and l.kind = 'mission')
  from public.payout_statements s
  join public.relais r on r.id = s.relay_id
  left join prive.relay_payment_details d on d.relay_id = s.relay_id
  where s.batch_id = p_batch
  order by r.prenom, s.relay_id;
end;
$$;
revoke all on function public.payout_statements_of(uuid) from public, anon, authenticated;
grant execute on function public.payout_statements_of(uuid) to authenticated;

-- Ce que le relais lit de ses missions : la tâche, la raison, la date limite et le montant, en plus ---------------------------------------------
drop function public.my_missions();
create function public.my_missions()
returns table (
  mission_id uuid, campus_id uuid, name text, label text, neighbourhood text, school_kind text, cycles text[],
  curriculum_note text, landmark text, sign_phone text, note text, kind text, latitude double precision,
  longitude double precision, verification_state text, photo_roles text[], contact_confirmed boolean,
  task text, reason text, due_on date, pay_xaf integer
)
language sql stable security definer set search_path = '' as $$
  select m.id, c.id, i.name, c.label, c.neighbourhood, i.kind::text,
         coalesce((select array_agg(cc.cycle::text order by cc.cycle) from public.campus_cycles cc where cc.campus_id = c.id), '{}'),
         c.curriculum_note, c.landmark, c.sign_phone::text, m.note, m.kind::text,
         extensions.st_y(c.position), extensions.st_x(c.position), c.verification_state::text,
         coalesce((select array_agg(distinct p.role::text order by p.role::text)
                   from public.field_submission_photos p
                   join public.field_submissions s on s.id = p.submission_id
                   where s.campus_id = c.id and s.status = 'accepte'), '{}'),
         exists (select 1 from public.field_submissions s
                 where s.campus_id = c.id and s.status = 'accepte' and s.contact_confirmed_at is not null),
         m.task, m.reason, m.due_on, m.pay_xaf
  from public.missions m
  join public.campuses c on c.id = m.campus_id
  join public.institutions i on i.id = c.institution_id
  where public.est_relais_actif() and m.status = 'open' and m.relay_id = (select public.current_user_id())
  order by m.created_at;
$$;
comment on function public.my_missions() is
  'Les missions ouvertes du relais connecté : l''école, ce que NTanova en sait, ce qu''il faut faire et pourquoi, la date limite et le montant.';
revoke all on function public.my_missions() from public, anon, authenticated;
grant execute on function public.my_missions() to authenticated;
