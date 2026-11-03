// Les zones de la carte (ticket 102) : construites avec le site, donc le même instantané que les pages. Chaque
// arrondissement qui a un état public (en polygone quand son contour est dessiné), chaque ville qui a un point, avec leurs
// compteurs publics. Voir src/modele/carte/donnees.ts.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../../infra/index';
import { zonesGeoJSON } from '../../modele/carte/donnees';
import { arrondissementDessine } from '../../modele/carte/plan';

export const GET: APIRoute = async () => {
  const { divisions, ecoles } = await obtenirSite();
  const zones = zonesGeoJSON({
    divisions,
    ecoles,
    // Les contours dessinés sont ceux de Pointe-Noire (les seuls que le projet ait) ; les autres zones n'ont pas de contour.
    contourDe: (d) =>
      d.adresse.join('/').startsWith('congo/pointe-noire/')
        ? (arrondissementDessine(d.slug)?.contour ?? null)
        : null,
  });
  return new Response(JSON.stringify(zones), {
    headers: { 'Content-Type': 'application/geo+json; charset=utf-8' },
  });
};
