// L'outil qui tire les contours d'OpenStreetMap et écrit la migration (ticket 113, décision D3 du 03/11).
import { describe, expect, it } from 'vitest';
import {
  assemblerAnneaux,
  contourDeRelation,
  ENSEMBLES,
  migrationSql,
  requeteOverpass,
  TOLERANCE_M,
  verifierNom,
  verifierReponse,
  type Membre,
  type Relation,
} from '../../outils/tracer-les-contours';

type Coin = [number, number];
const way = (role: string, points: Coin[]) => ({
  type: 'way' as const,
  ref: 1,
  role,
  geometry: points.map(([lon, lat]) => ({ lat, lon })),
});
const relation = (membres: Membre[], tags: Record<string, string> = {}): Relation => ({
  type: 'relation',
  id: 99,
  tags,
  members: membres,
});

// Un carré de 0,02° de côté (≈ 2,2 km), en quatre voies qui se touchent par leurs bouts.
const A: Coin = [11.9, -4.82];
const B: Coin = [11.92, -4.82];
const C: Coin = [11.92, -4.8];
const D: Coin = [11.9, -4.8];

describe('assembler des voies en anneaux', () => {
  it('rejoint des voies dans le désordre et à l’envers', () => {
    const anneaux = assemblerAnneaux([[D, A], [C, D].reverse(), [B, C], [A, B]]);
    expect(anneaux).toHaveLength(1);
    expect(anneaux[0]).toHaveLength(5);
    expect(anneaux[0]![0]).toEqual(anneaux[0]![4]);
    expect(new Set(anneaux[0]!.map((p) => p.join()))).toEqual(
      new Set([A, B, C, D].map((p) => p.join())),
    );
  });

  it('garde à part deux anneaux qui ne se touchent pas', () => {
    const E: Coin = [12.0, -4.82];
    const F: Coin = [12.01, -4.82];
    const G: Coin = [12.01, -4.81];
    expect(
      assemblerAnneaux([
        [A, B, C, D, A],
        [E, F, G, E],
      ]),
    ).toHaveLength(2);
  });

  it('accepte une voie déjà fermée', () => {
    expect(assemblerAnneaux([[A, B, C, D, A]])).toEqual([[A, B, C, D, A]]);
  });

  it('refuse un contour ouvert, en le disant', () => {
    expect(() =>
      assemblerAnneaux([
        [A, B],
        [B, C],
      ]),
    ).toThrow(/ouvert/i);
  });
});

describe('le contour d’une relation', () => {
  it('fait un polygone d’un extérieur et met l’extérieur dans le sens direct', () => {
    // Les voies sont données dans le sens des aiguilles d’une montre : l’outil retourne l’anneau (norme GeoJSON).
    const contour = contourDeRelation(relation([way('outer', [A, D, C]), way('outer', [C, B, A])]));
    expect(contour).toHaveLength(1);
    expect(contour[0]).toHaveLength(1);
    const anneau = contour[0]![0]!;
    const aire = anneau.slice(0, -1).reduce((s, p, i) => {
      const q = anneau[i + 1]!;
      return s + (p[0]! * q[1]! - q[0]! * p[1]!);
    }, 0);
    expect(aire).toBeGreaterThan(0);
  });

  it('range un trou dans l’extérieur qui le contient', () => {
    const h1: Coin = [11.905, -4.815];
    const h2: Coin = [11.91, -4.815];
    const h3: Coin = [11.91, -4.81];
    const contour = contourDeRelation(
      relation([way('outer', [A, B, C, D, A]), way('inner', [h1, h2, h3, h1])]),
    );
    expect(contour).toHaveLength(1);
    expect(contour[0]).toHaveLength(2);
  });

  it('refuse un trou qu’aucun extérieur ne contient', () => {
    const loin: Coin[] = [
      [13, -4],
      [13.1, -4],
      [13.1, -3.9],
      [13, -4],
    ];
    expect(() =>
      contourDeRelation(relation([way('outer', [A, B, C, D, A]), way('inner', loin)])),
    ).toThrow(/trou/i);
  });

  it('refuse une voie dont des points manquent', () => {
    const incomplete = {
      type: 'way' as const,
      ref: 2,
      role: 'outer',
      geometry: [{ lat: -4.8, lon: 11.9 }, null],
    };
    expect(() => contourDeRelation(relation([incomplete]))).toThrow(/point/i);
  });

  it('ignore les membres qui ne sont pas des voies (centre, sous-zones)', () => {
    const contour = contourDeRelation(
      relation([
        { type: 'node', ref: 5, role: 'admin_centre' },
        { type: 'relation', ref: 6, role: 'subarea' },
        way('outer', [A, B, C, D, A]),
      ]),
    );
    expect(contour).toHaveLength(1);
  });
});

