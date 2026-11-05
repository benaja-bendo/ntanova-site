/**
 * Les couches de NTanova sur la carte interactive (ticket 103, décisions du 03/11) : les zones, les villes, les groupes
 * d'écoles et les marqueurs. Le style du fond (`style.ts`) les reçoit par `styleDeLaCarte`.
 *
 * - les **zones** disent leur état public : « relevé en cours » (`actif` : contour net, remplissage léger) ou « déploiement
 *   programmé » (`programme` : tirets et hachures). Une zone sans état n'est pas dans le fichier : elle n'a pas de couche ;
 * - les **villes** sont des pastilles qui s'effacent quand les arrondissements prennent la place ;
 * - les **écoles** se regroupent (rond vert, nombre) jusqu'au zoom 14, puis chacune a son marqueur (`marqueurs.ts`).
 *
 * Aucune couleur n'est écrite ici : elles viennent des jetons de `src/ui/jetons.css`. Les images (hachures, marqueurs,
 * écusson) sont dessinées par l'îlot au moment où MapLibre les demande.
 */
import type { ExpressionSpecification, LayerSpecification, SourceSpecification } from 'maplibre-gl';
import { POLICE_DE_LA_CARTE } from './fond';
import { lireJeton } from './jetons';
import { IMAGE_ECUSSON, IMAGE_HACHURES } from './marqueurs';

export const ADRESSE_DES_ZONES = '/carte/zones.geojson';
export const ADRESSE_DES_ECOLES = '/carte/ecoles.geojson';
export const SOURCE_ZONES = 'zones';
export const SOURCE_ECOLES = 'ecoles';
export const COUCHE_EPINGLES = 'ecoles-epingles';
export const COUCHE_GROUPES = 'ecoles-groupes';
export const COUCHE_NOMS = 'ecoles-noms';
/** L'école choisie vit dans sa propre source : un groupe ne la cache jamais, et le halo la suit. */
export const SOURCE_CHOISIE = 'ecole-choisie';
export const COUCHE_CHOISIE_HALO = 'ecole-choisie-halo';
export const COUCHE_CHOISIE = 'ecole-choisie-epingle';
export const COUCHE_CHOISIE_NOM = 'ecole-choisie-nom';

/** Le nom d'une école s'écrit à côté de son épingle à partir de ce zoom : avant, les épingles se touchent. */
export const ZOOM_MIN_DES_NOMS = 13;
/**
 * La trame d'un « déploiement programmé » s'efface entre ces deux zooms : de loin elle dit « pas encore parcouru », à hauteur
 * de rue elle rayerait la carte. Le contour pointillé reste, et l'état se lit dans la légende.
 */
export const ZOOM_TRAME_PLEINE = 11;
export const ZOOM_TRAME_EFFACEE = 12.5;

/** Les noms d'école du fond, sauf celui de l'école choisie (elle écrit le sien, plus grand). */
export function filtreDesNoms(idChoisi?: string): ExpressionSpecification {
  const base = ['!', ['has', 'point_count']];
  return expr(idChoisi ? ['all', base, ['!=', ['get', 'id'], idChoisi]] : base);
}

/** Deux écoles à moins de ce nombre de pixels forment un groupe (la cible d'un doigt fait 44 px), jusqu'au zoom 14. */
export const RAYON_DES_GROUPES = 56;
export const ZOOM_MAX_DES_GROUPES = 14;
/**
 * Les pastilles de ville s'effacent quand les arrondissements prennent la place ; les groupes d'écoles et les marqueurs
 * prennent le relais au même zoom, jamais avant : une ville et ses écoles, avec le même nombre, ne se superposent pas.
 */
export const ZOOM_MAX_DES_VILLES = 9.5;
/** Les polygones des zones apparaissent avec les villes qui deviennent lisibles. */
export const ZOOM_MIN_DES_ZONES = 8;

export interface CouleursDeLaCarte {
  zoneActif: string;
  zoneProgramme: string;
  zoneNom: string;
  zoneNomDoux: string;
  zoneHalo: string;
  groupe: string;
  groupeTexte: string;
  groupeAnneau: string;
  selectionHalo: string;
}

/** Les couleurs des couches de NTanova, lues dans le texte de `jetons.css` (en suivant les `var(--…)`). */
export function couleursDeLaCarte(css: string): CouleursDeLaCarte {
  const jeton = (nom: string) => lireJeton(css, `carte-${nom}`);
  return {
    zoneActif: jeton('zone-actif'),
    zoneProgramme: jeton('zone-programme'),
    zoneNom: jeton('zone-nom'),
    zoneNomDoux: jeton('zone-nom-doux'),
    zoneHalo: jeton('zone-halo'),
    groupe: jeton('groupe'),
    groupeTexte: jeton('groupe-texte'),
    groupeAnneau: jeton('groupe-anneau'),
    selectionHalo: jeton('selection-halo'),
  };
}

