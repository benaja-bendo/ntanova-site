import { describe, expect, it } from 'vitest';
import {
  compterIndices,
  filtrerFile,
  relaisDeLaFile,
  type FicheDeFile,
} from '../../src/modele/file-validation';

const fiche = (o: Partial<FicheDeFile> & { id: string }): FicheDeFile => ({
  type: 'releve',
  relais: 'Alice',
  precisionM: 8,
  doublonPossible: false,
  ...o,
});

const FILE: FicheDeFile[] = [
  fiche({ id: 'a1', relais: 'Alice' }),
  fiche({ id: 'a2', relais: 'Alice', precisionM: null }),
  fiche({ id: 'b1', relais: 'Bruno', type: 'contre_visite', doublonPossible: true }),
  fiche({ id: 'b2', relais: 'Bruno', precisionM: null, doublonPossible: true }),
  fiche({ id: 'c1', relais: 'Chloé', type: 'correction' }),
];

const ids = (l: readonly FicheDeFile[]) => l.map((f) => f.id);

describe('filtrer la file à valider', () => {
  it('sans filtre, tout passe, dans l’ordre reçu', () => {
    expect(ids(filtrerFile(FILE, {}))).toEqual(['a1', 'a2', 'b1', 'b2', 'c1']);
  });

  it('garde le type demandé', () => {
    expect(ids(filtrerFile(FILE, { type: 'contre_visite' }))).toEqual(['b1']);
    expect(ids(filtrerFile(FILE, { type: 'tout' }))).toHaveLength(5);
  });

  it('garde les fiches d’un seul relais', () => {
    expect(ids(filtrerFile(FILE, { relais: 'Bruno' }))).toEqual(['b1', 'b2']);
  });

  it('« sans position » : la précision de la position manque', () => {
    expect(ids(filtrerFile(FILE, { indice: 'sans_position' }))).toEqual(['a2', 'b2']);
  });

  it('« doublon possible » garde les fiches que la base signale', () => {
    expect(ids(filtrerFile(FILE, { indice: 'doublon_possible' }))).toEqual(['b1', 'b2']);
  });

  it('les critères se combinent', () => {
    expect(
      ids(filtrerFile(FILE, { relais: 'Bruno', indice: 'sans_position', type: 'releve' })),
    ).toEqual(['b2']);
  });

  it('ne modifie pas la liste reçue', () => {
    const copie = [...FILE];
    filtrerFile(FILE, { relais: 'Alice' });
    expect(FILE).toEqual(copie);
  });
});

describe('les relais de la file', () => {
  it('liste chaque relais une fois, avec son nombre de fiches, par ordre alphabétique', () => {
    expect(relaisDeLaFile(FILE)).toEqual([
      { relais: 'Alice', fiches: 2 },
      { relais: 'Bruno', fiches: 2 },
      { relais: 'Chloé', fiches: 1 },
    ]);
  });

  it('une file vide ne propose aucun relais', () => {
    expect(relaisDeLaFile([])).toEqual([]);
  });
});

describe('compter les indices', () => {
  it('compte les fiches sans position et les doublons possibles', () => {
    expect(compterIndices(FILE)).toEqual({ sansPosition: 2, doublonPossible: 2 });
  });

  it('sur une file vide, zéro partout', () => {
    expect(compterIndices([])).toEqual({ sansPosition: 0, doublonPossible: 0 });
  });
});
