// Alléger un fond de carte (ticket 114, décision D6 du fondateur) : retirer des tuiles d'un PMTiles les couches que la
// carte ne dessine pas (bâtiments, commerces, occupation du sol aux petits zooms), puis réécrire l'archive. L'archive
// écrite est relue avec le lecteur OFFICIEL (`pmtiles`) : si la spécification n'est pas respectée, ces tests le disent.
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PMTiles, zxyToTileId, type RangeResponse, type Source } from 'pmtiles';
import {
  alleger,
  controler,
  couchesARetirer,
  ecrireArchive,
  lireArchive,
  metadonneesAllegees,
  nomsDesCouches,
  REGLES_SOBRES,
  retirerCouches,
  type TuileStockee,
} from '../../outils/fond-de-carte/alleger';

// --- Un Tile (MVT) fait à la main : protobuf, couches au champ 3, nom de la couche au champ 1 -------------------------------
const varint = (n: number): number[] => {
  const sortie: number[] = [];
  while (n >= 128) {
    sortie.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  sortie.push(n);
  return sortie;
};
const champLong = (champ: number, octets: readonly number[]): number[] => [
  champ * 8 + 2,
  ...varint(octets.length),
  ...octets,
];
const couche = (nom: string, contenu: readonly number[] = [1, 2, 3]): number[] =>
  champLong(3, [
    ...champLong(1, [...new TextEncoder().encode(nom)]),
    ...champLong(2, contenu),
    5 * 8,
    ...varint(4096),
  ]);
const tuile = (...couches: number[][]): Uint8Array => Uint8Array.from(couches.flat());

describe('retirer des couches d’une tuile', () => {
  const complete = tuile(
    couche('earth'),
    couche('buildings', [9, 9, 9, 9]),
    couche('roads'),
    couche('pois'),
  );

  it('lit les noms des couches', () => {
    expect(nomsDesCouches(complete)).toEqual(['earth', 'buildings', 'roads', 'pois']);
  });

  it('garde les autres couches telles quelles, octet pour octet', () => {
    const sortie = retirerCouches(complete, new Set(['buildings', 'pois']));
    expect(sortie).toEqual(tuile(couche('earth'), couche('roads')));
  });

  it('ne change rien quand aucune couche n’est à retirer', () => {
    expect(retirerCouches(complete, new Set(['landuse']))).toEqual(complete);
  });

  it('rend une tuile vide quand toutes les couches partent (une tuile MVT vide est valide)', () => {
    expect(retirerCouches(tuile(couche('buildings')), new Set(['buildings']))).toEqual(
      new Uint8Array(),
    );
  });

  it('garde un champ qu’il ne connaît pas (version, ajouts futurs)', () => {
    const avecInconnu = Uint8Array.from([1 * 8, 5, ...couche('buildings'), ...couche('earth')]);
    expect(retirerCouches(avecInconnu, new Set(['buildings']))).toEqual(
      Uint8Array.from([1 * 8, 5, ...couche('earth')]),
    );
  });

  it('refuse une tuile coupée au lieu de la réécrire de travers', () => {
    expect(() =>
      retirerCouches(complete.subarray(0, complete.length - 3), new Set(['pois'])),
    ).toThrow();
  });
});

describe('les règles du fond sobre (D6)', () => {
  it('ni bâtiments ni commerces à aucun zoom, ni occupation du sol jusqu’au zoom 10', () => {
    expect([...couchesARetirer(0)].sort()).toEqual(['buildings', 'landuse', 'pois']);
    expect([...couchesARetirer(10)].sort()).toEqual(['buildings', 'landuse', 'pois']);
    expect([...couchesARetirer(11)].sort()).toEqual(['buildings', 'pois']);
    expect([...couchesARetirer(15)].sort()).toEqual(['buildings', 'pois']);
    expect(REGLES_SOBRES.flatMap((r) => r.couches)).not.toContain('roads');
  });

  it('dit dans les métadonnées ce qui reste : plus de couche bâtiments, l’occupation du sol à partir du zoom 11', () => {
    const meta = metadonneesAllegees(
      {
        attribution: '© OpenStreetMap',
        vector_layers: [
          { id: 'earth', minzoom: 0, maxzoom: 15, fields: {} },
          { id: 'buildings', minzoom: 11, maxzoom: 15, fields: {} },
          { id: 'landuse', minzoom: 2, maxzoom: 15, fields: {} },
          { id: 'pois', minzoom: 5, maxzoom: 15, fields: {} },
        ],
      },
      REGLES_SOBRES,
    ) as {
      attribution: string;
      vector_layers: { id: string; minzoom: number }[];
      [cle: string]: unknown;
    };
    expect(meta.vector_layers.map((l) => l.id)).toEqual(['earth', 'landuse']);
    expect(meta.vector_layers.find((l) => l.id === 'landuse')?.minzoom).toBe(11);
    expect(meta.attribution).toBe('© OpenStreetMap');
    expect(String(meta['ntanova:allege'])).toMatch(/buildings/);
  });
});

// --- Une archive écrite par l'outil se relit avec le lecteur officiel ------------------------------------------------------
class SourceMemoire implements Source {
  constructor(private readonly octets: Uint8Array) {}
  getKey() {
    return 'memoire';
  }
  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    const t = this.octets.slice(offset, offset + length);
    return { data: t.buffer.slice(t.byteOffset, t.byteOffset + t.byteLength) as ArrayBuffer };
  }
}

