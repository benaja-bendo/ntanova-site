import { describe, expect, it } from 'vitest';
import { lireAccordContactPublic } from '../../src/modele/contact-public';
const accord = {
  numero: '06 000 00 01',
  accordLe: '2026-11-04',
  fonction: 'directeur',
  canal: 'appel',
  autorise: true,
};
describe('accord de publication du contact', () => {
  it('normalise le numéro et exige un accord de publication distinct', () => {
    expect(lireAccordContactPublic(accord, '2026-11-04').contact?.numero).toBe('242060000001');
    expect(
      lireAccordContactPublic({ ...accord, autorise: false }, '2026-11-04').erreur,
    ).toBeTruthy();
  });
  it('refuse les dates impossibles ou futures et les numéros suspects', () => {
    for (const changement of [
      { accordLe: '2026-11-05' },
      { accordLe: '2026-02-30' },
      { accordLe: '' },
      { numero: '2420060000001' },
      { numero: 'abc' },
      { fonction: '' },
      { canal: '' },
    ])
      expect(
        lireAccordContactPublic({ ...accord, ...changement }, '2026-11-04').contact,
      ).toBeNull();
  });
});
