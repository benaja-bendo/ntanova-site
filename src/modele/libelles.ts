/** Les mots affichés pour chaque valeur des listes fermées (src/modele/listes.ts). */
import type { Valeur } from './listes';

/** Dans l'ordre de l'écran Ajouter 2/3 : de la crèche au supérieur, la case de sortie en dernier. */
export const libelleNiveau: Record<Valeur<'niveau'>, string> = {
  creche: 'Crèche ou garderie',
  maternelle: 'Maternelle',
  primaire: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
  technique: 'Technique ou professionnel',
  superieur: 'Supérieur',
  autre_formation: 'Autre formation',
};

/** Dans l'ordre de l'écran Ajouter 2/3 : les deux cases de sortie en dernier. */
export const libelleTypeEcole: Record<Valeur<'type_ecole'>, string> = {
  privee: 'Privée',
  publique: 'Publique',
  confessionnelle: 'Confessionnelle',
  communautaire: 'Communautaire',
  autre: 'Autre',
  non_indique: 'Pas indiqué',
};

/**
 * Un type qui dit quelque chose au visiteur. « Pas indiqué » (rien n'est écrit) et « Autre »
 * (c'est écrit, mais ça ne rentre dans aucune case) ne s'écrivent pas sur la fiche : ils
 * rejoignent « Pas encore sur la fiche ».
 */
export function typeInformatif(type: Valeur<'type_ecole'>): boolean {
  return type !== 'non_indique' && type !== 'autre';
}

/** L'intitulé du document officiel d'une école ou d'une filière (ticket 148). */
export const libelleGenreAgrement: Record<Valeur<'accreditation_kind'>, string> = {
  agrement: 'Agrément',
  autorisation_ouverture: 'Autorisation d’ouverture',
  reconnaissance: 'Reconnaissance',
  autre: 'Autre intitulé',
};

export const libelleFonction: Record<Valeur<'fonction_direction'>, string> = {
  promoteur: 'Promoteur ou promotrice',
  directeur_general: 'Directeur général (DG)',
  directeur: 'Directeur ou directrice',
  gestionnaire_comptable: 'Gestionnaire ou comptable',
  secretariat: 'Secrétariat',
  autre: 'Autre',
  enseignant: 'Enseignant ou enseignante',
};

/** La forme courte, pour « Contact : confirmé · promoteur ». */
export const libelleFonctionCourt: Record<Valeur<'fonction_direction'>, string> = {
  promoteur: 'promoteur',
  directeur_general: 'DG',
  directeur: 'directeur',
  gestionnaire_comptable: 'gestionnaire',
  secretariat: 'secrétariat',
  autre: 'autre fonction',
  enseignant: 'enseignant',
};

export const libelleDirection: Record<Valeur<'direction_vue'>, string> = {
  vue: 'Oui',
  absente: 'Absente',
  refus: 'Refus',
};

export const libelleStatutReleve: Record<Valeur<'statut_releve'>, string> = {
  a_valider: 'À valider par NTanova',
  a_corriger: 'À corriger',
  accepte: 'Acceptée',
  refuse: 'Refusée',
};

export const libelleMotif: Record<Valeur<'motif_decision'>, string> = {
  photo_floue: 'La photo est floue.',
  // Une ancienne demande : le lot n'est plus une limite, mais la position reste à reprendre.
  hors_lot: "La position est à reprendre devant l'entrée.",
  doublon: "L'école est déjà relevée.",
  enfant_sur_photo: 'Un enfant est sur la photo.',
  autre: 'Une information est à revoir.',
  position_imprecise: "La position n'est pas celle de l'entrée.",
};

/** Les motifs que l'administration propose, dans cet ordre. `hors_lot` n'y est plus : il ne sert qu'à relire. */
export const motifsProposes: Valeur<'motif_decision'>[] = [
  'photo_floue',
  'position_imprecise',
  'doublon',
  'enfant_sur_photo',
  'autre',
];

/**
 * D'où vient une fiche publiée (ticket #99, décisions du fondateur du 03/11) : confirmée par la
 * direction (l'accord daté), vue sur place par un relais, ou ajoutée par NTanova (aucun relais n'est
 * passé). « Vue sur place » se lit sur la date du relevé (`surveyed_at`), que seule l'acceptation d'un
 * relevé pose : une fiche sans cette date n'est jamais dite vue sur place. Les deux preuves ne se
 * fusionnent pas : la fiche les écrit l'une après l'autre ; une liste n'en montre qu'une, la plus forte.
 */
