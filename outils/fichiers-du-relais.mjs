// Les fichiers de `_astro/` dont l'espace relais a besoin, pour son service worker (outils/integration-relais.mjs).
//
// Avant, le service worker prenait tout `_astro/` : l'îlot de l'administration et les scripts du site public compris.
// Toute mise en ligne, même sans changement du relais, changeait donc sa version (le bandeau « Nouvelle version
// prête » s'affichait chez les relais pour rien), et chaque téléphone retéléchargeait des fichiers qu'il n'ouvre jamais.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const echapper = (texte) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Les fichiers de `_astro/` que /relais/ charge : ceux que sa page nomme (l'îlot, son renderer, ses feuilles de style),
 * puis, de proche en proche, ceux que chacun nomme à son tour (`import`, `import()`). Un nom de fichier porte son
 * empreinte (`App.Jp1zct8C.js`) : le trouver dans un texte, c'est être nommé par ce texte. L'administration et le site
 * public ont leurs propres fichiers ; ils n'en font pas partie, sauf ce que le relais partage avec eux.
 *
 * Une page qui ne nomme rien, ou qui nomme un fichier absent, est une construction cassée : elle échoue ici, plutôt que
 * de produire un service worker qui ne garderait rien.
 *
 * @param {string} racine le dossier construit (`dist/`)
 * @returns {string[]} leurs adresses (`/_astro/App.Jp1zct8C.js`), triées
 */
export function fichiersAstroDuRelais(racine) {
  const dossier = join(racine, '_astro');
  const noms = readdirSync(dossier);
  const page = readFileSync(join(racine, 'relais', 'index.html'), 'utf8');

  const citees = new Set(
    (page.match(/\/_astro\/[\w.-]+\.(?:js|css)/g) ?? []).map((a) => a.slice(8)),
  );
  if (citees.size === 0) {
    throw new Error(
      "La page /relais/ ne nomme aucun fichier de _astro/ : l'application du relais n'y est pas.",
    );
  }
  for (const nom of citees) {
    if (!noms.includes(nom)) {
      throw new Error(`La page /relais/ nomme ${nom}, qui n'existe pas dans _astro/.`);
    }
  }

  const motifs = noms.map((nom) => [nom, new RegExp(`(?<![\\w.-])${echapper(nom)}(?![\\w-])`)]);
  const gardes = new Set(citees);
  const aLire = [...citees];
  for (let nom = aLire.pop(); nom !== undefined; nom = aLire.pop()) {
    if (!nom.endsWith('.js')) continue;
    const texte = readFileSync(join(dossier, nom), 'utf8');
    for (const [autre, motif] of motifs) {
      if (!gardes.has(autre) && motif.test(texte)) {
        gardes.add(autre);
        aLire.push(autre);
      }
    }
  }
  return [...gardes].sort().map((nom) => `/_astro/${nom}`);
}
