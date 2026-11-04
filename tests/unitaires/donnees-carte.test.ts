// Les données de la carte (ticket 102, décisions du fondateur du 03/11) : des fichiers GeoJSON construits avec
// le site. Les zones disent leur état public ; les écoles sont celles que des relais ont vues sur place.
import { describe, expect, it } from 'vitest';
import {
  cycleLePlusEleve,
  ecolesGeoJSON,
  libelleDeploiement,
  zonesGeoJSON,
} from '../../src/modele/carte/donnees';
import type { DivisionPublique, EcolePubliee } from '../../src/modele/ports';

const division = (
  id: string,
  parentId: string | null,
  niveau: number,
  genre: DivisionPublique['genre'],
  nom: string,
  slug: string,
  adresse: string[],
  reste: Partial<DivisionPublique> = {},
): DivisionPublique => ({
  id,
  parentId,
  niveau,
  genre,
  nom,
  slug,
  adresse,
  ordinal: null,
  alias: [],
  verifieeLe: '2026-11-03',
  ouverte: false,
  deploiement: null,
  position: null,
  contour: null,
  ...reste,
});

const D = [
  division('pays', null, 0, 'country', 'Congo', 'congo', ['congo']),
  division('pn-dep', 'pays', 1, 'department', 'Pointe-Noire', 'pointe-noire', [
    'congo',
    'pointe-noire',
  ]),
  division(
    'pn',
    'pn-dep',
    2,
    'city',
    'Pointe-Noire',
    'pointe-noire',
    ['congo', 'pointe-noire', 'pointe-noire'],
    { position: { latitude: -4.7975, longitude: 11.8503 } },
  ),
  division(
    'tie',
    'pn',
    3,
    'arrondissement',
    'Tié-Tié',
    'tie-tie',
    ['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'],
    { ordinal: 3, ouverte: true, deploiement: 'actif' },
  ),
  division(
    'lum',
    'pn',
    3,
    'arrondissement',
    'Lumumba',
    'lumumba',
    ['congo', 'pointe-noire', 'pointe-noire', 'lumumba'],
    { ordinal: 1, deploiement: 'programme' },
  ),
  division(
    'mvou',
    'pn',
    3,
    'arrondissement',
    'Mvou-Mvou',
    'mvou-mvou',
    ['congo', 'pointe-noire', 'pointe-noire', 'mvou-mvou'],
    { ordinal: 2 },
  ),
  division('bzv-dep', 'pays', 1, 'department', 'Brazzaville', 'brazzaville', [
    'congo',
    'brazzaville',
  ]),
  division(
    'bzv',
    'bzv-dep',
    2,
    'city',
    'Brazzaville',
    'brazzaville',
    ['congo', 'brazzaville', 'brazzaville'],
    { position: { latitude: -4.2694, longitude: 15.2712 }, deploiement: 'programme' },
  ),
];

const ecole = (id: string, reste: Partial<EcolePubliee> = {}): EcolePubliee => ({
  id,
  institutionId: `i-${id}`,
  divisionId: 'tie',
  slug: `ecole-${id}`,
  nom: `[École ${id}]`,
  etiquette: null,
  arrondissement: 'tie-tie',
  adresse: ['congo', 'pointe-noire', 'tie-tie'],
  divisionNoms: ['Congo', 'Pointe-Noire', 'Tié-Tié'],
  quartier: null,
  typeEcole: 'privee',
  niveaux: ['primaire'],
  programme: null,
  formations: [],
  repere: null,
  numeroEnseigne: null,
  latitude: -4.79,
  longitude: 11.92,
  etat: 'relevee',
  verifieeLe: null,
  releveeLe: '2026-11-02T10:00:00Z',
  situeeLe: null,
  misAJourLe: '2026-11-02T10:00:00Z',
  ...reste,
});

describe('le cycle le plus élevé', () => {
  it.each([
    [['maternelle', 'primaire', 'college'], 'C', 'college'],
    [['creche'], 'M', 'creche'],
    [['creche', 'maternelle'], 'M', 'maternelle'],
    [['primaire'], 'P', 'primaire'],
    [['college', 'lycee'], 'L', 'lycee'],
    [['lycee', 'technique'], 'T', 'technique'],
    [['superieur', 'primaire'], 'S', 'superieur'],
    [['autre_formation'], 'S', 'autre_formation'],
  ] as const)('%j : la lettre %s', (niveaux, lettre, cycle) => {
    expect(cycleLePlusEleve([...niveaux])).toEqual({ lettre, cycle });
  });

  it('n’en dit aucun quand l’école n’a noté aucun niveau', () => {
    expect(cycleLePlusEleve([])).toBeNull();
  });
});

