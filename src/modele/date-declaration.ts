/** Les déclarations et accords sont datés au Congo-Brazzaville, indépendamment du téléphone. */
export function jourDuCongo(quand: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Brazzaville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(quand);
  const valeurs = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${valeurs.year}-${valeurs.month}-${valeurs.day}`;
}
/** Le jour (ISO) décalé de `jours` (négatif : avant), compté à midi pour ne jamais basculer de jour. */
export function ajouterJours(jour: string, jours: number): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}
export function dateDeclareeValide(jour: string, aujourdHui = jourDuCongo()): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(jour) &&
    Number.isFinite(Date.parse(jour)) &&
    new Date(jour).toISOString().slice(0, 10) === jour &&
    jour <= aujourdHui
  );
}
