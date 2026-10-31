// Après la construction, écrit dist/relais/sw.js : le service worker de l'espace
// relais, avec la liste des fichiers à garder pour le hors ligne. Sa version est
// l'empreinte de ces fichiers : toute nouvelle construction en publie une nouvelle.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        const garder = [
          ...fichiers(join(racine, '_astro')),
          ...fichiers(join(racine, 'polices')).filter((f) => f.endsWith('.woff2')),
          join(racine, 'favicon.svg'),
          join(racine, 'relais', 'manifest.webmanifest'),
          join(racine, 'relais', 'icone-192.png'),
        ];
        const empreinte = createHash('sha256');
        const liste = ['/relais/'];
        empreinte.update(readFileSync(join(racine, 'relais', 'index.html')));
        for (const f of garder) {
          if (!statSync(f, { throwIfNoEntry: false })) continue;
          liste.push('/' + relative(racine, f).split(sep).join('/'));
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
