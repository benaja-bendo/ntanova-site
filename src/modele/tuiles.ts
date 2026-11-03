/**
 * Le calcul de la carte de position (ticket #72) : où tombent les tuiles d'OpenStreetMap autour d'un point, et où se
 * pose le repère. Des fonctions pures : le dessin est dans `src/app/commun/CartePosition.tsx`.
 *
 * Le projet n'embarque aucune bibliothèque de cartes : une carte est une grille de six tuiles au plus (360 × 220 px,
 * tuiles de 256 px), un repère et le cercle de la précision, dessinés en SVG. La projection est celle de toutes les
 * cartes en tuiles (« Web Mercator »).
 *
 * Les tuiles viennent du serveur d'OpenStreetMap, dont les conditions sont : un usage léger (une poignée de tuiles
 * par carte ouverte, jamais de préchargement), l'attribution visible sous la carte, et les tuiles gardées par le
 * navigateur. Si l'usage monte, on change de fournisseur : `ADRESSE_DES_TUILES` est la seule ligne à changer.
 */
import type { Point } from './geo';

/** Le côté d'une tuile, en pixels. */
export const TAILLE_TUILE = 256;

/** Le modèle d'adresse des tuiles : `{z}` le zoom, `{x}` la colonne, `{y}` la rangée. */
export const ADRESSE_DES_TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

/** À écrire sous toute carte qui montre des tuiles d'OpenStreetMap. */
export const ATTRIBUTION_DES_TUILES = '© les contributeurs d’OpenStreetMap';

/** Le zoom de la carte de position : environ 1,2 m par pixel à Pointe-Noire, une rue se lit. */
export const ZOOM_DE_POSITION = 17;

/** Une tuile : sa colonne, sa rangée, son zoom, et où elle se pose sur la carte (en pixels, depuis le coin haut gauche). */
export interface Tuile {
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
}

/** La latitude au-delà de laquelle la projection ne dessine plus rien. */
const LATITUDE_MAX = 85.0511287798;

/** Où un point tombe dans le monde au zoom donné, en pixels depuis le coin nord-ouest du monde. */
export function pixelDuMonde(point: Point, zoom: number): { x: number; y: number } {
  const monde = TAILLE_TUILE * 2 ** zoom;
  const latitude = Math.max(-LATITUDE_MAX, Math.min(LATITUDE_MAX, point.latitude));
  const sinus = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((point.longitude + 180) / 360) * monde,
    y: (0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI)) * monde,
  };
}

/** Combien de mètres représente un pixel, à cette latitude et à ce zoom. */
export function metresParPixel(latitude: number, zoom: number): number {
  return (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
}

/** Le rayon, en pixels, d'une distance en mètres (le cercle de la précision de la position). */
export function rayonEnPixels(metres: number, latitude: number, zoom: number): number {
  return metres / metresParPixel(latitude, zoom);
}

/**
 * Les tuiles qui couvrent une carte de `largeur` × `hauteur` pixels centrée sur le point, et le centre de la carte
 * (où se pose le repère). Les tuiles hors du monde (au-delà des pôles) sont laissées de côté ; une colonne qui
 * passe le méridien opposé est ramenée dans le monde.
 */
export function grilleDeTuiles(
  point: Point,
  dimensions: { largeur: number; hauteur: number; zoom: number },
): { tuiles: Tuile[]; centre: { x: number; y: number } } {
  const { largeur, hauteur, zoom } = dimensions;
  const monde = pixelDuMonde(point, zoom);
  const gauche = monde.x - largeur / 2;
  const haut = monde.y - hauteur / 2;
  const nombre = 2 ** zoom;
  const tuiles: Tuile[] = [];
  for (
    let ty = Math.floor(haut / TAILLE_TUILE);
    ty <= Math.floor((haut + hauteur - 1) / TAILLE_TUILE);
    ty++
  ) {
    if (ty < 0 || ty >= nombre) continue;
    for (
      let tx = Math.floor(gauche / TAILLE_TUILE);
      tx <= Math.floor((gauche + largeur - 1) / TAILLE_TUILE);
      tx++
    ) {
      tuiles.push({
        x: ((tx % nombre) + nombre) % nombre,
        y: ty,
        z: zoom,
        px: tx * TAILLE_TUILE - gauche,
        py: ty * TAILLE_TUILE - haut,
      });
    }
  }
  return { tuiles, centre: { x: largeur / 2, y: hauteur / 2 } };
}

/** L'adresse d'une tuile chez le fournisseur. */
export function adresseDeTuile(tuile: Tuile): string {
  return ADRESSE_DES_TUILES.replace('{z}', String(tuile.z))
    .replace('{x}', String(tuile.x))
    .replace('{y}', String(tuile.y));
}
