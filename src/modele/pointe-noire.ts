/**
 * Pointe-Noire : les numéros de ses six arrondissements, comme on les dit sur
 * place (« arrondissement 3 »). 1 Lumumba, 2 Mvou-Mvou, 3 Tié-Tié, 4 Loandjili,
 * 5 Mongo-Mpoukou, 6 Ngoyo.
 */
export const numeroArrondissement: Readonly<Record<string, number>> = {
  'tie-tie': 3,
  ngoyo: 6,
};

/** « 2 novembre 2026 » */
export function dateLongue(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Brazzaville',
  }).format(new Date(iso));
}

/** Date courte des preuves publiques, à l’heure du Congo. */
export function dateCourte(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Brazzaville',
  }).format(new Date(iso));
}
