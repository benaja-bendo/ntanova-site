/**
 * Le style du fond de la carte interactive (ticket 114, décisions D5 et D6 du fondateur) : le style de Protomaps
 * (`@protomaps/basemaps`, au BUILD seulement : l'îlot n'en tire rien) repeint aux jetons de `src/ui/jetons.css`, réduit
 * à ce que le fichier de tuiles allégé contient (`outils/fond-de-carte/`), avec une seule police et aucun pictogramme.
 *
 * Aucune couleur n'est écrite ici : elles viennent des jetons `--fond-de-carte-…`, lus à la construction comme
 * `partage.ts` lit les siens. Les couches de NTanova (zones, écoles) viennent s'y ajouter dans l'îlot ; ce fichier ne
 * dessine que le fond.
 */
import { layers, type Flavor } from '@protomaps/basemaps';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import {
  ADRESSE_DES_GLYPHES,
  ADRESSE_DES_TUILES,
  ATTRIBUTION_DU_FOND,
  COUCHES_DU_FOND,
  POLICE_DE_LA_CARTE,
  ZOOM_MIN_DE_L_OCCUPATION_DU_SOL,
} from './fond';
import { lireJeton } from './jetons';

export interface CouleursDuFond {
  terre: string;
  parc: string;
  eau: string;
  route: string;
  routeBord: string;
  grandeRouteBord: string;
  limite: string;
  nom: string;
  nomFort: string;
  nomEau: string;
  halo: string;
}

/** Les couleurs du fond, lues dans le texte de `jetons.css` (en suivant les `var(--…)`). */
export function couleursDuFond(css: string): CouleursDuFond {
  const jeton = (nom: string) => lireJeton(css, `fond-de-carte-${nom}`);
  return {
    terre: jeton('terre'),
    parc: jeton('parc'),
    eau: jeton('eau'),
    route: jeton('route'),
    routeBord: jeton('route-bord'),
    grandeRouteBord: jeton('grande-route-bord'),
    limite: jeton('limite'),
    nom: jeton('nom'),
    nomFort: jeton('nom-fort'),
    nomEau: jeton('nom-eau'),
    halo: jeton('halo'),
  };
}

/**
 * Le « drapeau » de Protomaps : une couleur par élément du fond (une centaine). Les neuf jetons du fond suffisent : la
 * terre et ses occupations du sol sont presque de la même couleur, les routes sont blanches à bord gris, seules l'eau
 * et les noms ont leur teinte. Les clés sont celles du paquet ; TypeScript refuse l'oubli d'une seule.
 */
export function drapeauDuFond(c: CouleursDuFond): Flavor {
  return {
    background: c.terre,
    earth: c.terre,
    park_a: c.parc,
    park_b: c.parc,
    hospital: c.terre,
    industrial: c.terre,
    school: c.terre,
    wood_a: c.parc,
    wood_b: c.parc,
    pedestrian: c.terre,
    scrub_a: c.parc,
    scrub_b: c.parc,
    glacier: c.terre,
    sand: c.terre,
    beach: c.terre,
    aerodrome: c.terre,
    runway: c.routeBord,
    water: c.eau,
    zoo: c.terre,
    military: c.terre,
    tunnel_other_casing: c.routeBord,
    tunnel_minor_casing: c.routeBord,
    tunnel_link_casing: c.routeBord,
    tunnel_major_casing: c.routeBord,
    tunnel_highway_casing: c.routeBord,
    tunnel_other: c.route,
    tunnel_minor: c.route,
    tunnel_link: c.route,
    tunnel_major: c.route,
    tunnel_highway: c.route,
    pier: c.terre,
    buildings: c.terre,
    minor_service_casing: c.routeBord,
    minor_casing: c.routeBord,
    link_casing: c.routeBord,
    major_casing_late: c.grandeRouteBord,
    highway_casing_late: c.grandeRouteBord,
    other: c.route,
    minor_service: c.route,
    minor_a: c.route,
    minor_b: c.route,
    link: c.route,
    major_casing_early: c.grandeRouteBord,
    major: c.route,
    highway_casing_early: c.grandeRouteBord,
    highway: c.route,
    railway: c.grandeRouteBord,
    boundaries: c.limite,
    bridges_other_casing: c.routeBord,
    bridges_minor_casing: c.routeBord,
    bridges_link_casing: c.routeBord,
    bridges_major_casing: c.grandeRouteBord,
    bridges_highway_casing: c.grandeRouteBord,
    bridges_other: c.route,
    bridges_minor: c.route,
    bridges_link: c.route,
    bridges_major: c.route,
    bridges_highway: c.route,
    roads_label_minor: c.nom,
    roads_label_minor_halo: c.halo,
    roads_label_major: c.nom,
    roads_label_major_halo: c.halo,
    ocean_label: c.nomEau,
    subplace_label: c.nom,
    subplace_label_halo: c.halo,
    city_label: c.nomFort,
    city_label_halo: c.halo,
    state_label: c.nom,
    state_label_halo: c.halo,
    country_label: c.nomFort,
    address_label: c.nom,
    address_label_halo: c.halo,
    // Une seule police pour toutes les graisses : un seul jeu de glyphes à servir (D6).
    regular: POLICE_DE_LA_CARTE,
    bold: POLICE_DE_LA_CARTE,
    italic: POLICE_DE_LA_CARTE,
    landcover: {
      barren: c.terre,
      farmland: c.terre,
      forest: c.parc,
      glacier: c.terre,
      grassland: c.parc,
      scrub: c.parc,
      urban_area: c.terre,
    },
  };
}

