import { describe, expect, it } from 'vitest';
import { lireEquipement, etatPublicEquipement } from '../../src/modele/equipements-ecole';
const base = {
  cle: 'cloture',
  precision: '',
  etat: 'present',
  source: 'terrain',
  constateLe: '2026-11-04',
  note: 'Visible de la rue.',
  confirme: true,
};
describe('équipement et preuve', () => {
  it('garde source et date d’une observation visible', () => {
    expect(lireEquipement(base, '2026-11-04').equipement).toMatchObject({
      cle: 'cloture',
      etat: 'present',
      source: 'terrain',
      constateLe: '2026-11-04',
    });
  });
  it('ne transforme ni non observé en absent ni présence d’un tuyau en service d’eau disponible', () => {
    for (const c of [
      { etat: 'absent' },
      { etat: 'non_precise' },
      { cle: 'eau' },
      { cle: 'electricite' },
      { cle: 'cantine' },
      { cle: 'transport' },
    ])
      expect(lireEquipement({ ...base, ...c }, '2026-11-04').equipement).toBeNull();
  });
  it('accepte une absence ou une inconnue déclarée par l’école, sans les confondre', () => {
    expect(
      lireEquipement({ ...base, cle: 'cantine', source: 'ecole', etat: 'absent' }, '2026-11-04')
        .equipement?.etat,
    ).toBe('absent');
    expect(
      lireEquipement({ ...base, cle: 'eau', source: 'ecole', etat: 'non_precise' }, '2026-11-04')
        .equipement?.etat,
    ).toBe('non_precise');
  });
  it('exige précision pour autre, date non future et confirmation de la provenance', () => {
    for (const c of [
      { cle: 'autre' },
      { cle: '' },
      { source: '' },
      { constateLe: '2026-11-05' },
      { constateLe: '2026-02-30' },
      { confirme: false },
    ])
      expect(lireEquipement({ ...base, ...c }, '2026-11-04').equipement).toBeNull();
    expect(
      lireEquipement({ ...base, cle: 'autre', precision: 'Auvent à l’entrée' }, '2026-11-04')
        .equipement?.precision,
    ).toBe('Auvent à l’entrée');
  });
});

it('ne rebaptise pas une nouvelle source inconnue en déclaration de l’école', () => {
  expect(etatPublicEquipement({ source: 'source_future', etat: 'present' })).toBe(
    'Source non précisée',
  );
  expect(etatPublicEquipement({ source: 'ecole', etat: 'etat_futur' })).toBe('État non précisé');
});
