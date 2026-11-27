// Ticket 236, retoucher une photo du relais : le flou ne laisse rien lire, le carré du logo reste dans la photo, et la photo
// d'origine ne reparaît pas d'office.
import { describe, expect, it } from 'vitest';
import type { EtatPhotoPublique } from '../../src/modele/photos-publiques';
import {
  BLOCS_AU_PLUS,
  carreDuLogo,
  pixelliser,
  retraitDeLOriginal,
  sourceDeLaRetouche,
  tailleDuSvg,
  zoneEntre,
} from '../../src/modele/retouche';

const photo = { largeur: 1280, hauteur: 960 };

describe('les rectangles', () => {
  it('un tracé dans n’importe quel sens, borné à la photo ; trop petit, il ne désigne rien', () => {
    expect(zoneEntre({ x: 1400, y: 100 }, { x: 1000.4, y: -20 }, photo)).toEqual({
      x: 1000,
      y: 0,
      largeur: 280,
      hauteur: 100,
    });
    expect(zoneEntre({ x: 10, y: 10 }, { x: 14, y: 200 }, photo)).toBeNull();
  });

  it('le carré du logo reste carré et dans la photo, aux bords comme au centre', () => {
    expect(carreDuLogo(photo, { taille: 50, x: 50, y: 50 })).toEqual({
      x: 400,
      y: 240,
      largeur: 480,
      hauteur: 480,
    });
    expect(carreDuLogo(photo, { taille: 100, x: 100, y: 100 })).toEqual({
      x: 320,
      y: 0,
      largeur: 960,
      hauteur: 960,
    });
  });
});

describe('le flou', () => {
  it('au plus huit blocs d’une seule couleur sur le grand côté : le détail ne se retrouve plus', () => {
    // Des rayures d'un pixel, comme des lettres : blanches et noires, une sur deux.
    const [largeur, hauteur] = [160, 40];
    const pixels = new Uint8ClampedArray(largeur * hauteur * 4).map((_, i) =>
      i % 4 === 3 ? 255 : Math.floor(i / 4) % 2 === 0 ? 255 : 0,
    );
    pixelliser(pixels, largeur, hauteur);
    const rouges = Array.from({ length: largeur }, (_, x) => pixels[x * 4]!);
    // Chaque bloc a pris la moyenne : plus aucune rayure.
    expect(new Set(rouges)).toEqual(new Set([128]));
    const cote = Math.ceil(largeur / BLOCS_AU_PLUS);
    const degrade = new Uint8ClampedArray(largeur * hauteur * 4).map((_, i) =>
      i % 4 === 3 ? 255 : (Math.floor(i / 4) % largeur) % 256,
    );
    pixelliser(degrade, largeur, hauteur);
    const couleurs = new Set(Array.from({ length: largeur }, (_, x) => degrade[x * 4]!));
    expect(couleurs.size).toBeLessThanOrEqual(BLOCS_AU_PLUS);
    expect(degrade[0]).toBe(degrade[(cote - 1) * 4]);
  });
});

describe('retirer l’original', () => {
  const etat = (champs: Partial<EtatPhotoPublique> = {}): EtatPhotoPublique => ({
    mode: 'automatique',
    choisieId: null,
    publiee: true,
    retenueId: null,
    ...champs,
  });
  const p = { id: 'p1', publiable: true, publique: false };

  it('retenue, choisie ou susceptible de l’être : le retrait s’écrit, pour qu’aucune ne la remplace d’office', () => {
    expect(retraitDeLOriginal(p, etat({ retenueId: 'p1' })).ecrireLeRetrait).toBe(true);
    expect(retraitDeLOriginal(p, etat({ mode: 'choix', choisieId: 'p1' })).ecrireLeRetrait).toBe(
      true,
    );
    expect(retraitDeLOriginal(p, etat({ publiee: false })).ecrireLeRetrait).toBe(true);
  });

  it('une autre photo en ligne : on retire seulement le contrôle de celle-ci, l’autre reste', () => {
    expect(retraitDeLOriginal(p, etat({ mode: 'choix', choisieId: 'p2' }))).toEqual({
      ecrireLeRetrait: false,
      retirerLeControle: true,
    });
    expect(retraitDeLOriginal(p, etat({ retenueId: 'p2' })).ecrireLeRetrait).toBe(false);
    expect(retraitDeLOriginal({ ...p, publiable: false }, etat({ publiee: false }))).toEqual({
      ecrireLeRetrait: false,
      retirerLeControle: false,
    });
  });
});

it('la source dit d’où vient l’image, et le jour de la photo', () => {
  expect(
    sourceDeLaRetouche('logo', '2026-11-12T09:00:00Z', { floutee: false, recadree: false }),
  ).toBe('Logo recadré sur la photo prise par le relais le 12 novembre 2026');
  expect(sourceDeLaRetouche('cover', null, { floutee: true, recadree: true })).toBe(
    'Photo prise par le relais, floutée et recadrée',
  );
});

it('la taille d’un SVG : ses dimensions, sinon sa viewBox, sinon un carré', () => {
  expect(tailleDuSvg('200px', '100', '0 0 10 10')).toEqual({ largeur: 200, hauteur: 100 });
  expect(tailleDuSvg('100%', null, '0,0 300 150')).toEqual({ largeur: 300, hauteur: 150 });
  expect(tailleDuSvg(null, null, null)).toEqual({ largeur: 512, hauteur: 512 });
});
