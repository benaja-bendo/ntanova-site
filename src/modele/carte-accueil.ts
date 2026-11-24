/**
 * Le dessin de l'accueil (refonte publique, lot 1, 24/11/2026) : le Congo-Brazzaville en points, et un point jaune là où au
 * moins une école publiée a sa fiche. Une illustration, pas une carte : aucun fond, aucun script, aucune tuile.
 *
 * Le contour vient du dessin original du canevas (`outils/canevas-accueil/dessins/carte.py`, dépôt `ntanova`, 23/11) : environ
 * 70 sommets tracés à la main, précis à quelques kilomètres, assez pour un dessin, jamais pour un calcul. Les points jaunes et
 * les villes, eux, sont recalculés à chaque construction depuis les positions publiées : le dessin du canevas les avait figés
 * au 23/11. Une école sans position n'allume rien ; une ville sans école située, ou trop près d'une plus grande pour que
 * son étiquette se lise, n'a pas d'étiquette (la liste « Par ville » la donne toujours).
 *
 * Pur : ni DOM, ni Astro.
 */
import { ecolesSous, lienDivision, type ArbrePublic } from './geo-divisions';

/** Le contour du pays (longitude, latitude), d'après le dessin du canevas. */
export const CONTOUR_DU_CONGO: readonly (readonly [number, number])[] = [
  [11.13, -3.95], [11.2, -3.6], [11.5, -3.3], [11.6, -3.0], [11.75, -2.7], [12.0, -2.4], [12.3, -2.25],
  [12.6, -1.95], [12.9, -2.05], [13.1, -2.4], [13.7, -2.35], [14.1, -2.45], [14.5, -2.0], [14.5, -1.2],
  [14.45, -0.5], [14.4, 0.2], [14.3, 0.6], [14.3, 1.1], [14.15, 1.38], [13.25, 1.25], [13.25, 2.17],
  [14.5, 2.15], [15.0, 2.05], [15.3, 1.95], [15.7, 1.8], [16.05, 1.61], [16.15, 1.9], [16.2, 2.22],
  [16.5, 2.9], [16.6, 3.45], [17.0, 3.55], [17.5, 3.65], [18.2, 3.6], [18.62, 3.48], [18.55, 3.1],
  [18.35, 2.6], [18.07, 2.04], [18.07, 1.62], [17.95, 1.0], [17.8, 0.5], [17.75, -0.1], [17.65, -0.55],
  [17.2, -1.0], [16.8, -1.25], [16.45, -1.75], [16.22, -2.15], [16.2, -2.6], [16.18, -3.18], [15.9, -3.55],
  [15.6, -4.02], [15.45, -4.15], [15.28, -4.3], [15.05, -4.55], [14.8, -4.75], [14.45, -4.9], [14.0, -4.82],
  [13.5, -4.78], [13.08, -4.65], [12.85, -4.42], [12.55, -4.45], [12.25, -4.8], [12.03, -5.02],
  [11.86, -4.78], [11.65, -4.55], [11.4, -4.25], [11.13, -3.95],
]; // prettier-ignore

/** Le cadre du dessin : de 10,95° à 18,8° de longitude, de 3,8° à −5,2° de latitude, 58 unités par degré. */
const LON_OUEST = 10.95;
const LON_EST = 18.8;
const LAT_NORD = 3.8;
const LAT_SUD = -5.2;
const ECHELLE = 58;
/** Un point tous les 0,16° (environ 18 km) : la trame du dessin. */
const PAS_DEGRES = 0.16;
/** La marge autour du pays, pour les halos des villes du bord (Pointe-Noire). */
const MARGE = 36;
const RAYON = 2.3;

export interface PointJaune {
  x: number;
  y: number;
  r: number;
}

export interface VilleDuDessin {
  nom: string;
  lien: string;
  total: number;
  /** Le centre de ses écoles situées, en unités du dessin. */
  x: number;
  y: number;
  /** Le même point en pourcentage du dessin, pour poser l'étiquette HTML au-dessus. */
  gauche: number;
  haut: number;
  /** Où l'étiquette se pose par rapport au point, pour qu'aucune n'en couvre une autre ni le dessin de la famille. */
  place: PlaceEtiquette;
}

