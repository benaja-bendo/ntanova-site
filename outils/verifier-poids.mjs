// Le budget de poids des pages construites (dist/).
// Une page publique pèse moins de 100 Ko en tout (HTML, CSS, polices, images)
// et n'a aucun JavaScript, sauf « Rechercher » et « Autour de moi » (un petit script de filtrage, 20 Ko au plus,
// compressé) et leur fichier de recherche (300 Ko au plus, compressé). Les tailles du HTML, du CSS et du JS
// sont comptées compressées (gzip), comme elles voyagent sur le réseau.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = 'dist';
const budgetPage = 100 * 1024;
// Les applications (/relais/, /admin/) auront leur propre budget, avec du JavaScript.
const avecJavaScript = /^(relais|admin)\//;
// Les deux pages publiques qui filtrent dans le navigateur : un petit script chacune, et rien d'autre.
const petitJavaScript = /^(recherche|autour-de-moi)\//;
const budgetPetitJavaScript = 20 * 1024;
const budgetFichierRecherche = 300 * 1024;
// Le guide du relais (ticket #110) montre quatre captures de l'application, chargées au défilement : 400 Ko au plus,
// sans JavaScript (la page se lit sans réseau et se partage par un lien).
const pageGuide = /^(guide-relais|relais\/guide)\//;
const budgetGuide = 400 * 1024;

