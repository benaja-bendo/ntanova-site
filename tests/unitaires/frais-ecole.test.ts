import { describe, expect, it } from 'vitest';
import {
  erreurDuOui,
  etatDuOui,
  ligneChangee,
  lireFraisEcole,
  moisFacturesDesLignes,
  montantFrais,
  type FraisEcole,
} from '../../src/modele/frais-ecole';
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

// Lot 2 du site public (15/11) : les mois facturés (P1) et le OUI daté de l'école (P6), comme `set_school_fee` et
// `confirm_school_fees` de la base.
describe('frais : mois facturés et OUI de l’école (lot 2 du site public)', () => {
  const ligne = (champs: Partial<FraisEcole> = {}): FraisEcole => ({
    id: 'f1',
    cycle: 'primaire',
    minimum: 20000,
    maximum: 20000,
    periode: 'mois',
    precisionPeriode: null,
    inscription: 10000,
    anneeScolaire: '2026-2027',
    declaresLe: '2026-11-04',
    note: null,
    classe: 'CP1',
    formationId: null,
    photoPreuve: null,
    moisFactures: 10,
    confirmeLe: '2026-11-05',
    ...champs,
  });

  it('lit les mois facturés d’une ligne au mois, de 1 à 12 ; vide : pas dit', () => {
    expect(lireFraisEcole({ ...base, moisFactures: '10' }, '2026-11-04').frais!.moisFactures).toBe(
      10,
    );
    expect(lireFraisEcole({ ...base, moisFactures: '' }, '2026-11-04').frais!.moisFactures).toBe(
      null,
    );
    for (const faux of ['0', '13', 'dix'])
      expect(lireFraisEcole({ ...base, moisFactures: faux }, '2026-11-04').erreur).toBe(
        'Les mois facturés vont de 1 à 12.',
      );
  });

  it('laisse les mois de côté pour une autre période : la base les refuse', () => {
    const lu = lireFraisEcole({ ...base, periode: 'annee', moisFactures: '10' }, '2026-11-04');
    expect(lu.erreur).toBeNull();
    expect(lu.frais!.moisFactures).toBeNull();
  });

  it('une ligne qui ne change pas n’est pas réécrite (elle garde son OUI) ; un montant, une classe ou les mois, si', () => {
    const avant = ligne();
    const pareille = { ...avant };
    expect(ligneChangee(avant, pareille)).toBe(false);
    expect(ligneChangee(avant, { ...pareille, minimum: 21000 })).toBe(true);
    expect(ligneChangee(avant, { ...pareille, classe: 'CP2' })).toBe(true);
    expect(ligneChangee(avant, { ...pareille, moisFactures: 9 })).toBe(true);
    expect(ligneChangee(avant, { ...pareille, formationId: 'p1' })).toBe(true);
    // La photo du prospectus est la preuve de la ligne, pas son contenu.
    expect(ligneChangee(avant, { ...pareille, photoPreuve: 'ph1' })).toBe(false);
  });

  it('dit où en est le OUI : aucune ligne, des lignes qui l’attendent, toutes confirmées', () => {
    expect(etatDuOui([])).toEqual({ etat: 'vide' });
    expect(
      etatDuOui([
        ligne({ confirmeLe: null, declaresLe: '2026-11-04' }),
        ligne({ id: 'f2', confirmeLe: null, declaresLe: '2026-11-07' }),
        ligne({ id: 'f3', confirmeLe: '2026-11-09', declaresLe: '2026-11-08' }),
      ]),
    ).toEqual({ etat: 'attend', lignes: 2, auPlusTot: '2026-11-07' });
    expect(
      etatDuOui([
        ligne({ confirmeLe: '2026-11-05' }),
        ligne({ id: 'f2', confirmeLe: '2026-11-09' }),
      ]),
    ).toEqual({ etat: 'confirme', le: '2026-11-09' });
  });

  it('refuse un OUI dans le futur, ou avant la date des frais qu’il confirme', () => {
    expect(erreurDuOui('2026-11-10', '2026-11-04', '2026-11-08')).toBe(
      'Donne le jour réel où l’école a répondu OUI.',
    );
    expect(erreurDuOui('2026-11-03', '2026-11-04', '2026-11-08')).toBe(
      'Le OUI ne peut pas précéder la date des frais qu’il confirme.',
    );
    expect(erreurDuOui('2026-11-04', '2026-11-04', '2026-11-08')).toBeNull();
  });

  it('préremplit les mois facturés avec ceux que disent le plus de lignes au mois', () => {
    expect(
      moisFacturesDesLignes([
        ligne({ moisFactures: 9 }),
        ligne({ id: 'f2', moisFactures: 10 }),
        ligne({ id: 'f3', moisFactures: 10 }),
        ligne({ id: 'f4', periode: 'annee', moisFactures: null }),
      ]),
    ).toBe(10);
    expect(moisFacturesDesLignes([ligne({ moisFactures: null })])).toBeNull();
  });
});
