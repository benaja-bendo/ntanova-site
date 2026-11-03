/**
 * Accepter une fiche (ticket #89). Deux règles, que l'écran et les tests partagent :
 *
 * 1. **Le bouton « Accepter » ne se grise jamais sans dire pourquoi** (`ceQuiManquePourAccepter`).
 * 2. **Une correction d'une fiche pas encore acceptée hérite de la fiche d'origine** (`heriterDeLOrigine`). Un relais qui
 *    reprend sa photo après un « à corriger » envoie une correction sans position (« corriger pour la photo » ne la
 *    redemande pas) ; la fiche qu'elle corrige n'a pas d'école. La base crée l'école à partir de la correction, avec la
 *    position, la division et le secteur de la fiche d'origine ; l'écran traite donc cette correction comme une nouvelle
 *    fiche. Une correction d'une école déjà créée, elle, met l'école à jour : aucune division à choisir.
 */
import type { Point } from './geo';
import type { DetailReleve } from './ports';

/** Comment l'envoi entre dans le catalogue : la décision en un geste. */
export type Cible =
  | { mode: 'nouvelle' }
  | { mode: 'new_campus'; institutionId: string }
  | { mode: 'update_campus'; campusId: string }
  | { mode: 'add_cycle'; campusId: string };

/** Ce que l'on sait de la fiche qu'une correction corrige. */
export interface OrigineDeLaCorrection {
  /** L'école créée à partir de cette fiche ; nulle tant qu'elle n'est pas acceptée. */
  campusId: string | null;
  position: Point | null;
  divisionId: string | null;
  lot: string | null;
}

export interface ChampsHerites {
  /** Vrai : la fiche d'origine n'a pas d'école ; la correction est traitée comme une nouvelle fiche. */
  corrigeUneFicheEnAttente: boolean;
  position: Point | null;
  divisionId: string | null;
  lot: string | null;
  /** Vrai : la position affichée est celle de la fiche d'origine, pas de la correction. */
  positionDeLaFicheDOrigine: boolean;
}

/** Ce qu'une correction reprend de la fiche d'origine, quand cette fiche n'a pas encore d'école. */
export function heriterDeLOrigine(
  correction: Pick<DetailReleve, 'type' | 'position' | 'divisionId' | 'lot'>,
  origine: OrigineDeLaCorrection | null,
): ChampsHerites {
  const rien: ChampsHerites = {
    corrigeUneFicheEnAttente: false,
    position: correction.position,
    divisionId: correction.divisionId,
    lot: correction.lot,
    positionDeLaFicheDOrigine: false,
  };
  if (correction.type !== 'correction' || origine === null || origine.campusId !== null)
    return rien;
  return {
    corrigeUneFicheEnAttente: true,
    position: correction.position ?? origine.position,
    divisionId: correction.divisionId ?? origine.divisionId,
    lot: correction.lot ?? origine.lot,
    positionDeLaFicheDOrigine: correction.position === null && origine.position !== null,
  };
}

type FichePourAccepter = Pick<
  DetailReleve,
  'essai' | 'type' | 'corrigeUneFicheEnAttente' | 'divisionId' | 'position' | 'lot'
>;

/**
 * L'administration doit-elle choisir la division de l'école ? Seulement quand une école va être créée : la division est
 * celle de la position quand un contour la contient ; sinon (aucun contour connu, ou ni position ni secteur), c'est
 * l'administration qui la choisit : la fiche ne retombe plus sur le secteur du relais (ticket n° 67).
 * **Une correction d'une école déjà créée n'en demande jamais** : l'école a déjà sa division.
 */
export function divisionRequise(fiche: FichePourAccepter, cible: Cible): boolean {
  if (fiche.essai) return false;
  if (fiche.type === 'correction' && !fiche.corrigeUneFicheEnAttente) return false;
  if (cible.mode !== 'nouvelle' && cible.mode !== 'new_campus') return false;
  return fiche.divisionId === null && (fiche.position !== null || fiche.lot === null);
}

/** Ce qui manque pour accepter, dit en une phrase ; `null` quand le bouton peut être actif. */
export function ceQuiManquePourAccepter(
  fiche: FichePourAccepter,
  cible: Cible,
  divisionChoisie: string,
): string | null {
  if (divisionRequise(fiche, cible) && divisionChoisie === '') {
    return 'Choisis la division de l’école pour pouvoir accepter.';
  }
  if (cible.mode === 'new_campus' && cible.institutionId === '') {
    return 'Choisis l’institution à laquelle rattacher cette implantation.';
  }
  if ((cible.mode === 'update_campus' || cible.mode === 'add_cycle') && cible.campusId === '') {
    return 'Choisis l’implantation à mettre à jour.';
  }
  return null;
}
