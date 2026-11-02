// Après la construction, écrit dist/relais/sw.js : le service worker de l'espace
// relais, avec la liste des fichiers à garder pour le hors ligne. Cette liste est
// celle de ce que /relais/ charge (outils/fichiers-du-relais.mjs), pas tout `_astro/`.
// Sa version est l'empreinte de ces fichiers : une mise en ligne qui ne change que
// l'administration ou le site public ne change pas la version du relais.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fichiersAstroDuRelais } from './fichiers-du-relais.mjs';

function* fichiers(dossier) {
  for (const entree of readdirSync(dossier, { withFileTypes: true })) {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) yield* fichiers(chemin);
    else yield chemin;
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function integrationRelais() {
  return {
    name: 'ntanova-relais',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const racine = fileURLToPath(dir);
        const adresse = (f) => '/' + relative(racine, f).split(sep).join('/');
        const garder = [
          ...fichiersAstroDuRelais(racine).map((a) => join(racine, a)),
          ...[...fichiers(join(racine, 'polices'))].filter((f) => f.endsWith('.woff2')).sort(),
          join(racine, 'favicon.svg'),
          join(racine, 'relais', 'manifest.webmanifest'),
          join(racine, 'relais', 'icone-192.png'),
        ];
        const empreinte = createHash('sha256');
        const liste = ['/relais/'];
        empreinte.update(readFileSync(join(racine, 'relais', 'index.html')));
        for (const f of garder) {
          if (!statSync(f, { throwIfNoEntry: false })) continue;
          liste.push(adresse(f));
          empreinte.update(adresse(f));
          empreinte.update(readFileSync(f));
        }
        const version = empreinte.digest('hex').slice(0, 12);
        const modele = readFileSync(new URL('./sw-relais.js', import.meta.url), 'utf8');
        writeFileSync(
          join(racine, 'relais', 'sw.js'),
          modele
            .replace('__VERSION__', version)
            .replace('/* __FICHIERS__ */ []', JSON.stringify(liste, null, 2)),
        );
        logger.info(`relais/sw.js : ${liste.length} fichiers, version ${version}`);
      },
    },
  };
}