/**
 * Le nom d'un lieu : en français quand OpenStreetMap l'a, sinon le nom local. Le style de Protomaps sait aussi écrire
 * deux noms sur deux lignes et choisir une police par écriture (devanagari) : le Congo n'en a pas l'usage, et ces
 * expressions pèsent la moitié du style.
 */
const NOM_EN_FRANCAIS = ['coalesce', ['get', 'name:fr'], ['get', 'name']];

/**
 * Ce que le fichier allégé ne contient pas, le style ne le dessine pas : pas de couche d'une source retirée (bâtiments,
 * commerces), pas de pictogramme (le style n'a pas de sprite), pas d'occupation du sol avant le zoom 11. Une couche de
 * symboles sans texte (flèches, plaques de route) disparaît avec ses icônes.
 */
function retoucher(couche: LayerSpecification): LayerSpecification[] {
  const brute = structuredClone(couche) as unknown as Record<string, unknown>;
  const source = brute['source-layer'];
  if (typeof source === 'string' && !(COUCHES_DU_FOND as readonly string[]).includes(source))
    return [];

  const layout = { ...((brute.layout as Record<string, unknown> | undefined) ?? {}) };
  const paint = { ...((brute.paint as Record<string, unknown> | undefined) ?? {}) };
  // Une couche faite pour un pictogramme (plaques de route, flèches) n'a pas de sens sans lui, même si elle écrit un
  // texte (le numéro de la plaque) ; seules les villes gardent leur nom quand on retire le point qui les marque.
  if ('icon-image' in layout && source !== 'places') return [];
  for (const cle of Object.keys(layout)) if (cle.startsWith('icon-')) delete layout[cle];
  for (const cle of Object.keys(paint)) if (cle.startsWith('icon-')) delete paint[cle];
  if (brute.type === 'symbol' && !('text-field' in layout)) return [];
  if ('text-field' in layout) layout['text-field'] = NOM_EN_FRANCAIS;

  const retouchee: Record<string, unknown> = { ...brute, layout, paint };
  if (Object.keys(layout).length === 0) delete retouchee.layout;
  if (Object.keys(paint).length === 0) delete retouchee.paint;
  if (source === 'landuse') {
    retouchee.minzoom = Math.max(Number(brute.minzoom ?? 0), ZOOM_MIN_DE_L_OCCUPATION_DU_SOL);
  }
  return [retouchee as unknown as LayerSpecification];
}

export interface OptionsDuFond {
  /** Où lire le fichier de tuiles : R2 par défaut, le serveur local (`servir.ts`) pendant le développement. */
  adresseDesTuiles?: string;
}

/** Le style du fond : sa source (le fichier de tuiles, lu par morceaux), ses glyphes, ses couches. Rien d'autre. */
export function styleDuFond(css: string, options: OptionsDuFond = {}): StyleSpecification {
  const adresse = options.adresseDesTuiles ?? ADRESSE_DES_TUILES;
  const couches = layers('fond', drapeauDuFond(couleursDuFond(css)), { lang: 'fr' }).flatMap(
    retoucher,
  );
  return {
    version: 8,
    name: 'NTanova · fond de carte',
    glyphs: ADRESSE_DES_GLYPHES,
    sources: {
      fond: { type: 'vector', url: `pmtiles://${adresse}`, attribution: ATTRIBUTION_DU_FOND },
    },
    layers: couches,
  };
}
