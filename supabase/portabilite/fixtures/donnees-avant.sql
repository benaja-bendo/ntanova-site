-- Un jeu de données dans l'ancien modèle (avant le catalogue multi-campus), pour vérifier que la migration ne perd rien.
-- Chargé après les migrations jusqu'au 20261101180100 (celles de la PR n° 53 comprises), avant les nouvelles.
-- Données fictives seulement.

insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000000a1', 'a@exemple.test', 'authenticated', 'authenticated', '{"provider":"google"}', '{"given_name":"Alice","provider_id":"google-a1"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'b@exemple.test', 'authenticated', 'authenticated', '{"provider":"google"}', '{"given_name":"Bastien","provider_id":"google-b1"}'),
  ('00000000-0000-4000-8000-0000000000d1', 'd@exemple.test', 'authenticated', 'authenticated', '{"provider":"google"}', '{"given_name":"Dominique","provider_id":"google-d1"}');
insert into prive.admins (id) values ('00000000-0000-4000-8000-0000000000d1');
select public.activer_relais('00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'));
select public.activer_relais('00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'));

-- Des écoles : publiée (relevée), prête avec programme, brouillon importé sans arrondissement, ajoutée par l'administration, retirée (doublon)
insert into public.ecoles (id, arrondissement_id, slug, nom, quartier, type_ecole, niveaux, repere, numero_enseigne, position, etat, publication,
                           programme, relevee_le, situee_le, situee_par, publiee_le) values
  ('e1000000-0000-4000-8000-000000000001', (select id from public.arrondissements where slug = 'tie-tie'), 'complexe-etoile', 'Complexe [Étoile]', 'Mayanga', 'privee',
   '{maternelle,primaire}', 'Près du marché', '242060000001', extensions.st_setsrid(extensions.st_makepoint(11.93, -4.80), 4326), 'relevee', 'publiee',
   null, timestamptz '2026-11-02 10:00+01', null, null, timestamptz '2026-11-02 12:00+01'),
  ('e1000000-0000-4000-8000-000000000002', (select id from public.arrondissements where slug = 'ngoyo'), 'ecole-ocean', 'École [Océan]', null, 'publique',
   '{primaire,college}', null, null, extensions.st_setsrid(extensions.st_makepoint(11.90, -4.86), 4326), 'relevee', 'prete',
   'Programme congolais', timestamptz '2026-11-02 11:00+01', null, null, null),
  ('e1000000-0000-4000-8000-000000000003', null, 'ecole-importee', 'École [Importée]', null, 'non_indique',
   '{}', null, null, null, 'relevee', 'brouillon', null, null, null, null, null),
  ('e1000000-0000-4000-8000-000000000004', (select id from public.arrondissements where slug = 'tie-tie'), 'institut-horizon', 'Institut [Horizon]', null, 'privee',
   '{technique,superieur}', null, null, extensions.st_setsrid(extensions.st_makepoint(11.94, -4.81), 4326), 'relevee', 'publiee',
   null, null, timestamptz '2026-11-01 20:00+01', '00000000-0000-4000-8000-0000000000d1', timestamptz '2026-11-01 21:00+01'),
  ('e1000000-0000-4000-8000-000000000005', (select id from public.arrondissements where slug = 'tie-tie'), 'complexe-etoile-2', 'Complexe [Étoile] (doublon)', null, 'privee',
   '{primaire}', null, null, extensions.st_setsrid(extensions.st_makepoint(11.9301, -4.8001), 4326), 'relevee', 'brouillon', null, null, null, null, null);
update public.ecoles set publication = 'retiree', retiree_le = now(), motif_retrait = 'doublon', remplacee_par = 'e1000000-0000-4000-8000-000000000001'
where id = 'e1000000-0000-4000-8000-000000000005';
insert into prive.ecoles_sources (ecole_id, reference) values ('e1000000-0000-4000-8000-000000000003', 'ETB-777');
insert into public.ecoles_confiees (ecole_id, relais_id, note) values ('e1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', 'Situer l''entrée.');
insert into public.echanges (ecole_id, premier_message_le, relances) values ('e1000000-0000-4000-8000-000000000001', date '2026-11-03', 1);

-- Des relevés : accepté (avec contact et photo), à valider, refusé ; une contre-visite
insert into public.releves (id, relais_id, lot_id, type, position, precision_m, pris_le, nom_enseigne, niveaux, type_ecole, programme, repere, numero_enseigne,
                            direction, fiche_liaison_remise, repasser, statut, ecole_id, decide_le, contact_confirme_le, contact_fonction) values
  ('f1000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'), 'releve',
   extensions.st_setsrid(extensions.st_makepoint(11.93, -4.80), 4326), 8, timestamptz '2026-11-02 10:00+01', 'Complexe [Étoile]', '{maternelle,primaire}', 'privee',
   null, 'Près du marché', '242060000001', 'vue', true, null, 'accepte', 'e1000000-0000-4000-8000-000000000001', timestamptz '2026-11-02 12:00+01',
   timestamptz '2026-11-03 09:00+01', 'directeur'),
  ('f1000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000b1', (select id from public.lots where nom = 'Ngoyo'), 'releve',
   extensions.st_setsrid(extensions.st_makepoint(11.90, -4.86), 4326), 12, timestamptz '2026-11-02 11:00+01', 'École [Océan]', '{primaire,college}', 'publique',
   'Programme congolais', null, null, 'absente', false, 'Repasser mardi', 'accepte', 'e1000000-0000-4000-8000-000000000002', timestamptz '2026-11-02 13:00+01', null, null),
  ('f1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'), 'releve',
   extensions.st_setsrid(extensions.st_makepoint(11.95, -4.82), 4326), 20, timestamptz '2026-11-03 10:00+01', 'École [À valider]', '{lycee}', 'non_indique',
   null, null, null, 'refus', false, null, 'a_valider', null, null, null, null),
  ('f1000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000a1', (select id from public.lots where nom = 'Tié-Tié'), 'releve',
   extensions.st_setsrid(extensions.st_makepoint(11.96, -4.83), 4326), 30, timestamptz '2026-11-03 11:00+01', 'École [Refusée]', '{}', 'non_indique',
   null, null, null, 'vue', false, null, 'refuse', null, timestamptz '2026-11-03 15:00+01', null, null);
update public.releves set motif = 'photo_floue', message_au_relais = 'Photo floue.' where id = 'f1000000-0000-4000-8000-000000000004';
insert into prive.contacts_direction (releve_id, fonction, nom, whatsapp, accord_contact, accord_le, ce_qui_a_ete_dit)
values ('f1000000-0000-4000-8000-000000000001', 'directeur', '[Nom]', '242060000099', true, timestamptz '2026-11-02 10:30+01', 'Rappeler mardi.');
insert into prive.effacements (quoi, releve_id, par, note) values ('contact', 'f1000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000d1', 'Demande de la direction');
insert into prive.effacements (quoi, ecole_id, par, note) values ('fusion', 'e1000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-0000000000d1', 'Fusionnée dans e1');
-- La photo du relevé accepté est dans le seau, à l'ancien chemin
insert into storage.objects (bucket_id, name, metadata) values ('releves', 'f1000000-0000-4000-8000-000000000001/enseigne.jpg', '{"size": 180000}');
