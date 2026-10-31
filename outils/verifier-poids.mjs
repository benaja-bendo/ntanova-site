// Le budget de poids des pages construites (dist/).
// Une page publique pèse moins de 100 Ko en tout (HTML, CSS, polices, images)
// et n'a aucun JavaScript. Les tailles du HTML, du CSS et du JS sont comptées
// compressées (gzip), comme elles voyagent sur le réseau.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'dist';
const budgetPage = 100 * 1024;
// Les applications (/relais/, /admin/) auront leur propre budget, avec du JavaScript.
const avecJavaScript = /^(relais|admin)\//;

if (!existsSync(dist)) {
  console.error('dist/ manque : lancer `pnpm build` d’abord.');
  process.exit(1);
}

function* pages(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) yield* pages(chemin);
    else if (entree.name.endsWith('.html')) yield chemin;
  }
}

const compresse = (texte) => gzipSync(texte).length;
const ko = (octets) => `${(octets / 1024).toFixed(1)} Ko`;

let echec = false;
const lignes = [];
for (const page of pages(dist)) {
  const nom = relative(dist, page);
  const html = readFileSync(page, 'utf8');
  const vus = new Set();
  let total = compresse(html);
  let javascript = /<script(?![^>]*application\/ld\+json)/i.test(html);

  const compter = (url) => {
    if (!url.startsWith('/') || url.startsWith('//') || vus.has(url)) return;
    vus.add(url);
    const fichier = join(dist, decodeURI(url.split(/[?#]/)[0]));
    if (!existsSync(fichier)) return;
    if (/\.(css|js|mjs)$/.test(fichier)) {
      const texte = readFileSync(fichier, 'utf8');
      total += compresse(texte);
      if (fichier.endsWith('.css'))
        for (const m of texte.matchAll(/url\(\s*['"]?([^'")]+)/g)) compter(m[1]);
      else javascript = true;
    } else {
      total += statSync(fichier).size;
    }
  };

  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/\.(css|js|mjs|woff2?|png|jpe?g|webp|avif|svg)(\?|#|$)/.test(m[1])) compter(m[1]);
  }
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)/g)) compter(m[1]);

  const fautes = [];
  if (total > budgetPage) fautes.push(`dépasse ${ko(budgetPage)}`);
  if (javascript && !avecJavaScript.test(nom)) fautes.push('contient du JavaScript');
  if (fautes.length) echec = true;
  lignes.push(
    `${fautes.length ? '✗' : '✓'} ${nom.padEnd(32)} ${ko(total).padStart(9)}  ${fautes.join(', ')}`,
  );
}

console.log(lignes.join('\n'));
if (echec) {
  console.error('\nBudget de poids dépassé.');
  process.exit(1);
}
