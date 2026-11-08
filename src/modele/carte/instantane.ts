/**
 * Ce que la carte interactive lit : les zones et les écoles du même instantané que les pages (ticket 103). Un seul endroit
 * les construit pour la page `/carte/` (la liste, le cadre) et pour les fichiers que l'îlot charge.
 */
import type { DivisionPublique, EcolePubliee } from '../ports';
import { cheminDeDivision } from '../geo-divisions';
import { cadreParDefaut } from './cadrage';
import { ecolesGeoJSON, zonesGeoJSON } from './donnees';
import { arrondissementDeLApercu, arrondissementDessine, vuesSurPlace } from './plan';

export function donneesDeLaCarte(site: {
  divisions: readonly DivisionPublique[];
  ecoles: readonly EcolePubliee[];
}) {
  const zones = zonesGeoJSON({
    divisions: site.divisions,
    ecoles: site.ecoles,
    // Le contour est celui de la base (`d.contour`, ticket 113). Ce repli est le dessin embarqué de Pointe-Noire, pour ce que
    // la base n'a pas (le faux serveur des parcours) ; les autres zones n'ont pas d'autre contour.
    contourDe: (d) =>
      d.adresse.join('/').startsWith('congo/pointe-noire/')
        ? (arrondissementDessine(d.slug)?.contour ?? null)
        : null,
  });
  const parId = new Map(site.divisions.map((d) => [d.id, d]));
  const ecoles = ecolesGeoJSON(site.ecoles, (e) => {
    const d = parId.get(e.divisionId);
    return d ? (cheminDeDivision(d, parId)[0] ?? null) : null;
  });
  return { zones, ecoles, cadre: cadreParDefaut(zones.features, ecoles.features) };
}

/**
 * L'arrondissement de Pointe-Noire que montre le repli de la carte (le dessin de l'accueil, ticket 42) : celui qui a le plus
 * d'écoles sur la carte. Rien quand aucun arrondissement dessiné n'est ouvert : le repli est alors un simple texte.
 */
export function arrondissementDuRepli(site: {
  divisions: readonly DivisionPublique[];
  ecoles: readonly EcolePubliee[];
}) {
  const ouverts = site.divisions
    .filter(
      (d) => d.niveau === 3 && d.ouverte && d.adresse.join('/').startsWith('congo/pointe-noire/'),
    )
    .map((d) => ({ slug: d.slug }));
  const dePointeNoire = site.ecoles.filter((e) =>
    e.adresse.join('/').startsWith('congo/pointe-noire/'),
  );
  const tete = arrondissementDeLApercu(ouverts, vuesSurPlace(dePointeNoire));
  return {
    tete,
    ecoles: tete ? dePointeNoire.filter((e) => e.arrondissement === tete.slug) : [],
  };
}
