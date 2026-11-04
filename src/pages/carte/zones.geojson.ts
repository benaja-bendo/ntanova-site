// Les zones de la carte (tickets 102 et 113) : construites avec le site, donc le même instantané que les pages. Chaque
// arrondissement qui a un état public (en polygone quand son contour est connu), chaque ville qui a un point, avec leurs
// compteurs publics. Les contours viennent de la base ; voir src/modele/carte/donnees.ts.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../../infra/index';
import { donneesDeLaCarte } from '../../modele/carte/instantane';

export const GET: APIRoute = async () => {
  const { zones } = donneesDeLaCarte(await obtenirSite());
  return new Response(JSON.stringify(zones), {
    headers: { 'Content-Type': 'application/geo+json; charset=utf-8' },
  });
};
