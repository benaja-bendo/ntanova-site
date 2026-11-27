/**
 * Retoucher une photo du relais (ticket 236, 27/11) : un carré pour le logo, des zones floutées ou un recadrage avant de
 * publier, et le retrait de l'original. Le flou est une mosaïque grossière appliquée aux pixels : la version publiée n'en
 * garde rien. Pur : ni DOM, ni réseau.
 */
import { dateLongue } from './pointe-noire';
import type { EtatPhotoPublique } from './photos-publiques';
import type { PhotoVue } from './ports';

/** Un rectangle, en pixels de la photo. */
export interface Zone {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}
export interface Taille {
  largeur: number;
  hauteur: number;
}
export interface Point2D {
  x: number;
  y: number;
}

/** En deçà, un geste du doigt n'a rien désigné. */
export const ZONE_MINIMALE = 16;
/** Une zone floutée n'a pas plus de blocs que cela sur son grand côté : plus aucun mot ni visage ne s'y lit. */
export const BLOCS_AU_PLUS = 8;

const borne = (v: number, max: number) => Math.min(Math.max(Math.round(v), 0), max);

/** Le rectangle tracé entre deux points, dans la photo ; nul s'il est trop petit. */
export function zoneEntre(a: Point2D, b: Point2D, image: Taille): Zone | null {
  const x = borne(Math.min(a.x, b.x), image.largeur);
  const y = borne(Math.min(a.y, b.y), image.hauteur);
  const largeur = borne(Math.max(a.x, b.x), image.largeur) - x;
  const hauteur = borne(Math.max(a.y, b.y), image.hauteur) - y;
  return largeur >= ZONE_MINIMALE && hauteur >= ZONE_MINIMALE ? { x, y, largeur, hauteur } : null;
}

/** Le carré du logo : sa taille (en % du petit côté) et sa place (en % de ce qui reste, de gauche à droite, de haut en bas). */
export function carreDuLogo(
  image: Taille,
  reglage: { taille: number; x: number; y: number },
): Zone {
  const petit = Math.min(image.largeur, image.hauteur);
  const cote = Math.min(petit, Math.max(ZONE_MINIMALE, Math.round((petit * reglage.taille) / 100)));
  return {
    x: borne(((image.largeur - cote) * reglage.x) / 100, image.largeur - cote),
    y: borne(((image.hauteur - cote) * reglage.y) / 100, image.hauteur - cote),
    largeur: cote,
    hauteur: cote,
  };
}

/** Floute sur place les pixels (RVBA) d'une zone découpée : chaque bloc prend sa couleur moyenne. */
export function pixelliser(pixels: Uint8ClampedArray, largeur: number, hauteur: number): void {
  const bloc = Math.max(1, Math.ceil(Math.max(largeur, hauteur) / BLOCS_AU_PLUS));
  for (let haut = 0; haut < hauteur; haut += bloc) {
    for (let gauche = 0; gauche < largeur; gauche += bloc) {
      const bas = Math.min(haut + bloc, hauteur);
      const droite = Math.min(gauche + bloc, largeur);
      const somme = [0, 0, 0, 0];
      for (let y = haut; y < bas; y++)
        for (let x = gauche; x < droite; x++)
          for (let c = 0; c < 4; c++) somme[c]! += pixels[(y * largeur + x) * 4 + c]!;
      const nombre = (bas - haut) * (droite - gauche);
      for (let y = haut; y < bas; y++)
        for (let x = gauche; x < droite; x++)
          for (let c = 0; c < 4; c++) pixels[(y * largeur + x) * 4 + c] = somme[c]! / nombre;
    }
  }
}

/** D'où vient la nouvelle image (privé). */
export function sourceDeLaRetouche(
  genre: 'logo' | 'cover' | 'gallery',
  prisLe: string | null,
  gestes: { floutee: boolean; recadree: boolean },
): string {
  const jour = prisLe ? ` le ${dateLongue(prisLe)}` : '';
  if (genre === 'logo') return `Logo recadré sur la photo prise par le relais${jour}`;
  const faits = [gestes.floutee ? 'floutée' : null, gestes.recadree ? 'recadrée' : null]
    .filter(Boolean)
    .join(' et ');
  return `Photo prise par le relais${jour}, ${faits}`;
}

/**
 * La taille d'un logo SVG : ses `width` et `height` en pixels, sinon sa `viewBox`, sinon un carré (un SVG sans taille se
 * dessine quand même).
 */
export function tailleDuSvg(
  largeur: string | null,
  hauteur: string | null,
  viewBox: string | null,
): Taille {
  const enPixels = (v: string | null) =>
    v && /^\s*\d+(\.\d+)?\s*(px)?\s*$/.test(v) ? Number.parseFloat(v) : 0;
  const [l, h] = [enPixels(largeur), enPixels(hauteur)];
  if (l > 0 && h > 0) return { largeur: l, hauteur: h };
  const [, , bl = 0, bh = 0] = (viewBox ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  return bl > 0 && bh > 0 ? { largeur: bl, hauteur: bh } : { largeur: 512, hauteur: 512 };
}

/**
 * Ce qu'il faut faire pour que l'original ne paraisse plus. Le retrait explicite empêche aussi qu'une autre photo prenne sa
 * place d'office ; quand une autre est déjà choisie ou retenue, retirer le contrôle de celle-ci suffit.
 */
export function retraitDeLOriginal(
  photo: Pick<PhotoVue, 'id' | 'publiable' | 'publique'>,
  etat: EtatPhotoPublique,
): { ecrireLeRetrait: boolean; retirerLeControle: boolean } {
  const ecrireLeRetrait =
    photo.publique === true ||
    etat.choisieId === photo.id ||
    (etat.mode === 'automatique' &&
      (etat.retenueId === photo.id || (!etat.publiee && photo.publiable)));
  return { ecrireLeRetrait, retirerLeControle: photo.publiable || photo.publique === true };
}
