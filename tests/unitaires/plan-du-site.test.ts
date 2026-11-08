// Le plan du site (ticket 146, décision du fondateur du 08/11/2026) : les pages fixes, chaque fiche et chaque page de lieu qui
// a au moins une fiche ; jamais une page de lieu vide (elle est en `noindex`), jamais deux fois la même adresse.
import { describe, expect, it } from 'vitest';
import type { PageDivision } from '../../src/modele/geo-divisions';
import { entreesDuPlan, PAGES_FIXES, planDuSite } from '../../src/modele/plan-du-site';
import type { EcolePubliee } from '../../src/modele/ports';

const ecole = (slug: string, numero: string, misAJourLe: string) =>
  ({ slug, numero, misAJourLe }) as unknown as EcolePubliee;
const lieu = (chemin: string[], ecoles: EcolePubliee[], enfants: PageDivision[] = []) =>
  ({ chemin, ecoles, enfants }) as unknown as PageDivision;

const fiche = ecole('[ecole-exemple]', '482913', '2026-11-06T09:00:00Z');
const ngoyo = lieu(['pointe-noire', 'ngoyo'], [fiche]);
const vide = lieu(['pointe-noire', 'tie-tie'], []);
const ville = lieu(['pointe-noire'], [], [ngoyo, vide]);

describe('le plan du site', () => {
  const entrees = entreesDuPlan([ville, ngoyo, vide], [fiche]);
  const chemins = entrees.map((x) => x.chemin);

  it('liste les pages fixes, les lieux qui ont une fiche et les fiches', () => {
    expect(chemins.slice(0, PAGES_FIXES.length)).toEqual([...PAGES_FIXES]);
    expect(chemins).toContain('/ecoles/pointe-noire/');
    expect(chemins).toContain('/ecoles/pointe-noire/ngoyo/');
    expect(chemins).toContain('/ecoles/[ecole-exemple]-482913/');
  });

  it('laisse de côté une page de lieu sans fiche, et ne répète jamais une adresse', () => {
    expect(chemins).not.toContain('/ecoles/pointe-noire/tie-tie/');
    expect(new Set(chemins).size).toBe(chemins.length);
    expect(entreesDuPlan([ngoyo, ngoyo], [fiche, fiche]).length).toBe(PAGES_FIXES.length + 2);
  });

  it('date un lieu par sa fiche la plus récente, et une fiche par sa mise à jour', () => {
    const date = (chemin: string) => entrees.find((x) => x.chemin === chemin)?.misAJourLe;
    expect(date('/ecoles/pointe-noire/')).toBe('2026-11-06');
    expect(date('/ecoles/[ecole-exemple]-482913/')).toBe('2026-11-06');
    expect(date('/')).toBeNull();
  });

  it('écrit un XML valide, aux adresses absolues, caractères échappés', () => {
    const xml = planDuSite('https://ntanova.com', [
      { chemin: '/', misAJourLe: null },
      { chemin: "/ecoles/a&b'c/", misAJourLe: '2026-11-06' },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain('<url><loc>https://ntanova.com/</loc></url>');
    expect(xml).toContain(
      '<url><loc>https://ntanova.com/ecoles/a&amp;b&apos;c/</loc><lastmod>2026-11-06</lastmod></url>',
    );
  });
});
