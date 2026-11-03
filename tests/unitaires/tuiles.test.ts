import { describe, expect, it } from 'vitest';
import {
  adresseDeTuile,
  grilleDeTuiles,
  metresParPixel,
  pixelDuMonde,
  rayonEnPixels,
  TAILLE_TUILE,
} from '../../src/modele/tuiles';

// Le calcul de la carte de position (ticket #72) : où tombent les tuiles d'OpenStreetMap, et où se pose le repère.
// Les valeurs de référence sont celles de la projection « Web Mercator » des cartes en tuiles.

const POINTE_NOIRE = { latitude: -4.7692, longitude: 11.8664 };

describe('où un point tombe dans le monde, en pixels', () => {
  it('le point (0, 0) est au centre du monde, à tous les zooms', () => {
    for (const zoom of [0, 1, 17]) {
      const { x, y } = pixelDuMonde({ latitude: 0, longitude: 0 }, zoom);
      const moitie = (TAILLE_TUILE * 2 ** zoom) / 2;
      expect(x).toBeCloseTo(moitie, 6);
      expect(y).toBeCloseTo(moitie, 6);
    }
  });

  it('l’est est à droite, le sud en bas', () => {
    const centre = pixelDuMonde({ latitude: 0, longitude: 0 }, 10);
    const sudEst = pixelDuMonde({ latitude: -5, longitude: 12 }, 10);
    expect(sudEst.x).toBeGreaterThan(centre.x);
    expect(sudEst.y).toBeGreaterThan(centre.y);
  });

  it('un zoom de plus double les distances', () => {
    const a = pixelDuMonde(POINTE_NOIRE, 16);
    const b = pixelDuMonde(POINTE_NOIRE, 17);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });
});

describe('les mètres et les pixels', () => {
  it('à l’équateur, au zoom 0 : 156 543 m par pixel', () => {
    expect(metresParPixel(0, 0)).toBeCloseTo(156543.03392, 4);
  });

  it('à Pointe-Noire, au zoom 17 : environ 1,2 m par pixel', () => {
    expect(metresParPixel(POINTE_NOIRE.latitude, 17)).toBeCloseTo(1.19, 2);
  });

  it('une précision de 10 m fait un cercle d’environ 8 pixels au zoom 17', () => {
    expect(rayonEnPixels(10, POINTE_NOIRE.latitude, 17)).toBeCloseTo(8.4, 0);
  });
});

describe('les tuiles qui couvrent la carte', () => {
  const dimensions = { largeur: 360, hauteur: 220, zoom: 17 };

  it('couvrent toute la carte, sans trou, avec peu de tuiles', () => {
    const { tuiles } = grilleDeTuiles(POINTE_NOIRE, dimensions);
    expect(tuiles.length).toBeGreaterThanOrEqual(2);
    // Au plus 3 colonnes sur 360 px et 2 rangées sur 220 px : jamais plus de 6 tuiles.
    expect(tuiles.length).toBeLessThanOrEqual(6);
    const gauche = Math.min(...tuiles.map((t) => t.px));
    const haut = Math.min(...tuiles.map((t) => t.py));
    const droite = Math.max(...tuiles.map((t) => t.px + TAILLE_TUILE));
    const bas = Math.max(...tuiles.map((t) => t.py + TAILLE_TUILE));
    expect(gauche).toBeLessThanOrEqual(0);
    expect(haut).toBeLessThanOrEqual(0);
    expect(droite).toBeGreaterThanOrEqual(dimensions.largeur);
    expect(bas).toBeGreaterThanOrEqual(dimensions.hauteur);
  });

  it('chaque tuile touche la carte (aucune tuile inutile)', () => {
    const { tuiles } = grilleDeTuiles(POINTE_NOIRE, dimensions);
    for (const t of tuiles) {
      expect(t.px + TAILLE_TUILE).toBeGreaterThan(0);
      expect(t.py + TAILLE_TUILE).toBeGreaterThan(0);
      expect(t.px).toBeLessThan(dimensions.largeur);
      expect(t.py).toBeLessThan(dimensions.hauteur);
    }
  });

  it('le point est au centre, et la tuile qui le contient est à la bonne place', () => {
    const { tuiles, centre } = grilleDeTuiles(POINTE_NOIRE, dimensions);
    expect(centre).toEqual({ x: 180, y: 110 });
    const monde = pixelDuMonde(POINTE_NOIRE, 17);
    const sienne = tuiles.find(
      (t) =>
        t.x === Math.floor(monde.x / TAILLE_TUILE) && t.y === Math.floor(monde.y / TAILLE_TUILE),
    );
    expect(sienne).toBeDefined();
    // Dans sa tuile, le point est à (monde − début de la tuile) ; sur la carte, il doit tomber au centre.
    const dansLaTuile = {
      x: monde.x - sienne!.x * TAILLE_TUILE,
      y: monde.y - sienne!.y * TAILLE_TUILE,
    };
    expect(sienne!.px + dansLaTuile.x).toBeCloseTo(centre.x, 6);
    expect(sienne!.py + dansLaTuile.y).toBeCloseTo(centre.y, 6);
  });

  it('numérote les tuiles du zoom demandé, dans les bornes du monde', () => {
    const { tuiles } = grilleDeTuiles(POINTE_NOIRE, dimensions);
    for (const t of tuiles) {
      expect(t.z).toBe(17);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThan(2 ** 17);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeLessThan(2 ** 17);
    }
    // Pointe-Noire est à l'est du méridien de Greenwich et au sud de l'équateur : tuile 66 000 à 67 000, 66 000 à 67 000.
    expect(tuiles[0]!.x).toBeGreaterThan(66000);
    expect(tuiles[0]!.x).toBeLessThan(70000);
    expect(tuiles[0]!.y).toBeGreaterThan(66000);
    expect(tuiles[0]!.y).toBeLessThan(70000);
  });

  it('ne sort pas du monde près d’un pôle', () => {
    const { tuiles } = grilleDeTuiles({ latitude: 85, longitude: 0 }, dimensions);
    for (const t of tuiles) expect(t.y).toBeGreaterThanOrEqual(0);
  });
});

describe('l’adresse d’une tuile', () => {
  it('suit le modèle d’OpenStreetMap : zoom, colonne, rangée', () => {
    expect(adresseDeTuile({ x: 66777, y: 67890, z: 17, px: 0, py: 0 })).toBe(
      'https://tile.openstreetmap.org/17/66777/67890.png',
    );
  });
});
