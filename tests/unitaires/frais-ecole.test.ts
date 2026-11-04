import { describe, expect, it } from 'vitest';
import { lireFraisEcole, montantFrais } from '../../src/modele/frais-ecole';
const base = {
  cycle: 'primaire',
  minimum: '25 000',
  maximum: '30 000',
  periode: 'mois',
  precisionPeriode: '',
  inscription: '',
  anneeScolaire: '',
  declaresLe: '2026-11-04',
  note: '',
  declarationConfirmee: true,
};
describe('frais déclarés', () => {
  it('conserve l’unité, la date et les inconnues sans transformer le montant en total annuel', () => {
    const f = lireFraisEcole(base, '2026-11-04').frais!;
    expect(f.minimum).toBe(25000);
    expect(f.maximum).toBe(30000);
    expect(f.inscription).toBeNull();
    expect(f.anneeScolaire).toBeNull();
    expect(f.periode).toBe('mois');
    expect(montantFrais(f)).toContain('25');
    expect(montantFrais(f)).toContain('30');
  });
  it('distingue zéro d’une donnée non communiquée', () => {
    const f = lireFraisEcole(
      { ...base, minimum: '0', maximum: '0', inscription: '0' },
      '2026-11-04',
    ).frais!;
    expect(f.inscription).toBe(0);
    expect(montantFrais(f)).toBe('0 FCFA');
  });
  it('refuse montant négatif, décimal, excessif, fourchette inversée, date future et source non confirmée', () => {
    for (const changement of [
      { minimum: '-1' },
      { minimum: '1,5' },
      { maximum: '9999999999999' },
      { minimum: '40000' },
      { declaresLe: '2026-11-05' },
      { declaresLe: '2026-02-30' },
      { declarationConfirmee: false },
      { periode: 'autre' },
      { cycle: '' },
    ])
      expect(lireFraisEcole({ ...base, ...changement }, '2026-11-04').frais).toBeNull();
  });
});

it('un montant unique n’exige pas une fourchette ; une autre période reste explicite', () => {
  const f = lireFraisEcole(
    {
      ...base,
      maximum: '',
      periode: 'autre',
      precisionPeriode: 'Par module',
      anneeScolaire: '2026-2027',
    },
    '2026-11-04',
  ).frais!;
  expect(f.maximum).toBe(f.minimum);
  expect(f.precisionPeriode).toBe('Par module');
  expect(f.anneeScolaire).toBe('2026-2027');
});
