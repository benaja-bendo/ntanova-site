// Refait les icônes du site public à partir de public/icone.svg (carré) : `pnpm icones`.
//   public/favicon-48.png        48 × 48, le favicon que Google relit
//   public/apple-touch-icon.png  180 × 180, l'icône d'écran d'accueil de l'iPhone
//   public/favicon.ico           16, 32 et 48 px, des PNG dans un fichier .ico
// La liste que le `<head>` déclare est dans src/modele/icones.ts ; tests/unitaires/icones-site.test.ts garde les tailles.
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync(new URL('../public/icone.svg', import.meta.url), 'utf8');
const sortie = (nom) => new URL(`../public/${nom}`, import.meta.url);

/** Le PNG du SVG, à `cote` pixels de côté. */
function png(cote) {
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: cote } }).render().asPng());
}

/** Un fichier .ico : l'en-tête, une entrée de 16 octets par taille, puis les PNG. */
function ico(cotes) {
  const images = cotes.map((c) => png(c));
  const entete = Buffer.alloc(6 + 16 * cotes.length);
  entete.writeUInt16LE(0, 0);
  entete.writeUInt16LE(1, 2); // 1 = icône
  entete.writeUInt16LE(cotes.length, 4);
  let decalage = entete.length;
  cotes.forEach((c, i) => {
    const debut = 6 + i * 16;
    entete[debut] = c; // 0 voudrait dire 256 : aucune taille d'ici n'y va
    entete[debut + 1] = c;
    entete.writeUInt16LE(1, debut + 4); // plans
    entete.writeUInt16LE(32, debut + 6); // bits par pixel
    entete.writeUInt32LE(images[i].length, debut + 8);
    entete.writeUInt32LE(decalage, debut + 12);
    decalage += images[i].length;
  });
  return Buffer.concat([entete, ...images]);
}

writeFileSync(sortie('favicon-48.png'), png(48));
writeFileSync(sortie('apple-touch-icon.png'), png(180));
writeFileSync(sortie('favicon.ico'), ico([16, 32, 48]));
console.log('Icônes écrites : favicon-48.png, apple-touch-icon.png, favicon.ico');
