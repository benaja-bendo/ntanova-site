// Refonte publique, lot 1 (24/11/2026) : le dessin de l'accueil. Les points jaunes et les villes viennent des positions
// publiées, jamais d'un dessin figé ; une école sans position n'allume rien ; aucune étiquette n'en couvre une autre.
import { describe, expect, it } from 'vitest';
import {
  CONTOUR_DU_CONGO,
  carteDeLAccueil,
  placerLesEtiquettes,
} from '../../src/modele/carte-accueil';
import { construireArbre } from '../../src/modele/geo-divisions';
import type { DivisionPublique, EcolePubliee } from '../../src/modele/ports';

const division = (
  id: string,
  parentId: string | null,
  niveau: number,
  genre: DivisionPublique['genre'],
  nom: string,
  slug: string,
): DivisionPublique => ({
  id,
  parentId,
  niveau,
  genre,
  nom,
  slug,
  adresse: [],
  ordinal: null,
  alias: [],
  deploiement: null,
  position: null,
  contour: null,
  verifieeLe: null,
  ouverte: false,
});

let n = 0;
const ecole = (
  divisionId: string,
  latitude: number | null,
  longitude: number | null,
): EcolePubliee => {
  n += 1;
  return {
    id: `e${n}`,
    institutionId: `i${n}`,
    divisionId,
    slug: `ecole-${n}`,
    numero: String(100000 + n),
    nom: `École ${n}`,
    etiquette: null,
    arrondissement: '',
    adresse: [],
    divisionNoms: [],
    quartier: null,
    typeEcole: 'privee',
    niveaux: ['primaire'],
    programme: null,
    formations: [],
    repere: null,
    numeroEnseigne: null,
    latitude,
    longitude,
    etat: 'relevee',
    verifieeLe: null,
    releveeLe: null,
    situeeLe: null,
    misAJourLe: '2026-11-02T10:00:00Z',
  };
};

const DIVISIONS: DivisionPublique[] = [
  division('cg', null, 0, 'country', 'Congo', 'congo'),
  division('pn-dep', 'cg', 1, 'department', 'Pointe-Noire', 'pointe-noire'),
  division('pn', 'pn-dep', 2, 'city', 'Pointe-Noire', 'pointe-noire'),
  division('lo', 'pn', 3, 'arrondissement', 'Loandjili', 'loandjili'),
  division('bz-dep', 'cg', 1, 'department', 'Brazzaville', 'brazzaville'),
  division('bz', 'bz-dep', 2, 'city', 'Brazzaville', 'brazzaville'),
  division('ni', 'cg', 1, 'department', 'Niari', 'niari'),
  division('do', 'ni', 2, 'city', 'Dolisie', 'dolisie'),
];

describe('le dessin de l’accueil', () => {
  it('un point jaune par case où une école publiée est située ; plus d’écoles, un point plus gros', () => {
    const carte = carteDeLAccueil(
      construireArbre(DIVISIONS, [
        ecole('lo', -4.78, 11.86),
        ecole('lo', -4.781, 11.861),
        ecole('bz', -4.26, 15.27),
        ecole('bz', null, null),
      ]),
    );
    expect(carte.points).toHaveLength(2);
    const [petit, gros] = [...carte.points].sort((a, b) => a.r - b.r);
    expect(gros!.r).toBeGreaterThan(petit!.r);
    // Brazzaville est à l'est de Pointe-Noire, et plus au nord.
    const pn = carte.villes.find((v) => v.nom === 'Pointe-Noire')!;
    const bz = carte.villes.find((v) => v.nom === 'Brazzaville')!;
    expect(bz.x).toBeGreaterThan(pn.x);
    expect(bz.y).toBeLessThan(pn.y);
    // Le total de la ville compte aussi ses écoles sans position ; l'étiquette est dans le dessin.
    expect(bz.total).toBe(2);
    for (const v of carte.villes) {
      expect(v.gauche).toBeGreaterThan(0);
      expect(v.gauche).toBeLessThan(100);
      expect(v.haut).toBeGreaterThan(0);
      expect(v.haut).toBeLessThan(100);
      expect(v.lien).toMatch(/^\/ecoles\/[a-z-]+\/$/);
    }
  });

  it('aucune école située : aucun point, aucune étiquette, le pays seul', () => {
    const carte = carteDeLAccueil(construireArbre(DIVISIONS, [ecole('do', null, null)]));
    expect(carte.points).toEqual([]);
    expect(carte.villes).toEqual([]);
    expect(carte.contour.split(' ')).toHaveLength(CONTOUR_DU_CONGO.length);
  });

  it('une position hors du pays dessiné (une erreur de saisie) n’allume rien', () => {
    const carte = carteDeLAccueil(construireArbre(DIVISIONS, [ecole('lo', 48.85, 2.35)]));
    expect(carte.points).toEqual([]);
    expect(carte.villes).toEqual([]);
  });

  it('les étiquettes ne se couvrent pas : Dolisie, proche de Pointe-Noire, prend une autre place', () => {
    const carte = carteDeLAccueil(
      construireArbre(DIVISIONS, [
        ecole('lo', -4.78, 11.86),
        ecole('lo', -4.79, 11.87),
        ecole('do', -4.2, 12.67),
        ecole('bz', -4.26, 15.27),
      ]),
    );
    const places = Object.fromEntries(carte.villes.map((v) => [v.nom, v.place]));
    // La plus fournie se pose la première, à droite à l'ouest ; Brazzaville, à l'est, à gauche (la famille est à droite).
    expect(places['Pointe-Noire']).toBe('droite-milieu');
    expect(places['Brazzaville']).toMatch(/^gauche-/);
    // Dolisie n'a plus de place libre : son point jaune reste, son étiquette attend la liste « Par ville ».
    expect(places['Dolisie']).toBeUndefined();
    expect(carte.points).toHaveLength(3);
  });

  it('Pointe-Noire, Brazzaville et Ouesso ont chacune leur étiquette, quelle que soit la ville la plus fournie', () => {
    const divisions = [...DIVISIONS, division('ou', 'cg', 2, 'city', 'Ouesso', 'ouesso')];
    const a = (n: number, d: string, lat: number, lon: number) =>
      Array.from({ length: n }, (_, i) => ecole(d, lat + i / 1000, lon + i / 1000));
    for (const [pn, bz] of [
      [51, 32],
      [20, 60],
    ] as const) {
      const carte = carteDeLAccueil(
        construireArbre(divisions, [
          ...a(pn, 'lo', -4.78, 11.86),
          ...a(bz, 'bz', -4.26, 15.27),
          ...a(1, 'ou', 1.61, 16.05),
        ]),
      );
      expect(carte.villes.map((v) => v.nom).sort()).toEqual([
        'Brazzaville',
        'Ouesso',
        'Pointe-Noire',
      ]);
    }
  });

  it('sans place libre, une étiquette de plus ne se pose jamais sur une autre', () => {
    const villes = placerLesEtiquettes(
      Array.from({ length: 12 }, (_, i) => ({
        nom: `V${i}`,
        lien: `/ecoles/v${i}/`,
        total: 1,
        x: 0,
        y: 0,
        gauche: 30,
        haut: 50,
      })),
    );
    // Au même point, six places possibles au plus, et en réalité moins : jamais deux à la même.
    expect(villes.length).toBeGreaterThan(0);
    expect(villes.length).toBeLessThanOrEqual(6);
    expect(new Set(villes.map((v) => v.place)).size).toBe(villes.length);
  });
});
