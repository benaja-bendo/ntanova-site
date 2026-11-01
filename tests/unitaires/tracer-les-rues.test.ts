import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AGENT_HTTP,
  avecLesRues,
  LONGUEUR_MINIMALE_M,
  requeteOverpass,
  serialiser,
  SERVEUR_OVERPASS,
  telecharger,
  TOLERANCE_M,
  versRues,
  type DonneesCarte,
  type Voie,
} from '../../outils/tracer-les-rues';
import { boiteDeContours } from '../../src/modele/carte/geometrie';
import type { MultiPolygone } from '../../src/modele/geo';

// Un arrondissement fictif d'environ 2,2 km de côté (11,90 à 11,92 est, 4,82 à 4,80 sud), et des
// voies faites à la main : à cette latitude, 0,001° de longitude fait 111 m, 0,001° de latitude aussi.
const contour: MultiPolygone = [
  [
    [
      [11.9, -4.82],
      [11.92, -4.82],
      [11.92, -4.8],
      [11.9, -4.8],
      [11.9, -4.82],
    ],
  ],
];

type Coin = [longitude: number, latitude: number];
const voie = (highway: string | undefined, ...points: (Coin | null)[]): Voie => ({
  ...(highway === undefined ? {} : { tags: { highway } }),
  geometry: points.map((p) => (p === null ? null : { lon: p[0], lat: p[1] })),
});

/** Une rue droite de l'ouest vers l'est dans le contour, longue de `longueurDegres` de longitude. */
const droite = (highway: string, longueurDegres: number, latitude = -4.81): Voie =>
  voie(highway, [11.901, latitude], [11.901 + longueurDegres, latitude]);

describe('la requête envoyée à Overpass', () => {
  const boite = boiteDeContours([contour]);

  it('demande les voies de la boîte de l’arrondissement, avec une marge pour que les rues du bord arrivent jusqu’au bord', () => {
    // Overpass range les côtés ainsi : sud, ouest, nord, est.
    expect(requeteOverpass(boite)).toContain('(-4.822,11.898,-4.798,11.922)');
  });

  it('ne demande que les classes que la carte dessine : ni chemins, ni pistes, ni voies de service', () => {
    const requete = requeteOverpass(boite);
    for (const classe of [
      'trunk',
      'primary',
      'secondary',
      'tertiary',
      'residential',
      'unclassified',
      'living_street',
    ]) {
      expect(requete, classe).toMatch(new RegExp(`[(|]${classe}[|)]`));
    }
    expect(requete).not.toMatch(/service|track|footway|path|link/);
  });

  it('demande les étiquettes et la géométrie, en JSON, avec un délai assez long pour un arrondissement', () => {
    const requete = requeteOverpass(boite);
    expect(requete).toContain('[out:json]');
    expect(requete).toContain('[timeout:120]');
    expect(requete).toMatch(/out tags geom;$/);
  });
});

