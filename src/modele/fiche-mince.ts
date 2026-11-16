/**
 * Lot 4 du site public, la fiche mince (planches « Fiche mince » de la version 44, feu vert du fondateur le 16/11/2026).
 * Pur : ni DOM, ni Astro.
 *
 * - La couverture d'une fiche : la couverture choisie, sinon la photo d'enseigne ; sans photo, aucun bandeau (règle du 09/11 :
 *   ni bandeau vide ni phrase).
 * - L'image d'une carte d'école (accueil, « Écoles proches », plus tard la liste) : la même photo, réduite.
 * - « Écoles proches » : seulement des écoles vues sur place, avec leur distance.
 */
import { distanceMetres } from './geo';
import type { EcolePubliee } from './ports';
import { cheminPhotoPublique, type PhotoPublique } from './photos-publiques';
import { cheminMedia } from './vitrine';

// Les images ------------------------------------------------------------------------------------------------------------

/**
 * Les vignettes de la photo d'enseigne, réduites à la construction (WebP) : carrée pour une carte en ligne (téléphone), large
 * pour une carte en colonne. Poids mesurés sur le catalogue réel le 16/11 : 3,3 Ko et 9 Ko en médiane.
 */
export const FORMATS_ENSEIGNE = {
  carree: { largeur: 152, hauteur: 152, budget: 6 * 1024 },
  large: { largeur: 400, hauteur: 208, budget: 12 * 1024 },
} as const;
export type FormeVignette = keyof typeof FORMATS_ENSEIGNE;
export const cheminVignetteEnseigne = (p: Pick<PhotoPublique, 'id'>, forme: FormeVignette) =>
  `/photos/vignettes/${p.id}-${forme}.webp`;

export type CouvertureDeLaFiche =
  { genre: 'couverture'; src: string } | { genre: 'enseigne'; src: string; photo: PhotoPublique };

/** La couverture choisie, sinon la photo d'enseigne, sinon rien : la fiche commence alors par le rond et le nom. */
export function couvertureDeLaFiche(
  e: Pick<EcolePubliee, 'medias' | 'photo'>,
): CouvertureDeLaFiche | null {
  const choisie = e.medias?.couverture;
  if (choisie) return { genre: 'couverture', src: cheminMedia(choisie, 'couverture') };
  if (e.photo) return { genre: 'enseigne', src: cheminPhotoPublique(e.photo), photo: e.photo };
  return null;
}

/** L'image d'une carte d'école : les deux formes, ou rien (le fond pierre et le rond). */
export function vignetteDeLaCarte(
  e: Pick<EcolePubliee, 'medias' | 'photo'>,
): { carree: string; large: string } | null {
  const choisie = e.medias?.couverture;
  if (choisie) {
    const src = cheminMedia(choisie, 'vignette');
    return { carree: src, large: src };
  }
  if (e.photo)
    return {
      carree: cheminVignetteEnseigne(e.photo, 'carree'),
      large: cheminVignetteEnseigne(e.photo, 'large'),
    };
  return null;
}

// « Écoles proches » ----------------------------------------------------------------------------------------------------

/** Au-delà, une école n'est plus « proche » pour une famille qui se déplace à pied ou en taxi. */
export const RAYON_ECOLES_PROCHES_M = 5000;
export const NOMBRE_ECOLES_PROCHES = 3;

/**
 * Les écoles proches d'une fiche : vues sur place, situées, à moins de 5 km, avec au moins un niveau en commun ; ni la fiche
 * elle-même, ni un autre site de la même école (« Les sites de l'école » les montre déjà). Les plus proches d'abord.
 */
export function ecolesProches<
  T extends Pick<
    EcolePubliee,
    'id' | 'institutionId' | 'niveaux' | 'latitude' | 'longitude' | 'releveeLe' | 'nom'
  >,
>(
  e: T,
  ecoles: readonly T[],
  rayon = RAYON_ECOLES_PROCHES_M,
  nombre = NOMBRE_ECOLES_PROCHES,
): { ecole: T; distanceM: number }[] {
  if (e.latitude === null || e.longitude === null) return [];
  const ici = { latitude: e.latitude, longitude: e.longitude };
  const niveaux = new Set(e.niveaux);
  return ecoles
    .filter(
      (x) =>
        x.id !== e.id &&
        x.institutionId !== e.institutionId &&
        x.releveeLe !== null &&
        x.latitude !== null &&
        x.longitude !== null &&
        x.niveaux.some((n) => niveaux.has(n)),
    )
    .map((x) => ({
      ecole: x,
      distanceM: distanceMetres(ici, { latitude: x.latitude!, longitude: x.longitude! }),
    }))
    .filter((p) => p.distanceM <= rayon)
    .sort((a, b) => a.distanceM - b.distanceM || a.ecole.nom.localeCompare(b.ecole.nom, 'fr'))
    .slice(0, nombre);
}

/** « 250 m », « 1,1 km » : la distance d'une carte d'école (planche), arrondie à 10 m, puis à 100 m. */
export function distanceCourte(m: number): string {
  const metres = Math.max(10, Math.round(m / 10) * 10);
  if (metres < 1000) return `${metres} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
}
