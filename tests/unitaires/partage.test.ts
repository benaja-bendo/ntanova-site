// Le partage d'une fiche sur WhatsApp (ticket 101) : l'image construite avec le site, sa preuve, son
// adresse, et les données structurées de la fiche, sans rien de privé.
import { describe, expect, it } from 'vitest';
import {
  cheminImagePartage,
  couleursDePartage,
  coupeEnLignes,
  donneesEcole,
  preuveDePartage,
  svgDePartage,
} from '../../src/modele/partage';

const e = {
  nom: '[Complexe scolaire Exemple]',
  etiquette: null,
  adresse: ['congo', 'pointe-noire', 'tie-tie'],
  slug: 'complexe-scolaire-exemple',
  divisionNoms: ['Congo', 'Pointe-Noire', 'Tié-Tié'],
  quartier: '[Quartier Exemple]',
  repere: '[derrière la station]',
  numeroEnseigne: '242060000001',
  latitude: -4.79105,
  longitude: 11.925,
  etat: 'relevee' as const,
  verifieeLe: null,
  releveeLe: '2026-11-02T10:00:00Z',
  situeeLe: null,
};

describe('la preuve écrite sur l’image', () => {
  it('dit le passage du relais, l’accord de la direction, ou leur absence, avec la date', () => {
    expect(preuveDePartage(e)).toEqual({
      genre: 'terrain',
      texte: 'Vue sur place le 2 novembre 2026',
    });
    expect(preuveDePartage({ ...e, etat: 'verifiee', verifieeLe: '2026-11-04' })).toEqual({
      genre: 'direction',
      texte: 'Confirmée par la direction le 4 novembre 2026',
    });
    expect(preuveDePartage({ ...e, releveeLe: null })).toEqual({
      genre: 'ajoutee',
      texte: 'Ajoutée par NTanova, pas encore vue sur place',
    });
  });
});

describe('l’adresse de l’image', () => {
  it('suit celle de la fiche, en .png', () => {
    expect(cheminImagePartage(e)).toBe(
      '/partage/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple.png',
    );
  });
});

describe('le dessin', () => {
  const couleurs = couleursDePartage(`:root {
    --gris-fond: #f7f8f6; --fond: var(--gris-fond); --fond-releve: #ffffff; --texte: #14231f;
    --texte-doux: #4d5752; --marque: #0b5d4a; --preuve-direction: var(--marque);
    --preuve-direction-texte: #f9f4ec; --preuve-terrain: var(--marque); --preuve-vide: #6b716c;
    --preuve-vide-trait: #868c86; --creme: #f9f4ec; --jaune: #f2b738; --rouge: #e2543c; --encre: #14231f;
  }`);

  it('lit ses couleurs dans les jetons', () => {
    expect(couleurs.fond).toBe('#f7f8f6');
    expect(couleurs.preuveDirection).toBe('#0b5d4a');
  });

  it('coupe un long nom en trois lignes au plus, avec des points de suspension', () => {
    expect(coupeEnLignes('Un nom court', 20, 3)).toEqual(['Un nom court']);
    const lignes = coupeEnLignes(
      'Complexe scolaire bilingue privé laïc les petits génies de la cité du quartier',
      20,
      3,
    );
    expect(lignes).toHaveLength(3);
    expect(lignes.every((l) => l.length <= 20)).toBe(true);
    expect(lignes[2]?.endsWith('…')).toBe(true);
  });

  it('échappe le texte, et n’écrit que les couleurs des jetons', () => {
    const svg = svgDePartage({
      titre: 'École <A> & B',
      lieu: '[Quartier Exemple] · Tié-Tié · Pointe-Noire',
      preuve: preuveDePartage(e),
      couleurs,
    });
    expect(svg).toContain('École &lt;A&gt; &amp; B');
    expect(svg).toContain('Vue sur place le 2 novembre 2026');
    expect(svg).toContain('width="1200" height="630"');
    const permises = new Set(Object.values(couleurs));
    for (const hex of svg.match(/#[0-9a-f]{6}\b/gi) ?? []) expect(permises).toContain(hex);
  });
});

describe('les données structurées de la fiche', () => {
  it('décrivent l’école pour les moteurs de recherche, sans rien de privé', () => {
    const d = donneesEcole(e, 'https://ntanova.com/ecoles/congo/pointe-noire/tie-tie/x/');
    expect(d['@context']).toBe('https://schema.org');
    expect(d['@type']).toBe('School');
    expect(d.name).toBe('[Complexe scolaire Exemple]');
    expect(d.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: '[derrière la station]',
      addressLocality: '[Quartier Exemple], Tié-Tié, Pointe-Noire',
      addressCountry: 'CG',
    });
    expect(d.geo).toEqual({ '@type': 'GeoCoordinates', latitude: -4.79105, longitude: 11.925 });
    expect(d.telephone).toBe('+242060000001');
    expect(JSON.stringify(d)).not.toMatch(/whatsapp|direction|contact/i);
  });

  it('n’écrit ni position ni téléphone absents', () => {
    const d = donneesEcole(
      { ...e, latitude: null, longitude: null, numeroEnseigne: null, repere: null },
      'https://ntanova.com/x/',
    );
    expect(d.geo).toBeUndefined();
    expect(d.telephone).toBeUndefined();
    expect(d.address).not.toHaveProperty('streetAddress');
  });
});
