/**
 * Les cadrages de la carte détourée, tels que les pages publiques les montrent :
 * - la ville : les six arrondissements, ceux où le relevé a commencé en couleur ;
 * - un arrondissement : ses rues, ses écoles, regroupées quand elles se toucheraient ;
 * - un coin : un groupe vu de près, sur sa propre page (sans JavaScript, pas de zoom : on
 *   change de page) ;
 * - une école : un petit plan sur sa fiche ;
 * - un aperçu : une fenêtre sur un arrondissement, pour l'accueil (planches « Accueil » et
 *   « Accueil sur ordinateur » du canevas).
 */
import { dansContour, type MultiPolygone, type Point } from '../geo';
import { lienEcole } from '../geo-divisions';
import { provenanceDe, type Provenance } from '../libelles';
import donnees from './pointe-noire.json';
import {
  boiteDeContours,
  boiteDePoints,
  elargir,
  METRES_PAR_DEGRE,
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

/**
 * Les rues d'un arrondissement, quand elles sont dessinées. On les tire d'OpenStreetMap, un
 * arrondissement à la fois, avec `outils/tracer-les-rues.ts`.
 */
export function ruesDe(slug: string): Rues | null {
  return rues[slug] ?? null;
}

export function arrondissementDessine(slug: string): ArrondissementDessine | null {
  return arrondissementsDessines.find((a) => a.slug === slug) ?? null;
}

/** L'arrondissement dessiné qui contient la position, ou null (hors de Pointe-Noire). */
export function arrondissementDeLaPosition(position: Point): ArrondissementDessine | null {
  return arrondissementsDessines.find((a) => dansContour(position, a.contour)) ?? null;
}

/** Un arrondissement tel que la carte le dessine. */
export interface ArrondissementSurCarte {
  arrondissement: ArrondissementDessine;
  /**
   * `focus` : celui qu'on regarde, en relief, avec ses rues. `voisin` : autour, pâle.
   * Sur la carte de la ville, l'état public de la carte interactive : `en-cours` (relevé en cours), `programme` (déploiement
   * programmé, en pointillés) ou `pas-encore` (aucun état).
   */
  role: 'focus' | 'voisin' | 'en-cours' | 'programme' | 'pas-encore';
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
  /** Le drapeau : vert si confirmée par la direction, blanc si vue sur place. */
  etat: Provenance;
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
  /** Une école confirmée par la direction dedans : un petit drapeau vert sur la pastille. */
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
/**
 * Les écoles qu'un relais a vues sur place (décision du fondateur du 03/11) : la carte est la vitrine
 * de la preuve de terrain. Une école ajoutée par NTanova, ou importée, reste dans les listes et la
 * recherche, avec sa mention, mais pas sur la carte.
 */
export function vuesSurPlace<T extends { releveeLe: string | null }>(ecoles: readonly T[]): T[] {
  return ecoles.filter((e) => e.releveeLe !== null);
}

interface EcoleASituer {
  id: string;
  nom: string;
  etiquette?: string | null;
  adresse: string[];
  slug: string;
  numero: string;
  etat: 'verifiee' | 'relevee';
  releveeLe: string | null;
  situeeLe: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Une école sur un plan, qu'un relais l'ait vue ou non (le petit plan de sa propre fiche). */
export function marqueDe(e: EcoleASituer & Point): EcoleSurCarte {
  return {
    id: e.id,
    // Deux implantations d'une même école se distinguent sur la carte par leur étiquette.
    nom: e.etiquette ? `${e.nom} (${e.etiquette})` : e.nom,
    lien: lienEcole(e),
    etat: provenanceDe(e),
    latitude: e.latitude,
    longitude: e.longitude,
  };
}

/** Les écoles de la carte : vues sur place, et situées. */
export function surCarte(ecoles: readonly EcoleASituer[]): EcoleSurCarte[] {
  return situees(vuesSurPlace(ecoles)).map(marqueDe);
}

/** Les groupes de la carte d'un arrondissement : chacun a sa page « vu de près ». */
export function coinsDe(
  arrondissement: ArrondissementDessine,
  ecoles: readonly EcoleSurCarte[],
): MarqueGroupe[] {
  const { boite, projection: p } = cadreArrondissement(arrondissement);
  return planer(boite, ecoles, p).marques.filter((m): m is MarqueGroupe => m.genre === 'groupe');
}

// L'aperçu de la carte sur l'accueil (ticket 42) ------------------------------------

/**
 * La place qu'on donne à l'aperçu, en unités du dessin : celle des planches « Accueil »
 * (téléphone, 350 × 150) et « Accueil sur ordinateur » (520 × 456) du canevas.
 *
 * `reserveHaut` et `reserveBas` sont des bandes sans maison. Sur ordinateur, la légende est posée
 * en haut de la carte et le cartouche (le nom, le compte, le bouton) en bas ; sous 64 rem, le
 * cartouche suit la carte et rien n'est posé dessus. Les deux nombres suivent le CSS de
 * `ApercuCarte.astro` au plus petit agrandissement du dessin (0,9 px par unité, à 1 024 px de
 * large) ; un parcours vérifie dans le navigateur qu'aucune école ne passe dessous.
 */
export interface FormatApercu {
  largeur: number;
  hauteur: number;
  reserveHaut: number;
  reserveBas: number;
}

export const APERCU_TELEPHONE: FormatApercu = {
  largeur: 350,
  hauteur: 150,
  reserveHaut: 0,
  reserveBas: 0,
};

export const APERCU_ORDINATEUR: FormatApercu = {
  largeur: 520,
  hauteur: 456,
  reserveHaut: 48,
  reserveBas: 104,
};

/**
 * Ce qu'occupe une maison autour de son point, en unités du dessin (voir `Carte.astro`) : le
 * drapeau monte à 56 au-dessus, la porte descend à 8, la zone à toucher fait 56 de large.
 */
export const ENCOMBREMENT_MARQUE = { gauche: 28, droite: 28, haut: 56, bas: 8 } as const;

/** Un peu de place en plus de chaque côté : l'arrondi du dessin au dixième ne rogne jamais une maison. */
const SECURITE = 2;

/** Une fenêtre sur des écoles ne descend jamais sous ces mètres : un zoom de rue ne dirait rien. */
export const PLANCHER_APERCU = { largeur: 900, hauteur: 600 } as const;

/**
 * Sans école sur la carte : une vue du cœur de l'arrondissement, assez large pour que ses rues se
 * lisent comme une carte (la hauteur suit le rapport de la place).
 */
export const FENETRE_SANS_ECOLE = { largeur: 2500 } as const;

/** Sans rues dessinées : la fenêtre déborde de 10 % la largeur de l'arrondissement, pour qu'on voie son bord. */
const AIR_SANS_RUES = 1.1;

const RAD = Math.PI / 180;

/**
 * Le cœur d'un arrondissement : le milieu de ses rues quand elles sont dessinées, c'est-à-dire là
 * où le dessin est dense, sinon le centre de sa boîte.
 */
function coeurDe(arrondissement: ArrondissementDessine): Point {
  const r = ruesDe(arrondissement.slug);
  const points = r ? [...r.rues, ...r.avenues].flat() : [];
  if (points.length > 0) {
    const somme = points.reduce(
      (total, [longitude = 0, latitude = 0]) => ({
        longitude: total.longitude + longitude,
        latitude: total.latitude + latitude,
      }),
      { longitude: 0, latitude: 0 },
    );
    return { latitude: somme.latitude / points.length, longitude: somme.longitude / points.length };
  }
  const b = boiteDeContours([arrondissement.contour]);
  return { latitude: (b.sud + b.nord) / 2, longitude: (b.ouest + b.est) / 2 };
}

/**
 * L'arrondissement que l'aperçu de l'accueil montre : celui qui a le plus d'écoles sur la carte
 * (situées) ; à égalité, celui dont les rues sont dessinées (sans rues, la fenêtre d'un
 * arrondissement vide serait un aplat), puis le plus petit numéro. Aucun si aucun arrondissement
 * ouvert n'est dessiné.
 */
export function arrondissementDeLApercu(
  ouverts: readonly { slug: string }[],
  ecoles: readonly { arrondissement: string; latitude: number | null; longitude: number | null }[],
): ArrondissementDessine | null {
  const candidats = ouverts
    .map((o) => arrondissementDessine(o.slug))
    .filter((a): a is ArrondissementDessine => a !== null)
    .map((a) => ({
      arrondissement: a,
      surCarte: situees(ecoles.filter((e) => e.arrondissement === a.slug)).length,
      aDesRues: ruesDe(a.slug) !== null,
    }));
  candidats.sort(
    (a, b) =>
      b.surCarte - a.surCarte ||
      Number(b.aDesRues) - Number(a.aDesRues) ||
      a.arrondissement.numero - b.arrondissement.numero,
  );
  return candidats[0]?.arrondissement ?? null;
}

/**
 * La fenêtre de l'aperçu : un morceau de l'arrondissement, au rapport de la place qu'on lui donne,
 * qui contient chaque école située avec sa maison entière (drapeau compris) et laisse libres les
 * bandes réservées du format.
 *
 * - La fenêtre fait au moins 900 × 600 m (`PLANCHER_APERCU`) et jamais plus que l'arrondissement ;
 *   le dessin reste à l'échelle, les maisons gardent leur taille.
 * - Les marges des maisons sont en unités du dessin, donc en mètres selon l'agrandissement : la
 *   fenêtre se calcule d'un coup, sans essais successifs (la marge est une part fixe du dessin).
 * - Sans école, c'est une vue du cœur de l'arrondissement (`FENETRE_SANS_ECOLE`).
 * - Sans rues dessinées, elle montre l'arrondissement sur toute sa largeur, avec un peu d'air :
 *   serrée, elle ne montrerait qu'un aplat beige. Il suffit de tirer les rues de l'arrondissement
 *   d'OpenStreetMap (`outils/tracer-les-rues.ts`).
 */
export function cadreApercu(
  arrondissement: ArrondissementDessine,
  ecoles: readonly Point[],
  format: FormatApercu,
): { boite: Boite; projection: Projection } {
  const rapport = format.largeur / format.hauteur;
  const enveloppe = ecoles.length > 0 ? boiteDePoints(ecoles) : null;
  const milieu: Point = enveloppe
    ? {
        latitude: (enveloppe.sud + enveloppe.nord) / 2,
        longitude: (enveloppe.ouest + enveloppe.est) / 2,
      }
    : coeurDe(arrondissement);
  const kx = Math.cos(milieu.latitude * RAD);

  // Ce que la fenêtre doit contenir : les écoles (en mètres) et la place de leur maison (en unités).
  const lateral = ENCOMBREMENT_MARQUE.gauche + ENCOMBREMENT_MARQUE.droite + 2 * SECURITE;
  const hautUnites = ENCOMBREMENT_MARQUE.haut + SECURITE + format.reserveHaut;
  const basUnites = ENCOMBREMENT_MARQUE.bas + SECURITE + format.reserveBas;
  const largeurEcoles = enveloppe ? (enveloppe.est - enveloppe.ouest) * kx * METRES_PAR_DEGRE : 0;
  const hauteurEcoles = enveloppe ? (enveloppe.nord - enveloppe.sud) * METRES_PAR_DEGRE : 0;
  // La fenêtre fait L mètres pour `format.largeur` unités : une marge de n unités y pèse
  // n × L / largeur mètres, d'où L = écoles / (1 - marges / largeur).
  const parLargeur = largeurEcoles / (1 - lateral / format.largeur);
  const parHauteur = (hauteurEcoles / (1 - (hautUnites + basUnites) / format.hauteur)) * rapport;

  const limite = boiteDeContours([arrondissement.contour]);
  const limiteLargeur =
    (limite.est - limite.ouest) *
    Math.cos(((limite.sud + limite.nord) / 2) * RAD) *
    METRES_PAR_DEGRE;
  const limiteHauteur = (limite.nord - limite.sud) * METRES_PAR_DEGRE;

  const voulue = enveloppe
    ? Math.max(parLargeur, parHauteur, PLANCHER_APERCU.largeur, PLANCHER_APERCU.hauteur * rapport)
    : FENETRE_SANS_ECOLE.largeur;
  // Sans rues dessinées, une fenêtre serrée ne montrerait qu'un aplat : on
  // montre l'arrondissement sur toute sa largeur, avec un peu d'air, pour qu'on voie où l'on est.
  const sansRues = ruesDe(arrondissement.slug) === null;
  const largeur = sansRues
    ? Math.max(voulue, limiteLargeur * AIR_SANS_RUES)
    : Math.min(voulue, limiteLargeur, limiteHauteur * rapport);
  const hauteur = largeur / rapport;
  const metresParUnite = largeur / format.largeur;

  // Le drapeau et la légende sont en haut, le cartouche en bas : le bloc « écoles et marges »
  // n'est pas centré sur les écoles, la fenêtre non plus.
  const decalage = enveloppe
    ? ((hautUnites - basUnites) * metresParUnite) / 2 / METRES_PAR_DEGRE
    : 0;
  const centre: Point = { latitude: milieu.latitude + decalage, longitude: milieu.longitude };
  const demiLatitude = hauteur / 2 / METRES_PAR_DEGRE;
  const demiLongitude = largeur / 2 / (METRES_PAR_DEGRE * kx);
  const boite: Boite = {
    ouest: centre.longitude - demiLongitude,
    est: centre.longitude + demiLongitude,
    sud: centre.latitude - demiLatitude,
    nord: centre.latitude + demiLatitude,
  };
  return {
    boite,
    projection: projection(boite, {
      largeur: format.largeur,
      hauteurMax: format.hauteur,
      hauteurMin: format.hauteur,
      marge: 0,
    }),
  };
}

/**
 * Ce que dit le cartouche de l'aperçu : combien d'écoles sont sur la carte, ou que les écoles
 * publiées n'y sont pas encore (aucune position), ou que le relevé est en cours.
 */
export function compteApercu(publiees: number, surCarte: number): string {
  const ecoles = (n: number) => `${n} école${n > 1 ? 's' : ''}`;
  if (surCarte > 0) return `${ecoles(surCarte)} sur la carte`;
  if (publiees > 0) return `${ecoles(publiees)}, pas encore sur la carte`;
  return 'relevé en cours';
}
