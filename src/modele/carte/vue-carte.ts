/**
 * Le cadrage de la vue Carte de « Les écoles » (17/11/2026, feu vert du fondateur) : des calculs seulement, sans MapLibre,
 * pour que les tests les lisent.
 *
 * - le pays tient en entier dans la carte, quelle que soit sa forme (le Congo est plus haut que large : une carte presque
 *   carrée enfermée dans la boîte du pays coupait le nord) ;
 * - un changement de recherche ou de filtre recadre la carte sur les écoles retenues ; sans aucun choix, sur le pays ;
 * - le zoom de ce cadrage tient compte des tuiles de l'endroit visé, pas de celui qu'on quitte.
 */
import type { Cadre, EtatListe } from '../liste-ecoles';
import { BOITE_DU_PAYS, ZOOM_MAX_DES_TUILES, zoomMaxEn, type Fenetre } from './fond';

/** La latitude en projection de Mercator (radians). */
const versY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const depuisY = (y: number) => (360 / Math.PI) * Math.atan(Math.exp(y)) - 90;

/**
 * La boîte où la carte peut se promener : celle du pays, élargie dans le sens qui manque pour que le pays entier tienne
 * dans une carte de `largeur` × `hauteur` pixels, avec un peu d'air (`air`, part de chaque côté).
 */
export function boiteQuiTient(
  largeur: number,
  hauteur: number,
  pays: Fenetre = BOITE_DU_PAYS,
  air = 0.04,
): Fenetre {
  if (!(largeur > 0) || !(hauteur > 0)) return pays;
  const [o, s, e, n] = pays;
  const dx = ((e - o) * Math.PI) / 180;
  const ys = versY(s);
  const yn = versY(n);
  const dy = yn - ys;
  const forme = largeur / hauteur;
  let [x0, x1, y0, y1] = [(o * Math.PI) / 180, (e * Math.PI) / 180, ys, yn];
  if (dx / dy < forme) {
    const manque = (dy * forme - dx) / 2;
    x0 -= manque;
    x1 += manque;
  } else {
    const manque = (dx / forme - dy) / 2;
    y0 -= manque;
    y1 += manque;
  }
  const ax = (x1 - x0) * air;
  const ay = (y1 - y0) * air;
  const deg = (r: number) => (r * 180) / Math.PI;
  return [deg(x0 - ax), depuisY(y0 - ay), deg(x1 + ax), depuisY(y1 + ay)];
}

/** Ce qui choisit les écoles, sans le tri, la vue ni la zone de la carte : quand cela change, la carte se recadre. */
export function cleDeLaSelection(etat: EtatListe): string {
  return JSON.stringify([etat.q, etat.ou, etat.choix, etat.rayonM]);
}

/** Aucun choix : la carte montre le pays. */
export const selectionVide = (etat: EtatListe) =>
  !etat.q &&
  !etat.ou &&
  etat.rayonM === null &&
  Object.values(etat.choix).every((c) => c.length === 0);

export interface Cadrage {
  boite: Fenetre;
  /** Le zoom à ne pas dépasser pour ce cadrage : jamais plus près que les tuiles de l'endroit. */
  zoomMax: number;
}

/** La plus petite boîte qui contient ces points (longitude, latitude), ou rien. */
export function boiteDesPoints(points: readonly (readonly [number, number])[]): Fenetre | null {
  if (points.length === 0) return null;
  let [o, s, e, n] = [180, 90, -180, -90];
  for (const [x, y] of points) {
    o = Math.min(o, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [o, s, e, n];
}

/**
 * Où poser la carte pour cette sélection : le pays sans aucun choix, la zone de la carte quand l'adresse en donne une,
 * sinon les écoles retenues. Rien quand aucune école retenue n'a de position (la carte ne bouge pas).
 */
export function cadrageDeLaSelection(
  etat: EtatListe,
  points: readonly (readonly [number, number])[],
): Cadrage | null {
  if (etat.cadre) return cadrageDe(etat.cadre);
  if (selectionVide(etat)) return { boite: BOITE_DU_PAYS, zoomMax: ZOOM_MAX_DES_TUILES };
  const boite = boiteDesPoints(points);
  return boite ? cadrageDe(boite) : null;
}

function cadrageDe(boite: Cadre | Fenetre): Cadrage {
  const [o, s, e, n] = boite;
  // Une ville seule : jusqu'aux dernières tuiles (15) ; ailleurs, le fichier s'arrête plus tôt (10).
  const zoomMax = Math.min(ZOOM_MAX_DES_TUILES, zoomMaxEn((o + e) / 2, (s + n) / 2));
  return { boite: [o, s, e, n], zoomMax };
}
