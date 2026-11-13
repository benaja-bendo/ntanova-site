-- M10. Lot F du ticket 165 (13/11/2026) : la preuve d'une autorisation téléversée, et la paie détaillée ligne par ligne.
--
-- 1. **La preuve d'une autorisation** : jusqu'ici, la photo de l'arrêté devait venir d'un relevé accepté (`proof_photo_id`). Le
--    fondateur demande aussi de **téléverser** la photo du document depuis l'admin. Le fichier se range sous
--    `ecoles/<site>/preuves/` (la règle de stockage d'ajout de l'administration couvre déjà `ecoles/`) ; il n'est **jamais public** :
--    la seule règle de lecture publique du seau lit `public_campus_media`, où une preuve n'entre jamais. La page publique écrit
--    seulement « vue sur le document » ou « dite par l'école », jamais « reconnue par l'État ».
--    `set_accreditation_evidence` gagne `p_proof_path` (les appels d'avant marchent toujours) et rend le chemin du fichier
--    remplacé, que l'admin efface du stockage. La suppression définitive d'une école emporte aussi ses preuves.
-- 2. **« Ma paie » détaillée** : `my_payout` rend en plus `lines`, une ligne par genre et par tarif (« 3 × 500 FCFA »), avec les
--    fiches qu'elle paie : de quoi écrire une facture claire et dire, sur une fiche, ce qu'elle rapporte. Les colonnes d'avant
--    ne changent pas : le téléphone d'avant la mise à jour lit toujours sa paie.

-- 1. La preuve téléversée ----------------------------------------------------------------------------------------------------------------------------
alter table public.campus_accreditations
  add column proof_path text
    check (proof_path ~ '^ecoles/[0-9a-f-]{36}/preuves/[a-z0-9][a-z0-9_.-]{0,120}$'),
  add constraint campus_accreditations_fichier_de_preuve check (proof_path is null or evidence = 'photo'),
  add constraint campus_accreditations_une_seule_preuve check (proof_path is null or proof_photo_id is null);
comment on column public.campus_accreditations.proof_path is
  'La photo du document, téléversée par l''administration (photo de travail, jamais publique), sous ecoles/<site>/preuves/.';

drop function public.set_accreditation_evidence(uuid, text, uuid);
create function public.set_accreditation_evidence(
  p_accreditation uuid, p_evidence text, p_proof_photo uuid default null, p_proof_path text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_campus uuid;
  v_ancien text;
begin
  select a.campus_id, a.proof_path into v_campus, v_ancien from public.campus_accreditations a where a.id = p_accreditation for update;
  if not found then raise exception 'Agrément introuvable.' using errcode = 'P0002'; end if;
  perform public.exiger_gestion_site(v_campus);
  if p_evidence is not null and p_evidence not in ('photo', 'document_vu', 'dit_ecole')
     or ((p_proof_photo is not null or p_proof_path is not null) and p_evidence is distinct from 'photo')
     or (p_proof_photo is not null and p_proof_path is not null) then
    raise exception 'La preuve est une photo du document (d''un relevé ou téléversée), le document vu sur place, ou l''école qui le dit.' using errcode = '22023';
  end if;
  if p_proof_photo is not null and not exists (
    select 1 from public.field_submission_photos ph join public.field_submissions s on s.id = ph.submission_id
    where ph.id = p_proof_photo and s.campus_id = v_campus and s.status = 'accepte' and not ph.is_public
  ) then
    raise exception 'La photo doit venir d''un relevé accepté de ce site, et rester privée.' using errcode = '22023';
  end if;
  if p_proof_path is not null and p_proof_path !~ ('^ecoles/' || v_campus::text || '/preuves/') then
    raise exception 'Le fichier de la preuve se range sous ecoles/<site>/preuves/.' using errcode = '22023';
  end if;
  update public.campus_accreditations a
  set evidence = p_evidence, proof_photo_id = p_proof_photo, proof_path = p_proof_path
  where a.id = p_accreditation;
  insert into prive.campus_accreditation_history (accreditation_id, campus_id, action, after_data, recorded_by)
  values (p_accreditation, v_campus, 'modification',
          jsonb_build_object('evidence', p_evidence, 'proof_photo_id', p_proof_photo, 'proof_path', p_proof_path),
          public.current_user_id());
  -- Le fichier remplacé (ou retiré) : l'admin l'efface du stockage.
  return case when v_ancien is distinct from p_proof_path then v_ancien end;
end;
$$;
comment on function public.set_accreditation_evidence(uuid, text, uuid, text) is
  'La preuve d''un agrément : photo du document (d''un relevé accepté, ou téléversée sous ecoles/<site>/preuves/), document vu, ou dit par l''école. Rend le fichier remplacé.';
revoke all on function public.set_accreditation_evidence(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_accreditation_evidence(uuid, text, uuid, text) to authenticated;

-- Retirer un agrément rend le fichier de sa preuve, que l'admin efface ; le reste ne change pas.
drop function public.remove_campus_accreditation(uuid);
create function public.remove_campus_accreditation(p_accreditation uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_avant jsonb; v_campus uuid; v_fichier text;
begin
  perform public.exiger_admin_session();
  delete from public.campus_accreditations a where a.id = p_accreditation
  returning to_jsonb(a), a.campus_id, a.proof_path into v_avant, v_campus, v_fichier;
  if not found then raise exception 'Agrément introuvable.' using errcode = 'P0002'; end if;
  update public.campuses set updated_at = now() where id = v_campus;
  insert into prive.campus_accreditation_history (accreditation_id, campus_id, action, before_data, recorded_by)
  values (p_accreditation, v_campus, 'retrait', v_avant, public.current_user_id());
  return v_fichier;
end;
$$;
revoke all on function public.remove_campus_accreditation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.remove_campus_accreditation(uuid) to authenticated;

-- La suppression définitive d'une école emporte aussi les fichiers de ses preuves.
create or replace function public.campus_purge_preview(p_campus uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_nom text;
  v_corbeille boolean;
  v_institution uuid;
  v_ids uuid[];
  v_bloque text;
  v_chemins jsonb;
  v_medias jsonb;
begin
  perform public.exiger_admin_session();
  select i.name || coalesce(' — ' || c.label, ''), c.trashed_at is not null, c.institution_id
    into v_nom, v_corbeille, v_institution
  from public.campuses c join public.institutions i on i.id = c.institution_id
  where c.id = p_campus;
  if not found then
    raise exception 'Cette école est introuvable.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(s.id), '{}') into v_ids
  from public.field_submissions s
  where s.campus_id = p_campus or s.duplicate_of_campus_id = p_campus;

  v_bloque := case
    when not v_corbeille then 'Mets l''école à la corbeille d''abord.'
    when exists (select 1 from public.payout_lines pl where pl.submission_id = any (v_ids)) then
      'Une fiche de cette école figure dans la paie d''un relais : l''école reste à la corbeille.'
    when exists (
      select 1 from public.field_submissions s
      where s.id = any (v_ids) and s.status in ('a_valider', 'a_corriger')
    ) then 'Un envoi en attente concerne cette école : décide-le d''abord.'
    when exists (select 1 from public.campuses o where o.replaced_by_campus_id = p_campus) then
      'Des fiches fusionnées renvoient vers cette école : elle ne se supprime pas.'
  end;

  select coalesce(jsonb_agg(p.storage_path), '[]'::jsonb) into v_chemins
  from public.field_submission_photos p where p.submission_id = any (v_ids);
  select coalesce(jsonb_agg(x.chemin), '[]'::jsonb) into v_medias
  from (
    select unnest(array_remove(array[m.storage_path, m.thumb_path], null)) as chemin
    from public.campus_media m
    where m.source_photo_id is null
      and (m.campus_id = p_campus
           or (m.institution_id = v_institution
               and not exists (select 1 from public.campuses o where o.institution_id = v_institution and o.id <> p_campus)))
    union all
    select a.proof_path from public.campus_accreditations a where a.campus_id = p_campus and a.proof_path is not null
  ) x;

  return jsonb_build_object(
    'name', v_nom,
    'trashed', v_corbeille,
    'blocked', v_bloque,
    'submissions', cardinality(v_ids),
    'photos', jsonb_array_length(v_chemins),
    'media', jsonb_array_length(v_medias),
    'contacts', (select count(*) from prive.direction_contacts d where d.submission_id = any (v_ids)),
    'paths', v_chemins || v_medias
  );
end;
$$;

-- 2. « Ma paie » détaillée ---------------------------------------------------------------------------------------------------------------------------
drop function public.my_payout(date);
create function public.my_payout(p_friday date default null)
returns table (
  friday date, state text, submissions integer, contacts integer, trial_bundles integer, total_xaf integer,
  not_payable integer, has_payment_details boolean, paid_at timestamptz, reference text, missions integer, lines jsonb
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
  with items as (select i.* from prive.payable_items_for(v_friday) i where i.relay_id = v_me)
  select v_friday, 'acquis'::text,
         (select count(*)::integer from items i where i.kind = 'submission'),
         (select count(*)::integer from items i where i.kind = 'contact'),
         (select count(*)::integer from items i where i.kind = 'trial_bundle'),
         (select coalesce(sum(i.amount_xaf), 0)::integer from items i),
         (select count(*)::integer from public.field_submissions s
          where s.relay_id = v_me and s.status = 'accepte' and not s.payable and s.kind in ('releve', 'contre_visite')
            and not exists (select 1 from public.lots l where l.id = s.batch_id and l.essai)),
         v_details, null::timestamptz, null::text,
         (select count(*)::integer from items i where i.kind = 'mission'),
         coalesce((
           select jsonb_agg(jsonb_build_object('kind', g.kind, 'unit_xaf', g.amount_xaf, 'count', g.n, 'submissions', g.ids)
                            order by g.ordre, g.amount_xaf desc)
           from (select i.kind, i.amount_xaf, count(*)::integer as n,
                        coalesce(jsonb_agg(i.submission_id) filter (where i.submission_id is not null), '[]'::jsonb) as ids,
                        array_position(array['submission', 'mission', 'contact', 'trial_bundle'], i.kind) as ordre
                 from items i group by i.kind, i.amount_xaf) g
         ), '[]'::jsonb);

  return query
  select b.friday, (case when st.paid_at is null then 'a_payer' else 'paye' end)::text,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'submission'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'contact'),
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'trial_bundle'),
         st.total_xaf, 0, v_details, st.paid_at, st.reference,
         (select count(*)::integer from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id and l.kind = 'mission'),
         coalesce((
           select jsonb_agg(jsonb_build_object('kind', g.kind, 'unit_xaf', g.amount_xaf, 'count', g.n, 'submissions', g.ids)
                            order by g.ordre, g.amount_xaf desc)
           from (select l.kind, l.amount_xaf, count(*)::integer as n,
                        coalesce(jsonb_agg(l.submission_id) filter (where l.submission_id is not null), '[]'::jsonb) as ids,
                        array_position(array['submission', 'mission', 'contact', 'trial_bundle'], l.kind) as ordre
                 from public.payout_lines l where l.batch_id = st.batch_id and l.relay_id = st.relay_id
                 group by l.kind, l.amount_xaf) g
         ), '[]'::jsonb)
  from public.payout_statements st
  join public.payout_batches b on b.id = st.batch_id
  where st.relay_id = v_me
  order by b.friday desc;
end;
$$;
comment on function public.my_payout(date) is
  'La paie du relais connecté : l''acquis du prochain vendredi, puis les semaines closes. Fiches, contacts, essai, missions, et `lines` : une ligne par genre et par tarif, avec les fiches qu''elle paie.';
revoke all on function public.my_payout(date) from public, anon, authenticated;
grant execute on function public.my_payout(date) to authenticated;
