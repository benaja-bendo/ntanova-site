// Les écoles de la carte (ticket 102) : celles qu'un relais a vues sur place, et situées. Construites avec le site.
// Chaque école porte tous ses cycles et le plus élevé. Rien de privé. Voir src/modele/carte/donnees.ts.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../../infra/index';
import { donneesDeLaCarte } from '../../modele/carte/instantane';

export const GET: APIRoute = async () => {
  const { ecoles } = donneesDeLaCarte(await obtenirSite());
  return new Response(JSON.stringify(ecoles), {
    headers: { 'Content-Type': 'application/geo+json; charset=utf-8' },
  });
};
