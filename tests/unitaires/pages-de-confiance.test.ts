// Les pages de transparence (ticket 149) : chaque adresse du pied de page a sa page, le plan du site les liste, et la fiche
// renvoie vers la Méthode. Une adresse sans page serait un 404 en pied de chaque page du site.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DELAI_DROITS_JOURS,
  LIEN_METHODE,
  PAGES_DE_TRANSPARENCE,
} from '../../src/modele/pages-de-confiance';
import { PAGES_FIXES } from '../../src/modele/plan-du-site';
import { readFileSync } from 'node:fs';

describe('les pages de transparence', () => {
  it('sont quatre, dans l’ordre du pied de page, chacune avec sa page', () => {
    expect(PAGES_DE_TRANSPARENCE.map((p) => p.texte)).toEqual([
      'Méthode',
      'Données',
      'Confidentialité',
      'Mentions légales',
    ]);
    for (const { href } of PAGES_DE_TRANSPARENCE) {
      expect(href).toMatch(/^\/[a-z-]+\/$/);
      expect(existsSync(`src/pages${href.slice(0, -1)}.astro`)).toBe(true);
      expect(PAGES_FIXES).toContain(href);
    }
  });

  it('donnent à la fiche le lien de sa Méthode, et plus l’ancre de « À propos »', () => {
    expect(LIEN_METHODE).toBe('/methode/');
    const fiche = readFileSync('src/ui/FicheEcole.astro', 'utf8');
    expect(fiche).toContain('href={LIEN_METHODE}');
    expect(fiche).not.toContain('a-propos');
  });

  it('gardent le délai de 7 jours que NTanova s’est donné (décision du 01/11/2026)', () => {
    expect(DELAI_DROITS_JOURS).toBe(7);
  });
});
