// Lot 2 du site public (15/11) : les places annoncées (P3) et l'effectif des classes (P4), saisis par l'administration.
// Les règles sont celles de `set_campus_opening` et `set_campus_class_size` : l'écran les dit avant la base.
import { describe, expect, it } from 'vitest';
import {
  annonceEnCours,
  finDeLAnnonce,
  lireEffectif,
  lirePlaces,
  nomDeClasse,
  trierParClasse,
  type SaisieClasse,
} from '../../src/modele/places-effectifs';

const aujourdHui = '2026-11-15';
const saisie = (champs: Partial<SaisieClasse> = {}): SaisieClasse => ({
  cycle: 'primaire',
  classe: 'CP1',
  valeur: 'disponibles',
  precision: '',
  ditLe: '2026-11-10',
  ...champs,
});

describe('places annoncées et effectifs (lot 2 du site public)', () => {
  it('une annonce se montre 30 jours après le jour dit, ce dernier jour compris', () => {
    expect(finDeLAnnonce('2026-11-10')).toBe('2026-12-10');
    expect(finDeLAnnonce('2026-12-15')).toBe('2027-01-14');
    expect(annonceEnCours({ finLe: '2026-12-10' }, '2026-12-10')).toBe(true);
    expect(annonceEnCours({ finLe: '2026-12-10' }, '2026-12-11')).toBe(false);
  });

  it('lit une annonce ; une classe vide vaut pour tout le cycle', () => {
    expect(lirePlaces(saisie(), ['primaire'], aujourdHui).places).toEqual({
      cycle: 'primaire',
      classe: 'CP1',
      etat: 'disponibles',
      precision: null,
      ditLe: '2026-11-10',
    });
    expect(
      lirePlaces(saisie({ classe: '  ' }), ['primaire'], aujourdHui).places!.classe,
    ).toBeNull();
  });

  it('refuse ce que la base refuse : un cycle hors de la fiche, une date future, une annonce de plus de 30 jours, « autre » sans précision', () => {
    const erreur = (s: Partial<SaisieClasse>) =>
      lirePlaces(saisie(s), ['primaire'], aujourdHui).erreur;
    expect(erreur({ cycle: 'college' })).toMatch(/cycle/);
    expect(erreur({ ditLe: '2026-11-16' })).toMatch(/pas une date future/);
    expect(erreur({ ditLe: '2026-10-15' })).toMatch(/plus de 30 jours/);
    expect(erreur({ ditLe: '2026-10-16' })).toBeNull();
    expect(erreur({ valeur: 'autre' })).toBe('Précise ce que l’école annonce.');
    expect(erreur({ valeur: 'autre', precision: 'Liste d’attente' })).toBeNull();
    expect(erreur({ valeur: '' })).toMatch(/places disponibles/);
    expect(erreur({ classe: 'x'.repeat(41) })).toMatch(/Raccourcis/);
  });

  it('lit un effectif en tranches, jamais un nombre ; une date ancienne reste permise', () => {
    expect(
      lireEffectif(saisie({ valeur: '35_a_49', ditLe: '2026-09-01' }), ['primaire'], aujourdHui)
        .effectif,
    ).toEqual({
      cycle: 'primaire',
      classe: 'CP1',
      tranche: '35_a_49',
      precision: null,
      ditLe: '2026-09-01',
    });
    expect(lireEffectif(saisie({ valeur: '42' }), ['primaire'], aujourdHui).erreur).toBe(
      'Choisis une tranche : jamais le nombre exact d’élèves.',
    );
    expect(lireEffectif(saisie({ valeur: 'autre' }), ['primaire'], aujourdHui).erreur).toBe(
      'Précise l’effectif dit par l’école.',
    );
  });

  it('range les classes du cycle le plus bas d’abord, puis par nom ; nomme le cycle quand la classe manque', () => {
    const lignes = [
      { cycle: 'college', classe: '6e' },
      { cycle: 'primaire', classe: 'CP2' },
      { cycle: 'primaire', classe: 'CE1' },
      { cycle: 'maternelle', classe: null },
    ];
    expect(trierParClasse(lignes).map(nomDeClasse)).toEqual(['Maternelle', 'CE1', 'CP2', '6e']);
  });
});
