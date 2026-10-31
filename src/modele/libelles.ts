/** Les mots affichés pour chaque valeur des listes fermées (src/modele/listes.ts). */
import type { Valeur } from './listes';

export const libelleNiveau: Record<Valeur<'niveau'>, string> = {
  maternelle: 'Maternelle',
  primaire: 'Primaire',
  college: 'Collège',
  lycee: 'Lycée',
  technique: 'Technique',
  superieur: 'Supérieur',
};

/** Dans l'ordre de l'écran Ajouter 2/3. */
export const libelleTypeEcole: Record<Valeur<'type_ecole'>, string> = {
  privee: 'Privée',
  publique: 'Publique',
  confessionnelle: 'Confessionnelle',
  non_indique: 'Pas indiqué',
};

export const libelleFonction: Record<Valeur<'fonction_direction'>, string> = {
  promoteur: 'Promoteur ou promotrice',
  directeur_general: 'Directeur général (DG)',
  directeur: 'Directeur ou directrice',
  gestionnaire_comptable: 'Gestionnaire ou comptable',
  secretariat: 'Secrétariat',
  autre: 'Autre',
};

/** La forme courte, pour « Contact : confirmé · promoteur ». */
export const libelleFonctionCourt: Record<Valeur<'fonction_direction'>, string> = {
  promoteur: 'promoteur',
  directeur_general: 'DG',
  directeur: 'directeur',
  gestionnaire_comptable: 'gestionnaire',
  secretariat: 'secrétariat',
  autre: 'autre fonction',
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
  hors_lot: "L'école est hors de votre lot.",
  doublon: "L'école est déjà relevée.",
  enfant_sur_photo: 'Un enfant est sur la photo.',
  autre: 'Une information est à revoir.',
};
