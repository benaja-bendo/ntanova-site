import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import integrationRelais from '../../outils/integration-relais.mjs';

/**
 * Le service worker de l'espace relais (`outils/integration-relais.mjs`, écrit à la construction) : sa version est
 * l'empreinte de ce que `/relais/` charge, et sa liste de fichiers, ce que le téléphone garde pour le hors ligne.
 * Ticket #62, M5 : avant, l'empreinte et la liste prenaient TOUT `_astro/` (l'administration et le site public
 * compris) : toute mise en ligne, même sans changement du relais, faisait apparaître « Nouvelle version prête »
 * chez les relais et leur faisait télécharger des fichiers qu'ils n'ouvrent jamais.
 *
 * Le dossier construit est écrit à la main, fichier par fichier ; l'intégration tourne comme à la fin d'une construction.
 */

/** Un site construit en petit : le relais, l'administration et une page publique, avec un morceau commun. */
const SITE: Record<string, string> = {
  'relais/index.html':
    '<link rel="stylesheet" href="/_astro/App.rel1.css"><astro-island component-url="/_astro/App.rel1.js" renderer-url="/_astro/client.rl1.js"></astro-island>',
  'relais/manifest.webmanifest': '{}',
  'relais/icone-192.png': 'png',
  'favicon.svg': '<svg/>',
  'polices/poppins-latin-700-normal.woff2': 'police',
  // Ce que le relais charge : la page, son îlot, son moteur React, un morceau commun, un adaptateur appelé à la demande
  // (`import()`), et ce que cet adaptateur importe à son tour.
  '_astro/App.rel1.css': '.relais{}',
  '_astro/App.rel1.js':
    'import{c}from"./commun.cm1.js";export default()=>import("./adaptateur.ad1.js");',
  '_astro/client.rl1.js': 'export const react=1;',
  '_astro/commun.cm1.js': 'export const c=1;',
  '_astro/adaptateur.ad1.js': 'import"./erreurs.er1.js";export const a=1;',
  '_astro/erreurs.er1.js': 'export const e=1;',
  // Le guide du relais (ticket 110) : une page à part, sa feuille de style et une capture, gardées pour se lire sans réseau.
  'relais/guide/index.html':
    '<link rel="stylesheet" href="/_astro/Guide.gd1.css"><img src="/guide-relais/captures/mon-lot.webp"><a href="/guide-relais/guide.pdf" download>PDF</a>',
  '_astro/Guide.gd1.css': '.guide{}',
  'guide-relais/captures/mon-lot.webp': 'capture',
  'guide-relais/guide.pdf': 'pdf',
  // L'administration : son îlot, un tableau, et le morceau commun qu'elle partage avec le relais.
  'admin/index.html':
    '<astro-island component-url="/_astro/App.adm1.js" renderer-url="/_astro/client.rl1.js"></astro-island>',
  '_astro/App.adm1.js': 'import{c}from"./commun.cm1.js";import"./Tableau.tb1.js";',
  '_astro/Tableau.tb1.js': 'export const t=1;',
  // Le site public : un script de recherche, une carte.
  'recherche/index.html': '<script type="module" src="/_astro/recherche.rch1.js"></script>',
  '_astro/recherche.rch1.js': 'import"./Carte.cr1.js";',
  '_astro/Carte.cr1.js': 'export const carte=1;',
  '_astro/Carte.cr1.css': '.carte{}',
};

let racine = '';

function ecrire(fichiers: Record<string, string>) {
  for (const [chemin, contenu] of Object.entries(fichiers)) {
    mkdirSync(dirname(join(racine, chemin)), { recursive: true });
    writeFileSync(join(racine, chemin), contenu);
  }
}

/** Joue l'intégration comme à la fin d'une construction, et lit ce qu'elle a écrit dans `relais/sw.js`. */
async function serviceWorker(): Promise<{ version: string; fichiers: string[] }> {
  const fin = integrationRelais().hooks['astro:build:done'];
  if (!fin) throw new Error('L’intégration n’écrit rien à la fin de la construction.');
  await fin({ dir: pathToFileURL(`${racine}/`), logger: { info: () => undefined } } as never);
  const code = readFileSync(join(racine, 'relais', 'sw.js'), 'utf8');
  const version = /const VERSION = '([^']*)'/.exec(code)?.[1];
  const liste = /const FICHIERS = (\[[\s\S]*?\]);/.exec(code)?.[1];
  if (!version || !liste) throw new Error('Le service worker écrit est illisible.');
  return { version, fichiers: JSON.parse(liste) as string[] };
}

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), 'ntanova-sw-'));
  ecrire(SITE);
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