export interface CouchesDeLaCarte {
  sources: Record<string, SourceSpecification>;
  /** Les remplissages des zones : sous l'eau, pour que le fleuve ne soit jamais hachuré (la commune de Brazzaville le contient). */
  sousLEau: LayerSpecification[];
  /** Les contours des zones : au-dessus du fond, sous ses noms. */
  contours: LayerSpecification[];
  /** Les noms des zones, les villes, les groupes et les marqueurs : tout en haut. */
  dessus: LayerSpecification[];
}

const expr = (e: unknown): ExpressionSpecification => e as ExpressionSpecification;
const de = (cle: string) => ['==', ['get', 'etat'], cle];
const estUneZone = ['==', ['get', 'genre'], 'zone'];
const estUneVille = ['==', ['get', 'genre'], 'ville'];
const police = [POLICE_DE_LA_CARTE];
const aucuneEcole = { type: 'FeatureCollection', features: [] } as const;
/** Le nom du marqueur d'une école, comme `couches` le demande à l'îlot : lettre, écusson si confirmée, et grandeur. */
const imageDeLEpingle = (suffixe: string) =>
  expr([
    'concat',
    'epingle-',
    ['coalesce', ['get', 'lettre'], 'neutre'],
    ['case', ['==', ['get', 'preuve'], 'direction'], '-confirmee', ''],
    suffixe,
  ]);

