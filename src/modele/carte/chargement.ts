/**
 * Quand charger la carte interactive (ticket 103, décision D7 du fondateur, 03/11/2026).
 *
 * La carte coûte de l'ordre de 0,5 Mo de plus que la page seule : sur un forfait compté, c'est le prix de dix pages.
 * - sur **`/carte/`** (la personne a choisi d'ouvrir la carte) : toujours d'office, avec ou sans économiseur de données ;
 * - sur **l'accueil** : d'office et en différé, y compris sur iPhone et Safari (qui n'exposent pas `navigator.connection` :
 *   un navigateur qui ne dit rien est une bonne connexion), **sauf** si le navigateur signale explicitement un économiseur
 *   de données (`saveData`) ou une connexion très lente (`slow-2g`, `2g`, `3g`). Alors un bouton remplace le chargement
 *   et rien ne se télécharge avant l'appui.
 */
export type PageDeLaCarte = 'carte' | 'accueil';

/** Ce que le navigateur dit de la connexion (`navigator.connection`), quand il le dit. */
export interface Connexion {
  saveData?: boolean;
  effectiveType?: string;
}

export type ModeDeChargement = 'd-office' | 'sur-appui';

const CONNEXIONS_LENTES: readonly string[] = ['slow-2g', '2g', '3g'];

export function modeDeChargement(
  page: PageDeLaCarte,
  connexion: Connexion | null | undefined,
): ModeDeChargement {
  if (page === 'carte') return 'd-office';
  if (connexion?.saveData === true) return 'sur-appui';
  if (connexion?.effectiveType && CONNEXIONS_LENTES.includes(connexion.effectiveType))
    return 'sur-appui';
  return 'd-office';
}
