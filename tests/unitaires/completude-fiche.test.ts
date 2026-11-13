import { describe, expect, it } from 'vitest';
import { completudeDeLaFiche, completudeEnMots } from '../../src/modele/fiche-admin';

const vide = {
  niveaux: [] as ('primaire' | 'superieur')[],
  repere: null,
  equipements: [],
  frais: [],
  contactPublic: null,
  agrements: [],
  motDirection: null,
  formations: 0,
};

describe('« X rubriques remplies sur Y »', () => {
  it('une fiche vide : 0 sur 9, et ce que l’école peut donner sans demande ouverte', () => {
    const c = completudeDeLaFiche(
      vide,
      [],
      [
        { quiPeut: ['ecole'], demandeLe: null },
        { quiPeut: ['ecole', 'relais'], demandeLe: '2026-11-12' },
        { quiPeut: ['relais'], demandeLe: null },
      ],
    );
    expect(c.total).toBe(9);
    expect(c.remplies).toBe(0);
    expect(c.aDemander).toBe(1);
    expect(completudeEnMots(c)).toBe('0 rubrique remplie sur 9 · 1 à demander');
  });

  it('les images comptent seulement publiques ; le supérieur ajoute « Formations »', () => {
    const c = completudeDeLaFiche(
      { ...vide, niveaux: ['superieur'], repere: '[face au marché]', formations: 2 },
      [
        { genre: 'logo', publique: true },
        { genre: 'cover', publique: false },
        { genre: 'gallery', publique: true },
      ],
      [],
    );
    expect(c.total).toBe(10);
    expect(c.rubriques.filter((r) => r.remplie).map((r) => r.titre)).toEqual([
      'Logo',
      'Photos',
      'En bref',
      'Formations',
    ]);
    expect(completudeEnMots(c)).toBe('4 rubriques remplies sur 10');
  });
});
