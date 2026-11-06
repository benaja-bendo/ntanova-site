/**
 * Les cycles et leur lettre (celle de l'épingle, du disque et des puces) : la plus petite pièce du modèle de la carte, séparée
 * de `donnees.ts` parce que les pages qui n'ont pas la carte (la recherche, ses lignes d'écoles) la lisent aussi, sans les
 * contours et les rues que `plan.ts` apporte.
 */
import type { Valeur } from '../listes';

type Niveau = Valeur<'niveau'>;

/** La lettre d'un cycle sur son marqueur. Du plus bas au plus haut : M, P, C, L, T, S. */
export const CYCLES: readonly { cycle: Niveau; lettre: 'M' | 'P' | 'C' | 'L' | 'T' | 'S' }[] = [
  { cycle: 'creche', lettre: 'M' },
  { cycle: 'maternelle', lettre: 'M' },
  { cycle: 'primaire', lettre: 'P' },
  { cycle: 'college', lettre: 'C' },
  { cycle: 'lycee', lettre: 'L' },
  { cycle: 'technique', lettre: 'T' },
  { cycle: 'superieur', lettre: 'S' },
  { cycle: 'autre_formation', lettre: 'S' },
];

/** Les lettres des cycles, du plus bas au plus haut : le rang d'un cycle est sa place ici, à partir de 1. */
export const ORDRE_LETTRES = ['M', 'P', 'C', 'L', 'T', 'S'] as const;

/**
 * Les lettres de TOUS les cycles d'une école (« MPC »), du plus bas au plus haut, une fois chacune. C'est ce que lit le
 * filtre de cycle : le marqueur suit le cycle choisi (D9), pas seulement le plus élevé. Vide quand aucun niveau n'est noté.
 */
export function lettresDesCycles(niveaux: readonly Niveau[]): string {
  const presentes = new Set(
    niveaux.flatMap((n) => CYCLES.filter((c) => c.cycle === n).map((c) => c.lettre)),
  );
  return ORDRE_LETTRES.filter((l) => presentes.has(l)).join('');
}

/** Le cycle le plus élevé d'une école, pour son marqueur ; rien quand aucun niveau n'est noté. */
export function cycleLePlusEleve(
  niveaux: readonly Niveau[],
): { cycle: Niveau; lettre: (typeof CYCLES)[number]['lettre'] } | null {
  let meilleur = -1;
  for (const n of niveaux)
    meilleur = Math.max(
      meilleur,
      CYCLES.findIndex((c) => c.cycle === n),
    );
  const trouve = CYCLES[meilleur];
  return trouve ? { cycle: trouve.cycle, lettre: trouve.lettre } : null;
}
