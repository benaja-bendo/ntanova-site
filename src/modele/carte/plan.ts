/**
 * Les cadrages de la carte détourée, tels que les pages publiques les montrent :
 * - la ville : les six arrondissements, ceux où le relevé a commencé en couleur ;
 * - un arrondissement : ses rues, ses écoles, regroupées quand elles se toucheraient ;
 * - un coin : un groupe vu de près, sur sa propre page (sans JavaScript, pas de zoom : on
 *   change de page) ;
 * - une école : un petit plan sur sa fiche.
 */
import type { MultiPolygone, Point } from '../geo';
import donnees from './pointe-noire.json';
import {
  boiteDeContours,
  boiteDePoints,
  elargir,
  projection,
  regrouper,
  type Boite,
  type Projection,
} from './geometrie';

export interface ArrondissementDessine {
  slug: string;
  nom: string;
  /** « Arrondissement 3 », comme on le dit sur place. */
  numero: number;
  contour: MultiPolygone;
}

/**
 * Les six arrondissements de Pointe-Noire, dessinés d'un même trait. Les contours viennent
 * d'OpenStreetMap (© les contributeurs d'OpenStreetMap, licence ODbL), simplifiés pour le dessin :
 * à 10 m près, invisible à l'écran. Le contrôle « hors du lot » lit ceux de la base, plus précis.
 */
export const arrondissementsDessines: readonly ArrondissementDessine[] = donnees.arrondissements;

export interface Rues {
  /** Les rues ordinaires, en traits fins. */
  rues: number[][][];
  /** Les grands axes, plus larges, en jaune. */
  avenues: number[][][];
}

const rues: Readonly<Record<string, Rues>> = donnees.rues;

/** Les rues d'un arrondissement, quand elles sont dessinées (Tié-Tié pour l'instant). */
export function ruesDe(slug: string): Rues | null {
  return rues[slug] ?? null;
}

export function arrondissementDessine(slug: string): ArrondissementDessine | null {
  return arrondissementsDessines.find((a) => a.slug === slug) ?? null;
}

/** Un arrondissement tel que la carte le dessine. */
export interface ArrondissementSurCarte {
  arrondissement: ArrondissementDessine;
  /**
   * `focus` : celui qu'on regarde, en relief, avec ses rues. `voisin` : autour, pâle.
   * Sur la carte de la ville : `en-cours` (le relevé a commencé) ou `pas-encore`.
   */
  role: 'focus' | 'voisin' | 'en-cours' | 'pas-encore';
  /** Toucher l'arrondissement mène ici (la carte de la ville). */
  lien?: string;
  /** La seconde ligne sous son nom : « 3 écoles », « pas encore ». */
  etiquette?: string;
}

// Les écoles sur la carte -----------------------------------------------------------

export interface EcoleSurCarte extends Point {
  id: string;
  nom: string;
  /** L'adresse de sa fiche. */
  lien: string;
  etat: 'verifiee' | 'relevee';
}

export interface MarqueEcole {
  genre: 'ecole';
  x: number;
  y: number;
  ecole: EcoleSurCarte;
}

export interface MarqueGroupe {
  genre: 'groupe';
  /** `coin-1`, `coin-2`… : du nord au sud, puis d'ouest en est. */
  id: string;
  x: number;
  y: number;
  ecoles: EcoleSurCarte[];
  /** Une école vérifiée dedans : un petit drapeau vert sur la pastille. */
  verifiee: boolean;
}

export type MarqueSurCarte = MarqueEcole | MarqueGroupe;

export interface Plan {
  projection: Projection;
  marques: MarqueSurCarte[];
}

/**
 * La place d'une marque, en unités du dessin : la zone à toucher, pas seulement le dessin. Le
 * dessin fait 400 unités de large ; sur un téléphone de 360 px, il en occupe 328 : 54 unités font
 * 44 px, la plus petite cible permise. Deux marques plus proches que cela, en largeur ET en
 * hauteur, se toucheraient : elles deviennent un groupe.
 */
export const TAILLE_MARQUE = { largeur: 54, hauteur: 54 } as const;

/** Les écoles qui ont une position (les autres attendent la visite d'un relais). */
export function situees<T extends { latitude: number | null; longitude: number | null }>(
  ecoles: readonly T[],
): (T & Point)[] {
  return ecoles.filter((e): e is T & Point => e.latitude !== null && e.longitude !== null);
}