describe('les écoles de la carte', () => {
  const vue = ecole('vue', { niveaux: ['maternelle', 'primaire', 'college'] });
  const confirmee = ecole('conf', { etat: 'verifiee', verifieeLe: '2026-11-04' });
  const ajoutee = ecole('ajoutee', { releveeLe: null, situeeLe: '2026-11-03T10:00:00Z' });
  const sansPosition = ecole('sans', { latitude: null, longitude: null });
  const collection = ecolesGeoJSON([vue, confirmee, ajoutee, sansPosition]);

  it('ne contient que les écoles vues sur place et situées', () => {
    expect(collection.type).toBe('FeatureCollection');
    expect(collection.features.map((f) => f.properties.id)).toEqual(['vue', 'conf']);
  });

  it('place chaque école en [longitude, latitude]', () => {
    expect(collection.features[0]?.geometry).toEqual({
      type: 'Point',
      coordinates: [11.92, -4.79],
    });
  });

  it('garde TOUS les cycles pour l’aperçu, et le plus élevé pour le marqueur', () => {
    expect(collection.features[0]?.properties).toMatchObject({
      nom: '[École vue]',
      lien: '/ecoles/congo/pointe-noire/tie-tie/ecole-vue/',
      niveaux: ['Maternelle', 'Primaire', 'Collège'],
      cycle: 'college',
      lettre: 'C',
      preuve: 'terrain',
      preuveTexte: 'Vue sur place le 2 novembre 2026',
    });
    expect(collection.features[1]?.properties).toMatchObject({
      preuve: 'direction',
      preuveTexte: 'Confirmée par la direction le 4 novembre 2026',
    });
  });

  it('porte le rang du cycle le plus élevé (1 à 6) pour regrouper, trier et filtrer', () => {
    const rang = (niveaux: EcolePubliee['niveaux']) =>
      ecolesGeoJSON([ecole('r', { niveaux })]).features[0]?.properties.rang;
    expect(rang(['creche'])).toBe(1);
    expect(rang(['maternelle'])).toBe(1);
    expect(rang(['primaire'])).toBe(2);
    expect(rang(['primaire', 'college'])).toBe(3);
    expect(rang(['college', 'lycee'])).toBe(4);
    expect(rang(['technique'])).toBe(5);
    expect(rang(['superieur'])).toBe(6);
    expect(rang(['autre_formation'])).toBe(6);
    expect(rang([])).toBeNull();
  });

  it('porte les lettres de TOUS les cycles, du plus bas au plus haut, une fois chacune : la lettre suit le filtre (D9)', () => {
    const lettres = (niveaux: EcolePubliee['niveaux']) =>
      ecolesGeoJSON([ecole('l', { niveaux })]).features[0]?.properties.lettres;
    expect(lettres(['maternelle', 'primaire', 'college'])).toBe('MPC');
    expect(lettres(['creche', 'maternelle'])).toBe('M');
    expect(lettres(['lycee', 'primaire'])).toBe('PL');
    expect(lettres(['superieur', 'autre_formation'])).toBe('S');
    expect(lettres([])).toBe('');
  });

  it('dit le type comme les listes du site, et rien quand il n’est pas connu', () => {
    const type = (typeEcole: EcolePubliee['typeEcole']) =>
      ecolesGeoJSON([ecole('t', { typeEcole })]).features[0]?.properties.type;
    expect(type('privee')).toBe('Privée');
    expect(type('publique')).toBe('Publique');
    expect(type('confessionnelle')).toBe('Confessionnelle');
    expect(type('communautaire')).toBe('Communautaire');
    expect(type('autre')).toBeNull();
    expect(type('non_indique')).toBeNull();
  });

  it('porte un repère court : espaces nettoyés, coupé sur un mot à 80 caractères, rien quand il est vide', () => {
    const repere = (r: string | null) =>
      ecolesGeoJSON([ecole('p', { repere: r })]).features[0]?.properties.repere;
    expect(repere('  En face de la station  ')).toBe('En face de la station');
    expect(repere('')).toBeNull();
    expect(repere('   ')).toBeNull();
    expect(repere(null)).toBeNull();
    const long =
      'Derrière le grand marché, à côté de la pharmacie, après le carrefour de la mairie et avant le rond-point';
    const coupe = repere(long) as string;
    expect(coupe.length).toBeLessThanOrEqual(80);
    expect(coupe.endsWith('…')).toBe(true);
    expect(coupe).not.toMatch(/[ ,;:]…$/);
    expect(long.startsWith(coupe.slice(0, -1))).toBe(true);
    // Un mot plus long que la place est coupé net, jamais perdu en entier.
    expect(repere('x'.repeat(200)) as string).toHaveLength(80);
  });

  it('n’écrit rien de privé', () => {
    const brut = JSON.stringify(ecolesGeoJSON([ecole('x', { numeroEnseigne: '242060000001' })]));
    expect(brut).not.toMatch(/242060000001|whatsapp|contact/i);
  });
});