/** L'étiquette à droite ou à gauche du point, à sa hauteur, au-dessus ou au-dessous. */
export type PlaceEtiquette = `${'droite' | 'gauche'}-${'milieu' | 'haut' | 'bas'}`;

/** La boîte d'une étiquette, en pourcentage du dessin (« Pointe-Noire » et « 51 écoles » sur deux lignes). */
const ETIQUETTE_L = 27;
const ETIQUETTE_H = 10;
/** Le coin bas-droit du dessin est pris par la famille : une étiquette à droite au-delà de 45 % passe à gauche. */
const DROITE_LIBRE_JUSQUA = 45;
/** La place de la famille (38 % de la largeur, en bas à droite, `DessinCongo.astro`) : aucune étiquette ne s'y pose. */
const FAMILLE = { x0: 60, y0: 58, x1: 100, y1: 100 } as const;

type Boite = { x0: number; y0: number; x1: number; y1: number };

function boiteDe(gauche: number, haut: number, place: PlaceEtiquette): Boite {
  const [cote, hauteur] = place.split('-') as ['droite' | 'gauche', 'milieu' | 'haut' | 'bas'];
  const x0 = cote === 'droite' ? gauche + 2 : gauche - 2 - ETIQUETTE_L;
  const y0 =
    hauteur === 'milieu'
      ? haut - ETIQUETTE_H / 2
      : hauteur === 'haut'
        ? haut - 2 - ETIQUETTE_H
        : haut + 2;
  return { x0, y0, x1: x0 + ETIQUETTE_L, y1: y0 + ETIQUETTE_H };
}

const seCouvrent = (a: Boite, b: Boite) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Les places à essayer, dans l'ordre : de son côté d'abord (à droite à l'ouest du dessin, à gauche à l'est). */
function essaisDe(v: Pick<VilleDuDessin, 'gauche'>): PlaceEtiquette[] {
  const cote = v.gauche > DROITE_LIBRE_JUSQUA ? 'gauche' : 'droite';
  const autre = cote === 'droite' ? 'gauche' : 'droite';
  return [
    `${cote}-milieu`,
    `${cote}-haut`,
    `${cote}-bas`,
    `${autre}-milieu`,
    `${autre}-haut`,
    `${autre}-bas`,
  ];
}

const dansLeDessin = (b: Boite) =>
  b.x0 >= 0 && b.x1 <= 100 && b.y0 >= 0 && b.y1 <= 100 && !seCouvrent(b, FAMILLE);

/**
 * Les étiquettes, de la ville la plus fournie à la moins fournie : chacune prend la première place libre. Quand il n'en
 * reste aucune, une étiquette déjà posée peut changer de place pour lui en faire une. Sinon, la ville garde son point jaune
 * mais pas d'étiquette dans le dessin : deux étiquettes l'une sur l'autre ne se liraient plus, et la liste « Par ville »,
 * sous le dessin, la donne toujours.
 */
export function placerLesEtiquettes(
  villes: readonly Omit<VilleDuDessin, 'place'>[],
): VilleDuDessin[] {
  const placees: VilleDuDessin[] = [];
  const libre = (v: Omit<VilleDuDessin, 'place'>, p: PlaceEtiquette, sauf?: VilleDuDessin) => {
    const b = boiteDe(v.gauche, v.haut, p);
    return (
      dansLeDessin(b) &&
      !placees.some((x) => x !== sauf && seCouvrent(boiteDe(x.gauche, x.haut, x.place), b))
    );
  };
  for (const v of villes) {
    const place = essaisDe(v).find((p) => libre(v, p));
    if (place) {
      placees.push({ ...v, place });
      continue;
    }
    // Déplacer une étiquette déjà posée, si cela libère une place.
    reparer: for (const deja of [...placees].reverse()) {
      for (const autre of essaisDe(deja)) {
        if (autre === deja.place || !libre(deja, autre, deja)) continue;
        const avant = deja.place;
        deja.place = autre;
        const sienne = essaisDe(v).find((p) => libre(v, p));
        if (sienne) {
          placees.push({ ...v, place: sienne });
          break reparer;
        }
        deja.place = avant;
      }
    }
  }
  return villes.flatMap((v) => placees.filter((p) => p.nom === v.nom && p.lien === v.lien));
}

