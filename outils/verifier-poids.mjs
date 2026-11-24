// Le budget de poids des pages construites (dist/).
// Une page publique pèse moins de 200 Ko (12/11 ; avant : 100 Ko) en tout (HTML, CSS, polices, images)
// et n'a aucun JavaScript, sauf la page « Écoles » (ticket 146 : elle a repris « Rechercher » et « Autour de moi » ; un petit
// script de filtrage, 20 Ko au plus, compressé) et son fichier de recherche (300 Ko au plus, compressé). Les tailles du HTML, du CSS et du JS
// sont comptées compressées (gzip), comme elles voyagent sur le réseau.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = 'dist';
const budgetPage = 200 * 1024;
// Les applications (/relais/, /admin/) auront leur propre budget, avec du JavaScript.
const avecJavaScript = /^(relais|admin)\//;
// La page publique qui filtre dans le navigateur, « Écoles » (`/ecoles/` seule : ses lieux et ses fiches n'en ont pas) : un
// petit script, et rien d'autre.
const petitJavaScript = /^ecoles\/index\.html$/;
const budgetPetitJavaScript = 20 * 1024;
const budgetFichierRecherche = 300 * 1024;
// Le guide du relais (ticket #110) montre quatre captures de l'application, chargées au défilement : 400 Ko au plus,
// sans JavaScript (la page se lit sans réseau et se partage par un lien).
const pageGuide = /^(guide-relais|relais\/guide)\//;
const budgetGuide = 400 * 1024;

// Le bouton « Partager » des fiches d'école (audit du 05/11/2026, chantier 2) : la quatrième exception. Un seul script écrit dans la
// page, repéré par `data-partager`, de 2 Ko au plus (non compressé, lisible), sans fichier ni réseau : il ouvre le partage du téléphone ou
// copie le lien. Sans lui, le bouton reste un lien WhatsApp. Toute autre page de `ecoles/` reste sans JavaScript.
const pageEcoles = /^ecoles\//;
const budgetScriptPartage = 2 * 1024;
/** Les scripts écrits dans la page (hors données structurées) : leur attribut `src` s'il y en a un, et leur texte. */
const scriptsDeLaPage = (html) =>
  [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributs]) => !/application\/ld\+json/.test(attributs))
    .map(([, attributs, texte]) => ({ externe: /\ssrc=/.test(attributs), texte }));
// Lot 4 (16/11/2026) : « Demander la vérification », la cinquième exception, sur la fiche seulement. Un second script écrit
// dans la page, repéré par `data-demande`, de 2 Ko au plus : il compte une demande sans nom ni numéro (`count_family_demand`).
// La page porte le bloc qu'il sert.
// 19/11/2026 : la visionneuse des photos (fondateur), la sixième exception, sur la fiche et la page des photos. Un script écrit
// dans la page, repéré par `data-visionneuse`, de 2 Ko au plus ; la page porte la fenêtre (`<dialog data-visionneuse>`) qu'il
// ouvre. Ses grandes images ne sont pas comptées : leur adresse est dans `data-grande`, pas dans `src`, avant l'ouverture.
const scriptPermis = (html, s) =>
  !s.externe &&
  Buffer.byteLength(s.texte) <= budgetScriptPartage &&
  ((s.texte.includes('data-partager') && /<a\b[^>]*\sdata-partager\b/.test(html)) ||
    (s.texte.includes('data-demande') && /<div\b[^>]*\sdata-demande\b/.test(html)) ||
    (s.texte.includes('data-visionneuse') && /<dialog\b[^>]*\sdata-visionneuse\b/.test(html)));
const seulementLePartage = (html) => {
  const scripts = scriptsDeLaPage(html);
  return (
    scripts.length >= 1 &&
    scripts.length <= 3 &&
    scripts.every((s) => scriptPermis(html, s)) &&
    // Le partage reste là où il y a un bouton « Partager ».
    (!/<a\b[^>]*\sdata-partager\b/.test(html) ||
      scripts.some((s) => s.texte.includes('data-partager')))
  );
};

