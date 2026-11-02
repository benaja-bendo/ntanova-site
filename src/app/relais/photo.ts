/**
 * Chaque photo est allégée dans le téléphone avant d'être gardée : moins de 200 Ko, en WebP quand le
 * navigateur le sait, sinon en JPEG. Le réencodage retire les métadonnées de l'appareil (dont la
 * position GPS de la photo).
 *
 * La garantie est dure : on baisse la qualité, puis la taille, jusqu'à passer sous la limite. Une photo
 * qui ne passerait jamais (impossible en pratique : même du bruit pur à 480 px tient sous 200 Ko) est
 * refusée, jamais gardée trop lourde : rien d'une taille inattendue ne part sur un réseau qui coupe.
 */

/** La limite : strictement moins de 200 Ko (200 000 octets). */
export const POIDS_MAX_OCTETS = 200_000;

/** Le grand côté, du plus lisible au plus léger : on ne descend d'un cran que si la qualité ne suffit pas. */
const COTES = [1280, 1024, 800, 640, 480] as const;
/** De la meilleure qualité à la plus basse acceptable. */
const QUALITES = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3] as const;

export type TypePhoto = 'image/webp' | 'image/jpeg';

export interface PhotoAlleegee {
  blob: Blob;
  mime: TypePhoto;
  octets: number;
  largeur: number;
  hauteur: number;
}

export class PhotoIllisible extends Error {
  override name = 'PhotoIllisible';
}

/** La photo ne passe sous la limite à aucune taille ni qualité : à reprendre. */
export class PhotoTropLourde extends Error {
  override name = 'PhotoTropLourde';
}

function enBlob(toile: HTMLCanvasElement, type: TypePhoto, qualite: number): Promise<Blob | null> {
  return new Promise((fin) => toile.toBlob(fin, type, qualite));
}

let webpSupporte: Promise<boolean> | null = null;

/**
 * Le navigateur sait-il encoder du WebP ? Un navigateur qui ne le sait pas rend du PNG sans le dire : on
 * regarde le type réellement rendu, pas celui demandé.
 */
function saitLeWebp(): Promise<boolean> {
  webpSupporte ??= (async () => {
    const toile = document.createElement('canvas');
    toile.width = toile.height = 2;
    const blob = await enBlob(toile, 'image/webp', 0.5);
    return blob?.type === 'image/webp';
  })();
  return webpSupporte;
}

/**
 * Allège une photo : orientation corrigée, grand côté d'au plus 1 280 px, moins de 200 Ko.
 * `type` force un format (les tests) ; sans lui, WebP si possible, JPEG sinon.
 */
export async function alleger(fichier: Blob, type?: TypePhoto): Promise<PhotoAlleegee> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch (erreur) {
    throw new PhotoIllisible(erreur instanceof Error ? erreur.message : 'image');
  }

  const format: TypePhoto = type ?? ((await saitLeWebp()) ? 'image/webp' : 'image/jpeg');
  try {
    for (const cote of COTES) {
      const echelle = Math.min(1, cote / Math.max(image.width, image.height));
      const toile = document.createElement('canvas');
      toile.width = Math.max(1, Math.round(image.width * echelle));
      toile.height = Math.max(1, Math.round(image.height * echelle));
      const contexte = toile.getContext('2d');
      if (!contexte) throw new PhotoIllisible('canvas');
      contexte.drawImage(image, 0, 0, toile.width, toile.height);

      for (const qualite of QUALITES) {
        const blob = await enBlob(toile, format, qualite);
        // Un format que le navigateur n'a pas su produire : on ne garde pas un PNG déguisé.
        if (blob && blob.type === format && blob.size < POIDS_MAX_OCTETS) {
          return {
            blob,
            mime: format,
            octets: blob.size,
            largeur: toile.width,
            hauteur: toile.height,
          };
        }
      }
      // Cette taille ne tient pas, même à la qualité la plus basse : on réduit l'image.
    }
  } finally {
    image.close();
  }
  throw new PhotoTropLourde('plus de 200 Ko à toutes les tailles');
}