export function couchesDeLaCarte(c: CouleursDeLaCarte): CouchesDeLaCarte {
  const parEtat = (actif: string, programme: string) =>
    expr(['match', ['get', 'etat'], 'actif', actif, programme]);
  const nomEtLibelle = expr([
    'format',
    ['get', 'nom'],
    { 'font-scale': 1 },
    '\n',
    {},
    ['get', 'libelle'],
    { 'font-scale': 0.85 },
  ]);
  const nomSeul = expr(['format', ['get', 'nom'], { 'font-scale': 1 }]);
  const texteDeZone = {
    'text-color': parEtat(c.zoneNom, c.zoneNomDoux),
    'text-halo-color': c.zoneHalo,
    'text-halo-width': 1.5,
  };

  return {
    sources: {
      [SOURCE_ZONES]: { type: 'geojson', data: ADRESSE_DES_ZONES },
      [SOURCE_ECOLES]: {
        type: 'geojson',
        data: ADRESSE_DES_ECOLES,
        cluster: true,
        clusterRadius: RAYON_DES_GROUPES,
        clusterMaxZoom: ZOOM_MAX_DES_GROUPES,
        // Un groupe porte un écusson dès qu'une de ses écoles est confirmée par sa direction.
        clusterProperties: {
          confirmees: expr(['+', ['case', ['==', ['get', 'preuve'], 'direction'], 1, 0]]),
        },
      },
      [SOURCE_CHOISIE]: { type: 'geojson', data: aucuneEcole },
    },

    sousLEau: [
      {
        id: 'zones-fond-actif',
        type: 'fill',
        source: SOURCE_ZONES,
        minzoom: ZOOM_MIN_DES_ZONES,
        filter: expr(['all', estUneZone, de('actif')]),
        paint: { 'fill-color': c.zoneActif, 'fill-opacity': 0.1 },
      },
      {
        id: 'zones-fond-programme',
        type: 'fill',
        source: SOURCE_ZONES,
        minzoom: ZOOM_MIN_DES_ZONES,
        filter: expr(['all', estUneZone, de('programme')]),
        paint: {
          'fill-pattern': IMAGE_HACHURES,
          'fill-opacity': expr([
            'interpolate',
            ['linear'],
            ['zoom'],
            ZOOM_TRAME_PLEINE,
            1,
            ZOOM_TRAME_EFFACEE,
            0,
          ]),
        },
      },
    ],

    contours: [
      {
        id: 'zones-contour-actif',
        type: 'line',
        source: SOURCE_ZONES,
        minzoom: ZOOM_MIN_DES_ZONES,
        filter: expr(['all', estUneZone, de('actif')]),
        layout: { 'line-join': 'round' },
        paint: { 'line-color': c.zoneActif, 'line-width': 2 },
      },
      {
        id: 'zones-contour-programme',
        type: 'line',
        source: SOURCE_ZONES,
        minzoom: ZOOM_MIN_DES_ZONES,
        filter: expr(['all', estUneZone, de('programme')]),
        paint: { 'line-color': c.zoneProgramme, 'line-width': 1.5, 'line-dasharray': [4, 3] },
      },
    ],

    dessus: [
      {
        id: 'zones-nom',
        type: 'symbol',
        source: SOURCE_ZONES,
        minzoom: ZOOM_MIN_DES_ZONES + 0.5,
        filter: expr(estUneZone),
        layout: {
          // Une zone « relevé en cours » dit son état ; une zone « déploiement programmé » n'écrit que son nom : l'état se
          // lit dans la légende et dans le panneau, jamais répété sur chaque quartier.
          'text-field': expr(['case', de('actif'), nomEtLibelle, nomSeul]),
          'text-font': police,
          'text-size': expr(['interpolate', ['linear'], ['zoom'], 8, 12, 14, 15]),
          'text-max-width': 8,
          'text-padding': 4,
        },
        paint: texteDeZone,
      },
      {
        id: 'villes-pastille',
        type: 'circle',
        source: SOURCE_ZONES,
        maxzoom: ZOOM_MAX_DES_VILLES,
        filter: expr(estUneVille),
        paint: {
          'circle-radius': 15,
          'circle-color': parEtat(c.zoneActif, c.zoneProgramme),
          'circle-stroke-width': 2,
          'circle-stroke-color': c.groupeAnneau,
        },
      },
      {
        id: 'villes-nombre',
        type: 'symbol',
        source: SOURCE_ZONES,
        maxzoom: ZOOM_MAX_DES_VILLES,
        filter: expr(estUneVille),
        layout: {
          // Le nombre d'écoles VUES SUR PLACE, celles qui sont sur la carte : pas le total publié.
          'text-field': expr(['to-string', ['get', 'vues']]),
          'text-font': police,
          'text-size': 14,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': c.groupeTexte },
      },
      {
        id: 'villes-nom',
        type: 'symbol',
        source: SOURCE_ZONES,
        maxzoom: ZOOM_MAX_DES_VILLES,
        filter: expr(estUneVille),
        layout: {
          'text-field': nomEtLibelle,
          'text-font': police,
          'text-size': 13,
          'text-anchor': 'left',
          'text-offset': [1.4, 0],
          'text-max-width': 9,
        },
        paint: texteDeZone,
      },
      {
        id: COUCHE_GROUPES,
        minzoom: ZOOM_MAX_DES_VILLES,
        type: 'circle',
        source: SOURCE_ECOLES,
        filter: expr(['has', 'point_count']),
        paint: {
          'circle-color': c.groupe,
          'circle-radius': expr(['step', ['get', 'point_count'], 18, 10, 22, 50, 26]),
          'circle-stroke-width': 3,
          'circle-stroke-color': c.groupeAnneau,
        },
      },
      {
        id: 'ecoles-groupes-nombre',
        minzoom: ZOOM_MAX_DES_VILLES,
        type: 'symbol',
        source: SOURCE_ECOLES,
        filter: expr(['has', 'point_count']),
        layout: {
          'text-field': expr(['get', 'point_count_abbreviated']),
          'text-font': police,
          'text-size': 14,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': c.groupeTexte },
      },
      {
        id: 'ecoles-groupes-ecusson',
        minzoom: ZOOM_MAX_DES_VILLES,
        type: 'symbol',
        source: SOURCE_ECOLES,
        filter: expr(['all', ['has', 'point_count'], ['>', ['get', 'confirmees'], 0]]),
        layout: {
          'icon-image': IMAGE_ECUSSON,
          'icon-offset': [14, -14],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      {
        // Le halo de l'école choisie : sous toutes les épingles, pour que la sienne, plus grande, le recouvre à moitié.
        id: COUCHE_CHOISIE_HALO,
        type: 'circle',
        source: SOURCE_CHOISIE,
        paint: {
          'circle-radius': 20,
          'circle-color': c.selectionHalo,
          'circle-opacity': 0.6,
          'circle-blur': 0.35,
          'circle-pitch-alignment': 'map',
        },
      },
      {
        id: COUCHE_EPINGLES,
        minzoom: ZOOM_MAX_DES_VILLES,
        type: 'symbol',
        source: SOURCE_ECOLES,
        filter: expr(['!', ['has', 'point_count']]),
        layout: {
          // Forme = preuve (épingle, avec écusson quand la direction a confirmé), lettre et couleur = cycle le plus élevé.
          'icon-image': imageDeLEpingle(''),
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      {
        // Le nom de chaque école, à côté de son épingle : une épingle sans nom oblige à la toucher pour savoir.
        id: COUCHE_NOMS,
        minzoom: ZOOM_MIN_DES_NOMS,
        type: 'symbol',
        source: SOURCE_ECOLES,
        filter: filtreDesNoms(),
        layout: {
          'text-field': expr(['get', 'nom']),
          'text-font': police,
          'text-size': 13,
          'text-anchor': 'left',
          'text-offset': [1.4, -1.8],
          'text-max-width': 9,
          'text-padding': 2,
        },
        paint: {
          'text-color': c.zoneNom,
          'text-halo-color': c.zoneHalo,
          'text-halo-width': 2,
        },
      },
      {
        id: COUCHE_CHOISIE,
        type: 'symbol',
        source: SOURCE_CHOISIE,
        layout: {
          'icon-image': imageDeLEpingle('-choisie'),
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      },
      {
        id: COUCHE_CHOISIE_NOM,
        type: 'symbol',
        source: SOURCE_CHOISIE,
        layout: {
          'text-field': expr(['get', 'nom']),
          'text-font': police,
          'text-size': 15,
          'text-anchor': 'left',
          'text-offset': [1.6, -2.1],
          'text-max-width': 10,
          // Toujours écrit, et il pèse sur les noms du dessous : celui de la zone s'efface plutôt que de le chevaucher.
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': c.zoneNom,
          'text-halo-color': c.zoneHalo,
          'text-halo-width': 2,
        },
      },
    ],
  };
}
