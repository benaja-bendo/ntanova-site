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

describe('les mots de l’état public', () => {
  it('dit « relevé en cours » et « déploiement programmé », jamais « complet »', () => {
    expect(libelleDeploiement.actif).toBe('Relevé en cours');
    expect(libelleDeploiement.programme).toBe('Déploiement programmé');
    expect(JSON.stringify(libelleDeploiement)).not.toMatch(/complet|terminé|100/i);
  });
});
