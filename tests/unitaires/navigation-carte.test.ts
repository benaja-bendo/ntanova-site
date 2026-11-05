import { describe, expect, it } from 'vitest';
import { lireVue, adresseVue, filtrerEcoles } from '../../src/modele/carte/navigation';
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
    preuveTexte: 'Vue sur place',
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
