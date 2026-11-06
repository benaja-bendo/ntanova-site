/**
 * Filtrer la file « À valider » (audit de l'administration, 06/11/2026). Seize envois à la fois, de trois relais :
 * l'administrateur doit pouvoir ne garder que ceux d'un relais, ou ceux qui demandent une attention (sans position,
 * doublon possible). Des règles pures : aucun appel réseau, aucune lecture de l'heure.
 */

export type TypeDeFiche = 'releve' | 'correction' | 'contre_visite';
export type IndiceDeFiche = 'sans_position' | 'doublon_possible';

/** Ce que la file sait d'une fiche : un sous-ensemble de `ReleveAValider`. */
export interface FicheDeFile {
  id: string;
  type: TypeDeFiche;
  relais: string;
  /** Posée avec la position, toujours : nulle seulement quand le relais n'a pas pu la prendre. */
  precisionM: number | null;
  doublonPossible: boolean;
}

export interface CriteresDeFile {
  type?: TypeDeFiche | 'tout';
  relais?: string | null;
  indice?: IndiceDeFiche | null;
}

/** Le relais n'a pas pu prendre la position (permission refusée, saisie depuis un ordinateur) : l'école n'aura pas de point sur la carte. */
export const sansPosition = (f: Pick<FicheDeFile, 'precisionM'>) => f.precisionM === null;

export function filtrerFile<T extends FicheDeFile>(
  fiches: readonly T[],
  { type = 'tout', relais = null, indice = null }: CriteresDeFile,
): T[] {
  return fiches.filter(
    (f) =>
      (type === 'tout' || f.type === type) &&
      (relais === null || f.relais === relais) &&
      (indice === null || (indice === 'sans_position' ? sansPosition(f) : f.doublonPossible)),
  );
}

export function relaisDeLaFile(
  fiches: readonly Pick<FicheDeFile, 'relais'>[],
): { relais: string; fiches: number }[] {
  const nombres = new Map<string, number>();
  for (const f of fiches) nombres.set(f.relais, (nombres.get(f.relais) ?? 0) + 1);
  return [...nombres]
    .map(([relais, n]) => ({ relais, fiches: n }))
    .sort((a, b) => a.relais.localeCompare(b.relais, 'fr'));
}

export function compterIndices(
  fiches: readonly Pick<FicheDeFile, 'precisionM' | 'doublonPossible'>[],
) {
  return {
    sansPosition: fiches.filter(sansPosition).length,
    doublonPossible: fiches.filter((f) => f.doublonPossible).length,
  };
}
