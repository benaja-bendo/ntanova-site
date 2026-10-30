// Refuse toute couleur écrite en valeur hors de src/ui/jetons.css.
// Sans ce contrôle, les écrans dérivent : le canevas comptait 23 couleurs, dont 11 hors des jetons.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const racine = 'src';
const jetons = join('src', 'ui', 'jetons.css');
const extensions = /\.(css|astro|tsx?|jsx?|mjs|html|svg)$/;

const motifs = [
  /#[0-9a-fA-F]{3,8}\b/,
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/,
  /(?:color|background|border|fill|stroke|outline|shadow|stop-color)[\w-]*\s*[:=]\s*["']?[^;"'{}]*\b(?:white|black|red|green|blue|yellow|orange|gray|grey|silver|purple|pink|brown|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i,
];

function* fichiers(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) yield* fichiers(chemin);
    else if (extensions.test(entree.name)) yield chemin;
  }
}

const fautes = [];
for (const fichier of fichiers(racine)) {
  if (relative('.', fichier) === jetons) continue;
  readFileSync(fichier, 'utf8')
    .split('\n')
    .forEach((ligne, i) => {
      if (motifs.some((m) => m.test(ligne))) fautes.push(`${fichier}:${i + 1}  ${ligne.trim()}`);
    });
}

if (fautes.length) {
  console.error(`Couleurs écrites hors de ${jetons} (utiliser une variable des jetons) :\n`);
  console.error(fautes.join('\n'));
  process.exit(1);
}
console.log(`Couleurs : aucune valeur hors de ${jetons}.`);
