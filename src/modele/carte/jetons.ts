/**
 * Lire un jeton dans le texte de `src/ui/jetons.css` (le seul fichier où une couleur s'écrit en valeur). Les jetons de
 * rôle renvoient à des couleurs de base (`var(--blanc)`) : on les suit jusqu'à la couleur. Un jeton absent, ou qui
 * se renvoie à lui-même, fait échouer la construction : on ne devine jamais une couleur.
 */
export function lireJeton(css: string, nom: string, chemin: readonly string[] = []): string {
  if (chemin.includes(nom)) {
    throw new Error(`Jeton circulaire dans jetons.css : ${[...chemin, nom].join(' → ')}`);
  }
  const trouve = new RegExp(`--${nom}:\\s*([^;]+);`).exec(css);
  if (!trouve?.[1]) throw new Error(`Jeton absent de jetons.css : --${nom}`);
  const valeur = trouve[1].trim();
  const renvoi = /^var\(--([\w-]+)\)$/.exec(valeur);
  return renvoi?.[1] ? lireJeton(css, renvoi[1], [...chemin, nom]) : valeur.toLowerCase();
}