describe('les rues d’un arrondissement tirées des voies d’OpenStreetMap (règles de Tié-Tié)', () => {
  it('garde une longue rue, avec la longitude avant la latitude', () => {
    const { rues, avenues } = versRues([droite('residential', 0.01)], contour);
    expect(rues).toEqual([
      [
        [11.901, -4.81],
        [11.911, -4.81],
      ],
    ]);
    expect(avenues).toEqual([]);
  });

  it(`écarte une rue de moins de ${LONGUEUR_MINIMALE_M} m et garde celle qui les dépasse`, () => {
    // 0,0057° de longitude : 632 m ; 0,0059° : 654 m.
    const courte = droite('residential', 0.0057);
    const longue = droite('residential', 0.0059, -4.812);
    expect(versRues([courte], contour).rues).toEqual([]);
    expect(versRues([longue], contour).rues).toHaveLength(1);
  });

  it.each(['trunk', 'primary', 'secondary', 'tertiary'])(
    'garde toujours une avenue (%s), même courte, parmi les avenues',
    (classe) => {
      const { rues, avenues } = versRues([droite(classe, 0.001)], contour);
      expect(rues).toEqual([]);
      expect(avenues).toHaveLength(1);
    },
  );

  it.each(['residential', 'unclassified', 'living_street'])(
    'range une longue voie %s parmi les rues',
    (classe) => {
      expect(versRues([droite(classe, 0.01)], contour).rues).toHaveLength(1);
    },
  );

  it.each([
    'service',
    'track',
    'footway',
    'path',
    'pedestrian',
    'steps',
    'tertiary_link',
    'trunk_link',
    'construction',
  ])('ne dessine pas une voie %s', (classe) => {
    expect(versRues([droite(classe, 0.02)], contour)).toEqual({ rues: [], avenues: [] });
  });

  it('ne dessine pas une voie sans classe, sans géométrie ou d’un seul point', () => {
    const sansClasse = voie(undefined, [11.901, -4.81], [11.911, -4.81]);
    const sansGeometrie: Voie = { tags: { highway: 'residential' } };
    const unSeulPoint = voie('residential', [11.905, -4.81]);
    expect(versRues([sansClasse, sansGeometrie, unSeulPoint], contour)).toEqual({
      rues: [],
      avenues: [],
    });
  });

  it('ne dessine pas une voie entièrement hors de l’arrondissement', () => {
    const dehors = voie('tertiary', [11.95, -4.81], [11.96, -4.81]);
    expect(versRues([dehors], contour)).toEqual({ rues: [], avenues: [] });
  });

  it('coupe une rue qui sort de l’arrondissement, en gardant le premier point de dehors de chaque côté', () => {
    // Un coude à 556 m de la ligne droite, de quoi garder les cinq points.
    const traverse = voie(
      'residential',
      [11.89, -4.81], // dehors, à l'ouest
      [11.905, -4.81],
      [11.91, -4.815],
      [11.915, -4.81],
      [11.93, -4.81], // dehors, à l'est
    );
    expect(versRues([traverse], contour).rues).toEqual([
      [
        [11.89, -4.81],
        [11.905, -4.81],
        [11.91, -4.815],
        [11.915, -4.81],
        [11.93, -4.81],
      ],
    ]);
  });

  it('ne garde pas les points de dehors qui ne touchent pas l’arrondissement', () => {
    // Deux points dehors à l'ouest : seul le dernier, qui rejoint le contour, est gardé.
    const longue = voie(
      'residential',
      [11.88, -4.8],
      [11.89, -4.81],
      [11.905, -4.812],
      [11.911, -4.805],
    );
    const [ligne] = versRues([longue], contour).rues;
    expect(ligne?.[0]).toEqual([11.89, -4.81]);
    expect(ligne).toHaveLength(3);
  });

  it('fait deux lignes d’une rue qui sort puis rentre', () => {
    const sortRentre = voie(
      'residential',
      [11.903, -4.805],
      [11.912, -4.81],
      [11.935, -4.81], // dehors
      [11.935, -4.815], // dehors
      [11.912, -4.815],
      [11.903, -4.818],
    );
    expect(versRues([sortRentre], contour).rues).toEqual([
      [
        [11.903, -4.805],
        [11.912, -4.81],
        [11.935, -4.81],
      ],
      [
        [11.935, -4.815],
        [11.912, -4.815],
        [11.903, -4.818],
      ],
    ]);
  });

  it(`aplatit ce qui dévie de moins de ${TOLERANCE_M} m, et garde un vrai coude`, () => {
    const milieu = (ecart: number) =>
      voie('residential', [11.901, -4.81], [11.906, -4.81 + ecart], [11.911, -4.81]);
    // 0,00009° : 10 m. 0,00054° : 60 m.
    expect(versRues([milieu(0.00009)], contour).rues[0]).toHaveLength(2);
    expect(versRues([milieu(0.00054)], contour).rues[0]).toHaveLength(3);
  });

  it('retire les points alignés', () => {
    const alignee = voie(
      'tertiary',
      [11.901, -4.81],
      [11.903, -4.81],
      [11.906, -4.81],
      [11.909, -4.81],
      [11.911, -4.81],
    );
    expect(versRues([alignee], contour).avenues[0]).toEqual([
      [11.901, -4.81],
      [11.911, -4.81],
    ]);
  });

  it('arrondit à cinq décimales (un mètre), assez pour que la carte ne les voie pas', () => {
    const fine = voie('tertiary', [11.9012345, -4.8100049], [11.9112351, -4.8099951]);
    expect(versRues([fine], contour).avenues).toEqual([
      [
        [11.90123, -4.81],
        [11.91124, -4.81],
      ],
    ]);
  });

  it('saute les points que le serveur n’a pas donnés : sa boîte coupe les voies qui la dépassent', () => {
    const coupee = voie('residential', [11.901, -4.81], null, [11.911, -4.81]);
    expect(versRues([coupee], contour).rues).toEqual([
      [
        [11.901, -4.81],
        [11.911, -4.81],
      ],
    ]);
  });

  it('garde l’ordre des voies, et ne touche pas à ce qu’on lui donne', () => {
    const voies = [droite('residential', 0.01, -4.811), droite('tertiary', 0.002, -4.809)];
    const avant = structuredClone(voies);
    const a = versRues(voies, contour);
    expect(voies).toEqual(avant);
    expect(versRues(voies, contour)).toEqual(a);
    expect(a.rues[0]?.[0]).toEqual([11.901, -4.811]);
  });

  it('range les rues et les avenues chacune de son côté, dans l’ordre où elles arrivent', () => {
    const voies = [
      droite('tertiary', 0.002, -4.805),
      droite('residential', 0.01, -4.806),
      droite('trunk', 0.003, -4.807),
      droite('unclassified', 0.01, -4.808),
    ];
    const { rues, avenues } = versRues(voies, contour);
    expect(avenues.map((a) => a[0]?.[1])).toEqual([-4.805, -4.807]);
    expect(rues.map((r) => r[0]?.[1])).toEqual([-4.806, -4.808]);
  });
});

