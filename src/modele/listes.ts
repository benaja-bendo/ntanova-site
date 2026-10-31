/**
 * Les listes fermées, copie de celles de la base (domaines SQL de
 * supabase/migrations/20261031010000_tables.sql). Un test vérifie qu'elles
 * restent identiques : changer une liste, c'est changer les deux.
 */
export const listes = {
  type_ecole: ['publique', 'privee', 'confessionnelle', 'non_indique'],
  niveau: ['maternelle', 'primaire', 'college', 'lycee', 'technique', 'superieur'],
  fonction_direction: [
    'promoteur',
    'directeur_general',
    'directeur',
    'gestionnaire_comptable',
    'secretariat',
    'autre',
  ],
  motif_decision: ['photo_floue', 'hors_lot', 'doublon', 'enfant_sur_photo', 'autre'],
  statut_releve: ['a_valider', 'a_corriger', 'accepte', 'refuse'],
  type_releve: ['releve', 'correction', 'contre_visite'],
  statut_relais: ['en_attente', 'actif', 'suspendu'],
  direction_vue: ['vue', 'absente', 'refus'],
  reponse_doublon: ['la_meme', 'une_autre'],
  etat_ecole: ['relevee', 'verifiee'],
  publication: ['brouillon', 'prete', 'publiee', 'retiree'],
  motif_retrait: ['demande_ecole', 'erreur', 'fermeture', 'doublon', 'autre'],
  type_echange: ['appel', 'rendez_vous'],
} as const;

export type Liste = keyof typeof listes;
export type Valeur<L extends Liste> = (typeof listes)[L][number];
