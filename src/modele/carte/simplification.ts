/**
 * Simplifier un contour (ticket 113). Un contour d'OpenStreetMap a des milliers de points ; un téléphone n'en a pas
 * besoin, et chacun pèse une dizaine d'octets dans un GeoJSON. Douglas-Peucker en mètres, des anneaux qui restent
 * fermés, des coordonnées arrondies : une fonction pure, partagée par l'outil qui écrit les contours dans la base
 * (`outils/tracer-les-contours.ts`) et par la construction de `/carte/zones.geojson`.
 *
 * Un contour simplifié sert à situer et à dessiner, pas à mesurer.
 */
import type { MultiPolygone } from '../geo';
// L'extension est écrite : l'outil `outils/tracer-les-contours.ts` charge ce fichier avec Node seul.
import { METRES_PAR_DEGRE } from './geometrie.ts';

type Coin = number[];
type EnMetres = readonly [x: number, y: number];

/** Les indices à garder d'une ligne ouverte (Douglas-Peucker), les deux bouts toujours. Les points sont en mètres. */
function indicesGardes(points: readonly EnMetres[], tolerance: number): number[] {
  const garde = points.map(() => false);
  garde[0] = true;
  garde[points.length - 1] = true;
  const pile: [number, number][] = [[0, points.length - 1]];
  for (let tranche = pile.pop(); tranche; tranche = pile.pop()) {
    const [a, b] = tranche;
    const [x1, y1] = points[a]!;
    const [x2, y2] = points[b]!;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const n = Math.hypot(dx, dy);
    let loin = -1;
    let ecart = 0;
    for (let i = a + 1; i < b; i++) {
      const [x0, y0] = points[i]!;
      const d =
        n < 1e-6
          ? Math.hypot(x0 - x1, y0 - y1)
          : Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / n;
      if (d > ecart) {
        loin = i;
        ecart = d;
      }
    }
    if (loin >= 0 && ecart > tolerance) {
      garde[loin] = true;
      pile.push([a, loin], [loin, b]);
    }
  }
  return garde.flatMap((g, i) => (g ? [i] : []));
}

function arrondi(points: readonly Coin[], decimales: number): Coin[] {
  const sortie: Coin[] = [];
  for (const p of points) {
    const q = [Number((p[0] ?? 0).toFixed(decimales)), Number((p[1] ?? 0).toFixed(decimales))];
    const dernier = sortie[sortie.length - 1];
    if (!dernier || dernier[0] !== q[0] || dernier[1] !== q[1]) sortie.push(q);
  }
  return sortie;
}

/**
 * Un anneau fermé, simplifié à `toleranceM` mètres près et arrondi à `decimales` (5 : un mètre). Il reste fermé et garde
 * au moins quatre points : si la tolérance l'écrasait, l'anneau d'origine (arrondi) est rendu tel quel.
 */
export function simplifierAnneau(
  anneau: readonly Coin[],
  toleranceM: number,
  decimales = 5,
): Coin[] {
  if (anneau.length < 5) return arrondi(anneau, decimales);
  const ferme = anneau[0]![0] === anneau.at(-1)![0] && anneau[0]![1] === anneau.at(-1)![1];
  const points = ferme ? anneau : [...anneau, anneau[0]!];
  const milieu = points.reduce((s, p) => s + (p[1] ?? 0), 0) / points.length;
  const kx = Math.cos((milieu * Math.PI) / 180);
  const metres: EnMetres[] = points.map((p) => [
    (p[0] ?? 0) * kx * METRES_PAR_DEGRE,
    (p[1] ?? 0) * METRES_PAR_DEGRE,
  ]);
  // L'anneau est fermé : Douglas-Peucker a besoin de deux bouts distincts. On le coupe au point le plus éloigné du
  // premier, on simplifie chaque moitié, on les recolle.
  const [x0, y0] = metres[0]!;
  let loin = 1;
  let ecart = -1;
  for (let i = 1; i < metres.length - 1; i++) {
    const d = Math.hypot(metres[i]![0] - x0, metres[i]![1] - y0);
    if (d > ecart) {
      loin = i;
      ecart = d;
    }
  }
  const premiere = indicesGardes(metres.slice(0, loin + 1), toleranceM);
  const seconde = indicesGardes(metres.slice(loin), toleranceM).map((i) => i + loin);
  const indices = [...premiere, ...seconde.slice(1)];
  const simplifie = arrondi(
    indices.map((i) => points[i]!),
    decimales,
  );
  const reste =
    simplifie.length >= 4 &&
    simplifie[0]![0] === simplifie.at(-1)![0] &&
    simplifie[0]![1] === simplifie.at(-1)![1];
  return reste ? simplifie : arrondi(points, decimales);
}

/**
 * Un contour (polygones › anneaux › points) simplifié. L'extérieur de chaque polygone est toujours gardé ; un trou que
 * la tolérance fait disparaître (moins de quatre points) est laissé de côté.
 */
export function simplifierContour(
  contour: MultiPolygone,
  toleranceM: number,
  decimales = 5,
): MultiPolygone {
  return contour.map(([exterieur, ...trous]) => {
    if (!exterieur) return [];
    return [
      simplifierAnneau(exterieur, toleranceM, decimales),
      ...trous
        .map((trou) => simplifierAnneau(trou, toleranceM, decimales))
        .filter((trou) => trou.length >= 4 && !tropPetit(trou, toleranceM)),
    ];
  });
}

/** Un trou plus petit que la tolérance dans les deux sens n'est pas un détail qu'on dessine. */
function tropPetit(anneau: readonly Coin[], toleranceM: number): boolean {
  const lons = anneau.map((p) => p[0] ?? 0);
  const lats = anneau.map((p) => p[1] ?? 0);
  const largeur =
    (Math.max(...lons) - Math.min(...lons)) *
    Math.cos((((Math.max(...lats) + Math.min(...lats)) / 2) * Math.PI) / 180) *
    METRES_PAR_DEGRE;
  const hauteur = (Math.max(...lats) - Math.min(...lats)) * METRES_PAR_DEGRE;
  return largeur < toleranceM && hauteur < toleranceM;
}
