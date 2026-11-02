import { describe, expect, it } from 'vitest';
import {
  estUnVendredi,
  francs,
  jourABrazzaville,
  prochainVendredi,
  vendrediLong,
} from '../../src/modele/paie';

// Le 1er novembre 2026 est un dimanche : le vendredi suivant est le 6.

describe('le jour, à Brazzaville', () => {
  it('compte à l’heure de Brazzaville (UTC+1), pas à celle du serveur', () => {
    expect(jourABrazzaville(new Date('2026-11-05T22:59:00Z'))).toBe('2026-11-05');
    expect(jourABrazzaville(new Date('2026-11-05T23:00:00Z'))).toBe('2026-11-06');
    expect(jourABrazzaville(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });
});

describe('le vendredi de paie', () => {
  it('le dimanche, c’est le vendredi qui vient', () => {
    expect(prochainVendredi(new Date('2026-11-01T09:00:00Z'))).toBe('2026-11-06');
  });

  it('un vendredi, c’est le jour même, jusqu’à minuit à Brazzaville', () => {
    expect(prochainVendredi(new Date('2026-11-06T08:00:00Z'))).toBe('2026-11-06');
    expect(prochainVendredi(new Date('2026-11-06T22:59:00Z'))).toBe('2026-11-06');
  });

  it('le samedi, c’est le vendredi suivant', () => {
    expect(prochainVendredi(new Date('2026-11-07T08:00:00Z'))).toBe('2026-11-13');
    // Vendredi 23 h 30 en UTC, c'est déjà samedi à Brazzaville.
    expect(prochainVendredi(new Date('2026-11-06T23:30:00Z'))).toBe('2026-11-13');
  });

  it('jeudi soir à 23 h 30 en UTC, c’est déjà vendredi à Brazzaville', () => {
    expect(prochainVendredi(new Date('2026-11-05T23:30:00Z'))).toBe('2026-11-06');
  });

  it('reconnaît un vendredi', () => {
    expect(estUnVendredi('2026-11-06')).toBe(true);
    expect(estUnVendredi('2026-11-07')).toBe(false);
    expect(estUnVendredi('2026-11-05')).toBe(false);
  });

  it('s’écrit en toutes lettres', () => {
    expect(vendrediLong('2026-11-06')).toBe('vendredi 6 novembre');
  });
});

describe('les montants', () => {
  it('s’écrivent en FCFA, avec des espaces qui ne se coupent pas en fin de ligne', () => {
    expect(francs(1500)).toBe('1\u00a0500\u00a0FCFA');
    expect(francs(0)).toBe('0\u00a0FCFA');
    expect(francs(1_234_500)).toBe('1\u00a0234\u00a0500\u00a0FCFA');
    // Aucune espace ordinaire (U+0020) : toutes sont insécables.
    expect(francs(1_234_500)).not.toMatch(/\u0020/);
  });
});
