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

/**
 * Le signe d'attente de la carte (canevas « Chargement », validé par le fondateur le 08/11/2026, ticket 146) : rien avant
 * 0,4 s (sur une bonne connexion, personne ne le voit), au moins 0,5 s une fois paru (il ne clignote pas), et après 10 s une
 * sortie vers la liste des écoles (personne ne reste bloqué).
 */
export const ATTENTE_DE_LA_CARTE = { avantLeSigne: 400, signeAuMoins: 500, lente: 10_000 } as const;

/** Combien de millisecondes garder encore le signe paru à `paruA` (`null` : il n'a pas paru). */
export function resteDuSigne(paruA: number | null, maintenant: number): number {
  if (paruA === null) return 0;
  return Math.max(0, ATTENTE_DE_LA_CARTE.signeAuMoins - (maintenant - paruA));
}
