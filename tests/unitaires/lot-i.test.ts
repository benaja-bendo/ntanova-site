import { describe, expect, it } from 'vitest';
import { lireTitulaire } from '../../src/modele/numero-de-paie';
import { basculerCeQuOnVoit, nouvelleFiche, type PhotoLocale } from '../../src/modele/fiche';
import {
  avecMemeInscription,
  inscriptionLaPlusFrequente,
  type FraisEcole,
} from '../../src/modele/frais-ecole';
import { REPERES_RAPIDES } from '../../src/modele/repere';

describe('Lot I : « Au nom de »', () => {
  it('resserre les espaces et refuse un nom vide ou trop court', () => {
    expect(lireTitulaire('  [Titulaire   Exemple] ')).toEqual({
      ok: true,
      titulaire: '[Titulaire Exemple]',
    });
    expect(lireTitulaire('').ok).toBe(false);
    expect(lireTitulaire('X').ok).toBe(false);
    expect(lireTitulaire('a'.repeat(81)).ok).toBe(false);
  });
});

describe('Lot I : « On y voit »', () => {
  const photo = (role: PhotoLocale['role'], onYVoit?: PhotoLocale['onYVoit']): PhotoLocale => ({
    id: role,
    role,
    blob: null,
    mime: 'image/webp',
    octets: 1,
    largeur: 1,
    hauteur: 1,
    prisLe: '2026-11-13T10:00:00Z',
    envoyee: false,
    ...(onYVoit ? { onYVoit } : {}),
  });
  it('coche et décoche sur la photo de l’enseigne seulement, dans l’ordre des puces', () => {
    const f = {
      ...nouvelleFiche('f', '2026-11-13T10:00:00Z', null),
      photos: [photo('signboard', ['signboard']), photo('courtyard')],
    };
    const g = basculerCeQuOnVoit(basculerCeQuOnVoit(f, 'building'), 'entrance');
    expect(g.photos[0]!.onYVoit).toEqual(['signboard', 'entrance', 'building']);
    expect(g.photos[1]!.onYVoit).toBeUndefined();
    expect(basculerCeQuOnVoit(g, 'signboard').photos[0]!.onYVoit).toEqual(['entrance', 'building']);
  });
});

describe('Lot I : les six repères de la planche', () => {
  it('dans l’ordre : Marché, Église, Pharmacie, Station, Carrefour, École', () => {
    expect(REPERES_RAPIDES.map((r) => r.libelle)).toEqual([
      'Marché',
      'Église',
      'Pharmacie',
      'Station',
      'Carrefour',
      'École',
    ]);
  });
});

describe('Lot I : « Même inscription sur toutes les lignes »', () => {
  const ligne = (id: string, inscription: number | null): FraisEcole => ({
    id,
    cycle: 'primaire',
    minimum: 10000,
    maximum: 10000,
    periode: 'mois',
    precisionPeriode: null,
    inscription,
    anneeScolaire: null,
    declaresLe: '2026-11-01',
    note: null,
    photoPreuve: 'photo-1',
    formationId: null,
  });
  it('réécrit seulement les lignes qui changent, en gardant leur preuve', () => {
    const r = avecMemeInscription([ligne('a', 5000), ligne('b', null), ligne('c', 7000)], 5000);
    expect(r.map((f) => f.id)).toEqual(['b', 'c']);
    expect(r.every((f) => f.inscription === 5000 && f.photoPreuve === 'photo-1')).toBe(true);
  });
  it('préremplit avec l’inscription la plus fréquente', () => {
    expect(inscriptionLaPlusFrequente([ligne('a', 5000), ligne('b', 7000), ligne('c', 7000)])).toBe(
      7000,
    );
    expect(inscriptionLaPlusFrequente([ligne('a', null)])).toBeNull();
  });
});