describe('l’ajout des rues d’un arrondissement dans le fichier des tracés', () => {
  const rues = { rues: [[[11.9, -4.8]]], avenues: [] };
  const tieTie = { rues: [[[11.8, -4.7]]], avenues: [[[11.8, -4.7]]] };
  const donnees: DonneesCarte = {
    arrondissements: [{ slug: 'ngoyo', nom: 'Ngoyo', contour }],
    rues: { 'tie-tie': tieTie },
  };

  it('ajoute l’arrondissement et laisse les autres tels quels', () => {
    const apres = avecLesRues(donnees, 'ngoyo', rues);
    expect(apres.rues.ngoyo).toBe(rues);
    expect(apres.rues['tie-tie']).toBe(tieTie);
    expect(apres.arrondissements).toBe(donnees.arrondissements);
  });

  it('ne change pas ce qu’on lui donne', () => {
    const avant = structuredClone(donnees);
    avecLesRues(donnees, 'ngoyo', rues);
    expect(donnees).toEqual(avant);
  });

  it('refuse de refaire des rues déjà dessinées, sauf si on le demande', () => {
    expect(() => avecLesRues(donnees, 'tie-tie', rues)).toThrow(/tie-tie.*--remplacer/);
    expect(avecLesRues(donnees, 'tie-tie', rues, true).rues['tie-tie']).toBe(rues);
  });

  it('réécrit le fichier des tracés sans en changer un octet, sauf ce qu’on ajoute', () => {
    const fichier = readFileSync(
      new URL('../../src/modele/carte/pointe-noire.json', import.meta.url),
      'utf8',
    );
    expect(serialiser(JSON.parse(fichier))).toBe(fichier);
  });
});

describe('le téléchargement depuis Overpass', () => {
  const boite = boiteDeContours([contour]);
  const reponse = { elements: [droite('residential', 0.01)], osm3s: {} };
  const appels: { url: string; init: RequestInit }[] = [];
  const serveur = (r: Response): typeof fetch =>
    (async (url: string | URL | Request, init?: RequestInit) => {
      appels.push({ url: String(url), init: init ?? {} });
      return r;
    }) as typeof fetch;
  const json = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  it('interroge le serveur d’OpenStreetMap France avec la requête de l’arrondissement', async () => {
    appels.length = 0;
    const lu = await telecharger(boite, serveur(json(reponse)));
    expect(lu.elements).toHaveLength(1);
    expect(appels).toHaveLength(1);
    expect(appels[0]?.url).toBe(SERVEUR_OVERPASS);
    expect(SERVEUR_OVERPASS).toBe('https://overpass.openstreetmap.fr/api/interpreter');
    expect(appels[0]?.init.method).toBe('POST');
    expect(new URLSearchParams(String(appels[0]?.init.body)).get('data')).toBe(
      requeteOverpass(boite),
    );
  });

  it('se présente sous un nom générique, jamais avec une adresse e-mail', async () => {
    appels.length = 0;
    await telecharger(boite, serveur(json(reponse)));
    const agent = new Headers(appels[0]?.init.headers).get('user-agent');
    expect(agent).toBe(AGENT_HTTP);
    expect(AGENT_HTTP).not.toMatch(/@|mailto|\.com/);
  });

  it('dit le code quand le serveur refuse', async () => {
    await expect(telecharger(boite, serveur(json({}, 429)))).rejects.toThrow(/429/);
    await expect(telecharger(boite, serveur(json({}, 504)))).rejects.toThrow(/504/);
  });

  it('refuse une réponse que le serveur dit incomplète : il répond 200 même quand il a coupé', async () => {
    const coupee = json({
      elements: reponse.elements,
      remark: 'runtime error: Query timed out in "query" at line 1 after 181 seconds.',
    });
    await expect(telecharger(boite, serveur(coupee))).rejects.toThrow(/timed out/);
  });

  it('refuse une réponse sans aucune voie : on n’écrase pas un fichier avec du vide', async () => {
    await expect(telecharger(boite, serveur(json({ elements: [] })))).rejects.toThrow(
      /aucune voie/i,
    );
    await expect(telecharger(boite, serveur(json({})))).rejects.toThrow(/aucune voie/i);
  });
});