describe('les zones de la carte', () => {
  const ecoles = [
    ecole('a', { releveeLe: '2026-11-02T10:00:00Z' }),
    ecole('b', { etat: 'verifiee', verifieeLe: '2026-11-04', releveeLe: '2026-11-05T10:00:00Z' }),
    ecole('c', { releveeLe: null, situeeLe: '2026-11-03T10:00:00Z' }),
  ];
  const contour = [
    [
      [
        [11.9, -4.78],
        [11.95, -4.78],
        [11.95, -4.82],
        [11.9, -4.78],
      ],
    ],
  ];
  const zones = zonesGeoJSON({
    divisions: D,
    ecoles,
    contourDe: (d) => (d.slug === 'tie-tie' || d.slug === 'lumumba' ? contour : null),
  });
  const parSlug = (slug: string) => zones.features.find((f) => f.properties.slug === slug);

  it('un arrondissement qui a son contour et un état est un polygone', () => {
    expect(parSlug('tie-tie')?.geometry.type).toBe('MultiPolygon');
    expect(parSlug('tie-tie')?.properties).toMatchObject({
      genre: 'zone',
      etat: 'actif',
      libelle: 'Relevé en cours',
    });
    expect(parSlug('lumumba')?.properties).toMatchObject({
      etat: 'programme',
      libelle: 'Déploiement programmé',
    });
  });

  it('une zone sans état public n’est pas sur la carte', () => {
    expect(parSlug('mvou-mvou')).toBeUndefined();
  });

  it('une ville qui a un point est un point, avec l’état de ce qu’elle contient', () => {
    const pn = zones.features.find(
      (f) => f.properties.genre === 'ville' && f.properties.slug === 'pointe-noire',
    );
    expect(pn?.geometry).toEqual({ type: 'Point', coordinates: [11.8503, -4.7975] });
    expect(pn?.properties.etat).toBe('actif');
    const bzv = zones.features.find(
      (f) => f.properties.genre === 'ville' && f.properties.slug === 'brazzaville',
    );
    expect(bzv?.properties.etat).toBe('programme');
  });

  it('le département de même nom qu’une ville n’est pas compté deux fois', () => {
    expect(zones.features.filter((f) => f.properties.nom === 'Pointe-Noire')).toHaveLength(1);
  });

  it('les compteurs sont publics et sans seuil : publiées, vues sur place, confirmées, dernier passage', () => {
    expect(parSlug('tie-tie')?.properties).toMatchObject({
      ecoles: 3,
      vues: 2,
      confirmees: 1,
      dernierPassage: '2026-11-05',
    });
    expect(parSlug('lumumba')?.properties).toMatchObject({ ecoles: 0, vues: 0, confirmees: 0 });
    expect(parSlug('lumumba')?.properties.dernierPassage).toBeNull();
    expect(JSON.stringify(zones)).not.toMatch(/seuil|objectif|D7/);
  });

  it('une zone dessinée a la page de ses écoles ; un lien n’est jamais inventé', () => {
    expect(parSlug('tie-tie')?.properties.lien).toBe('/ecoles/congo/pointe-noire/tie-tie/');
  });
});

