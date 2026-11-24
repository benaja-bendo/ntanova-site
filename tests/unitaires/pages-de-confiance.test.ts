// Les pages de transparence (ticket 149) : chaque adresse du pied de page a sa page, le plan du site les liste, et la fiche
// renvoie vers la Méthode. Une adresse sans page serait un 404 en pied de chaque page du site.
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DELAI_DROITS_JOURS,
  LIEN_METHODE,
  PAGES_DE_TRANSPARENCE,
} from '../../src/modele/pages-de-confiance';
import { LIEN_MENTIONS } from '../../src/modele/mentions';
import { PAGES_FIXES } from '../../src/modele/plan-du-site';
import { readFileSync } from 'node:fs';

describe('les pages de transparence', () => {
  it('sont quatre, dans l’ordre du pied de page, chacune avec sa page', () => {
    // Refonte publique, lot 1 (24/11/2026) : les libellés du canevas « Points de repère », mêmes adresses.
    expect(PAGES_DE_TRANSPARENCE.map((p) => p.texte)).toEqual([
      'Fiabilité des informations',
      'Données de l’annuaire',
      'Confidentialité',
      'Mentions légales',
    ]);
    for (const { href } of PAGES_DE_TRANSPARENCE) {
      expect(href).toMatch(/^\/[a-z-]+\/$/);
      expect(existsSync(`src/pages${href.slice(0, -1)}.astro`)).toBe(true);
      expect(PAGES_FIXES).toContain(href);
    }
  });

  it('donnent à la fiche, à la démonstration et à l’accueil le lien des mentions, une ancre de Fiabilité (lot 4)', () => {
    expect(LIEN_METHODE).toBe('/methode/');
    expect(LIEN_MENTIONS).toBe(`${LIEN_METHODE}#m-mentions`);
    for (const fichier of [
      'src/ui/FicheEcole.astro',
      'src/pages/demo/fiche-ecole.astro',
      'src/pages/index.astro',
    ]) {
      const source = readFileSync(fichier, 'utf8');
      expect(source, fichier).toContain('href={LIEN_MENTIONS}');
      expect(source, fichier).not.toContain('a-propos');
    }
    // L'ancre existe sur la page.
    expect(readFileSync('src/pages/methode.astro', 'utf8')).toContain('id={ANCRE_MENTIONS}');
  });

  it('gardent le délai de 7 jours que NTanova s’est donné (décision du 01/11/2026)', () => {
    expect(DELAI_DROITS_JOURS).toBe(7);
  });
});
