/**
 * Le fond de la carte interactive : ce que l'îlot et le style savent du fichier de tuiles (ticket 114).
 * Des constantes seulement, sans dépendance : l'îlot les importe sans rien tirer du générateur de style.
 *
 * Le fichier est fabriqué par `outils/fond-de-carte/fabriquer.sh` et hébergé sur Cloudflare R2 (action du fondateur).
 * Son nom porte la date de la build : il ne change jamais sous un même nom, donc il se garde un an. Pour en publier un
 * nouveau, on envoie le fichier daté, on change `FICHIER_DES_TUILES`, on met en ligne, puis on efface l'ancien.
 */

export const FICHIER_DES_TUILES = 'congo-2026-11-03.pmtiles';
export const ADRESSE_DES_TUILES = `https://tuiles.ntanova.com/${FICHIER_DES_TUILES}`;

/** Les couches que le fichier contient (les bâtiments et les commerces en sont retirés : décision D6, `alleger.ts`). */
export const COUCHES_DU_FOND = [
  'boundaries',
  'earth',
  'landcover',
  'landuse',
  'places',
  'roads',
  'water',
] as const;

/** Le plus petit zoom de la carte : un téléphone de 360 px voit le Congo entier vers 4,7. */
export const ZOOM_MIN_DE_LA_CARTE = 4.5;
/** L'occupation du sol (parcs, quartiers) n'existe dans le fichier qu'à partir du zoom 11 : `alleger.ts` la retire avant. */
export const ZOOM_MIN_DE_L_OCCUPATION_DU_SOL = 11;
/** Les dernières tuiles du fichier : au-delà, on agrandit celles-ci (zoom maximal de la carte : 17,5). */
export const ZOOM_MAX_DES_TUILES = 15;
/** Hors des deux villes, le fichier s'arrête au zoom 10 : plus près, il n'y aurait rien à dessiner. */
export const ZOOM_MAX_HORS_DES_VILLES = 10;

/** Une fenêtre géographique : ouest, sud, est, nord (degrés). */
export type Fenetre = readonly [ouest: number, sud: number, est: number, nord: number];

/**
 * Les deux villes qui ont des tuiles jusqu'au zoom 15. Ce sont les fenêtres que `fabriquer.sh` extrait (un test
 * compare les deux) : une ville de plus s'ajoute aux deux endroits.
 */
export const FENETRES_DES_VILLES = {
  'pointe-noire': [11.8, -4.95, 11.99, -4.65],
  brazzaville: [15.1, -4.45, 15.4, -4.15],
} as const satisfies Record<string, Fenetre>;

/** Une seule police, servie par le site (ses glyphes sont dans `public/polices/carte/`). */
export const POLICE_DE_LA_CARTE = 'NotoSans-Regular';
export const ADRESSE_DES_GLYPHES = '/polices/carte/{fontstack}/{range}.pbf';

/** L'attribution d'OpenStreetMap (licence ODbL) : visible en permanence sous la carte. */
export const ATTRIBUTION_DU_FOND =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© les contributeurs d’OpenStreetMap</a>';
