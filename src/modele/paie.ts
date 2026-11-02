/**
 * La paie des relais : les dates et les montants, tels que l'administration les lit. Le calcul de ce qui est
 * dû est fait par la base (`payout_preview`), qui est la seule source : ici, rien que de l'affichage.
 */

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
