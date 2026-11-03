// Les zones de la carte (tickets 102 et 113) : construites avec le site, donc le même instantané que les pages. Chaque
// arrondissement qui a un état public (en polygone quand son contour est connu), chaque ville qui a un point, avec leurs
// compteurs publics. Les contours viennent de la base ; voir src/modele/carte/donnees.ts.
import type { APIRoute } from 'astro';
import { obtenirSite } from '../../infra/index';
import { zonesGeoJSON } from '../../modele/carte/donnees';
import { arrondissementDessine } from '../../modele/carte/plan';

export const GET: APIRoute = async () => {
  const { divisions, ecoles } = await obtenirSite();
  const zones = zonesGeoJSON({
    divisions,
    ecoles,
    // Le contour est celui de la base (`d.contour`, ticket 113). Ce repli est le dessin embarqué de Pointe-Noire, pour ce que
    // la base n'a pas (le faux serveur des parcours) ; les autres zones n'ont pas d'autre contour.
    contourDe: (d) =>
      d.adresse.join('/').startsWith('congo/pointe-noire/')
        ? (arrondissementDessine(d.slug)?.contour ?? null)
        : null,
  });
  return new Response(JSON.stringify(zones), {
    headers: { 'Content-Type': 'application/geo+json; charset=utf-8' },
  });
};