describe('ce que le service worker du relais garde pour le hors ligne', () => {
  it('suit ce que la page nomme, de proche en proche, et laisse le reste', async () => {
    const { fichiers } = await serviceWorker();
    expect([...fichiers].sort()).toEqual(
      [
        '/relais/',
        '/relais/guide/',
        '/_astro/Guide.gd1.css',
        '/guide-relais/captures/mon-lot.webp',
        '/_astro/App.rel1.css',
        '/_astro/App.rel1.js',
        '/_astro/client.rl1.js',
        '/_astro/commun.cm1.js',
        '/_astro/adaptateur.ad1.js',
        '/_astro/erreurs.er1.js',
        '/polices/poppins-latin-700-normal.woff2',
        '/favicon.svg',
        '/relais/manifest.webmanifest',
        '/relais/icone-192.png',
      ].sort(),
    );
  });

  it('ne garde ni l’îlot de l’administration, ni ce qu’elle seule charge, ni les scripts du site public', async () => {
    const { fichiers } = await serviceWorker();
    for (const hors of [
      '/_astro/App.adm1.js',
      '/_astro/Tableau.tb1.js',
      '/_astro/recherche.rch1.js',
      '/_astro/Carte.cr1.js',
      '/_astro/Carte.cr1.css',
    ]) {
      expect(fichiers, hors).not.toContain(hors);
    }
  });
});

describe('la version du service worker du relais', () => {
  it('ne bouge pas quand seuls l’administration ou le site public changent', async () => {
    const avant = await serviceWorker();
    ecrire({
      '_astro/App.adm1.js':
        'import{c}from"./commun.cm1.js";import"./Tableau.tb1.js";/* autre texte */',
      '_astro/Tableau.tb1.js': 'export const t=2;',
      '_astro/recherche.rch1.js': 'import"./Carte.cr1.js";/* autre texte */',
      '_astro/Carte.cr1.css': '.carte{color:red}',
      'recherche/index.html': '<p>une autre page publique</p>',
      'admin/index.html': '<p>une autre page d’administration</p>',
    });
    const apres = await serviceWorker();
    expect(apres.version).toBe(avant.version);
  });

  it('est la même d’une construction à l’autre quand rien n’a changé', async () => {
    expect((await serviceWorker()).version).toBe((await serviceWorker()).version);
  });

  it.each([
    ['la page du relais', 'relais/index.html', SITE['relais/index.html'] + '<!-- changée -->'],
    ['son îlot', '_astro/App.rel1.js', SITE['_astro/App.rel1.js'] + '/* changé */'],
    ['son style', '_astro/App.rel1.css', '.relais{color:red}'],
    ['un morceau qu’il partage avec l’administration', '_astro/commun.cm1.js', 'export const c=2;'],
    [
      'un adaptateur appelé à la demande',
      '_astro/adaptateur.ad1.js',
      'import"./erreurs.er1.js";export const a=2;',
    ],
    ['ce que cet adaptateur importe', '_astro/erreurs.er1.js', 'export const e=2;'],
    ['une police', 'polices/poppins-latin-700-normal.woff2', 'autre police'],
    ['l’icône', 'relais/icone-192.png', 'autre icône'],
    [
      'la page du guide',
      'relais/guide/index.html',
      SITE['relais/guide/index.html'] + '<!-- changée -->',
    ],
    ['une capture du guide', 'guide-relais/captures/mon-lot.webp', 'autre capture'],
    ['le style du guide', '_astro/Guide.gd1.css', '.guide{color:red}'],
  ])('change quand %s change', async (_nom, chemin, contenu) => {
    const avant = await serviceWorker();
    ecrire({ [chemin]: contenu });
    expect((await serviceWorker()).version).not.toBe(avant.version);
  });
});

describe('le guide du relais', () => {
  it('ne garde pas le PDF (un lien à télécharger n’est pas chargé avec la page)', async () => {
    const { fichiers } = await serviceWorker();
    expect(fichiers).not.toContain('/guide-relais/guide.pdf');
  });

  it('échoue quand une capture nommée par la page du guide manque', async () => {
    rmSync(join(racine, 'guide-relais', 'captures', 'mon-lot.webp'));
    await expect(serviceWorker()).rejects.toThrow(/mon-lot\.webp/);
  });
});

describe('une construction qui n’a rien à garder', () => {
  it('échoue, au lieu d’écrire un service worker vide', async () => {
    ecrire({ 'relais/index.html': '<p>plus d’îlot</p>' });
    await expect(serviceWorker()).rejects.toThrow(/relais/i);
  });

  it('échoue quand un fichier nommé par la page manque', async () => {
    rmSync(join(racine, '_astro', 'App.rel1.js'));
    await expect(serviceWorker()).rejects.toThrow(/App\.rel1\.js/);
  });
});
