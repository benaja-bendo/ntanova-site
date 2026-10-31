-- Qui a le droit de quoi. Tout est d'abord retiré, puis donné table par table :
-- en local, Supabase donne par défaut tous les droits sur les nouvelles tables à
-- `anon` et `authenticated` ; en ligne, il n'en donne aucun. Ainsi les deux bases
-- ont exactement les mêmes droits. Les tests pgTAP (supabase/tests/) les vérifient.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke all on all tables in schema prive from public, anon, authenticated;

-- Les règles d'accès sont actives sur toutes les tables, même celles que l'API ne voit pas.
alter table public.arrondissements enable row level security;
alter table public.lots enable row level security;
alter table public.relais enable row level security;
alter table public.ecoles enable row level security;
alter table public.releves enable row level security;
alter table public.echanges enable row level security;
alter table public.erreurs enable row level security;
alter table prive.admins enable row level security;
alter table prive.contacts_direction enable row level security;

-- Les fonctions utiles aux règles et à l'application ------------------------

grant execute on function
  public.est_admin(),
  public.est_relais_actif(),
  public.mon_lot(),
  public.exiger_admin(),
  public.contact_recu(uuid),
  public.slugifier(text),
  public.envoyer_contact(uuid, public.fonction_direction, text, public.telephone, boolean, timestamptz, text),
  public.accepter_releve(uuid, uuid),
  public.demander_correction(uuid, public.motif_decision, text),
  public.refuser_releve(uuid, public.motif_decision, text),
  public.confirmer_contact(uuid, public.fonction_direction),
  public.activer_relais(uuid, uuid),
  public.contact_du_releve(uuid)
to authenticated;

-- Arrondissements : publics ---------------------------------------------------

grant select on public.arrondissements to anon, authenticated;
create policy "Tout le monde lit les arrondissements"
  on public.arrondissements for select to anon, authenticated
  using (true);

-- Écoles : le public lit les fiches publiées ; l'administration fait tout ------

grant select on public.ecoles to anon, authenticated;
grant insert, update, delete on public.ecoles to authenticated;
grant select on public.ecoles_publiees to anon, authenticated;

create policy "Tout le monde lit les écoles publiées"
  on public.ecoles for select to anon, authenticated
  using (publication = 'publiee');
create policy "L'administration gère les écoles"
  on public.ecoles for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Lots : le relais actif lit le sien ------------------------------------------

grant select on public.lots to authenticated;
grant insert, update, delete on public.lots to authenticated;

create policy "Le relais actif lit son lot"
  on public.lots for select to authenticated
  using ((select public.est_relais_actif()) and id = (select public.mon_lot()));
create policy "L'administration gère les lots"
  on public.lots for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Relais : chacun lit sa ligne (même en attente) ; l'administration les gère ---

grant select on public.relais to authenticated;
grant update (prenom, statut, lot_id, active_le) on public.relais to authenticated;

create policy "Le relais lit sa ligne"
  on public.relais for select to authenticated
  using (id = (select auth.uid()));
create policy "L'administration lit les relais"
  on public.relais for select to authenticated
  using ((select public.est_admin()));
create policy "L'administration modifie les relais"
  on public.relais for update to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Relevés : le relais actif crée les siens et les relit ; jamais ceux des autres -

grant select on public.releves to authenticated;
-- Seulement les colonnes que le téléphone remplit : ni l'auteur, ni le statut, ni les calculs.
grant insert (
  id, lot_id, type, corrige_releve_id,
  position, precision_m, pris_le, reponse_doublon, doublon_de,
  nom_enseigne, niveaux, type_ecole, repere, numero_enseigne,
  direction, fiche_liaison_remise, code_liaison, repasser
) on public.releves to authenticated;
-- Pour l'administration (les règles ci-dessous écartent les relais).
grant update (
  lot_id, statut, motif, message_au_relais, decide_le, ecole_id,
  contact_confirme_le, contact_fonction
) on public.releves to authenticated;
grant select on public.releves_a_valider to authenticated;

create policy "Le relais lit ses relevés"
  on public.releves for select to authenticated
  using (relais_id = (select auth.uid()));
create policy "Le relais actif envoie ses relevés"
  on public.releves for insert to authenticated
  with check (relais_id = (select auth.uid()) and (select public.est_relais_actif()));
create policy "L'administration lit les relevés"
  on public.releves for select to authenticated
  using ((select public.est_admin()));
create policy "L'administration décide"
  on public.releves for update to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Échanges : l'administration seule -------------------------------------------

grant select, insert, update, delete on public.echanges to authenticated;
create policy "L'administration gère les échanges"
  on public.echanges for all to authenticated
  using ((select public.est_admin()))
  with check ((select public.est_admin()));

-- Erreurs : tout relais connecté écrit, l'administration lit ------------------

grant insert (id, survenue_le, ecran, code, detail, version_app, appareil)
  on public.erreurs to authenticated;
grant select on public.erreurs to authenticated;

create policy "Le relais signale ses erreurs"
  on public.erreurs for insert to authenticated
  with check (relais_id = (select auth.uid()));
create policy "L'administration lit les erreurs"
  on public.erreurs for select to authenticated
  using ((select public.est_admin()));

-- Les photos des relevés ------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('releves', 'releves', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- Chemin : <id du relevé>/enseigne.jpg, pour un relevé déjà reçu et envoyé par ce relais.
-- Sans écrasement : un second envoi de la même photo est refusé (« déjà reçu »).
create policy "Le relais actif envoie la photo de son relevé"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'releves'
    and storage.filename(name) = 'enseigne.jpg'
    and (select public.est_relais_actif())
    and exists (
      select 1 from public.releves r
      where r.id::text = (storage.foldername(name))[1]
        and r.relais_id = (select auth.uid())
    )
  );
create policy "L'administration voit les photos des relevés"
  on storage.objects for select to authenticated
  using (bucket_id = 'releves' and (select public.est_admin()));
