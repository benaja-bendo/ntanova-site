/**
 * La carte détourée, côté calcul : projeter des positions sur un dessin, tracer les contours et
 * les rues, regrouper les écoles qui se toucheraient à l'écran. Des fonctions pures, appelées à la
 * construction du site : la page publique ne reçoit que le SVG, sans JavaScript.
 *
 * La projection est celle du canevas « Site NTanova » : équirectangulaire, la longitude
 * resserrée par le cosinus de la latitude du milieu. À Pointe-Noire (4,8° sud), l'écart avec une
 * vraie carte est invisible.
 */
import type { MultiPolygone, Point } from '../geo';

/** Un rectangle de longitudes et de latitudes. */
export interface Boite {
  ouest: number;
  est: number;
  sud: number;
  nord: number;
}

export interface Projection {
  /** La taille du dessin (le `viewBox` du SVG), en unités d'écran. */
  largeur: number;
  hauteur: number;
  /** Combien de mètres sur le terrain pour une unité du dessin. */
  metresParUnite: number;
  versEcran(point: Point): [number, number];
}

export interface OptionsProjection {
  /** La largeur du dessin, en unités (400 par défaut : à peu près un téléphone). */
  largeur?: number;
  /** Un dessin plus haut est réduit pour tenir dans cette hauteur. */
  hauteurMax?: number;
  /** Un dessin plus bas est centré dans cette hauteur. */
  hauteurMin?: number;
  /** La marge autour de la boîte, en unités. */
  marge?: number;
}

const RAD = Math.PI / 180;
const METRES_PAR_DEGRE = 111_320;

/** La plus petite boîte qui contient ces points. */
export function boiteDePoints(points: readonly Point[]): Boite {
  if (points.length === 0) throw new Error('Aucun point : pas de boîte.');
  return {
    ouest: Math.min(...points.map((p) => p.longitude)),
    est: Math.max(...points.map((p) => p.longitude)),
    sud: Math.min(...points.map((p) => p.latitude)),
    nord: Math.max(...points.map((p) => p.latitude)),
  };
}

/** La plus petite boîte qui contient ces contours. */
export function boiteDeContours(contours: readonly MultiPolygone[]): Boite {
  return boiteDePoints(
    contours.flat(3).map(([longitude = 0, latitude = 0]) => ({ latitude, longitude })),
  );
}

/**
 * La boîte agrandie autour de son milieu pour faire au moins `metres.largeur` de large et
 * `metres.hauteur` de haut, puis d'une marge de `part` (0,2 : 20 % de chaque côté).
 */
export function elargir(
  boite: Boite,
  metres: { largeur: number; hauteur: number },
  part = 0,
): Boite {
  const milieu = {
    latitude: (boite.sud + boite.nord) / 2,
    longitude: (boite.ouest + boite.est) / 2,
  };
  const kx = Math.cos(milieu.latitude * RAD);
  const demiLat =
    Math.max((boite.nord - boite.sud) / 2, metres.hauteur / METRES_PAR_DEGRE / 2) * (1 + part);
  const demiLng =
    Math.max((boite.est - boite.ouest) / 2, metres.largeur / (METRES_PAR_DEGRE * kx) / 2) *
    (1 + part);
  return {
    ouest: milieu.longitude - demiLng,
    est: milieu.longitude + demiLng,
    sud: milieu.latitude - demiLat,
    nord: milieu.latitude + demiLat,
  };
}

/** La projection qui fait tenir la boîte dans le dessin, sans la déformer, centrée. */
export function projection(boite: Boite, options: OptionsProjection = {}): Projection {
  const { largeur = 400, hauteurMax = Infinity, hauteurMin = 0, marge = 16 } = options;
  const kx = Math.cos(((boite.sud + boite.nord) / 2) * RAD);
  const largeurDeg = Math.max((boite.est - boite.ouest) * kx, 1e-9);
  const hauteurDeg = Math.max(boite.nord - boite.sud, 1e-9);
  let echelle = (largeur - 2 * marge) / largeurDeg;
  let hauteur = hauteurDeg * echelle + 2 * marge;
  if (hauteur > hauteurMax) {
    echelle = (hauteurMax - 2 * marge) / hauteurDeg;
    hauteur = hauteurMax;
  }
  hauteur = Math.max(hauteur, hauteurMin);
  // Ce qui reste de place se partage des deux côtés.
  const decalageX = (largeur - largeurDeg * echelle) / 2;
  const decalageY = (hauteur - hauteurDeg * echelle) / 2;
  return {
    largeur,
    hauteur: arrondir(hauteur),
    metresParUnite: METRES_PAR_DEGRE / echelle,
    versEcran: ({ latitude, longitude }) => [
      arrondir(decalageX + (longitude - boite.ouest) * kx * echelle),
      arrondir(decalageY + (boite.nord - latitude) * echelle),
    ],
  };
}

/** Un dixième d'unité suffit : c'est moins d'un pixel sur un téléphone. */
const arrondir = (v: number) => Math.round(v * 10) / 10;

const versPoint = ([longitude = 0, latitude = 0]: number[]): Point => ({ latitude, longitude });