/** Les écoles d'un cadrage, seules ou en groupes. */
export function planer(boite: Boite, ecoles: readonly EcoleSurCarte[], proj: Projection): Plan {
  const marques = regrouper(
    ecoles
      .filter((e) => dans(boite, e))
      .map((ecole) => {
        const [x, y] = proj.versEcran(ecole);
        return { x, y, valeur: ecole };
      }),
    TAILLE_MARQUE.largeur,
    TAILLE_MARQUE.hauteur,
  );
  const groupes = marques
    .filter((m) => m.membres.length > 1)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return {
    projection: proj,
    marques: marques
      .map((m): MarqueSurCarte => {
        const [seule] = m.membres;
        if (m.membres.length === 1 && seule)
          return { genre: 'ecole', x: m.x, y: m.y, ecole: seule };
        return {
          genre: 'groupe',
          id: `coin-${groupes.indexOf(m) + 1}`,
          x: m.x,
          y: m.y,
          ecoles: [...m.membres].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
          verifiee: m.membres.some((e) => e.etat === 'verifiee'),
        };
      })
      // Du nord au sud : une maison du bas passe devant celle du haut, comme sur le canevas.
      .sort((a, b) => a.y - b.y || a.x - b.x),
  };
}

const dans = (b: Boite, p: Point) =>
  p.longitude >= b.ouest && p.longitude <= b.est && p.latitude >= b.sud && p.latitude <= b.nord;

// Les cadrages ----------------------------------------------------------------------

/** La ville entière. */
export function cadreVille(): Projection {
  return projection(boiteDeContours(arrondissementsDessines.map((a) => a.contour)), {
    largeur: 400,
    hauteurMax: 560,
    marge: 12,
  });
}

/** Un arrondissement entier ; une école hors de son contour (mais dans sa boîte) y figure aussi. */
export function cadreArrondissement(arrondissement: ArrondissementDessine): {
  boite: Boite;
  projection: Projection;
} {
  const boite = boiteDeContours([arrondissement.contour]);
  return {
    boite,
    // Une marge en haut pour le drapeau des maisons du bord nord.
    projection: projection(boite, { largeur: 400, hauteurMax: 560, marge: 28 }),
  };
}

/**
 * Un groupe vu de près : environ 180 m de côté au plus près (une marque y fait 28 m), pour que
 * deux écoles à 40 m l'une de l'autre (la distance d'un doublon possible) se séparent. Plus près,
 * c'est sans doute la même cour : elles restent un groupe, et la page les liste.
 */
export function cadreCoin(ecoles: readonly Point[]): { boite: Boite; projection: Projection } {
  const boite = elargir(boiteDePoints(ecoles), { largeur: 150, hauteur: 150 }, 0.2);
  return { boite, projection: projection(boite, { largeur: 400, hauteurMax: 420, marge: 28 }) };
}

/**
 * Le petit plan d'une fiche : un bandeau d'environ 1 km sur 400 m autour de l'école. Il est dans
 * un encadré, plus étroit que la page : 330 unités de large, pour que la maison garde 44 px.
 */
export function cadreEcole(ecole: Point): { boite: Boite; projection: Projection } {
  const boite = elargir(boiteDePoints([ecole]), { largeur: 1000, hauteur: 400 });
  return { boite, projection: projection(boite, { largeur: 330, marge: 0 }) };
}

/** Une école publiée, telle que la carte la montre (celles sans position n'y sont pas). */
export function surCarte(
  ecoles: readonly {
    id: string;
    nom: string;
    arrondissement: string;
    slug: string;
    etat: 'verifiee' | 'relevee';
    latitude: number | null;
    longitude: number | null;
  }[],
): EcoleSurCarte[] {
  return situees(ecoles).map((e) => ({
    id: e.id,
    nom: e.nom,
    lien: `/ecoles/${e.arrondissement}/${e.slug}/`,
    etat: e.etat,
    latitude: e.latitude,
    longitude: e.longitude,
  }));
}

/** Les groupes de la carte d'un arrondissement : chacun a sa page « vu de près ». */
export function coinsDe(
  arrondissement: ArrondissementDessine,
  ecoles: readonly EcoleSurCarte[],
): MarqueGroupe[] {
  const { boite, projection: p } = cadreArrondissement(arrondissement);
  return planer(boite, ecoles, p).marques.filter((m): m is MarqueGroupe => m.genre === 'groupe');
}
