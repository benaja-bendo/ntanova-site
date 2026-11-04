// Les glyphes qu'il faut servir (ticket #114) : MapLibre dessine un nom avec des glyphes servis par plages de 256 codes
// (`0-255.pbf`, `8192-8447.pbf`…) et redemande une plage dès qu'un nom y touche. Une nouvelle build du fond de carte peut
// apporter un caractère dont la plage n'est pas dans `public/polices/carte/` : l'étiquette le perdrait, sans bruit.
// L'outil lit les noms que la carte écrit (`name:fr`, sinon `name`) et dit les plages qui manquent.
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { POLICE_DE_LA_CARTE } from '../../src/modele/carte/fond';
import { ecrireArchive } from '../../outils/fond-de-carte/alleger';
import { plagesDeGlyphes, plagesManquantes } from '../../outils/fond-de-carte/glyphes';

// --- Une tuile (MVT) faite à la main : une couche « places » dont les lieux ont des propriétés -----------------------------
const varint = (n: number): number[] => {
  const sortie: number[] = [];
  while (n >= 128) {
    sortie.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  sortie.push(n);
  return sortie;
};
const octets = (texte: string): number[] => [...new TextEncoder().encode(texte)];
const champLong = (champ: number, contenu: readonly number[]): number[] => [
  champ * 8 + 2,
  ...varint(contenu.length),
  ...contenu,
];

/** Une couche : ses lieux, chacun avec ses propriétés (clé → texte). */
function couche(nom: string, lieux: Record<string, string>[]): number[] {
  const cles: string[] = [];
  const valeurs: string[] = [];
  const indice = (liste: string[], x: string) => {
    const i = liste.indexOf(x);
    if (i >= 0) return i;
    liste.push(x);
    return liste.length - 1;
  };
  const elements = lieux.map((proprietes) => {
    const tags = Object.entries(proprietes).flatMap(([k, v]) => [
      indice(cles, k),
      indice(valeurs, v),
    ]);
    return champLong(2, [
      ...champLong(2, tags.flatMap(varint)),
      3 * 8,
      1,
      ...champLong(4, [9, 0, 0]),
    ]);
  });
  return champLong(3, [
    ...champLong(1, octets(nom)),
    ...elements.flat(),
    ...cles.flatMap((k) => champLong(3, octets(k))),
    ...valeurs.flatMap((v) => champLong(4, champLong(1, octets(v)))),
    5 * 8,
    ...varint(4096),
  ]);
}

const OPTIONS = {
  metadonnees: {},
  minLon: 11,
  minLat: -5,
  maxLon: 19,
  maxLat: 4,
  centreZoom: 0,
  centreLon: 15,
  centreLat: 0,
  compressionTuiles: 2 as const,
};
const tuile = (z: number, x: number, y: number, ...couches: number[][]) => ({
  z,
  x,
  y,
  octets: gzipSync(Uint8Array.from(couches.flat())),
});

describe('les plages de glyphes dont les étiquettes ont besoin', () => {
  const archive = ecrireArchive(
    [
      tuile(
        6,
        33,
        31,
        couche('places', [
          { 'name:fr': 'Œuvre', name: 'Ouvre' }, // le nom français l'emporte : U+0152, plage 256-511
          { name: 'Avenue de l’Hôpital' }, // pas de nom français : le nom local ; U+2019, plage 8192-8447
          { 'name:fr': 'Pointe-Noire', 'name:ru': 'Мирный' }, // une autre langue n'est jamais écrite
        ]),
        couche('roads', [{ ref: 'Ж1' }]), // sans nom : rien à écrire
      ),
      tuile(2, 2, 1, couche('places', [{ name: 'Мирный' }])), // un zoom que la carte n'atteint pas
    ],
    OPTIONS,
  );

  it('compte les étiquettes de chaque plage, avec un exemple', () => {
    const plages = plagesDeGlyphes(archive, 4);
    expect([...plages.keys()].sort()).toEqual(['0-255', '256-511', '8192-8447']);
    expect(plages.get('0-255')?.etiquettes).toBe(3);
    expect(plages.get('256-511')).toEqual({ etiquettes: 1, exemple: 'Œuvre' });
    expect(plages.get('8192-8447')).toEqual({ etiquettes: 1, exemple: 'Avenue de l’Hôpital' });
  });

  it('lit aussi les zooms que la carte n’atteint pas, quand on le demande', () => {
    expect(plagesDeGlyphes(archive, 0).has('1024-1279')).toBe(true);
    expect(plagesDeGlyphes(archive, 4).has('1024-1279')).toBe(false);
  });

  it('lit une archive dont les tuiles ne sont pas compressées', () => {
    const brute = ecrireArchive(
      [{ z: 6, x: 1, y: 1, octets: Uint8Array.from(couche('places', [{ name: 'Mbé' }])) }],
      { ...OPTIONS, compressionTuiles: 1 },
    );
    expect([...plagesDeGlyphes(brute, 0).keys()]).toEqual(['0-255']);
  });
});

describe('les plages qui manquent dans public/polices/carte/', () => {
  const dossier = `public/polices/carte/${POLICE_DE_LA_CARTE}`;

  it('ne dit rien des plages servies', () => {
    expect(plagesManquantes(['0-255', '8192-8447'], dossier)).toEqual([]);
  });

  it('nomme celles qui manquent', () => {
    expect(plagesManquantes(['0-255', '256-511', '1024-1279'], dossier)).toEqual([
      '256-511',
      '1024-1279',
    ]);
  });
});
