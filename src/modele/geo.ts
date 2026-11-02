/**
 * Les calculs de position faits dans le téléphone, sans réseau. La base refait
 * les mêmes avec PostGIS : le téléphone prévient, la base tranche.
 */

export interface Point {
  latitude: number;
  longitude: number;
}

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

/** Jusqu'à cette distance du contour d'un lot, une école n'est pas « hors du lot » (comme la base). */
export const TOLERANCE_LOT_M = 50;

const METRES_PAR_DEGRE = (RAYON_TERRE_M * Math.PI) / 180;

/** La distance en mètres d'un point à un segment, sur un plan tangent au point : juste à ces échelles. */
function distanceAuSegment(point: Point, debut: number[], fin: number[]): number {
  const echelleLongitude = METRES_PAR_DEGRE * Math.cos((point.latitude * Math.PI) / 180);
  const [lng1 = 0, lat1 = 0] = debut;
  const [lng2 = 0, lat2 = 0] = fin;
  // Le point est l'origine ; le segment se compte en mètres à partir de lui.
  const x1 = (lng1 - point.longitude) * echelleLongitude;
  const y1 = (lat1 - point.latitude) * METRES_PAR_DEGRE;
  const dx = (lng2 - lng1) * echelleLongitude;
  const dy = (lat2 - lat1) * METRES_PAR_DEGRE;
  const longueur2 = dx * dx + dy * dy;
  const t = longueur2 === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / longueur2));
  return Math.hypot(x1 + t * dx, y1 + t * dy);
}

/**
 * La distance en mètres d'un point au contour : 0 dedans, sinon celle du bord le plus proche
 * (le bord d'un trou compte : un point dans un trou est hors du contour). Infinie si le contour est vide.
 */
export function distanceAuContour(point: Point, contour: MultiPolygone): number {
  if (dansContour(point, contour)) return 0;
  let plusProche = Infinity;
  for (const polygone of contour) {
    for (const anneau of polygone) {
      for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
        plusProche = Math.min(
          plusProche,
          distanceAuSegment(point, anneau[j] ?? [], anneau[i] ?? []),
        );
      }
    }
  }
  return plusProche;
}

/**
 * La position est-elle dans le lot, ou à moins de 50 m de son contour ? La base compte pareil : un lot
 * fin coupe un quartier, et un GPS se trompe de 10 à 30 m. `null` quand la question n'a pas de sens :
 * pas de lot, pas de contour, ou le lot d'entraînement (on s'y forme n'importe où).
 */
export function dansLeLot(
  point: Point,
  lot: { essai: boolean; contour: MultiPolygone | null } | null | undefined,
): boolean | null {
  if (!lot || lot.essai || !lot.contour) return null;
  return distanceAuContour(point, lot.contour) <= TOLERANCE_LOT_M;
}
