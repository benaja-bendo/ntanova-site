// Le repère en un toucher (audit de la fiche relais, 08/11/2026).
import { describe, expect, it } from 'vitest';
import {
  REPERES_RAPIDES,
  basculerRepere,
  repereCoche,
  repereManquant,
} from '../../src/modele/repere';

const marche = REPERES_RAPIDES.find((r) => r.cle === 'marche')!.phrase;
const pharmacie = REPERES_RAPIDES.find((r) => r.cle === 'pharmacie')!.phrase;

describe('les repères rapides', () => {
  it('chaque puce a un mot, une phrase qui commence par « Près » et une clé unique', () => {
    expect(REPERES_RAPIDES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(REPERES_RAPIDES.map((r) => r.cle)).size).toBe(REPERES_RAPIDES.length);
    for (const r of REPERES_RAPIDES) {
      expect(r.libelle.trim()).not.toBe('');
      expect(r.phrase).toMatch(/^Près d/);
    }
  });
});

describe('un toucher écrit ou efface la phrase', () => {
  it('dans un champ vide, la phrase s’écrit telle quelle', () => {
    expect(basculerRepere('', marche)).toBe('Près du marché');
    expect(basculerRepere('   ', marche)).toBe('Près du marché');
  });

  it('un second repère s’ajoute à la suite, sans écraser ce que le relais a écrit', () => {
    expect(basculerRepere('Près du marché', pharmacie)).toBe(
      'Près du marché, près de la pharmacie',
    );
    expect(basculerRepere('Derrière la gare, ', marche)).toBe('Derrière la gare, près du marché');
  });

  it('retoucher la même puce l’efface, et garde le reste du texte', () => {
    expect(basculerRepere('Près du marché', marche)).toBe('');
    expect(basculerRepere('Près du marché, près de la pharmacie', marche)).toBe(
      'Près de la pharmacie',
    );
    // Aller-retour sur un champ vide : on retrouve le champ vide.
    expect(basculerRepere(basculerRepere('', pharmacie), pharmacie)).toBe('');
  });

  it("se reconnaît à la casse et à l'apostrophe près (le clavier d'un téléphone met ’ ou ')", () => {
    expect(repereCoche("près de l'église", 'Près de l’église')).toBe(true);
    expect(repereCoche('PRÈS DU MARCHÉ', marche)).toBe(true);
    expect(repereCoche('Face au marché', marche)).toBe(false);
  });

  it('un repère manque quand le champ est vide ou ne contient que des blancs', () => {
    expect(repereManquant('')).toBe(true);
    expect(repereManquant('  \n ')).toBe(true);
    expect(repereManquant('Face au marché')).toBe(false);
  });
});
