-- La « Vue d'ensemble » de l'administration (ticket #76) : où en est le relevé, en un appel.
--
-- Jusqu'ici, aucun écran ne disait le rythme, la qualité ni les files qui vieillissent : les chiffres se tiraient par SQL.
-- Cette fonction rend les agrégats d'un coup. Elle ne contient AUCUN seuil ni objectif (les hypothèses de mesure vivent
-- ailleurs, jamais dans le code ni la base) : des nombres, que le fondateur compare. Lecture seule, administration seule.
--
-- Les écoles par zone ouverte ne sont pas ici : `divisions()` les rend déjà, avec leurs cumuls (les écoles relevées par un
-- relais ne se mélangent pas à celles qu'on a importées ou ajoutées). La vue d'ensemble appelle les deux.
--
-- Ce qu'elle ne sait pas, volontairement : la dernière ouverture de l'application d'un relais (aucune colonne ne la
-- garde ; `relais.active_le` est la date d'ACTIVATION). « Relais actif cette semaine » veut donc dire « a envoyé une
-- fiche cette semaine ».
--
-- `security invoker` : les règles d'accès de l'administration s'appliquent comme ailleurs ; `exiger_admin()` refuse tout
-- autre appelant. Les jours se comptent à l'heure de Pointe-Noire (Africa/Brazzaville, UTC+1), pas en UTC : une fiche de
-- 0 h 30 appartient au jour qui commence.

create function public.admin_overview(p_days integer default 14) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 14), 90));
  v_now timestamptz := now();
  v_today date := (now() at time zone 'Africa/Brazzaville')::date;
begin
  perform public.exiger_admin();
  return jsonb_build_object(
    'generated_at', v_now,
    -- La file : combien attendent, depuis quand, et combien depuis plus de 24 heures (la promesse faite aux relais).
    'to_review', (
      select jsonb_build_object(
        'count', count(*),
        'oldest_received_at', min(s.received_at),
        'over_24h', count(*) filter (where s.received_at < v_now - interval '24 hours'))
      from public.field_submissions s where s.status = 'a_valider'),
    -- Les relevés reçus par jour, les jours sans relevé compris ; le lot d'essai à part.
    'received_per_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', j.jour, 'total', coalesce(t.total, 0), 'trial', coalesce(t.trial, 0))
                                order by j.jour), '[]'::jsonb)
      from (select (v_today - g)::date as jour from generate_series(0, v_days - 1) g) j
      left join (
        select (s.received_at at time zone 'Africa/Brazzaville')::date as jour,
               count(*)::integer as total,
               (count(*) filter (where coalesce(l.essai, false)))::integer as trial
        from public.field_submissions s
        left join public.lots l on l.id = s.batch_id
        group by 1) t on t.jour = j.jour),
    -- Le délai entre la réception et la décision, sur les 30 derniers jours.
    'decisions', (
      select jsonb_build_object(
        'count', count(*),
        'average_hours', round((avg(extract(epoch from s.decided_at - s.received_at) / 3600))::numeric, 1))
      from public.field_submissions s
      where s.decided_at is not null and s.decided_at >= v_now - interval '30 days'),
    -- La qualité : parmi les nouvelles fiches des 30 derniers jours, combien sont arrivées avec la photo de l'enseigne.
    'signboard', (
      select jsonb_build_object(
        'with_photo', (count(*) filter (where exists (
          select 1 from public.field_submission_photos p where p.submission_id = s.id and p.role = 'signboard')))::integer,
        'total', count(*))
      from public.field_submissions s
      where s.kind = 'releve' and s.received_at >= v_now - interval '30 days'),
    'contacts', (
      select jsonb_build_object(
        'confirmed_total', count(*),
        'confirmed_7d', count(*) filter (where s.contact_confirmed_at >= v_now - interval '7 days'))
      from public.field_submissions s where s.contact_confirmed_at is not null),
    'relays', jsonb_build_object(
      'active', (select count(*) from public.relais where statut = 'actif'),
      'pending', (select count(*) from public.relais where statut = 'en_attente'),
      'suspended', (select count(*) from public.relais where statut = 'suspendu'),
      'sent_this_week', (select count(distinct s.relay_id) from public.field_submissions s
                         where s.received_at >= v_now - interval '7 days'))
  );
end;
$$;

comment on function public.admin_overview(integer) is
  'Les agrégats de la vue d''ensemble de l''administration. Aucun seuil, lecture seule, administration seule.';

revoke all on function public.admin_overview(integer) from public, anon;
grant execute on function public.admin_overview(integer) to authenticated;
