import { describe, expect, it } from 'vitest';
import {
  compteDesFiches,
  detailDeLaPaie,
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

// « Ma paie » (ticket #55, PR 5) : ce que le relais lit de sa propre paie ---------------------------------------------

describe('le détail de ce qui est dû', () => {
  it('dit ce qui compte, au singulier et au pluriel', () => {
    expect(detailDeLaPaie({ fiches: 1, contacts: 1, essais: 0 })).toEqual([
      '1 fiche acceptée',
      '1 contact de direction confirmé',
    ]);
    expect(detailDeLaPaie({ fiches: 3, contacts: 2, essais: 0 })).toEqual([
      '3 fiches acceptées',
      '2 contacts de direction confirmés',
    ]);
  });

  it('dit l’essai quand il est dû', () => {
    expect(detailDeLaPaie({ fiches: 0, contacts: 0, essais: 1 })).toEqual(['L’essai validé']);
  });

  it('ne dit rien quand rien n’est dû', () => {
    expect(detailDeLaPaie({ fiches: 0, contacts: 0, essais: 0 })).toEqual([]);
  });
});

describe('le compte des fiches du relais', () => {
  const unReleve = (statut: 'a_valider' | 'a_corriger' | 'accepte' | 'refuse') => ({ statut });

  it('compte les fiches envoyées à NTanova, par décision', () => {
    expect(
      compteDesFiches([
        unReleve('accepte'),
        unReleve('accepte'),
        unReleve('a_valider'),
        unReleve('a_corriger'),
        unReleve('refuse'),
      ]),
    ).toEqual({ envoyees: 5, acceptees: 2, enAttente: 1, aCorriger: 1, refusees: 1 });
  });

  it('ne compte pas les corrections comme des fiches de plus : seules les fiches comptent une fois', () => {
    expect(
      compteDesFiches([
        { statut: 'accepte', type: 'releve' },
        { statut: 'a_valider', type: 'correction' },
      ]),
    ).toEqual({ envoyees: 1, acceptees: 1, enAttente: 0, aCorriger: 0, refusees: 0 });
  });

  it('lit zéro quand il n’y a rien', () => {
    expect(compteDesFiches([])).toEqual({
      envoyees: 0,
      acceptees: 0,
      enAttente: 0,
      aCorriger: 0,
      refusees: 0,
    });
  });
});