const OPTIONS = {
  metadonnees: { name: 'Fond de test', attribution: '© contributeurs' },
  minLon: 11.1,
  minLat: -5.1,
  maxLon: 18.7,
  maxLat: 3.8,
  centreZoom: 3,
  centreLon: 14.9,
  centreLat: -0.65,
  compressionTuiles: 1 as const,
};
const stockee = (z: number, x: number, y: number, contenu: string): TuileStockee => ({
  z,
  x,
  y,
  octets: new TextEncoder().encode(contenu),
});
const texte = (r: RangeResponse | undefined) => (r ? new TextDecoder().decode(r.data) : undefined);

describe('écrire une archive PMTiles', () => {
  const tuiles = [
    stockee(0, 0, 0, 'monde'),
    stockee(1, 0, 0, 'nord-ouest'),
    stockee(1, 1, 0, 'nord-est'),
    stockee(2, 2, 1, 'pareil'),
    stockee(2, 2, 2, 'pareil'), // même contenu que la précédente, ailleurs
    stockee(2, 3, 1, 'pareil'),
  ];
  const octets = ecrireArchive(tuiles, OPTIONS);
  const archive = new PMTiles(new SourceMemoire(octets));

  it('a un en-tête que le lecteur officiel comprend', async () => {
    const h = await archive.getHeader();
    expect(h.specVersion).toBe(3);
    expect(h.minZoom).toBe(0);
    expect(h.maxZoom).toBe(2);
    expect(h.numAddressedTiles).toBe(6);
    expect(h.numTileContents).toBe(4);
    expect(h.clustered).toBe(true);
    expect(h.tileType).toBe(1);
    expect(h.minLon).toBeCloseTo(11.1, 6);
    expect(h.maxLat).toBeCloseTo(3.8, 6);
    expect(h.rootDirectoryOffset).toBe(127);
  });

  it('rend chaque tuile, et rien pour une tuile absente', async () => {
    expect(texte(await archive.getZxy(0, 0, 0))).toBe('monde');
    expect(texte(await archive.getZxy(1, 1, 0))).toBe('nord-est');
    expect(texte(await archive.getZxy(2, 2, 1))).toBe('pareil');
    expect(texte(await archive.getZxy(2, 2, 2))).toBe('pareil');
    expect(texte(await archive.getZxy(2, 3, 1))).toBe('pareil');
    expect(await archive.getZxy(1, 1, 1)).toBeUndefined();
    expect(await archive.getZxy(2, 0, 0)).toBeUndefined();
  });

  it('range une fois un contenu identique (la mer, par exemple)', () => {
    const lue = lireArchive(octets);
    expect(lue.entete.numTileContents).toBe(4);
    expect(lue.entete.tileDataLength).toBe(
      'monde'.length + 'nord-ouest'.length + 'nord-est'.length + 'pareil'.length,
    );
  });

  it('garde les métadonnées', async () => {
    expect(await archive.getMetadata()).toMatchObject({
      name: 'Fond de test',
      attribution: '© contributeurs',
    });
  });

  it('se relit tuile pour tuile avec notre propre lecteur', () => {
    const lues = [...lireArchive(octets).tuiles()].map(
      (t) => `${t.z}/${t.x}/${t.y}=${new TextDecoder().decode(t.octets)}`,
    );
    expect(lues.sort()).toEqual(
      tuiles.map((t) => `${t.z}/${t.x}/${t.y}=${new TextDecoder().decode(t.octets)}`).sort(),
    );
  });

  it('refuse deux fois la même tuile', () => {
    expect(() => ecrireArchive([stockee(1, 0, 0, 'a'), stockee(1, 0, 0, 'b')], OPTIONS)).toThrow(
      /deux fois/,
    );
  });
});

