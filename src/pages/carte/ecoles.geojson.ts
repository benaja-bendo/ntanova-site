// Les écoles de la carte (ticket 102) : celles qu'un relais a vues sur place, et situées. Construites avec le site.
// Chaque école porte tous ses cycles et le plus élevé. Rien de privé. Voir src/modele/carte/donnees.ts.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../../infra/index';
import { ecolesGeoJSON } from '../../modele/carte/donnees';

export const GET: APIRoute = async () => {
  const { ecoles } = await obtenirSite();
  return new Response(JSON.stringify(ecolesGeoJSON(ecoles)), {
    headers: { 'Content-Type': 'application/geo+json; charset=utf-8' },
  });
};
