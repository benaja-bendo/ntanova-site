/**
 * Les calculs de position faits dans le téléphone, sans réseau. La base refait
 * les mêmes avec PostGIS : le téléphone prévient, la base tranche.
 */

export interface Point {
  latitude: number;
  longitude: number;
}

/**
 * Pourquoi la position n'a pas pu être prise : refusée par le téléphone ou le navigateur, introuvable (signal), trop
 * longue, ou pas du tout gérée par le navigateur.
 */
export type ErreurPosition = 'refusee' | 'indisponible' | 'trop_longue' | 'absente';

/** Les coordonnées d'un MultiPolygon GeoJSON : [polygone][anneau][point][lng, lat]. */
export type MultiPolygone = number[][][][];

/** Le rayon sous lequel deux relevés sont peut-être la même école (comme la base). */
export const RAYON_DOUBLON_M = 40;

/** Au-delà, on demande au relais de se placer devant l'entrée. */
export const PRECISION_SUFFISANTE_M = 50;

const RAYON_TERRE_M = 6_371_008.8;

/** La distance en mètres entre deux points (formule de haversine). */
export function distanceMetres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** La plus proche des écoles à moins de `rayon` mètres, ou null. */
export function plusProche<T extends Point>(
  point: Point,
  ecoles: readonly T[],
  rayon = RAYON_DOUBLON_M,
): (T & { distance: number }) | null {
  let meilleure: (T & { distance: number }) | null = null;
  for (const ecole of ecoles) {
    const distance = distanceMetres(point, ecole);
    if (distance <= rayon && (meilleure === null || distance < meilleure.distance)) {
      meilleure = { ...ecole, distance };
    }
  }
  return meilleure;
}

function dansAnneau(point: Point, anneau: number[][]): boolean {
  let dedans = false;
  const x = point.longitude;
  const y = point.latitude;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi = 0, yi = 0] = anneau[i] ?? [];
    const [xj = 0, yj = 0] = anneau[j] ?? [];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Le point est-il dans le contour ? (Le premier anneau d'un polygone est l'extérieur, les autres des trous.) */
export function dansContour(point: Point, contour: MultiPolygone): boolean {
  return contour.some(
    ([exterieur, ...trous]) =>
      exterieur !== undefined &&
      dansAnneau(point, exterieur) &&
      !trous.some((trou) => dansAnneau(point, trou)),
  );
}
