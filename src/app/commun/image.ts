/**
 * Réduire une image dans le navigateur avant de l'envoyer (lot D du ticket 165) : l'administration ajoute un logo, une
 * couverture ou une photo de galerie ; le stockage ne reçoit jamais l'original de plusieurs mégaoctets, et chaque image a sa
 * miniature (environ 40 Ko) pour l'aperçu. La page publique, elle, réduit encore à la construction (sous son budget).
 * WebP si le navigateur sait l'écrire, sinon JPEG ; on baisse la qualité, puis la taille.
 */
import type { ImagePreparee } from '../../modele/fiche-admin';

export class ImageIllisible extends Error {
  override name = 'ImageIllisible';
}

const vers = (toile: HTMLCanvasElement, type: string, qualite: number) =>
  new Promise<Blob | null>((ok) => toile.toBlob(ok, type, qualite));

async function reduire(
  image: ImageBitmap,
  cote: number,
  budget: number,
  type: 'image/webp' | 'image/jpeg',
): Promise<{ blob: Blob; largeur: number; hauteur: number }> {
  for (const echelle of [1, 0.8, 0.6, 0.45]) {
    const k = Math.min(1, (cote * echelle) / Math.max(image.width, image.height));
    const largeur = Math.max(1, Math.round(image.width * k));
    const hauteur = Math.max(1, Math.round(image.height * k));
    const toile = document.createElement('canvas');
    toile.width = largeur;
    toile.height = hauteur;
    toile.getContext('2d')?.drawImage(image, 0, 0, largeur, hauteur);
    for (const qualite of [0.82, 0.7, 0.55, 0.4]) {
      const blob = await vers(toile, type, qualite);
      if (blob && blob.size <= budget) return { blob, largeur, hauteur };
    }
  }
  throw new ImageIllisible('Cette image ne se réduit pas assez : choisis-en une autre.');
}

export async function preparerImage(fichier: Blob): Promise<ImagePreparee> {
  if (fichier.size > 25 * 1024 * 1024)
    throw new ImageIllisible('Ce fichier est trop lourd (25 Mo au plus).');
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    throw new ImageIllisible('Ce fichier n’est pas une image lisible (JPEG, PNG ou WebP).');
  }
  const essai = document.createElement('canvas');
  essai.width = essai.height = 1;
  const webp = (await vers(essai, 'image/webp', 0.5))?.type === 'image/webp';
  const mime = webp ? 'image/webp' : 'image/jpeg';
  const plein = await reduire(image, 1600, 400 * 1024, mime);
  const mini = await reduire(image, 480, 40 * 1024, mime);
  image.close();
  return {
    plein: plein.blob,
    miniature: mini.blob,
    mime,
    largeur: plein.largeur,
    hauteur: plein.hauteur,
  };
}
