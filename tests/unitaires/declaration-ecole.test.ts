import { expect, it } from 'vitest';
import { erreursDeclaration } from '../../src/modele/declaration-ecole';
import { provenanceDe } from '../../src/modele/libelles';
import { preuveDePartage } from '../../src/modele/partage';

it('exige une date réelle et une confirmation explicite', () => {
  expect(Object.keys(erreursDeclaration({ declareeLe: '', confirmee: false }))).toEqual([
    'declareeLe',
    'confirmee',
  ]);
  expect(erreursDeclaration({ declareeLe: '2026-02-30', confirmee: true })).toHaveProperty(
    'declareeLe',
  );
  expect(erreursDeclaration({ declareeLe: '2999-01-01', confirmee: true })).toHaveProperty(
    'declareeLe',
  );
  expect(erreursDeclaration({ declareeLe: '2026-11-01', confirmee: true })).toEqual({});
});
it('une déclaration ne se confond pas avec un ajout NTanova ou une preuve de terrain', () => {
  const e = {
    etat: 'relevee' as const,
    releveeLe: null,
    situeeLe: null,
    origine: 'school',
    declareeLe: '2026-11-01',
    verifieeLe: null,
  };
  expect(provenanceDe(e)).toBe('declaree');
  expect(preuveDePartage(e).texte).toBe('Déclarée par l’école le 1 novembre 2026');
  expect(provenanceDe({ ...e, releveeLe: '2026-11-02' })).toBe('relevee');
  expect(provenanceDe({ ...e, etat: 'verifiee' })).toBe('verifiee');
  expect(provenanceDe({ ...e, origine: 'inconnue' })).toBe('ajoutee');
});
