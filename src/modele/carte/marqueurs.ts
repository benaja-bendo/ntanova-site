/**
 * Les marqueurs d'école sur la carte interactive (ticket 103, décisions du 03/11 : le canal de la forme dit la preuve,
 * la lettre et la couleur disent le cycle le plus élevé ; les deux se lisent sans la couleur).
 *
 * - une **épingle** pour une école vue sur place ; la même épingle avec un **écusson à coche** pour une école confirmée
 *   par sa direction (jamais fusionnées) ;
 * - la **lettre** (M, P, C, L, T, S) et la couleur du cycle ; une école dont aucun niveau n'est noté a une épingle neutre
 *   et pas de lettre.
 *
 * Le style ne fait que NOMMER l'image d'un marqueur (`icon-image`) ; l'îlot la dessine au moment où MapLibre la demande
 * (`styleimagemissing`), avec les couleurs des jetons : aucune couleur n'est écrite dans le code.
 */
export const LETTRES_DES_CYCLES = ['M', 'P', 'C', 'L', 'T', 'S'] as const;
export type LettreDeCycle = (typeof LETTRES_DES_CYCLES)[number];

/** Le jeton de `jetons.css` qui donne la couleur d'un cycle. */
export const JETON_DU_CYCLE: Record<LettreDeCycle, string> = {
  M: 'cycle-maternelle',
  P: 'cycle-primaire',
  C: 'cycle-college',
  L: 'cycle-lycee',
  T: 'cycle-technique',
  S: 'cycle-superieur',
};

/** Les images que le style demande à l'îlot de dessiner. */
export const IMAGE_ECUSSON = 'ecusson';
export const IMAGE_HACHURES = 'hachures';

const PREFIXE = 'epingle-';
const SUFFIXE_CONFIRMEE = '-confirmee';
const NEUTRE = 'neutre';

export function estUneLettreDeCycle(texte: string | null | undefined): texte is LettreDeCycle {
  return (LETTRES_DES_CYCLES as readonly string[]).includes(texte ?? '');
}

/** Le nom de l'image d'un marqueur : `epingle-P`, `epingle-P-confirmee`, `epingle-neutre`. */
export function nomDeLEpingle(lettre: string | null | undefined, confirmee: boolean): string {
  return `${PREFIXE}${estUneLettreDeCycle(lettre) ? lettre : NEUTRE}${confirmee ? SUFFIXE_CONFIRMEE : ''}`;
}

/** L'inverse : ce qu'il faut dessiner pour ce nom ; rien quand le nom n'est pas celui d'un marqueur. */
export function lireLEpingle(
  nom: string,
): { lettre: LettreDeCycle | null; confirmee: boolean } | null {
  if (!nom.startsWith(PREFIXE)) return null;
  const confirmee = nom.endsWith(SUFFIXE_CONFIRMEE);
  const lettre = nom.slice(PREFIXE.length, confirmee ? -SUFFIXE_CONFIRMEE.length : undefined);
  if (lettre === NEUTRE) return { lettre: null, confirmee };
  return estUneLettreDeCycle(lettre) ? { lettre, confirmee } : null;
}