export interface CarteDeLAccueil {
  /** La boîte du dessin (`viewBox`), marge comprise. */
  boite: readonly [number, number, number, number];
  /** Le contour du pays, en points SVG. */
  contour: string;
  /** L'écart entre deux points de la trame, en unités du dessin. */
  pas: number;
  rayon: number;
  points: PointJaune[];
  villes: VilleDuDessin[];
}

const projeter = (lon: number, lat: number) => ({
  x: (lon - LON_OUEST) * ECHELLE,
  y: (LAT_NORD - lat) * ECHELLE,
});

const arrondi = (n: number) => Math.round(n * 10) / 10;

/**
 * Le dessin : la trame du pays, une case jaune par case de la trame où au moins une école publiée est située (plus grosse
 * avec plus d'écoles), et une étiquette par ville qui a au moins une école située, au centre de ses écoles.
 */
export function carteDeLAccueil(arbre: Pick<ArbrePublic, 'racines'>): CarteDeLAccueil {
  const largeur = (LON_EST - LON_OUEST) * ECHELLE;
  const hauteur = (LAT_NORD - LAT_SUD) * ECHELLE;
  const boite = [-MARGE, -MARGE, largeur + 2 * MARGE, hauteur + 2 * MARGE] as const;
  const pas = PAS_DEGRES * ECHELLE;
  const cases = new Map<string, { i: number; j: number; n: number }>();
  const villes: Omit<VilleDuDessin, 'place'>[] = [];
  const dedans = (lon: number, lat: number) =>
    lon >= LON_OUEST && lon <= LON_EST && lat <= LAT_NORD && lat >= LAT_SUD;

  for (const ville of arbre.racines.flatMap((pays) => pays.enfants)) {
    const toutes = ecolesSous(ville);
    const situees = toutes.filter(
      (e) => e.latitude !== null && e.longitude !== null && dedans(e.longitude, e.latitude),
    );
    for (const e of situees) {
      const i = Math.round((e.longitude! - LON_OUEST) / PAS_DEGRES);
      const j = Math.round((LAT_NORD - e.latitude!) / PAS_DEGRES);
      const cle = `${i}:${j}`;
      const c = cases.get(cle) ?? { i, j, n: 0 };
      c.n += 1;
      cases.set(cle, c);
    }
    if (situees.length === 0) continue;
    const lon = situees.reduce((s, e) => s + e.longitude!, 0) / situees.length;
    const lat = situees.reduce((s, e) => s + e.latitude!, 0) / situees.length;
    const { x, y } = projeter(lon, lat);
    villes.push({
      nom: ville.division.nom,
      lien: lienDivision(ville.chemin),
      total: toutes.length,
      x: arrondi(x),
      y: arrondi(y),
      gauche: arrondi(((x - boite[0]) / boite[2]) * 100),
      haut: arrondi(((y - boite[1]) / boite[3]) * 100),
    });
  }

  const points = [...cases.values()]
    .sort((a, b) => a.j - b.j || a.i - b.i)
    .map(({ i, j, n }) => ({
      x: arrondi(i * pas),
      y: arrondi(j * pas),
      r: arrondi(RAYON * (n === 1 ? 1.5 : n < 6 ? 1.85 : 2.3)),
    }));

  return {
    boite,
    contour: CONTOUR_DU_CONGO.map(([lon, lat]) => {
      const { x, y } = projeter(lon, lat);
      return `${arrondi(x)},${arrondi(y)}`;
    }).join(' '),
    pas: arrondi(pas),
    rayon: RAYON,
    points,
    villes: placerLesEtiquettes(
      villes.sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom, 'fr')),
    ),
  };
}
