/**
 * La paie des relais : les dates et les montants, tels que l'administration les lit. Le calcul de ce qui est
 * dû est fait par la base (`payout_preview`), qui est la seule source : ici, rien que de l'affichage.
 */

import type { Valeur } from './listes';

/** Le fuseau de Brazzaville et de Pointe-Noire (UTC+1, pas d'heure d'été) : la semaine se clôt là-bas. */
const FUSEAU = 'Africa/Brazzaville';

/** Le jour (AAAA-MM-JJ) à Brazzaville pour un instant donné. */
export function jourABrazzaville(instant: Date): string {
  const parties = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
  return parties; // en-CA écrit AAAA-MM-JJ
}

/** Le vendredi de la semaine en cours : aujourd'hui s'il l'est, sinon le prochain (comme la base). */
export function prochainVendredi(instant = new Date()): string {
  const [a = 0, m = 1, j = 1] = jourABrazzaville(instant).split('-').map(Number);
  const jourUtc = new Date(Date.UTC(a, m - 1, j));
  const decalage = (5 - jourUtc.getUTCDay() + 7) % 7; // 5 = vendredi
  jourUtc.setUTCDate(jourUtc.getUTCDate() + decalage);
  return jourUtc.toISOString().slice(0, 10);
}

/** Est-ce un vendredi ? (La base refuse une clôture un autre jour.) */
export function estUnVendredi(jour: string): boolean {
  const [a = 0, m = 1, j = 1] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j)).getUTCDay() === 5;
}

/** « 1 500 FCFA », avec des espaces insécables : le montant ne se coupe pas en fin de ligne. */
export function francs(montant: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(montant).replace(/[\u202f\u00a0\s]/g, '\u00a0')}\u00a0FCFA`;
}

/** « vendredi 6 novembre » */
export function vendrediLong(jour: string): string {
  const [a = 0, m = 1, j = 1] = jour.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(a, m - 1, j)));
}

// « Ma paie » : ce que le relais lit de sa propre paie (ticket #55) -----------------------------------------------------

const s = (n: number) => (n > 1 ? 's' : '');

/** Ce qui compte dans une ligne de paie, en clair : « 3 fiches acceptées », « 1 contact de direction confirmé »… */
export function detailDeLaPaie(ligne: {
  fiches: number;
  contacts: number;
  essais: number;
}): string[] {
  const lignes: string[] = [];
  if (ligne.fiches > 0)
    lignes.push(`${ligne.fiches} fiche${s(ligne.fiches)} acceptée${s(ligne.fiches)}`);
  if (ligne.contacts > 0) {
    lignes.push(
      `${ligne.contacts} contact${s(ligne.contacts)} de direction confirmé${s(ligne.contacts)}`,
    );
  }
  if (ligne.essais > 0) lignes.push('L’essai validé');
  return lignes;
}

export interface CompteDesFiches {
  envoyees: number;
  acceptees: number;
  enAttente: number;
  aCorriger: number;
  refusees: number;
}

/**
 * Combien de fiches le relais a envoyées à NTanova, et ce qu'elle en a fait. Une correction n'est pas une fiche de plus :
 * la fiche qu'elle corrige est celle qui compte (et qui se paie).
 */
export function compteDesFiches(
  releves: readonly { statut: Valeur<'statut_releve'>; type?: Valeur<'type_releve'> }[],
): CompteDesFiches {
  const fiches = releves.filter((r) => r.type !== 'correction');
  const de = (statut: Valeur<'statut_releve'>) => fiches.filter((r) => r.statut === statut).length;
  return {
    envoyees: fiches.length,
    acceptees: de('accepte'),
    enAttente: de('a_valider'),
    aCorriger: de('a_corriger'),
    refusees: de('refuse'),
  };
}
