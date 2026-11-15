// Lot 2 du site public (15/11) : les demandes des familles, comptées sans nom ni numéro, lues par l'administration.
import { describe, expect, it } from 'vitest';
import {
  resumerDemandes,
  sujetDOrientation,
  type DemandeFamille,
} from '../../src/modele/demandes-familles';

const demande = (champs: Partial<DemandeFamille>): DemandeFamille => ({
  genre: 'verification',
  jour: '2026-11-10',
  ecole: null,
  profil: null,
  domaine: null,
  lieu: null,
  rythme: null,
  serie: null,
  ...champs,
});
const ecole = (id: string, nom: string) => ({ id, nom });

describe('les demandes des familles (lot 2 du site public)', () => {
  it('compte les vérifications par fiche, la plus demandée d’abord, avec le jour de la première', () => {
    const r = resumerDemandes([
      demande({ ecole: ecole('a', '[École A]'), jour: '2026-11-12' }),
      demande({ ecole: ecole('b', '[École B]'), jour: '2026-11-09' }),
      demande({ ecole: ecole('a', '[École A]'), jour: '2026-11-03' }),
      demande({ ecole: ecole('a', '[École A]'), jour: '2026-11-14' }),
    ]);
    expect(r.total).toBe(4);
    expect(r.verifications).toEqual([
      { ecoleId: 'a', nom: '[École A]', nombre: 3, depuis: '2026-11-03' },
      { ecoleId: 'b', nom: '[École B]', nombre: 1, depuis: '2026-11-09' },
    ]);
    expect(r.orientations).toEqual([]);
  });

  it('regroupe les tests d’orientation sans résultat par ce que la famille cherchait, en mots', () => {
    const cherche = {
      genre: 'orientation' as const,
      profil: 'bac' as const,
      domaine: 'Informatique',
      lieu: 'Pointe-Noire',
      rythme: 'soir' as const,
    };
    expect(sujetDOrientation(demande(cherche))).toBe(
      'Au lycée, ou j’ai le bac · Informatique · Pointe-Noire · Cours du soir',
    );
    const r = resumerDemandes([
      demande({ ...cherche, jour: '2026-11-11' }),
      demande({ ...cherche, jour: '2026-11-08' }),
      demande({ genre: 'orientation', profil: 'bepc', serie: null }),
    ]);
    expect(r.orientations[0]).toEqual({
      sujet: 'Au lycée, ou j’ai le bac · Informatique · Pointe-Noire · Cours du soir',
      nombre: 2,
      depuis: '2026-11-08',
    });
    expect(r.orientations[1]!.sujet).toBe('En 3e, ou j’ai le BEPC');
  });

  it('sans demande : zéro, et deux listes vides', () => {
    expect(resumerDemandes([])).toEqual({ total: 0, verifications: [], orientations: [] });
  });
});
