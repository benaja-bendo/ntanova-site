/**
 * Le plan du site pour les moteurs de recherche, `sitemap.xml` (ticket 146, décision du fondateur du 08/11/2026) : les pages
 * fixes, chaque fiche publiée et chaque page de lieu qui a au moins une fiche. Une page de lieu sans fiche n'y est pas (elle
 * est en `noindex`), ni les renvois, ni l'espace relais, ni l'administration.
 *
 * Pur : ni base, ni Astro. La page `src/pages/sitemap.xml.ts` le construit avec le site.
 */
import { ecolesSous, lienDivision, lienEcole, type PageDivision } from './geo-divisions';
import type { EcolePubliee } from './ports';

/** Les pages fixes du site public, dans l'ordre du menu. */
export const PAGES_FIXES = ['/', '/ecoles/', '/carte/', '/pour-les-ecoles/', '/a-propos/'] as const;

export interface EntreeDuPlan {
  /** L'adresse, depuis la racine du site (`/ecoles/pointe-noire/`). */
  chemin: string;
  /** Le jour de la dernière mise à jour, quand on le connaît (`AAAA-MM-JJ`). */
  misAJourLe: string | null;
}

const jour = (iso: string) => iso.slice(0, 10);
const plusRecent = (dates: readonly string[]) =>
  dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;

/** Les adresses du plan : pages fixes, puis lieux (ceux qui ont une fiche), puis fiches ; jamais deux fois la même. */
export function entreesDuPlan(
  lieux: readonly PageDivision[],
  ecoles: readonly EcolePubliee[],
): EntreeDuPlan[] {
  const entrees: EntreeDuPlan[] = PAGES_FIXES.map((chemin) => ({ chemin, misAJourLe: null }));
  for (const lieu of lieux) {
    const siennes = ecolesSous(lieu);
    if (siennes.length === 0) continue;
    entrees.push({
      chemin: lienDivision(lieu.chemin),
      misAJourLe: plusRecent(siennes.map((e) => jour(e.misAJourLe))),
    });
  }
  for (const e of ecoles) entrees.push({ chemin: lienEcole(e), misAJourLe: jour(e.misAJourLe) });
  const vus = new Set<string>();
  return entrees.filter((x) => (vus.has(x.chemin) ? false : (vus.add(x.chemin), true)));
}

const echapper = (texte: string) =>
  texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Le fichier `sitemap.xml` (protocole sitemaps.org 0.9), aux adresses absolues de `base` (`https://ntanova.com`). */
export function planDuSite(base: string, entrees: readonly EntreeDuPlan[]): string {
  const lignes = entrees.map((x) => {
    const adresse = echapper(new URL(x.chemin, base).href);
    const date = x.misAJourLe ? `<lastmod>${x.misAJourLe}</lastmod>` : '';
    return `  <url><loc>${adresse}</loc>${date}</url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...lignes,
    '</urlset>',
    '',
  ].join('\n');
}
