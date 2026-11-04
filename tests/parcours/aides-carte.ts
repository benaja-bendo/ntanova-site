// De quoi essayer la carte interactive sans Internet (ticket 103) : une mini-archive PMTiles faite à la main, et la route
// qui la sert comme R2 (requêtes partielles, CORS), à la place de `tuiles.ntanova.com`. Aucun parcours ne sort sur Internet.
//
// L'archive n'a qu'UNE tuile, au zoom 0 : MapLibre l'agrandit à tous les zooms. Elle contient la terre (tout le monde) et
// l'eau (à l'ouest de 11,6 °E, l'Atlantique), de quoi voir un fond se dessiner ; ce sont les couches de NTanova, lues dans
// les vrais fichiers du site construit, que les parcours regardent.
import type { BrowserContext } from '@playwright/test';
import { ecrireArchive } from '../../outils/fond-de-carte/alleger';
import { ADRESSE_DES_TUILES } from '../../src/modele/carte/fond';

// --- Un Tile (MVT) fait à la main : protobuf --------------------------------------------------------------------------------

const varint = (n: number): number[] => {
  const sortie: number[] = [];
  while (n >= 128) {
    sortie.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  sortie.push(n);
  return sortie;
};
const champ = (numero: number, type: 0 | 2, contenu: readonly number[]) => [
  numero * 8 + type,
  ...(type === 2 ? varint(contenu.length) : []),
  ...contenu,
];
const texte = (numero: number, valeur: string) =>
  champ(numero, 2, [...new TextEncoder().encode(valeur)]);
const zigzag = (n: number) => (n << 1) ^ (n >> 31);

/** Un rectangle plein : (x0, y0) à (x1, y1) en unités de la tuile, dans le sens des polygones extérieurs. */
function rectangle(x0: number, y0: number, x1: number, y1: number): number[] {
  const commandes = [
    (1 & 7) | (1 << 3),
    zigzag(x0),
    zigzag(y0),
    (2 & 7) | (3 << 3),
    zigzag(x1 - x0),
    zigzag(0),
    zigzag(0),
    zigzag(y1 - y0),
    zigzag(x0 - x1),
    zigzag(0),
    (7 & 7) | (1 << 3),
  ];
  return commandes;
}

function couche(nom: string, rectangles: [number, number, number, number][]): number[] {
  const objets = rectangles.map(([x0, y0, x1, y1]) =>
    champ(2, 2, [...champ(3, 0, [3]), ...champ(4, 2, rectangle(x0, y0, x1, y1).flatMap(varint))]),
  );
  return champ(3, 2, [
    ...champ(15, 0, [2]),
    ...texte(1, nom),
    ...objets.flat(),
    ...champ(5, 0, varint(4096)),
  ]);
}

/** La tuile du monde : toute la terre, et l'eau à l'ouest (x < 2100 ≈ 11,6 °E : l'Atlantique, à l'ouest de Pointe-Noire). */
function tuileDuMonde(): Uint8Array {
  return Uint8Array.from([
    ...couche('earth', [[0, 0, 4096, 4096]]),
    ...couche('water', [[0, 0, 2100, 4096]]),
  ]);
}

export function miniArchive(): Uint8Array {
  return ecrireArchive([{ z: 0, x: 0, y: 0, octets: tuileDuMonde() }], {
    metadonnees: {
      name: 'essai',
      attribution: '© les contributeurs d’OpenStreetMap',
      vector_layers: [
        { id: 'earth', fields: {} },
        { id: 'water', fields: {} },
      ],
    },
    minLon: -180,
    minLat: -85,
    maxLon: 180,
    maxLat: 85,
    centreZoom: 0,
    centreLon: 0,
    centreLat: 0,
    compressionTuiles: 1,
  });
}

// --- Le serveur de tuiles de l'essai ------------------------------------------------------------------------------------------

export interface TuilesServies {
  /** Chaque requête reçue par le faux serveur de tuiles, dans l'ordre. */
  requetes: { methode: string; range: string | null }[];
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'range, if-match',
  'access-control-expose-headers': 'etag, content-range, accept-ranges, content-length',
};

/**
 * Sert le fichier de tuiles là où le site le cherche. `absent` répond 404, comme un R2 pas encore activé : la carte doit le
 * dire sans casser le reste.
 */
export async function servirLesTuiles(
  contexte: BrowserContext,
  mode: 'present' | 'absent' = 'present',
): Promise<TuilesServies> {
  const archive = miniArchive();
  const servies: TuilesServies = { requetes: [] };
  await contexte.route(`${new URL(ADRESSE_DES_TUILES).origin}/**`, async (route) => {
    const requete = route.request();
    const range = requete.headers()['range'] ?? null;
    servies.requetes.push({ methode: requete.method(), range });
    if (requete.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (mode === 'absent') return route.fulfill({ status: 404, headers: CORS, body: 'absent' });
    const entete = { ...CORS, etag: '"mini"', 'accept-ranges': 'bytes' };
    const demande = range ? /^bytes=(\d+)-(\d*)$/.exec(range) : null;
    if (!demande) {
      return route.fulfill({
        status: 200,
        headers: { ...entete, 'content-type': 'application/octet-stream' },
        body: Buffer.from(archive),
      });
    }
    const debut = Number(demande[1]);
    const fin = Math.min(demande[2] ? Number(demande[2]) : archive.length - 1, archive.length - 1);
    return route.fulfill({
      status: 206,
      headers: {
        ...entete,
        'content-type': 'application/octet-stream',
        'content-range': `bytes ${debut}-${fin}/${archive.length}`,
      },
      body: Buffer.from(archive.slice(debut, fin + 1)),
    });
  });
  return servies;
}