// La carte interactive (ticket #103) : la troisième exception. La page /carte/ reste dans son budget de page ; elle porte
// un petit chargeur (le seul JavaScript de la page), qui décide puis charge l'îlot (MapLibre, les tuiles) par `import()`.
// L'îlot n'est lié à aucune page : on le trouve en suivant les `import()` du chargeur (voir `ilotDeLaCarte`).
// L'accueil n'a plus de carte depuis le lot 3 (version 44, 15/11/2026) : il redevient une page sans aucun JavaScript.
const pageCarte = /^carte\//;
const budgetChargeurCarte = 8 * 1024;
// Plafonds confirmés par le fondateur le 04/11 après mesure servie et essai téléphone : l'îlot (MapLibre,
// son worker, sa feuille de style, notre code ; SANS les tuiles) et le premier affichage interactif en tout.
const budgetIlot = 500 * 1024;
const budgetPremierAffichage = 700 * 1024;
// Les tuiles d'une vue de la ville (quatre tuiles, zoom 10, centre de Brazzaville, mesurées le 03/11/2026 sur le fichier
// allégé de outils/fond-de-carte/, Ko compressés) : la seule valeur de ce fichier qui ne vient pas de dist/.
const tuilesDeLaVilleEnOctets = 43 * 1024;

// Refonte publique, lot 2 (24/11/2026) : « S'orienter », la septième exception, pour cette seule page. Elle se lit sans
// script ; les six activités ont une amorce chargée avec la page, qui charge le script des réponses à l'approche ou au premier
// geste (`import()`). Tout le JavaScript de la page, amorce et imports suivis compris, pèse 10 Ko gzip au plus ; le premier
// affichage (sans les images `loading="lazy"` ni les scripts chargés plus tard) reste sous le budget d'une page.
const pageOrienter = /^orienter\/index\.html$/;
const budgetJavaScriptOrienter = 10 * 1024;

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
const totauxDEmblee = new Map();
for (const page of pages(dist)) {
  const nom = relative(dist, page);
  const html = readFileSync(page, 'utf8');
  const vus = new Set();
  let total = compresse(html);
  const partageSeul = pageEcoles.test(nom) && seulementLePartage(html);
  let javascript = !partageSeul && /<script(?![^>]*application\/ld\+json)/i.test(html);
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
  // Lot 4 bis : ce que la page charge d'emblée, sans les images `loading="lazy"` (elles attendent d'approcher de l'écran ; en
  // vue Carte, la liste est cachée au téléphone et ne montre que quelques cartes sur ordinateur). Sert au premier affichage
  // de la carte ; le budget de la page, lui, compte tout.
  let paresseuses = 0;
  for (const m of charge.matchAll(/<img\b[^>]*\sloading="lazy"[^>]*>/g)) {
    const src = /\ssrc="([^"]+)"/.exec(m[0])?.[1];
    if (!src || !src.startsWith('/')) continue;
    const fichier = join(dist, decodeURI(src.split(/[?#]/)[0]));
    if (existsSync(fichier)) paresseuses += statSync(fichier).size;
  }
  totauxDEmblee.set(nom, total - paresseuses);
  const fautes = [];
  const budget = pageGuide.test(nom) ? budgetGuide : budgetPage;
  if (total > budget) fautes.push(`dépasse ${ko(budget)}`);
  if (
    javascript &&
    !avecJavaScript.test(nom) &&
    !petitJavaScript.test(nom) &&
    !pageCarte.test(nom) &&
    !pageOrienter.test(nom)
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

// Lot 4 bis (16/11/2026) : la carte vit dans « Les écoles » (`?vue=carte`) ; `/carte/` n'est plus qu'un renvoi. Le script de la
// page (20 Ko au plus, compté avec elle) charge l'îlot au toucher de « Carte » : on suit ses `import()` comme ceux d'un chargeur.
const pagesAvecLaCarte = [
  ['carte/index.html', 'carte', budgetChargeurCarte],
  ['ecoles/index.html', 'ecoles', budgetPetitJavaScript],
];
for (const [cheminCarte, nomCarte, budgetDuChargeur] of pagesAvecLaCarte) {
  const pageDeLaCarte = join(dist, cheminCarte);
  if (!existsSync(pageDeLaCarte)) continue;
  const html = readFileSync(pageDeLaCarte, 'utf8');
  const trouve = ilotDeLaCarte(html);
  const total = (fichiers, mesure) =>
    fichiers.reduce((somme, f) => somme + mesure(readFileSync(f)), 0);
  if (!trouve || trouve.ilot.length === 0) {
    echec = true;
    lignes.push(
      `✗ ${`${nomCarte} : îlot`.padEnd(32)} introuvable : le script de /${nomCarte}/ n’importe plus la carte.`,
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
      return existsSync(fichier)
        ? /\.(pbf|woff2)$/.test(fichier)
          ? readFileSync(fichier).length
          : gzipSync(readFileSync(fichier)).length
        : 0;
    };
    const premierAffichage =
      (totauxDEmblee.get(cheminCarte) ?? 0) +
      Math.max(ilotGzip, ilotBrotli5) +
      servi('carte/style.json') +
      servi('carte/zones.geojson') +
      servi('carte/ecoles.geojson') +
      servi('polices/carte/NotoSans-Regular/0-255.pbf') +
      tuilesDeLaVilleEnOctets;
    const fautes = [];
    if (octetsChargeur > budgetDuChargeur)
      fautes.push(`le chargeur dépasse ${ko(budgetDuChargeur)}`);
    if (Math.max(ilotGzip, ilotBrotli5) > budgetIlot)
      fautes.push(`l’îlot dépasse ${ko(budgetIlot)}`);
    if (premierAffichage > budgetPremierAffichage)
      fautes.push(`le premier affichage dépasse ${ko(budgetPremierAffichage)}`);
    if (fautes.length) echec = true;
    const marque = fautes.length ? '✗' : '✓';
    lignes.push(
      `${marque} ${`${nomCarte} : chargeur`.padEnd(32)} ${ko(octetsChargeur).padStart(9)}  (gzip, avec la page)`,
      `${marque} ${`${nomCarte} : îlot, sans tuiles`.padEnd(32)} ${ko(ilotBrotli).padStart(9)}  brotli maximum ; ${ko(ilotBrotli5)} en brotli 5, ${ko(ilotGzip)} en gzip (plafond ${ko(budgetIlot)} : contrôle local conservateur, puis mesure servie obligatoire)`,
      `${marque} ${`${nomCarte} : premier affichage`.padEnd(32)} ${ko(premierAffichage).padStart(9)}  ${fautes.join(', ')}`.trimEnd(),
    );
  }
}

// --- « S'orienter » : tout le JavaScript de la page, en suivant les imports de son amorce ------------------------------------
const pageDOrientation = join(dist, 'orienter/index.html');
if (existsSync(pageDOrientation)) {
  const html = readFileSync(pageDOrientation, 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(
    ([, attributs]) => !/application\/ld\+json/.test(attributs),
  );
  const racines = [];
  let octetsEnLigne = 0;
  for (const [, attributs, texte] of scripts) {
    const src = /\ssrc="([^"]+)"/.exec(attributs)?.[1];
    if (src) racines.push(join(dist, decodeURI(src.split(/[?#]/)[0])));
    else {
      // Un script écrit dans la page : son texte compte, et ses imports se suivent comme ceux d'un fichier.
      octetsEnLigne += compresse(texte);
      for (const m of texte.matchAll(/["'`]\/?(_astro\/[^"'`]+\.(?:js|mjs))["'`]/g))
        racines.push(join(dist, m[1]));
    }
  }
  const fichiers = [
    ...fermeture(racines, (statiques, dynamiques) => [...statiques, ...dynamiques]),
  ].filter((f) => /\.(js|mjs)$/.test(f));
  const octets = octetsEnLigne + fichiers.reduce((n, f) => n + compresse(readFileSync(f)), 0);
  const emblee = totauxDEmblee.get('orienter/index.html') ?? 0;
  const fautes = [];
  if (scripts.length === 0) fautes.push('aucun script : les activités ne répondent pas');
  if (octets > budgetJavaScriptOrienter)
    fautes.push(`son JavaScript dépasse ${ko(budgetJavaScriptOrienter)}`);
  if (emblee > budgetPage) fautes.push(`le premier affichage dépasse ${ko(budgetPage)}`);
  if (fautes.length) echec = true;
  const marque = fautes.length ? '✗' : '✓';
  lignes.push(
    `${marque} ${'orienter : JavaScript'.padEnd(32)} ${ko(octets).padStart(9)}  (gzip, amorce et imports : ${fichiers.length} fichier${fichiers.length > 1 ? 's' : ''})`,
    `${marque} ${'orienter : premier affichage'.padEnd(32)} ${ko(emblee).padStart(9)}  ${fautes.join(', ')}`.trimEnd(),
  );
}

console.log(lignes.join('\n'));
if (echec) {
  console.error('\nBudget de poids dépassé.');
  process.exit(1);
}
