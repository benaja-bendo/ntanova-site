// Simplifier un contour (ticket 113) : un contour d'OpenStreetMap a des milliers de points, le téléphone n'en a pas besoin.
import { describe, expect, it } from 'vitest';
import type { MultiPolygone } from '../../src/modele/geo';
import { simplifierAnneau, simplifierContour } from '../../src/modele/carte/simplification';

// À cette latitude, 0,009° de longitude ou de latitude font environ 1 km. Un carré de 1 km de côté, dix points par côté.
const COTE = 0.009;
function carreAlignes(): number[][] {
  const points: number[][] = [];
  for (let i = 0; i <= 10; i++) points.push([11.9 + (COTE * i) / 10, -4.8]);
  for (let i = 1; i <= 10; i++) points.push([11.9 + COTE, -4.8 + (COTE * i) / 10]);
  for (let i = 1; i <= 10; i++) points.push([11.9 + COTE - (COTE * i) / 10, -4.8 + COTE]);
  for (let i = 1; i <= 10; i++) points.push([11.9, -4.8 + COTE - (COTE * i) / 10]);
  return points;
}

describe('simplifier un anneau', () => {
  it('retire les points alignés et garde les quatre coins', () => {
    const anneau = simplifierAnneau(carreAlignes(), 10);
    expect(anneau).toHaveLength(5);
    expect(anneau).toEqual(
      expect.arrayContaining([
        [11.9, -4.8],
        [11.909, -4.8],
        [11.909, -4.791],
        [11.9, -4.791],
      ]),
    );
  });

  it('reste fermé : le dernier point est le premier', () => {
    const anneau = simplifierAnneau(carreAlignes(), 10);
    expect(anneau[anneau.length - 1]).toEqual(anneau[0]);
  });

  it('garde un détail plus grand que la tolérance et retire un plus petit', () => {
    // Une bosse au milieu du côté sud : 0,0003° de latitude ≈ 33 m, ou 0,00004° ≈ 4 m.
    const avecBosse = (hauteur: number) => {
      const points = carreAlignes();
      points[5] = [points[5]![0]!, -4.8 - hauteur];
      return points;
    };
    const droit = simplifierAnneau(carreAlignes(), 10);
    const grande = simplifierAnneau(avecBosse(0.0003), 10);
    expect(grande.length).toBeGreaterThan(droit.length);
    expect(grande).toContainEqual([Number((11.9 + COTE / 2).toFixed(5)), -4.8003]);
    expect(simplifierAnneau(avecBosse(0.00004), 10)).toEqual(droit);
  });

  it('arrondit à cinq décimales (un mètre)', () => {
    const anneau = simplifierAnneau(
      [
        [11.123456789, -4.987654321],
        [11.2, -4.987654321],
        [11.2, -4.9],
        [11.123456789, -4.9],
        [11.123456789, -4.987654321],
      ],
      1,
    );
    expect(anneau[0]).toEqual([11.12346, -4.98765]);
  });

  it('ne rend jamais un anneau de moins de quatre points : une tolérance démesurée le laisse entier', () => {
    const anneau = simplifierAnneau(carreAlignes(), 100_000);
    expect(anneau.length).toBeGreaterThanOrEqual(4);
    expect(anneau[anneau.length - 1]).toEqual(anneau[0]);
  });
});

describe('simplifier un contour', () => {
  const trou = (c: number, demi: number): number[][] => [
    [c - demi, -4.795 - demi],
    [c - demi, -4.795 + demi],
    [c + demi, -4.795 + demi],
    [c + demi, -4.795 - demi],
    [c - demi, -4.795 - demi],
  ];

  it('garde la forme polygones › anneaux › points', () => {
    const contour: MultiPolygone = [[carreAlignes()]];
    const simplifie = simplifierContour(contour, 10);
    expect(simplifie).toHaveLength(1);
    expect(simplifie[0]).toHaveLength(1);
    expect(simplifie[0]![0]).toHaveLength(5);
  });

  it('garde un trou plus grand que la tolérance et laisse tomber celui qui disparaît', () => {
    const contour: MultiPolygone = [[carreAlignes(), trou(11.9045, 0.002), trou(11.9015, 0.00002)]];
    const simplifie = simplifierContour(contour, 10);
    expect(simplifie[0]).toHaveLength(2);
  });

  it('allège beaucoup un contour très détaillé sans le déformer de plus de la tolérance', () => {
    // Un cercle de 2 km de rayon à 2 000 points.
    const cercle: number[][] = [];
    for (let i = 0; i < 2000; i++) {
      const a = (2 * Math.PI * i) / 2000;
      cercle.push([
        11.9 + (0.018 * Math.cos(a)) / Math.cos((4.8 * Math.PI) / 180),
        -4.8 + 0.018 * Math.sin(a),
      ]);
    }
    cercle.push(cercle[0]!);
    const simplifie = simplifierAnneau(cercle, 10);
    expect(simplifie.length).toBeLessThan(120);
    expect(simplifie.length).toBeGreaterThan(20);
  });
});
