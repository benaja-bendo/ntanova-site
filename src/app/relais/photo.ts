/**
 * La photo de l'enseigne, allégée dans le téléphone avant d'être gardée :
 * 1 280 px au plus sur le grand côté, environ 200 Ko. Le réencodage retire les
 * métadonnées de l'appareil (dont la position GPS de la photo).
 */

const COTE_MAX = 1280;
const POIDS_VISE = 250_000;
const POIDS_MAX = 2_000_000; // la limite du seau `releves`

export class PhotoIllisible extends Error {
  override name = 'PhotoIllisible';
}

function enBlob(toile: HTMLCanvasElement, qualite: number): Promise<Blob | null> {
  return new Promise((fin) => toile.toBlob(fin, 'image/jpeg', qualite));
}

export async function alleger(fichier: Blob): Promise<Blob> {
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  } catch (erreur) {
    throw new PhotoIllisible(erreur instanceof Error ? erreur.message : 'image');
  }
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  const toile = document.createElement('canvas');
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  const contexte = toile.getContext('2d');
  if (!contexte) throw new PhotoIllisible('canvas');
  contexte.drawImage(image, 0, 0, toile.width, toile.height);
  image.close();

  let meilleure: Blob | null = null;
  for (const qualite of [0.8, 0.7, 0.6, 0.5]) {
    meilleure = await enBlob(toile, qualite);
    if (meilleure && meilleure.size <= POIDS_VISE) break;
  }
  if (!meilleure || meilleure.size > POIDS_MAX) throw new PhotoIllisible('trop lourde');
  return meilleure;
}
