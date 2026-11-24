// Le contrat des pages de transparence (ticket 149) : libellés, adresses du plan et délai de réponse.
// Les pages construites et les liens réels sont vérifiés dans pages-de-confiance.spec.ts et villes.spec.ts.
import { describe, expect, it } from 'vitest';
import { DELAI_DROITS_JOURS, PAGES_DE_TRANSPARENCE } from '../../src/modele/pages-de-confiance';
import { PAGES_FIXES } from '../../src/modele/plan-du-site';

describe('les pages de transparence', () => {
  it('sont quatre, dans l’ordre du pied de page, avec une adresse du plan du site', () => {
    // Refonte publique, lot 1 (24/11/2026) : les libellés du canevas « Points de repère », mêmes adresses.
    expect(PAGES_DE_TRANSPARENCE.map((p) => p.texte)).toEqual([
      'Fiabilité des informations',
      'Données de l’annuaire',
      'Confidentialité',
      'Mentions légales',
    ]);
    for (const { href } of PAGES_DE_TRANSPARENCE) {
      expect(href).toMatch(/^\/[a-z-]+\/$/);
      expect(PAGES_FIXES).toContain(href);
    }
  });

  it('gardent le délai de 7 jours que NTanova s’est donné (décision du 01/11/2026)', () => {
    expect(DELAI_DROITS_JOURS).toBe(7);
  });
});
