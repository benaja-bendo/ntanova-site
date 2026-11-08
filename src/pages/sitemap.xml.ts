// Le plan du site pour les moteurs de recherche (ticket 146) : voir `src/modele/plan-du-site.ts`. Construit avec le site,
// aux adresses de ntanova.com (`site` d'astro.config.mjs) ; `public/robots.txt` y renvoie.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../infra/index';
import { entreesDuPlan, planDuSite } from '../modele/plan-du-site';

export const GET: APIRoute = async ({ site }) => {
  const { arbre, ecoles } = await obtenirSite();
  return new Response(
    planDuSite(String(site ?? 'https://ntanova.com'), entreesDuPlan(arbre.tous, ecoles)),
    {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    },
  );
};