/** Les points d'une ligne à l'écran, sans les répétitions que l'arrondi a créées. */
function tracer(ligne: readonly number[][], proj: Projection): [number, number][] {
  const points: [number, number][] = [];
  for (const coordonnees of ligne) {
    const [x, y] = proj.versEcran(versPoint(coordonnees));
    const dernier = points.at(-1);
    if (!dernier || dernier[0] !== x || dernier[1] !== y) points.push([x, y]);
  }
  return points;
}

const commande = (points: readonly [number, number][]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join('');

/** Le chemin SVG (`d`) d'un contour : chaque anneau fermé. */
export function cheminContour(contour: MultiPolygone, proj: Projection): string {
  return contour
    .flatMap((polygone) => polygone.map((anneau) => tracer(anneau, proj)))
    .filter((points) => points.length >= 3)
    .map((points) => `${commande(points)}Z`)
    .join('');
}

/**
 * Le chemin SVG d'un ensemble de lignes (des rues). Une ligne entièrement hors du dessin (plus
 * une marge) n'est pas tracée : la page reste légère quand on regarde un coin de près.
 */
export function cheminLignes(
  lignes: readonly (readonly number[][])[],
  proj: Projection,
  marge = 20,
): string {
  const dedans = ([x, y]: [number, number]) =>
    x >= -marge && x <= proj.largeur + marge && y >= -marge && y <= proj.hauteur + marge;
  return lignes
    .map((ligne) => tracer(ligne, proj))
    .filter((points) => points.length >= 2 && traverse(points, proj, marge, dedans))
    .map(commande)
    .join('');
}

/** La ligne passe-t-elle dans le dessin ? (Un de ses points dedans, ou sa boîte qui le croise.) */
function traverse(
  points: readonly [number, number][],
  proj: Projection,
  marge: number,
  dedans: (p: [number, number]) => boolean,
): boolean {
  if (points.some(dedans)) return true;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return (
    Math.max(...xs) >= -marge &&
    Math.min(...xs) <= proj.largeur + marge &&
    Math.max(...ys) >= -marge &&
    Math.min(...ys) <= proj.hauteur + marge
  );
}

/**
 * Un point où poser le nom d'un arrondissement : le centre de gravité de son plus grand anneau,
 * à l'écran.
 */
export function pointDuNom(contour: MultiPolygone, proj: Projection): [number, number] {
  let meilleur: [number, number] = [0, 0];
  let plusGrande = -1;
  for (const [exterieur] of contour) {
    if (!exterieur) continue;
    const points = exterieur.map((c) => proj.versEcran(versPoint(c)));
    let aire = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i] ?? [0, 0];
      const [xj, yj] = points[j] ?? [0, 0];
      const f = xj * yi - xi * yj;
      aire += f;
      cx += (xj + xi) * f;
      cy += (yj + yi) * f;
    }
    if (Math.abs(aire) > plusGrande) {
      plusGrande = Math.abs(aire);
      meilleur =
        aire === 0 ? (points[0] ?? [0, 0]) : [arrondir(cx / (3 * aire)), arrondir(cy / (3 * aire))];
    }
  }
  return meilleur;
}

// Les groupes ---------------------------------------------------------------------

export interface Marque<T> {
  x: number;
  y: number;
  membres: T[];
}

/**
 * Regroupe les marques qui se toucheraient à l'écran (note « Quand le quartier se remplit » du
 * canevas) : tant que deux marques se touchent, elles fusionnent au milieu de leurs écoles. Deux
 * marques se touchent quand elles sont à moins de `largeur` de côté ET à moins de `hauteur` de
 * haut. L'ordre d'entrée ne change pas le résultat.
 */
export function regrouper<T>(
  points: readonly { x: number; y: number; valeur: T }[],
  largeur: number,
  hauteur: number,
): Marque<T>[] {
  // Chaque marque garde la somme des positions de ses écoles, pour en calculer le milieu.
  const marques = [...points]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((p) => ({ sx: p.x, sy: p.y, n: 1, membres: [p.valeur] }));
  const centre = (m: (typeof marques)[number]) => [m.sx / m.n, m.sy / m.n] as const;

  for (;;) {
    let paire: [number, number] | null = null;
    let plusProche = Infinity;
    for (let i = 0; i < marques.length; i++) {
      const [xi, yi] = centre(marques[i]!);
      for (let j = i + 1; j < marques.length; j++) {
        const [xj, yj] = centre(marques[j]!);
        const dx = Math.abs(xi - xj);
        const dy = Math.abs(yi - yj);
        if (dx < largeur && dy < hauteur && Math.hypot(dx, dy) < plusProche) {
          plusProche = Math.hypot(dx, dy);
          paire = [i, j];
        }
      }
    }
    if (!paire) break;
    const [i, j] = paire;
    const a = marques[i]!;
    const b = marques[j]!;
    marques[i] = {
      sx: a.sx + b.sx,
      sy: a.sy + b.sy,
      n: a.n + b.n,
      membres: [...a.membres, ...b.membres],
    };
    marques.splice(j, 1);
  }

  return marques.map((m) => {
    const [x, y] = centre(m);
    return { x: arrondir(x), y: arrondir(y), membres: m.membres };
  });
}