describe('une grande archive passe par des répertoires de feuilles', () => {
  // 40 000 tuiles du zoom 14 à des places et avec des longueurs au hasard (graine fixe) : la racine ne tient plus dans 16 Ko.
  let graine = 42;
  const hasard = (n: number) => {
    // mulberry32 : les bits de poids faible d'un simple congruentiel linéaire ne suffisent pas à tirer 40 000 places différentes.
    graine = (graine + 0x6d2b79f5) | 0;
    let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
  const places = new Set<string>();
  const tuiles: TuileStockee[] = [];
  while (tuiles.length < 40_000) {
    const x = hasard(2 ** 14);
    const y = hasard(2 ** 14);
    if (places.has(`${x}/${y}`)) continue;
    places.add(`${x}/${y}`);
    tuiles.push(stockee(14, x, y, `t14/${x}/${y}/${'#'.repeat(hasard(40))}`));
  }
  const octets = ecrireArchive(tuiles, OPTIONS);
  const archive = new PMTiles(new SourceMemoire(octets));

  it('garde sa racine dans les 16 premiers Ko et met le reste dans des feuilles', async () => {
    const h = await archive.getHeader();
    expect(h.rootDirectoryOffset + h.rootDirectoryLength).toBeLessThanOrEqual(16_384);
    expect(h.leafDirectoryLength).toBeGreaterThan(0);
  });

  it('retrouve des tuiles au hasard à travers les feuilles, et rien là où il n’y en a pas', async () => {
    for (const t of [tuiles[0]!, tuiles[1234]!, tuiles[20_000]!, tuiles[39_999]!]) {
      expect(texte(await archive.getZxy(t.z, t.x, t.y))).toBe(new TextDecoder().decode(t.octets));
    }
    let absente = 0;
    while (places.has(`${absente}/0`)) absente++;
    expect(await archive.getZxy(14, absente, 0)).toBeUndefined();
  });

  it('range les tuiles dans l’ordre de leur identifiant (archive « clustered »)', () => {
    const ids = [...lireArchive(octets).tuiles()].map((t) => zxyToTileId(t.z, t.x, t.y));
    expect(ids).toHaveLength(40_000);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});

describe('alléger une archive entière', () => {
  const gz = (mvt: Uint8Array) => new Uint8Array(gzipSync(mvt));
  const optionsGzip = { ...OPTIONS, compressionTuiles: 2 as const };
  // Deux tuiles du zoom 12 qui ne diffèrent que par leurs bâtiments : une fois allégées, elles sont identiques.
  const A = tuile(couche('earth', [1]), couche('roads', [2]), couche('buildings', [7, 7, 7]));
  const B = tuile(couche('earth', [1]), couche('roads', [2]), couche('buildings', [8, 8]));
  const entree = ecrireArchive(
    [
      { z: 5, x: 16, y: 16, octets: gz(tuile(couche('earth'), couche('landuse'), couche('pois'))) },
      { z: 12, x: 100, y: 100, octets: gz(A) },
      { z: 12, x: 101, y: 100, octets: gz(B) },
    ],
    {
      ...optionsGzip,
      metadonnees: {
        attribution: '© OpenStreetMap',
        vector_layers: [
          { id: 'earth', minzoom: 0, maxzoom: 15, fields: {} },
          { id: 'buildings', minzoom: 11, maxzoom: 15, fields: {} },
          { id: 'landuse', minzoom: 2, maxzoom: 15, fields: {} },
          { id: 'pois', minzoom: 5, maxzoom: 15, fields: {} },
          { id: 'roads', minzoom: 3, maxzoom: 15, fields: {} },
        ],
      },
    },
  );

  it('applique les règles zoom par zoom, retire les couches du JSON et range une fois les tuiles devenues identiques', async () => {
    const { archive, bilan } = alleger(entree);
    const lue = lireArchive(archive);
    const noms = (z: number, x: number, y: number) => {
      const t = [...lue.tuiles()].find((u) => u.z === z && u.x === x && u.y === y)!;
      return nomsDesCouches(new Uint8Array(gunzipSync(t.octets)));
    };
    expect(noms(5, 16, 16)).toEqual(['earth']); // ni occupation du sol (zoom ≤ 10) ni commerces
    expect(noms(12, 100, 100)).toEqual(['earth', 'roads']); // plus de bâtiments
    expect(lue.entete.numAddressedTiles).toBe(3);
    expect(lue.entete.numTileContents).toBe(2); // les deux tuiles du zoom 12 sont devenues la même
    expect(bilan.octetsApres).toBeLessThan(bilan.octetsAvant);
    expect(bilan.parZoom.find((z) => z.zoom === 12)?.tuiles).toBe(2);

    const officielle = new PMTiles(new SourceMemoire(archive));
    const meta = (await officielle.getMetadata()) as {
      vector_layers: { id: string }[];
      attribution: string;
    };
    expect(meta.vector_layers.map((l) => l.id).sort()).toEqual(['earth', 'landuse', 'roads']);
    expect(meta.attribution).toBe('© OpenStreetMap');
    const t = await officielle.getZxy(12, 101, 100);
    expect(nomsDesCouches(new Uint8Array(t!.data))).toEqual(['earth', 'roads']);
  });
});

describe('contrôler une archive allégée', () => {
  const gz = (mvt: Uint8Array) => new Uint8Array(gzipSync(mvt));
  const options = { ...OPTIONS, compressionTuiles: 2 as const };

  it('ne trouve rien à dire d’une archive que l’outil vient d’alléger', () => {
    const brute = ecrireArchive(
      [
        {
          z: 5,
          x: 16,
          y: 16,
          octets: gz(tuile(couche('earth'), couche('landuse'), couche('pois'))),
        },
        {
          z: 12,
          x: 100,
          y: 100,
          octets: gz(tuile(couche('earth'), couche('landuse'), couche('buildings'))),
        },
      ],
      options,
    );
    expect(controler(alleger(brute).archive)).toEqual([]);
  });

  it('trouve une couche retirée qui serait encore là, et dit où (l’occupation du sol reste permise à partir du zoom 11)', () => {
    const archive = ecrireArchive(
      [
        { z: 5, x: 16, y: 16, octets: gz(tuile(couche('earth'), couche('landuse'))) },
        { z: 12, x: 100, y: 100, octets: gz(tuile(couche('earth'), couche('landuse'))) },
        { z: 12, x: 101, y: 100, octets: gz(tuile(couche('earth'), couche('buildings'))) },
      ],
      options,
    );
    const problemes = controler(archive);
    expect(problemes).toHaveLength(2);
    expect(problemes.join('\n')).toMatch(/5\/16\/16.*landuse/);
    expect(problemes.join('\n')).toMatch(/12\/101\/100.*buildings/);
  });

  it('trouve une tuile qu’on ne sait pas lire', () => {
    const archive = ecrireArchive(
      [{ z: 3, x: 1, y: 1, octets: gz(Uint8Array.from([26, 200, 1, 1])) }],
      options,
    );
    expect(controler(archive).join('\n')).toMatch(/3\/1\/1.*illisible/);
  });
});
