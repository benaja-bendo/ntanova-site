import { describe, expect, it } from 'vitest';
import { ecrirePosition, lienGoogleMaps, lirePosition } from '../../src/modele/coordonnees';
import { lireChampPosition } from '../../src/modele/correction-ecole';
import {
  erreursCreation,
  formulaireCreationVide,
  versEntree,
} from '../../src/modele/creation-ecole';
import { arrondissementDeLaPosition } from '../../src/modele/carte/plan';

// Ce que l'administration colle pour situer une école : ce que Google Maps donne.
describe('lire une position collée', () => {
  const attendu = { latitude: -4.79105, longitude: 11.925 };

  it.each([
    ['-4.79105, 11.92500', 'l’appui long sur Google Maps'],
    ['-4.79105,11.925', 'sans espace'],
    ['  -4.79105 11.92500  ', 'séparés par un espace'],
    ['-4,79105 ; 11,92500', 'à la française'],
    ['https://www.google.com/maps/@-4.79105,11.925,17z', 'l’adresse de la vue'],
    ['https://maps.google.com/?q=-4.79105,11.925', 'une adresse ?q='],
    [
      'https://www.google.com/maps/place/X/@-4.7,11.9,17z/data=!3m1!4b1!4m6!3m5!8m2!3d-4.79105!4d11.925',
      'l’épingle du lieu plutôt que le centre de la vue',
    ],
  ])('%s (%s)', (texte) => {
    expect(lirePosition(texte)).toEqual(attendu);
  });

  it('lit les degrés, minutes et secondes de la fiche Google Maps', () => {
    const p = lirePosition('4°47\'27.8"S 11°55\'30.0"E');
    expect(p?.latitude).toBeCloseTo(-4.79106, 4);
    expect(p?.longitude).toBeCloseTo(11.925, 4);
  });

  it.each(['', 'Tié-Tié', '-4.79105', '200.1, 11.9', 'face au marché, 12'])(
    'refuse « %s »',
    (texte) => {
      expect(lirePosition(texte)).toBeNull();
    },
  );

  it('écrit la position à cinq décimales, et le lien pour la vérifier', () => {
    expect(ecrirePosition(attendu)).toBe('-4.79105, 11.92500');
    expect(lienGoogleMaps(attendu)).toBe(
      'https://www.google.com/maps/search/?api=1&query=-4.791050,11.925000',
    );
  });

  it('dit dans quel arrondissement tombe la position, et rien hors de Pointe-Noire', () => {
    expect(arrondissementDeLaPosition(attendu)?.slug).toBe('tie-tie');
    expect(arrondissementDeLaPosition({ latitude: -4.86, longitude: 11.92 })?.slug).toBe('ngoyo');
    expect(arrondissementDeLaPosition({ latitude: 48.85, longitude: 2.35 })).toBeNull();
    // Inversées (la longitude d'abord) : hors de la ville.
    expect(arrondissementDeLaPosition({ latitude: 11.925, longitude: -4.79105 })).toBeNull();
  });
});

describe('ajouter une école', () => {
  it('la position est facultative, mais une position illisible est une erreur', () => {
    expect(lireChampPosition('')).toEqual({ position: null, erreur: undefined });
    expect(lireChampPosition('-4.79105, 11.925').position).toEqual({
      latitude: -4.79105,
      longitude: 11.925,
    });
    expect(lireChampPosition('près du marché').erreur).toMatch(/illisible/);
  });

  it('rien n’est coché d’avance, et les champs vides partent vides', () => {
    const champs = {
      ...formulaireCreationVide(),
      nom: '  [École Exemple] ',
      numeroEnseigne: '06 000 00 01',
    };
    expect(formulaireCreationVide().cycles).toEqual([]);
    expect(formulaireCreationVide().genre).toBe('non_indique');
    expect(erreursCreation(champs)).toEqual({});
    expect(versEntree(champs)).toEqual({
      reference: null,
      nom: '[École Exemple]',
      genre: 'non_indique',
      campus: [
        {
          etiquette: null,
          division: null,
          quartier: null,
          repere: null,
          numeroEnseigne: '242060000001',
          position: null,
          programme: null,
          cycles: [],
        },
      ],
    });
  });

  it('une position qui ne se lit pas est une erreur, jamais une position inventée', () => {
    expect(
      erreursCreation({ ...formulaireCreationVide(), nom: '[École]', position: 'près du marché' }),
    ).toHaveProperty('position');
    expect(
      versEntree({ ...formulaireCreationVide(), nom: '[École]', position: '-4.79105, 11.925' })
        .campus[0]?.position,
    ).toEqual({ latitude: -4.79105, longitude: 11.925 });
  });
});
