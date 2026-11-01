import { describe, expect, it } from 'vitest';
import {
  dansLeLot,
  distanceAuContour,
  TOLERANCE_LOT_M,
  type MultiPolygone,
  type Point,
} from '../../src/modele/geo';

// Les mêmes lots et les mêmes positions que `supabase/tests/hors_du_lot.test.sql` :
// le téléphone prévient, la base tranche. À cette latitude, 0,00027° de longitude font 30 m.

const lotFin: MultiPolygone = [
  [
    [
      [12.52, -4.88],
      [12.54, -4.88],
      [12.54, -4.86],
      [12.52, -4.86],
      [12.52, -4.88],
    ],
  ],
];

/** Un point sur la latitude du milieu du lot. */
const ici = (longitude: number, latitude = -4.87): Point => ({ latitude, longitude });

describe('la distance d’un point au contour d’un lot', () => {
  it('est nulle dans le contour', () => {
    expect(distanceAuContour(ici(12.53), lotFin)).toBe(0);
  });

  it('se compte en mètres depuis le bord le plus proche', () => {
    expect(distanceAuContour(ici(12.54027), lotFin)).toBeCloseTo(30, 0);
    expect(distanceAuContour(ici(12.54072), lotFin)).toBeCloseTo(80, 0);
    expect(distanceAuContour(ici(12.51928), lotFin)).toBeCloseTo(80, 0); // à l’ouest
    expect(distanceAuContour(ici(12.53, -4.85928), lotFin)).toBeCloseTo(80, 0); // au nord
  });

  it('compte la longitude à l’échelle de la latitude, et pas seulement près de l’équateur', () => {
    // À 60,5° de latitude, un degré de longitude ne fait que 55 km : 0,001° font 55 m, et non 111 m.
    const nord: MultiPolygone = [
      [
        [
          [10, 60],
          [11, 60],
          [11, 61],
          [10, 61],
          [10, 60],
        ],
      ],
    ];
    expect(distanceAuContour({ latitude: 60.5, longitude: 11.001 }, nord)).toBeCloseTo(54.75, 0);
  });

  it('se compte depuis le coin, et non depuis le prolongement d’un côté', () => {
    // 30 m à l’est et 40 m au nord du coin nord-est : 50 m en ligne droite.
    const pres = { latitude: -4.86 + 0.00036, longitude: 12.54 + 0.00027 };
    expect(distanceAuContour(pres, lotFin)).toBeCloseTo(50, 0);
  });

  it('se compte depuis le bord du trou quand le point est dans un trou', () => {
    const avecTrou: MultiPolygone = [
      [
        [
          [12.5, -4.9],
          [12.6, -4.9],
          [12.6, -4.8],
          [12.5, -4.8],
          [12.5, -4.9],
        ],
        [
          [12.52, -4.88],
          [12.54, -4.88],
          [12.54, -4.86],
          [12.52, -4.86],
          [12.52, -4.88],
        ],
      ],
    ];
    // Dans le trou, à 20 m de son bord est : hors du contour, mais tout près.
    expect(distanceAuContour(ici(12.54 - 0.00018), avecTrou)).toBeCloseTo(20, 0);
  });

  it('prend le polygone le plus proche d’un contour en plusieurs morceaux', () => {
    const deux: MultiPolygone = [
      ...lotFin,
      [
        [
          [12.6, -4.88],
          [12.62, -4.88],
          [12.62, -4.86],
          [12.6, -4.86],
          [12.6, -4.88],
        ],
      ],
    ];
    expect(distanceAuContour(ici(12.59973), deux)).toBeCloseTo(30, 0);
    expect(distanceAuContour(ici(12.54027), deux)).toBeCloseTo(30, 0);
  });

  it('est infinie quand le contour est vide', () => {
    expect(distanceAuContour(ici(12.53), [])).toBe(Infinity);
  });
});

describe('dans le lot, avec une tolérance de 50 m', () => {
  const lot = { essai: false, contour: lotFin };

  it('garde la même valeur que la base : 50 m', () => {
    expect(TOLERANCE_LOT_M).toBe(50);
  });

  it('compte dans le lot une école dans le contour, ou à 30 m de lui', () => {
    expect(dansLeLot(ici(12.53), lot)).toBe(true);
    expect(dansLeLot(ici(12.54027), lot)).toBe(true);
  });

  it('compte hors du lot une école à 80 m du contour', () => {
    expect(dansLeLot(ici(12.54072), lot)).toBe(false);
  });

  it('coupe à 50 m : 49 m est dans le lot, 51 m est hors du lot', () => {
    expect(dansLeLot(ici(12.54 + 49 / 110_793.5), lot)).toBe(true);
    expect(dansLeLot(ici(12.54 + 51 / 110_793.5), lot)).toBe(false);
  });

  it('ne dit rien quand la question n’a pas de sens', () => {
    expect(dansLeLot(ici(12.53), { essai: true, contour: lotFin })).toBeNull();
    expect(dansLeLot(ici(12.53), { essai: false, contour: null })).toBeNull();
    expect(dansLeLot(ici(12.53), null)).toBeNull();
    expect(dansLeLot(ici(12.53), undefined)).toBeNull();
  });
});
