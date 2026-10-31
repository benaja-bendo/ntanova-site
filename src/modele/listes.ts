/**
 * Les listes fermées, copie de celles de la base (domaines SQL des migrations, dont
 * 20261031010000_tables.sql et 20261031190000_types_niveaux_programme.sql). Un test
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