// La carte interactive (ticket #103) : la troisième exception. La page /carte/ reste dans son budget de page ; elle porte
// un petit chargeur (le seul JavaScript de la page), qui décide puis charge l'îlot (MapLibre, les tuiles) par `import()`.
// L'îlot n'est lié à aucune page : on le trouve en suivant les `import()` du chargeur (voir `ilotDeLaCarte`).
const pageCarte = /^carte\//;
const budgetChargeurCarte = 8 * 1024;
// Plafonds de départ du fondateur (décision D7, 03/11), à figer après la mesure sur un Android réel : l'îlot (MapLibre,
// son worker, sa feuille de style, notre code ; SANS les tuiles) et le premier affichage interactif en tout.
const budgetIlot = 400 * 1024;
const budgetPremierAffichage = 700 * 1024;
// Les tuiles d'une vue de la ville (quatre tuiles, zoom 10, centre de Brazzaville, mesurées le 03/11/2026 sur le fichier
// allégé de outils/fond-de-carte/, Ko compressés) : la seule valeur de ce fichier qui ne vient pas de dist/.
const tuilesDeLaVilleEnOctets = 43 * 1024;

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
const totauxDesPages = new Map();
for (const page of pages(dist)) {
  const nom = relative(dist, page);
  const html = readFileSync(page, 'utf8');
  const vus = new Set();
  let total = compresse(html);
  let javascript = /<script(?![^>]*application\/ld\+json)/i.test(html);
  let octetsJavaScript = 0;

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
      else {
        javascript = true;
        octetsJavaScript += compresse(texte);
      }
    } else {
      total += statSync(fichier).size;
    }
  };

  // Un lien « à télécharger » (le PDF et les images du guide du relais) n'est pas chargé avec la page.
  const charge = html.replace(/<a\b[^>]*\sdownload\b[^>]*>/g, '');
  for (const m of charge.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/\.(css|js|mjs|woff2?|png|jpe?g|webp|avif|svg)(\?|#|$)/.test(m[1])) compter(m[1]);
  }
  for (const m of html.matchAll(/url\(\s*['"]?([^'")]+)/g)) compter(m[1]);

  totauxDesPages.set(nom, total);
  const fautes = [];
  const budget = pageGuide.test(nom) ? budgetGuide : budgetPage;
  if (total > budget) fautes.push(`dépasse ${ko(budget)}`);
  if (
    javascript &&
    !avecJavaScript.test(nom) &&
    !petitJavaScript.test(nom) &&
    !pageCarte.test(nom)
  ) {
    fautes.push('contient du JavaScript');
  }
  if (petitJavaScript.test(nom) && octetsJavaScript > budgetPetitJavaScript) {
    fautes.push(`son JavaScript dépasse ${ko(budgetPetitJavaScript)}`);
  }
  if (fautes.length) echec = true;
  lignes.push(
    `${fautes.length ? '✗' : '✓'} ${nom.padEnd(32)} ${ko(total).padStart(9)}  ${fautes.join(', ')}`,
  );
}

// Le fichier que filtre la recherche : il grossit avec le catalogue.
const fichierRecherche = join(dist, 'recherche.json');
if (existsSync(fichierRecherche)) {
  const octets = compresse(readFileSync(fichierRecherche));
  const trop = octets > budgetFichierRecherche;
  if (trop) echec = true;
  lignes.push(
    `${trop ? '✗' : '✓'} ${'recherche.json'.padEnd(32)} ${ko(octets).padStart(9)}  ${trop ? `dépasse ${ko(budgetFichierRecherche)} : couper le fichier par pays` : ''}`,
  );
}

// --- L'îlot de la carte : on suit les `import()` du chargeur de /carte/ ------------------------------------------------------
const brotli = (contenu, qualite = 11) =>
  brotliCompressSync(contenu, { params: { [constants.BROTLI_PARAM_QUALITY]: qualite } }).length;

/** Les fichiers de dist/ qu'un fichier nomme : imports (`from"./x.js"`, `import("./x.js")`) et adresses `_astro/x.ext`. */
function references(fichier) {
  const texte = readFileSync(fichier, 'utf8');
  const statiques = new Set();
  const dynamiques = new Set();
  const ici = (relatif) => join(fichier, '..', relatif);
  for (const m of texte.matchAll(
    /\bfrom\s*["'`](\.\/[^"'`]+)["'`]|\bimport\s*["'`](\.\/[^"'`]+)["'`]/g,
  )) {
    statiques.add(ici(m[1] ?? m[2]));
  }
  for (const m of texte.matchAll(/\bimport\s*\(\s*["'`](\.\/[^"'`]+)["'`]/g))
    dynamiques.add(ici(m[1]));
  for (const m of texte.matchAll(/["'`]\/?(_astro\/[^"'`]+\.(?:js|mjs|css))["'`]/g)) {
    dynamiques.add(join(dist, m[1]));
  }
  return { statiques, dynamiques };
}

function fermeture(racines, suivre) {
  const vus = new Set();
  const file = [...racines];
  while (file.length) {
    const f = file.pop();
    if (vus.has(f) || !existsSync(f) || !/\.(js|mjs)$/.test(f)) {
      if (!vus.has(f) && existsSync(f)) vus.add(f);
      continue;
    }
    vus.add(f);
    const { statiques, dynamiques } = references(f);
    for (const r of suivre(statiques, dynamiques)) file.push(r);
  }
  return vus;
}

function ilotDeLaCarte(html) {
  const script = /<script[^>]*src="([^"]+\.js)"/.exec(html)?.[1];
  if (!script) return null;
  const chargeur = join(dist, decodeURI(script));
  // Ce que la page charge avec son chargeur : lui, et ses imports statiques.
  const avecLaPage = fermeture([chargeur], (statiques) => statiques);
  // Tout ce que le chargeur et l'îlot nomment, moins ce que la page charge déjà.
  const tout = fermeture([chargeur], (statiques, dynamiques) => [...statiques, ...dynamiques]);
  const ilot = [...tout].filter((f) => !avecLaPage.has(f));
  return { chargeur: [...avecLaPage], ilot };
}

const pageDeLaCarte = join(dist, 'carte', 'index.html');
if (existsSync(pageDeLaCarte)) {
  const html = readFileSync(pageDeLaCarte, 'utf8');
  const trouve = ilotDeLaCarte(html);
  const total = (fichiers, mesure) =>
    fichiers.reduce((somme, f) => somme + mesure(readFileSync(f)), 0);
  if (!trouve || trouve.ilot.length === 0) {
    echec = true;
    lignes.push(
      `✗ ${'carte : îlot'.padEnd(32)} introuvable : le chargeur de /carte/ n’importe plus rien.`,
    );
  } else {
    const { chargeur, ilot } = trouve;
    const octetsChargeur = total(chargeur, (c) => gzipSync(c).length);
    const ilotBrotli = total(ilot, (c) => brotli(c));
    const ilotGzip = total(ilot, (c) => gzipSync(c, { level: 9 }).length);
    const ilotBrotli5 = total(ilot, (c) => brotli(c, 5));
    // Le premier affichage interactif : la page, l'îlot, le style, les deux fichiers GeoJSON, la plage de glyphes du français
    // et les tuiles d'une vue de la ville. Tout vient de dist/, sauf les tuiles (R2).
    const servi = (chemin) => {
      const fichier = join(dist, chemin);
      return existsSync(fichier) ? gzipSync(readFileSync(fichier)).length : 0;
    };
    const premierAffichage =
      (totauxDesPages.get('carte/index.html') ?? 0) +
      ilotBrotli +
      servi('carte/style.json') +
      servi('carte/zones.geojson') +
      servi('carte/ecoles.geojson') +
      servi('polices/carte/NotoSans-Regular/0-255.pbf') +
      tuilesDeLaVilleEnOctets;
    const fautes = [];
    if (octetsChargeur > budgetChargeurCarte)
      fautes.push(`le chargeur dépasse ${ko(budgetChargeurCarte)}`);
    if (ilotBrotli > budgetIlot) fautes.push(`l’îlot dépasse ${ko(budgetIlot)}`);
    if (premierAffichage > budgetPremierAffichage)
      fautes.push(`le premier affichage dépasse ${ko(budgetPremierAffichage)}`);
    if (fautes.length) echec = true;
    const marque = fautes.length ? '✗' : '✓';
    lignes.push(
      `${marque} ${'carte : chargeur'.padEnd(32)} ${ko(octetsChargeur).padStart(9)}  (gzip, avec la page)`,
      `${marque} ${'carte : îlot, sans tuiles'.padEnd(32)} ${ko(ilotBrotli).padStart(9)}  brotli maximum ; ${ko(ilotBrotli5)} en brotli 5, ${ko(ilotGzip)} en gzip (plafond ${ko(budgetIlot)} : à figer sur la taille servie, voir CLAUDE.md)`,
      `${marque} ${'carte : premier affichage'.padEnd(32)} ${ko(premierAffichage).padStart(9)}  ${fautes.join(', ')}`.trimEnd(),
    );
  }
}

console.log(lignes.join('\n'));
if (echec) {
  console.error('\nBudget de poids dépassé.');
  process.exit(1);
}
