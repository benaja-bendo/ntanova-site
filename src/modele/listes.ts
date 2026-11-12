/**
 * Les listes fermées, copie de celles de la base (domaines SQL des migrations, dont
 * 20261031010000_tables.sql, 20261031190000_types_niveaux_programme.sql et
 * 20261101200000_socle_portable.sql). Un test
 * vérifie qu'elles restent identiques : changer une liste, c'est changer les deux.
 *
 * Une liste a toujours une case de sortie (« autre », « non_indique »), on n'y retire et
 * on n'y renomme jamais une valeur (pour changer un mot, on change le libellé), et les
 * lectures sont tolérantes (voir `typeConnu` et `niveauxConnus`). La recette pour ajouter
 * une valeur : supabase/schema.md, « Les listes ».
 */
export const listes = {
  type_ecole: ['publique', 'privee', 'confessionnelle', 'communautaire', 'autre', 'non_indique'],
  niveau: [
    'creche',
    'maternelle',
    'primaire',
    'college',
    'lycee',
    'technique',
    'superieur',
    'autre_formation',
  ],
  fonction_direction: [
    'promoteur',
    'directeur_general',
    'directeur',
    'gestionnaire_comptable',
    'secretariat',
    'autre',
    'enseignant',
  ],
  motif_decision: [
    'photo_floue',
    'hors_lot',
    'doublon',
    'enfant_sur_photo',
    'autre',
    'position_imprecise',
  ],
  statut_releve: ['a_valider', 'a_corriger', 'accepte', 'refuse'],
  type_releve: ['releve', 'correction', 'contre_visite'],
  statut_relais: ['en_attente', 'actif', 'suspendu'],
  direction_vue: ['vue', 'absente', 'refus'],
  reponse_doublon: ['la_meme', 'une_autre', 'autre_site', 'autre_ecole', 'ne_sait_pas'],
  etat_ecole: ['relevee', 'verifiee'],
  publication: ['brouillon', 'prete', 'publiee', 'retiree'],
  motif_retrait: ['demande_ecole', 'erreur', 'fermeture', 'doublon', 'autre'],
  type_echange: ['appel', 'rendez_vous'],
  // Le catalogue universel (migrations 20261101200000_socle_portable.sql et suivantes) : divisions, formations,
  // photos, origine des fiches, missions.
  geo_kind: [
    'country',
    'department',
    'region',
    'city',
    'commune',
    'district',
    'arrondissement',
    'quarter',
    'zone',
  ],
  bac_track: ['a', 'c', 'd', 'e', 'f', 'f1', 'f2', 'f3', 'f4', 'g', 'g1', 'g2', 'g3', 'h', 'autre'],
  diploma_kind: [
    'cepe',
    'bepc',
    'bac',
    'bt',
    'bts',
    'licence',
    'master',
    'doctorat',
    'cap',
    'certificat',
    'autre',
  ],
  study_rhythm: ['jour', 'soir', 'weekend'],
  photo_role: [
    'signboard',
    'programs_board',
    'brochure',
    'building',
    'entrance',
    'courtyard',
    'room_empty',
    'sports_ground',
    'enrollment_poster',
  ],
  origin_kind: ['field', 'admin', 'import', 'school'],
  mission_kind: ['verify', 'locate', 'complete'],
  mission_status: ['open', 'done', 'cancelled', 'not_done'],
  equipment_key: [
    'electricite',
    'eau',
    'cantine',
    'transport',
    'bibliotheque',
    'informatique',
    'terrain_sport',
    'cloture',
    'autre',
    'toilettes',
  ],
  equipment_state: ['present', 'absent', 'non_precise'],
  fact_source: ['ecole', 'terrain'],
  accreditation_kind: ['agrement', 'autorisation_ouverture', 'reconnaissance', 'autre'],
  // La vitrine, l'admin et l'espace relais (migrations du 13/11/2026, M1 à M8).
  mission_blocker: ['ferme', 'pas_de_prospectus', 'refus', 'autre'],
  media_kind: ['logo', 'cover', 'gallery'],
  media_subject: [
    'logo',
    'enseigne',
    'portail',
    'batiment',
    'cour',
    'salle',
    'terrain',
    'activite',
    'autre',
  ],
  media_source: ['terrain', 'ecole', 'administration'],
  study_shift: ['matin', 'apres_midi', 'journee', 'soir'],
  teaching_language: ['francais', 'anglais', 'lingala', 'kituba', 'autre'],
  request_topic: [
    'logo',
    'frais',
    'agrement',
    'photos',
    'contact',
    'admission',
    'horaires',
    'autre',
  ],
  request_target: ['ecole', 'relais'],
  request_state: ['ouverte', 'obtenue', 'annulee'],
  post_kind: ['evenement', 'inscriptions', 'vie_ecole', 'autre'],
  post_state: ['publiee', 'retiree'],
  selection_kind: ['dossier', 'entretien', 'dossier_entretien', 'concours', 'autre'],
  admission_step: ['dossiers', 'selection', 'resultats', 'rentree'],
} as const;

export type Liste = keyof typeof listes;
export type Valeur<L extends Liste> = (typeof listes)[L][number];

// Des lectures tolérantes ---------------------------------------------------------------
//
// Une valeur que cette version du code ne connaît pas encore (une valeur ajoutée à la base
// entre deux mises en ligne, un téléphone qui n'a pas reçu la mise à jour) ne casse rien et
// ne bloque personne : ni erreur, ni libellé vide, ni écran qui ne répond plus.

/** Un type inconnu se lit « Pas indiqué ». */
export function typeConnu(valeur: string): Valeur<'type_ecole'> {
  return (listes.type_ecole as readonly string[]).includes(valeur)
    ? (valeur as Valeur<'type_ecole'>)
    : 'non_indique';
}

/** Les niveaux que cette version connaît, dans l'ordre de la liste ; les autres sont laissés de côté. */
export function niveauxConnus(valeurs: readonly string[]): Valeur<'niveau'>[] {
  return listes.niveau.filter((niveau) => valeurs.includes(niveau));
}