describe('les contours des zones viennent de la base', () => {
  // Un carré de 1 km de côté avec dix points par côté, à sept décimales : la base garde plus que la carte n'en veut.
  const COTE = 0.009;
  const detaille: number[][] = [];
  for (let i = 0; i <= 10; i++) detaille.push([11.9 + (COTE * i) / 10 + 1e-8, -4.8 + 1e-8]);
  for (let i = 1; i <= 10; i++) detaille.push([11.9 + COTE + 1e-8, -4.8 + (COTE * i) / 10 + 1e-8]);
  for (let i = 1; i <= 10; i++)
    detaille.push([11.9 + COTE - (COTE * i) / 10 + 1e-8, -4.8 + COTE + 1e-8]);
  for (let i = 1; i <= 10; i++) detaille.push([11.9 + 1e-8, -4.8 + COTE - (COTE * i) / 10 + 1e-8]);
  detaille[detaille.length - 1] = detaille[0] as number[];

  const avec = (slug: string, niveau: number, reste: Partial<DivisionPublique>) =>
    D.map((d) => (d.slug === slug && d.niveau === niveau ? { ...d, ...reste } : d));
  const parSlug = (z: ReturnType<typeof zonesGeoJSON>, slug: string, genre?: string) =>
    z.features.filter(
      (f) => f.properties.slug === slug && (!genre || f.properties.genre === genre),
    );

  it('un arrondissement prend le contour de la base avant le repli dessiné', () => {
    const repli = [
      [
        [
          [1, 1],
          [2, 1],
          [2, 2],
          [1, 1],
        ],
      ],
    ];
    const zones = zonesGeoJSON({
      divisions: avec('lumumba', 3, { contour: [[detaille]] }),
      ecoles: [],
      contourDe: () => repli,
    });
    const lumumba = parSlug(zones, 'lumumba')[0];
    expect(lumumba?.geometry.type).toBe('MultiPolygon');
    expect(JSON.stringify(lumumba?.geometry)).not.toContain('[1,1]');
    expect(JSON.stringify(lumumba?.geometry)).toContain('11.9');
  });

  it('le repli dessiné sert quand la base n’a pas de contour', () => {
    const repli = [
      [
        [
          [11.9, -4.8],
          [11.95, -4.8],
          [11.95, -4.82],
          [11.9, -4.8],
        ],
      ],
    ];
    const zones = zonesGeoJSON({ divisions: D, ecoles: [], contourDe: () => repli });
    expect(parSlug(zones, 'tie-tie')[0]?.geometry.type).toBe('MultiPolygon');
  });

  it('le contour est simplifié à 10 m et arrondi au mètre : le téléphone n’en veut pas plus', () => {
    const zones = zonesGeoJSON({
      divisions: avec('lumumba', 3, { contour: [[detaille]] }),
      ecoles: [],
      contourDe: () => null,
    });
    const geometrie = parSlug(zones, 'lumumba')[0]?.geometry;
    expect(geometrie?.type).toBe('MultiPolygon');
    const anneau = (geometrie as { coordinates: number[][][][] }).coordinates[0]![0]!;
    expect(anneau).toHaveLength(5);
    for (const [lon, lat] of anneau) {
      expect(Number(lon!.toFixed(5))).toBe(lon);
      expect(Number(lat!.toFixed(5))).toBe(lat);
    }
  });

  it('la commune qui a un état propre et un contour sort aussi en polygone, en plus de son point', () => {
    const zones = zonesGeoJSON({
      divisions: avec('brazzaville', 2, { contour: [[detaille]] }),
      ecoles: [],
      contourDe: () => null,
    });
    const bzv = parSlug(zones, 'brazzaville').filter((f) => f.properties.nom === 'Brazzaville');
    expect(bzv.map((f) => f.properties.genre).sort()).toEqual(['ville', 'zone']);
    expect(bzv.map((f) => f.geometry.type).sort()).toEqual(['MultiPolygon', 'Point']);
    expect(bzv.every((f) => f.properties.etat === 'programme')).toBe(true);
    const polygone = bzv.find((f) => f.properties.genre === 'zone');
    expect(polygone?.properties).toMatchObject({
      libelle: 'Déploiement programmé',
      ecoles: 0,
      vues: 0,
    });
  });

  it('une ville qui n’a pas d’état propre reste un point seul, même quand la base a son contour', () => {
    const zones = zonesGeoJSON({
      divisions: avec('pointe-noire', 2, { contour: [[detaille]] }),
      ecoles: [],
      contourDe: () => null,
    });
    const pn = parSlug(zones, 'pointe-noire');
    expect(pn).toHaveLength(1);
    expect(pn[0]?.geometry.type).toBe('Point');
  });

  it('un arrondissement qui a un contour mais pas d’état n’est pas sur la carte (Brazzaville, aujourd’hui)', () => {
    const moungali = division(
      'moungali',
      'bzv',
      3,
      'arrondissement',
      'Moungali',
      'moungali',
      ['congo', 'brazzaville', 'brazzaville', 'moungali'],
      { contour: [[detaille]] },
    );
    const zones = zonesGeoJSON({ divisions: [...D, moungali], ecoles: [], contourDe: () => null });
    expect(parSlug(zones, 'moungali')).toHaveLength(0);
    expect(JSON.stringify(zones)).not.toContain('11.9009');
  });
});

describe('les mots de l’état public', () => {
  it('dit « relevé en cours » et « déploiement programmé », jamais « complet »', () => {
    expect(libelleDeploiement.actif).toBe('Relevé en cours');
    expect(libelleDeploiement.programme).toBe('Déploiement programmé');
    expect(JSON.stringify(libelleDeploiement)).not.toMatch(/complet|terminé|100/i);
  });
});

it('conserve les deux dates sans confondre confirmation et passage', () => {
  const f = ecolesGeoJSON([ecole('deux', { etat: 'verifiee', verifieeLe: '2026-11-04' })])
    .features[0]!;
  expect(f.properties.passage).toBe('2026-11-02T10:00:00Z');
  expect(f.properties.confirmation).toBe('2026-11-04');
  const g = ecolesGeoJSON([ecole('rue', { verifieeLe: '2026-11-04' })]).features[0]!;
  expect(g.properties.confirmation).toBeNull();
});