export type Provenance = 'verifiee' | 'relevee' | 'ajoutee' | 'declaree';

export function provenanceDe(e: {
  origine?: string;
  etat: Valeur<'etat_ecole'>;
  releveeLe: string | null;
  situeeLe: string | null;
}): Provenance {
  if (e.etat === 'verifiee') return 'verifiee';
  if (e.releveeLe !== null) return 'relevee';
  return e.origine === 'school' ? 'declaree' : 'ajoutee';
}

export const libelleProvenance: Record<Provenance, string> = {
  verifiee: 'Confirmée par la direction',
  relevee: 'Vue sur place',
  ajoutee: 'Ajoutée par NTanova',
  declaree: 'Déclarée par l’école',
};

// Le catalogue universel : formations, photos, origine, divisions ------------------------------

/** Les séries du baccalauréat. « f » et « g » : l'enseigne ne dit pas la variante. */
export const libelleSerie: Record<Valeur<'bac_track'>, string> = {
  a: 'Série A',
  c: 'Série C',
  d: 'Série D',
  e: 'Série E',
  f: 'Série F',
  f1: 'Série F1',
  f2: 'Série F2',
  f3: 'Série F3',
  f4: 'Série F4',
  g: 'Série G',
  g1: 'Série G1',
  g2: 'Série G2',
  g3: 'Série G3',
  h: 'Série H',
  autre: 'Autre série',
};

export const libelleDiplome: Record<Valeur<'diploma_kind'>, string> = {
  cepe: 'CEPE',
  bepc: 'BEPC',
  bac: 'Baccalauréat',
  bt: 'BT',
  bts: 'BTS',
  licence: 'Licence',
  master: 'Master',
  doctorat: 'Doctorat',
  cap: 'CAP',
  certificat: 'Certificat',
  autre: 'Autre diplôme',
};

export const libelleRythme: Record<Valeur<'study_rhythm'>, string> = {
  jour: 'Cours du jour',
  soir: 'Cours du soir',
  weekend: 'Cours du week-end',
};

/** Ce que montre une photo, dans les mots du relais. */
export const libelleRolePhoto: Record<Valeur<'photo_role'>, string> = {
  signboard: "L'enseigne ou l'entrée",
  programs_board: 'Le panneau ou l’affiche des formations',
  brochure: 'Le prospectus remis par l’école',
  building: 'Une vue du bâtiment (sans enfant)',
  entrance: 'Le portail',
  courtyard: 'La cour, vide',
  room_empty: 'Une salle ou un équipement, vide',
  sports_ground: 'Le terrain de sport',
  enrollment_poster: 'L’affiche d’inscription',
};

/** Les trois usages des photos facultatives, dans les mots de l'écran Ajouter 1/3. */
export const libelleRolePhotoCourt: Record<Valeur<'photo_role'>, string> = {
  signboard: 'Enseigne ou entrée',
  programs_board: 'Panneau ou affiche des formations',
  brochure: "Prospectus remis par l'école",
  building: 'Autre vue du bâtiment (sans enfant)',
  entrance: 'Portail',
  courtyard: 'Cour (vide)',
  room_empty: 'Salle ou équipement (vide)',
  sports_ground: 'Terrain de sport',
  enrollment_poster: "Affiche d'inscription",
};

export const libelleOrigine: Record<Valeur<'origin_kind'>, string> = {
  field: 'Relevée par un relais',
  admin: 'Ajoutée par NTanova',
  import: 'Importée',
  school: 'Déclarée par l’école',
};

export const libelleGenreDivision: Record<Valeur<'geo_kind'>, string> = {
  country: 'Pays',
  department: 'Département',
  region: 'Région',
  city: 'Ville',
  commune: 'Commune',
  district: 'District',
  arrondissement: 'Arrondissement',
  quarter: 'Quartier',
  zone: 'Zone',
};

export const libelleTypeMission: Record<Valeur<'mission_kind'>, string> = {
  verify: 'Vérifier l’école sur place',
  locate: 'Situer l’école (prendre sa position)',
  complete: 'Compléter la fiche',
};
