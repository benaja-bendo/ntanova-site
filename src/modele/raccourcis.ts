/**
 * Les raccourcis clavier de « À valider » sur ordinateur (lot G, 13/11/2026) : J, la fiche suivante ; K, la précédente ;
 * Échap, revenir à la liste. Pas les flèches : elles font défiler la fiche. Jamais dans un champ, jamais avec une touche de modification,
 * jamais quand une fenêtre est ouverte (Échap la ferme d'abord). Aucun raccourci pour décider : « Accepter » et
 * « Refuser » restent des gestes au doigt ou à la souris.
 */
export type GesteClavier = 'suivante' | 'precedente' | 'liste';

export interface ToucheLue {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  /** La balise qui a le focus (`INPUT`, `TEXTAREA`, `SELECT`…), ou rien. */
  cible?: string | null;
  /** Le focus est dans une zone modifiable (`contenteditable`). */
  modifiable?: boolean;
  /** Une fenêtre (`dialog`) est ouverte. */
  fenetreOuverte?: boolean;
}

export function gesteDeLaTouche(t: ToucheLue): GesteClavier | null {
  if (t.altKey || t.ctrlKey || t.metaKey) return null;
  if (t.fenetreOuverte) return null;
  if (t.modifiable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.cible ?? '')) return null;
  switch (t.key) {
    case 'j':
      return 'suivante';
    case 'k':
      return 'precedente';
    case 'Escape':
      return 'liste';
    default:
      return null;
  }
}

/** L'identifiant de la fiche à ouvrir, ou `null` pour la liste, ou `undefined` s'il n'y a rien à faire. */
export function ficheApresLeGeste(
  geste: GesteClavier,
  ids: readonly string[],
  actuelle: string | null,
): string | null | undefined {
  if (geste === 'liste') return actuelle === null ? undefined : null;
  if (ids.length === 0) return undefined;
  const i = actuelle === null ? -1 : ids.indexOf(actuelle);
  if (geste === 'suivante') {
    if (i === -1) return ids[0];
    return i + 1 < ids.length ? ids[i + 1] : undefined;
  }
  if (i === -1) return ids[ids.length - 1];
  return i > 0 ? ids[i - 1] : undefined;
}
