import { describe, expect, it } from 'vitest';
import {
  lireVue,
  adresseVue,
  filtrerEcoles,
  lienCarteDuLieu,
} from '../../src/modele/carte/navigation';
import type { FeatureEcole } from '../../src/modele/carte/donnees';
const ecole = (id: string, lettres: string, x: number): FeatureEcole => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [x, -4.8] },
  properties: {
    id,
    nom: id,
    lien: '/ecoles/' + id + '/',
    lieu: 'Pointe-Noire',
    lettres,
    niveaux: [],
    niveauxLettres: [],
    cycle: null,
    lettre: 'S',
    rang: 6,
    type: null,
    repere: null,
    preuve: 'terrain',
    preuveTexte: 'Relevé terrain',
  },
});
describe('état partageable de la carte', () => {
  it('ignore une vue malformée ou hors du pays', () => {
    expect(lireVue('#15/NaN/12')).toBeNull();
    expect(lireVue('#15/48/2')).toBeNull();
    expect(lireVue('#15/-4.8/11.9/truc')).toBeNull();
  });
  it('borne le zoom selon les tuiles disponibles', () => {
    expect(lireVue('#17/-4.2/12.67')?.zoom).toBe(10);
    expect(lireVue('#99/-4.8/11.9')?.zoom).toBe(17.5);
  });
  it('partage une vue arrondie et relisible', () => {
    const hash = adresseVue({ zoom: 12.345, latitude: -4.81234567, longitude: 11.91234567 });
    expect(lireVue(hash)).toEqual({ zoom: 12.35, latitude: -4.81235, longitude: 11.91235 });
  });
  it('retient les écoles des groupes par leurs coordonnées, et change la lettre avec le cycle', () => {
    const all = [ecole('a', 'MPS', 11.9), ecole('b', 'S', 11.91), ecole('loin', 'M', 15.2)];
    const r = filtrerEcoles(all, 'M', [11.8, -4.9, 12, -4.7]);
    expect(r.map((e) => e.properties.id)).toEqual(['a']);
    expect(r[0]?.properties.lettre).toBe('M');
    expect(all[0]?.properties.lettre).toBe('S');
  });
});

describe('la carte cadrée sur un lieu (ticket 146 : les anciens plans et les pages de lieu y mènent)', () => {
  const vue = (lien: string) => {
    expect(lien.startsWith('/carte/#')).toBe(true);
    return lireVue(lien.slice('/carte/'.length));
  };
  it('cadre le contour quand la base le connaît', () => {
    const v = vue(
      lienCarteDuLieu({
        contour: [
          [
            [
              [11.85, -4.82],
              [11.9, -4.82],
              [11.9, -4.78],
              [11.85, -4.78],
              [11.85, -4.82],
            ],
          ],
        ],
        position: null,
      }),
    );
    expect(v).not.toBeNull();
    expect(v!.longitude).toBeCloseTo(11.875, 3);
    expect(v!.latitude).toBeCloseTo(-4.8, 3);
    expect(v!.zoom).toBeGreaterThan(11);
    expect(v!.zoom).toBeLessThan(15);
  });
  it('sans contour, ses écoles situées ; sans elles, son point ; sans rien, la carte par défaut', () => {
    const ecoles = [
      { latitude: -4.8, longitude: 11.86 },
      { latitude: null, longitude: null },
    ];
    const parEcoles = vue(lienCarteDuLieu({ contour: null, position: null, ecoles }));
    expect(parEcoles!.longitude).toBeCloseTo(11.86, 4);
    const parPoint = vue(
      lienCarteDuLieu({ contour: null, position: { latitude: -4.26, longitude: 15.28 } }),
    );
    expect(parPoint!.latitude).toBeCloseTo(-4.26, 4);
    expect(lienCarteDuLieu({ contour: null, position: null })).toBe('/carte/');
    expect(lienCarteDuLieu({ contour: null, position: null, ecoles: [ecoles[1]!] })).toBe(
      '/carte/',
    );
  });
});
