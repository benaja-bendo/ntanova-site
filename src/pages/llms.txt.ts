// `/llms.txt` pour les assistants d'IA (23/11/2026) : voir `src/modele/fichiers-standards.ts`. Construit avec le site, aux
// adresses de ntanova.com, avec les mêmes lieux et fiches que `sitemap.xml`.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../infra/index';
import { llmsTxt } from '../modele/fichiers-standards';

export const GET: APIRoute = async ({ site }) => {
  const { arbre, ecoles } = await obtenirSite();
  return new Response(llmsTxt(String(site ?? 'https://ntanova.com'), arbre.tous, ecoles), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
