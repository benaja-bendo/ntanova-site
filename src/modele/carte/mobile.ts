/**
 * Ce que le téléphone change à la carte, sans navigateur : la partie de l'écran que le clavier laisse voir, et les mots
 * de « Ma position ». Des fonctions pures, testées à part (`tests/unitaires/mobile-carte.test.ts`).
 */
import { BOITE_DU_PAYS } from './fond';

/** Ce que `window.visualViewport` dit de l'écran vu : sa hauteur, son décalage vers le bas et son zoom. */
export interface FenetreVue {
  height: number;
  offsetTop: number;
  scale: number;
}

/**
 * Sous cette perte de hauteur, ce n'est pas un clavier : la barre d'adresse d'un téléphone se replie ou se déplie, et
 * l'écran gagne ou perd quelques dizaines de pixels. Un clavier en prend bien plus.
 */
export const PERTE_MINIMALE_DU_CLAVIER = 120;

/**
 * La partie de la page que le clavier laisse voir (en pixels CSS), ou `null` quand il n'y a pas de clavier. `hauteurDeLaPage`
 * est la hauteur de la page entière (`window.innerHeight`) : sur iPhone comme sur Android, elle ne change pas quand le
 * clavier s'ouvre, seul l'écran vu rétrécit (et le navigateur le fait glisser pour montrer le champ).
 * Un zoom par pincement rétrécit aussi l'écran vu : ce n'est pas un clavier non plus.
 */
export function zoneVisibleAvecClavier(
  hauteurDeLaPage: number,
  vue: FenetreVue,
): { haut: number; hauteur: number } | null {
  if (vue.scale > 1.01) return null;
  if (hauteurDeLaPage - vue.height < PERTE_MINIMALE_DU_CLAVIER) return null;
  return { haut: Math.max(0, Math.round(vue.offsetTop)), hauteur: Math.round(vue.height) };
}

/** Une position (degrés) dans la boîte du pays : celle de la carte (`BOITE_DU_PAYS`), pas une frontière. */
export function dansLePays(longitude: number, latitude: number): boolean {
  const [ouest, sud, est, nord] = BOITE_DU_PAYS;
  return longitude >= ouest && longitude <= est && latitude >= sud && latitude <= nord;
}

/** Les mots de « Ma position » : clairs, discrets, et ils disent toujours ce qui reste possible. */
export const MESSAGES_DE_POSITION = {
  absente:
    'La localisation n’est pas disponible sur cet appareil. Cherchez une école ou déplacez la carte.',
  nonSecurisee:
    'La localisation nécessite une connexion sécurisée (https) : elle n’est pas disponible ici. Cherchez une école ou déplacez la carte.',
  refusee:
    'La localisation est bloquée pour ce site. Autorisez-la dans les réglages du navigateur, ou cherchez une école.',
  impossible: 'La position n’a pas pu être obtenue. La recherche et la carte restent disponibles.',
  enCours: 'Recherche de votre position…',
  horsDuPays:
    'Vous êtes actuellement hors du Congo-Brazzaville. La carte reste centrée sur le pays.',
  situee: 'Vous êtes situé sur la carte. NTanova ne conserve pas votre position.',
} as const;

/** Le message d'un échec de `getCurrentPosition` : 1 = refusée, 2 = indisponible, 3 = trop longue. */
export function messageDErreurDePosition(code: number): string {
  return code === 1 ? MESSAGES_DE_POSITION.refusee : MESSAGES_DE_POSITION.impossible;
}
