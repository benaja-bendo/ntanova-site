// Les mots de la preuve (ticket #99, décisions du fondateur du 03/11) : « Vue sur place » vient du
// passage d'un relais, « Confirmée par la direction » de l'accord daté, jamais l'un pour l'autre ; et
// la carte ne montre que les écoles vues sur place.
import { describe, expect, it } from 'vitest';
import { surCarte, vuesSurPlace } from '../../src/modele/carte/plan';
import { ligneDeLieu } from '../../src/modele/geo-divisions';
import { libelleProvenance, provenanceDe } from '../../src/modele/libelles';

const fiche = (
  releveeLe: string | null,
  situeeLe: string | null,
  etat: 'relevee' | 'verifiee' = 'relevee',
) => ({
  id: `id-${releveeLe}-${situeeLe}-${etat}`,
  nom: '[École Exemple]',
  etiquette: null,
  adresse: ['congo', 'pointe-noire', 'tie-tie'],
  slug: 'ecole-exemple',
  numero: '482913',
  etat,
  releveeLe,
  situeeLe,
  latitude: -4.79,
  longitude: 11.86,
});

describe('la provenance d’une fiche', () => {
  it('une fiche relevée par un relais est « vue sur place »', () => {
    expect(provenanceDe(fiche('2026-11-02T10:00:00Z', null))).toBe('relevee');
    expect(libelleProvenance.relevee).toBe('Vue sur place');
  });

  it('l’accord daté de la direction donne « Confirmée par la direction »', () => {
    expect(provenanceDe(fiche('2026-11-02T10:00:00Z', null, 'verifiee'))).toBe('verifiee');
    expect(libelleProvenance.verifiee).toBe('Confirmée par la direction');
  });

  it('une fiche sans passage de relais n’est jamais « vue sur place », même sans date de situation', () => {
    expect(provenanceDe(fiche(null, '2026-11-03T10:00:00Z'))).toBe('ajoutee');
    expect(provenanceDe(fiche(null, null))).toBe('ajoutee');
    expect(libelleProvenance.ajoutee).toBe('Ajoutée par NTanova');
  });

  it('aucun libellé ne dit « vérifiée » ni « relevée »', () => {
    for (const mot of Object.values(libelleProvenance)) {
      expect(mot).not.toMatch(/vérifi|relevée/i);
    }
  });
});

describe('les écoles de la carte', () => {
  it('ne gardent que celles vues sur place', () => {
    const vue = fiche('2026-11-02T10:00:00Z', null);
    const confirmee = fiche('2026-11-02T10:00:00Z', null, 'verifiee');
    const ajoutee = fiche(null, '2026-11-03T10:00:00Z');
    const sansDate = fiche(null, null);
    expect(vuesSurPlace([vue, confirmee, ajoutee, sansDate])).toEqual([vue, confirmee]);
    expect(surCarte([vue, ajoutee, sansDate]).map((e) => e.id)).toEqual([vue.id]);
  });
});

describe('la ligne de lieu d’une fiche', () => {
  it('ne répète jamais un nom (la ville et le département de Pointe-Noire)', () => {
    expect(ligneDeLieu(null, ['Congo', 'Pointe-Noire', 'Lumumba'])).toBe('Lumumba · Pointe-Noire');
  });

  it('va du plus fin au plus large, quartier compris', () => {
    expect(ligneDeLieu('[Quartier Exemple]', ['Congo', 'Pointe-Noire', 'Tié-Tié'])).toBe(
      '[Quartier Exemple] · Tié-Tié · Pointe-Noire',
    );
    expect(ligneDeLieu('Tié-Tié', ['Congo', 'Pointe-Noire', 'Tié-Tié'])).toBe(
      'Tié-Tié · Pointe-Noire',
    );
  });

  it('une ville sans arrondissement s’écrit seule', () => {
    expect(ligneDeLieu(null, ['Congo', 'Dolisie'])).toBe('Dolisie');
  });
});
