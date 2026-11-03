/**
 * L'âge d'une fiche à valider (ticket #76). Le livret promet aux relais une validation sous 24 à 48 heures : l'écran
 * dit depuis quand chaque fiche attend, et signale celle qui dépasse 24 heures. Un nombre, jamais un seuil du registre :
 * 24 heures est la promesse faite aux relais, pas une hypothèse de mesure.
 */

const MINUTES_PAR_JOUR = 24 * 60;

export interface AgeDeFiche {
  /** « depuis 5 h », « depuis 2 jours » */
  texte: string;
  /** Vrai à partir de 24 heures. */
  ancienne: boolean;
  minutes: number;
}

export function ageDe(depuisIso: string, maintenant: Date): AgeDeFiche {
  // Une horloge qui retarde ou avance ne donne jamais un âge négatif.
  const minutes = Math.max(0, Math.floor((maintenant.getTime() - Date.parse(depuisIso)) / 60_000));
  let texte: string;
  if (minutes < 1) texte = 'depuis moins d’une minute';
  else if (minutes < 60) texte = `depuis ${minutes} min`;
  else if (minutes < MINUTES_PAR_JOUR) texte = `depuis ${Math.floor(minutes / 60)} h`;
  else {
    const jours = Math.floor(minutes / MINUTES_PAR_JOUR);
    texte = `depuis ${jours} jour${jours > 1 ? 's' : ''}`;
  }
  return { texte, ancienne: minutes >= MINUTES_PAR_JOUR, minutes };
}

/** La plus ancienne d'abord : celle qui attend depuis le plus longtemps passe en premier. */
export function trierParAnciennete<T extends { recuLe: string }>(fiches: readonly T[]): T[] {
  return [...fiches].sort((a, b) => Date.parse(a.recuLe) - Date.parse(b.recuLe));
}
