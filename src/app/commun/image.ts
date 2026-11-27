/**
 * Réduire une image dans le navigateur avant de l'envoyer (lot D du ticket 165) : l'administration ajoute un logo, une
 * couverture ou une photo de galerie ; le stockage ne reçoit jamais l'original de plusieurs mégaoctets, et chaque image a sa
 * miniature (environ 40 Ko) pour l'aperçu. La page publique, elle, réduit encore à la construction (sous son budget).
 * WebP si le navigateur sait l'écrire, sinon JPEG ; on baisse la qualité, puis la taille.
 */
import type { ImagePreparee } from '../../modele/fiche-admin';
import { tailleDuSvg } from '../../modele/retouche';

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

export const estSvg = (fichier: File): boolean =>
  fichier.type === 'image/svg+xml' || /\.svg$/i.test(fichier.name);

/**
 * Un logo SVG devient un PNG dans le navigateur, avant l'envoi (ticket 236) : le stockage ne reçoit ni ne sert jamais de
 * SVG. Dessiné dans une image, il n'exécute aucun script et ne charge rien d'ailleurs. Fond blanc : un navigateur qui
 * n'écrit que le JPEG noircirait la transparence.
 */
export async function svgVersPng(fichier: Blob, cote = 1024): Promise<Blob> {
  const illisible = () => new ImageIllisible('Ce fichier SVG ne se lit pas : envoie un PNG.');
  if (fichier.size > 2 * 1024 * 1024)
    throw new ImageIllisible('Ce fichier SVG est trop lourd (2 Mo au plus).');
  const dessin = new DOMParser().parseFromString(await fichier.text(), 'image/svg+xml');
  const racine = dessin.documentElement;
  if (racine.localName !== 'svg' || dessin.getElementsByTagName('parsererror').length > 0)
    throw illisible();
  const taille = tailleDuSvg(
    racine.getAttribute('width'),
    racine.getAttribute('height'),
    racine.getAttribute('viewBox'),
  );
  const k = cote / Math.max(taille.largeur, taille.hauteur);
  const largeur = Math.max(1, Math.round(taille.largeur * k));
  const hauteur = Math.max(1, Math.round(taille.hauteur * k));
  if (!racine.hasAttribute('viewBox'))
    racine.setAttribute('viewBox', `0 0 ${taille.largeur} ${taille.hauteur}`);
  racine.setAttribute('width', String(largeur));
  racine.setAttribute('height', String(hauteur));
  const adresse = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(dessin)], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    image.src = adresse;
    await image.decode();
    const toile = document.createElement('canvas');
    toile.width = largeur;
    toile.height = hauteur;
    const contexte = toile.getContext('2d');
    if (!contexte) throw illisible();
    const blanc = getComputedStyle(document.documentElement).getPropertyValue('--blanc').trim();
    contexte.fillStyle = blanc;
    contexte.fillRect(0, 0, largeur, hauteur);
    contexte.drawImage(image, 0, 0, largeur, hauteur);
    const png = await vers(toile, 'image/png', 1);
    if (!png) throw illisible();
    return png;
  } catch (e) {
    throw e instanceof ImageIllisible ? e : illisible();
  } finally {
    URL.revokeObjectURL(adresse);
  }
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
