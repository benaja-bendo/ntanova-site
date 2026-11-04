import { creerApercu } from './apercu';
/**
 * L'îlot de la carte interactive (ticket 103) : MapLibre 6 et le fichier de tuiles, chargés par `import()` seulement quand
 * la page l'a décidé (`modele/carte/chargement.ts`). Rien d'autre que du navigateur : le style vient de `/carte/style.json`
 * (écrit à la construction, aux jetons), les zones et les écoles de leurs deux GeoJSON, le fond de R2.
 *
 * Ce que l'îlot ne fait pas, ici : demander la position (jamais sans geste, et pas encore de bouton), ni parler à un autre
 * serveur que le sien et celui des tuiles.
 */
import {
  addProtocol,
  AttributionControl,
  MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from 'maplibre-gl';
import feuille from 'maplibre-gl/dist/maplibre-gl.css?url';
import travailleur from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import type { FeatureEcole } from '../../modele/carte/donnees';
import {
  BOITE_DU_PAYS,
  ZOOM_MAX_DE_LA_CARTE,
  ZOOM_MAX_DU_CADRE_PAR_DEFAUT,
  ZOOM_MIN_DE_LA_CARTE,
  zoomMaxEn,
  type Fenetre,
} from '../../modele/carte/fond';
import { COUCHE_EPINGLES, COUCHE_GROUPES, SOURCE_ECOLES } from '../../modele/carte/couches';
import { imageDeLaCarte, nomsDesImages } from './images';

export interface DemarrageDeLaCarte {
  /** L'élément où MapLibre dessine : vide, de la taille de la carte. */
  toile: HTMLElement;
  /** Le cadre par défaut (ouest, sud, est, nord), calculé à la construction. */
  boite: Fenetre;
  /** Premier affichage complet : le repli peut s'effacer. */
  surPrete: () => void;
  surSelection?: (ecole: FeatureEcole['properties']) => void;
  integree?: boolean;
  /** Le fichier de tuiles ne répond pas : les zones et les écoles se dessinent, le fond manque. */
  surFondAbsent: () => void;
}

/** Une cible de doigt : 44 px de large, donc 22 px autour du point touché. */
const RAYON_DU_DOIGT = 22;

/** Les propriétés d'une feature GeoJSON de MapLibre : un tableau est renvoyé sous forme de texte JSON. */
function lireLEcole(f: MapGeoJSONFeature): FeatureEcole['properties'] {
  const p = { ...f.properties } as Record<string, unknown>;
  if (typeof p.niveaux === 'string') {
    try {
      p.niveaux = JSON.parse(p.niveaux);
    } catch {
      p.niveaux = [];
    }
  }
  return p as unknown as FeatureEcole['properties'];
}

/**
 * La feuille de style de MapLibre, posée par l'îlot et non par la page : importée avec `import 'maplibre-gl.css'`, la
 * construction la met dans l'en-tête de `/carte/` (≈ 10 Ko compressés pour tout visiteur, carte chargée ou non, et même sans
 * WebGL2). Ici elle ne part qu'avec l'îlot. La carte attend qu'elle soit là : sans elle, ses boutons s'étalent sur la page.
 */
function poserLaFeuille(): Promise<void> {
  return new Promise((resolve, reject) => {
    const lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.href = feuille;
    lien.onload = () => resolve();
    lien.onerror = () => reject(new Error('La feuille de style de la carte ne se charge pas.'));
    document.head.append(lien);
  });
}

async function lireLeStyle(): Promise<StyleSpecification> {
  const reponse = await fetch('/carte/style.json');
  if (!reponse.ok) throw new Error(`Le style de la carte ne se lit pas (HTTP ${reponse.status}).`);
  return (await reponse.json()) as StyleSpecification;
}

export async function demarrerLaCarte(options: DemarrageDeLaCarte): Promise<MapLibreMap> {
  const [style] = await Promise.all([lireLeStyle(), poserLaFeuille()]);

  // Le calcul des tuiles tourne dans un worker : MapLibre le cherche à côté de son script, ce qui ne tient plus une fois
  // le script regroupé. On lui donne l'adresse du fichier copié par la construction.
  setWorkerUrl(travailleur);
  addProtocol('pmtiles', new Protocol().tile);

  const carte = new MapLibreMap({
    container: options.toile,
    style,
    bounds: [...options.boite],
    fitBoundsOptions: { padding: 32, maxZoom: ZOOM_MAX_DU_CADRE_PAR_DEFAUT },
    maxBounds: [...BOITE_DU_PAYS],
    minZoom: ZOOM_MIN_DE_LA_CARTE,
    maxZoom: ZOOM_MAX_DE_LA_CARTE,
    // Un téléphone à 3 pixels par point ne dessine pas 9 pixels pour 1 : le plafond à 2 ménage la mémoire et la batterie.
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    // L'attribution d'OpenStreetMap reste écrite sous la carte, jamais repliée (licence ODbL).
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    cooperativeGestures: options.integree ?? false,
    locale: {
      'Map.Title': 'Carte',
      'NavigationControl.ZoomIn': 'Zoomer',
      'NavigationControl.ZoomOut': 'Dézoomer',
      'Popup.Close': 'Fermer l’aperçu',
      'AttributionControl.ToggleAttribution': 'Afficher les crédits',
      'CooperativeGesturesHandler.WindowsHelpText':
        'Utilisez Ctrl et la molette pour zoomer sur la carte',
      'CooperativeGesturesHandler.MacHelpText': 'Utilisez ⌘ et la molette pour zoomer sur la carte',
      'CooperativeGesturesHandler.MobileHelpText': 'Utilisez deux doigts pour déplacer la carte',
    },
  });
  carte.touchZoomRotate.disableRotation();
  carte.addControl(new AttributionControl({ compact: false }), 'bottom-right');
  carte.addControl(new NavigationControl({ showCompass: false }), 'top-right');

  const poserUneImage = (nom: string) => {
    const image = imageDeLaCarte(nom);
    if (image && !carte.hasImage(nom))
      carte.addImage(nom, image.data, { pixelRatio: image.pixelRatio });
  };
  // Toutes les images d'abord, dès que le style est là ; le rattrapage à la demande n'est qu'un filet.
  carte.once('style.load', () => nomsDesImages().forEach(poserUneImage));
  carte.on('styleimagemissing', (e) => poserUneImage(e.id));

  // Hors de Pointe-Noire et de Brazzaville, le fichier s'arrête au zoom 10 : plus près, la carte serait blanche.
  const borner = () => {
    const { lng, lat } = carte.getCenter();
    const max = zoomMaxEn(lng, lat);
    if (carte.getZoom() > max + 0.01)
      carte.easeTo({
        zoom: max,
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300,
      });
    else carte.setMaxZoom(max);
  };
  carte.on('moveend', borner);

  // Toucher un groupe le défait ; toucher une épingle ouvre son aperçu (le tiroir arrive à l'étape D).
  let ouvert: Popup | null = null;
  carte.on('click', (e) => {
    const zone: [[number, number], [number, number]] = [
      [e.point.x - RAYON_DU_DOIGT, e.point.y - RAYON_DU_DOIGT],
      [e.point.x + RAYON_DU_DOIGT, e.point.y + RAYON_DU_DOIGT],
    ];
    const touches = carte.queryRenderedFeatures(zone, {
      layers: [COUCHE_EPINGLES, COUCHE_GROUPES],
    });
    const premier = touches[0];
    if (!premier || premier.geometry.type !== 'Point') {
      ouvert?.remove();
      return;
    }
    const centre = premier.geometry.coordinates as [number, number];
    if (premier.layer.id === COUCHE_GROUPES) {
      const source = carte.getSource(SOURCE_ECOLES);
      const id = Number(premier.properties.cluster_id);
      if (source && 'getClusterExpansionZoom' in source) {
        void (source as { getClusterExpansionZoom(id: number): Promise<number> })
          .getClusterExpansionZoom(id)
          .then((zoom) =>
            carte.easeTo({ center: centre, zoom: Math.min(zoom + 0.25, ZOOM_MAX_DE_LA_CARTE) }),
          );
      }
      return;
    }
    if (options.surSelection) {
      options.surSelection(lireLEcole(premier));
      return;
    }
    ouvert?.remove();
    ouvert = new Popup({ offset: [0, -40], maxWidth: '280px' })
      .setLngLat(centre)
      .setDOMContent(creerApercu(lireLEcole(premier), centre))
      .addTo(carte);
  });
  for (const couche of [COUCHE_EPINGLES, COUCHE_GROUPES]) {
    carte.on('mouseenter', couche, () => (carte.getCanvas().style.cursor = 'pointer'));
    carte.on('mouseleave', couche, () => (carte.getCanvas().style.cursor = ''));
  }

  carte.on('error', (e) => {
    console.error('carte :', e.error?.message ?? e);
    if ((e as { sourceId?: string }).sourceId === 'fond') options.surFondAbsent();
  });
  carte.once('idle', options.surPrete);

  // Pour la console du navigateur pendant les essais (et les parcours), comme `window.carte` de /dev/carte/.
  Object.assign(window, { ntanovaCarte: carte });
  return carte;
}
