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
  // Lot B du ticket 165 (13/11) : la règle du code suit celle de la base (M2). Le terrain dit « vu » pour tout équipement ;
  // « absent » seulement pour la clôture ; jamais « non précisé ». Avant, il était bridé à clôture, terrain de sport, autre.
  it('le terrain dit « vu » pour tout équipement, « absent » seulement pour la clôture', () => {
    for (const cle of ['eau', 'electricite', 'cantine', 'transport', 'bibliotheque', 'toilettes'])
      expect(
        lireEquipement({ ...base, cle, source: 'terrain', etat: 'present' }, '2026-11-04')
          .equipement?.etat,
      ).toBe('present');
    expect(
      lireEquipement({ ...base, cle: 'cloture', source: 'terrain', etat: 'absent' }, '2026-11-04')
        .equipement?.etat,
    ).toBe('absent');
    for (const c of [
      { cle: 'cantine', etat: 'absent' },
      { cle: 'eau', etat: 'non_precise' },
      { cle: 'cloture', etat: 'non_precise' },
    ])
      expect(
        lireEquipement({ ...base, ...c, source: 'terrain' }, '2026-11-04').equipement,
      ).toBeNull();
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
