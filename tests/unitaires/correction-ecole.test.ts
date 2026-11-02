import { describe, expect, it } from 'vitest';
import {
  erreursFormulaireEcole,
  formulaireDe,
  versCorrection,
  type FormulaireEcole,
} from '../../src/modele/correction-ecole';
import type { EcoleVue } from '../../src/modele/ports';

const ecole: EcoleVue = {
  id: 'e1',
  institutionId: 'i1',
  nom: '[École]',
  etiquette: null,
  quartier: null,
  division: 'Tié-Tié',
  divisionId: 'd1',
  publication: 'publiee',
  origine: 'field',
  retrait: null,
  aSituer: false,
  position: { latitude: -4.79105, longitude: 11.925 },
  confiee: null,
  typeEcole: 'privee',
  niveaux: ['primaire', 'college'],
  programme: 'Bilingue',
  repere: '[Repère]',
  numeroEnseigne: '242060000001',
  formations: 0,
  verifieeLe: null,
};

const formulaire = (champs: Partial<FormulaireEcole> = {}): FormulaireEcole => ({
  ...formulaireDe(ecole),
  ...champs,
});

describe('corriger une fiche à la main (administration)', () => {
  it('le formulaire part de la fiche, le numéro écrit par groupes', () => {
    expect(formulaireDe(ecole)).toEqual({
      nom: '[École]',
      typeEcole: 'privee',
      niveaux: ['primaire', 'college'],
      programme: 'Bilingue',
      repere: '[Repère]',
      numeroEnseigne: '+242 06 000 00 01',
    });
    expect(
      formulaireDe({ ...ecole, programme: null, repere: null, numeroEnseigne: null }),
    ).toMatchObject({ programme: '', repere: '', numeroEnseigne: '' });
  });

  describe('ce qui part vers la base', () => {
    it('rien quand rien n’a changé', () => {
      expect(versCorrection(ecole, formulaire())).toEqual({});
    });

    it('seulement ce qui a changé : le reste de la fiche n’est pas touché', () => {
      expect(versCorrection(ecole, formulaire({ typeEcole: 'publique' }))).toEqual({
        typeEcole: 'publique',
      });
      expect(versCorrection(ecole, formulaire({ niveaux: ['creche', 'primaire'] }))).toEqual({
        niveaux: ['creche', 'primaire'],
      });
    });

    it('l’ordre des niveaux ne compte pas', () => {
      expect(versCorrection(ecole, formulaire({ niveaux: ['college', 'primaire'] }))).toEqual({});
    });

    it('nettoie le nom et le numéro', () => {
      expect(
        versCorrection(ecole, formulaire({ nom: '  [École B] ', numeroEnseigne: '06 000 00 02' })),
      ).toEqual({ nom: '[École B]', numeroEnseigne: '242060000002' });
    });

    it('un champ vidé devient « rien », pas une ligne vide', () => {
      expect(
        versCorrection(ecole, formulaire({ programme: '  ', repere: '', numeroEnseigne: '' })),
      ).toEqual({ programme: null, repere: null, numeroEnseigne: null });
    });
  });

  describe('les contrôles', () => {
    it('une fiche complète, ou presque vide, ne dit rien', () => {
      expect(erreursFormulaireEcole(formulaire())).toEqual({});
      expect(
        erreursFormulaireEcole(
          formulaire({ niveaux: [], programme: '', repere: '', numeroEnseigne: '' }),
        ),
      ).toEqual({});
    });

    it('veut un nom, et dit tout en français, en tutoyant', () => {
      expect(erreursFormulaireEcole(formulaire({ nom: '   ' })).nom).toBe(
        'Écris le nom de l’école.',
      );
      expect(erreursFormulaireEcole(formulaire({ nom: 'a'.repeat(201) })).nom).toMatch(/trop long/);
    });

    it('refuse un numéro incomplet, et des lignes trop longues', () => {
      expect(erreursFormulaireEcole(formulaire({ numeroEnseigne: '06 12' }))).toHaveProperty(
        'numeroEnseigne',
      );
      expect(erreursFormulaireEcole(formulaire({ programme: 'a'.repeat(201) }))).toHaveProperty(
        'programme',
      );
      expect(erreursFormulaireEcole(formulaire({ repere: 'a'.repeat(301) }))).toHaveProperty(
        'repere',
      );
    });

    it('une valeur que la version ne connaît pas dit un message, jamais « Invalid option »', () => {
      const e = erreursFormulaireEcole(
        formulaire({ typeEcole: 'demain' as never, niveaux: ['demain' as never] }),
      );
      expect(e.typeEcole).toMatch(/type/i);
      expect(e.niveaux).toMatch(/niveau/i);
      expect(`${e.typeEcole} ${e.niveaux}`).not.toMatch(/invalid|expected/i);
    });
  });
});