describe('les relations attendues', () => {
  it('Brazzaville : la commune et ses neuf arrondissements, chacun avec sa relation et son chemin', () => {
    const e = ENSEMBLES.brazzaville!;
    expect(e).toHaveLength(10);
    expect(new Set(e.map((c) => c.relation)).size).toBe(10);
    expect(new Set(e.map((c) => c.chemin)).size).toBe(10);
    expect(e.filter((c) => c.ordre !== undefined).map((c) => c.ordre)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
    expect(e.find((c) => c.chemin === 'congo.brazzaville.brazzaville')?.relation).toBe(16370691);
    expect(e.find((c) => c.chemin === 'congo.brazzaville.brazzaville.poto_poto')?.relation).toBe(
      16357198,
    );
  });

  it('accepte le nom d’OpenStreetMap sans accent et refuse un autre numéro d’ordre', () => {
    const ouenze = ENSEMBLES.brazzaville!.find((c) => c.nom === 'Ouenzé')!;
    const bon = relation([], {
      name: 'Ouenze (arrondissement 5)',
      boundary: 'administrative',
      admin_level: '6',
    });
    expect(() => verifierNom(bon, ouenze)).not.toThrow();
    const mauvais = relation([], {
      name: 'Ouenze (arrondissement 6)',
      boundary: 'administrative',
      admin_level: '6',
    });
    expect(() => verifierNom(mauvais, ouenze)).toThrow(/arrondissement 5/);
  });

  it('refuse une relation qui n’est pas une limite administrative', () => {
    const commune = ENSEMBLES.brazzaville![0]!;
    expect(() =>
      verifierNom(relation([], { name: 'Brazzaville (commune)', admin_level: '5' }), commune),
    ).toThrow(/administrative/);
  });
});

describe('la requête et la réponse d’Overpass', () => {
  it('demande les relations par leur numéro, avec leur géométrie', () => {
    expect(requeteOverpass([16370691, 16356192])).toBe(
      '[out:json][timeout:180];rel(id:16370691,16356192);out geom;',
    );
  });

  it('refuse une réponse coupée par le serveur', () => {
    expect(() =>
      verifierReponse({ elements: [], remark: 'runtime error: Query timed out' }, [1]),
    ).toThrow(/Overpass/);
  });

  it('refuse une réponse où il manque une relation', () => {
    expect(() => verifierReponse({ elements: [{ type: 'relation', id: 1 }] }, [1, 2])).toThrow(/2/);
  });

  it('rend la réponse quand tout y est', () => {
    const r = verifierReponse(
      {
        elements: [{ type: 'relation', id: 1 }],
        osm3s: { timestamp_osm_base: '2026-11-03T22:35:46Z' },
      },
      [1],
    );
    expect(r.elements).toHaveLength(1);
  });
});

describe('la migration de données', () => {
  const contour = [[[A, B, C, D, A]]] as unknown as number[][][][];
  const sql = migrationSql(
    [
      { attendu: ENSEMBLES.brazzaville![0]!, contour },
      { attendu: ENSEMBLES.brazzaville![3]!, contour },
    ],
    { date: '03/11/2026' },
  );

  it('met le contour, la relation et la source dans la division, par son chemin', () => {
    expect(sql).toMatch(/update public\.geo_divisions set/);
    expect(sql).toMatch(/where path::text = 'congo\.brazzaville\.brazzaville'/);
    expect(sql).toMatch(/osm_relation = 16370691/);
    expect(sql).toMatch(
      /source = source \|\| ' ; contour OpenStreetMap, relation 16370691, base du 03\/11\/2026, simplifié à 10 m/,
    );
    expect(TOLERANCE_M).toBe(10);
  });

  it('double les apostrophes du texte de la source', () => {
    expect(sql).toMatch(/© les contributeurs d''OpenStreetMap, licence ODbL/);
  });

  it('porte un GeoJSON qu’on peut relire', () => {
    const json = /st_geomfromgeojson\('([^']+)'\)/.exec(sql)?.[1];
    expect(JSON.parse(json!)).toEqual({ type: 'MultiPolygon', coordinates: contour });
  });

  it('échoue bruyamment si une division manque : le nombre de contours posés est vérifié', () => {
    expect(sql).toMatch(/raise exception/);
    expect(sql).toMatch(/<> 2/);
  });
});
