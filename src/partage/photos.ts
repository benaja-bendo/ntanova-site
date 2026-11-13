/** Traitement à la construction : aucun original ou métadonnée n’est copié dans le site. */
import sharp from 'sharp';
import { BUDGET_PHOTO_PUBLIQUE } from '../modele/photos-publiques';
export async function photoPourLeSite(source: Uint8Array): Promise<Uint8Array> {
  if (source.length > 2097152) throw new Error('Photo publique trop lourde à la source.');
  for (const largeur of [720, 480, 320, 200]) {
    for (const quality of [70, 50, 30]) {
      const image = await sharp(source, { limitInputPixels: 20000000 })
        .rotate()
        .resize({
          width: largeur,
          height: Math.round((largeur * 2) / 3),
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality })
        .toBuffer();
      if (image.length <= BUDGET_PHOTO_PUBLIQUE) return new Uint8Array(image);
    }
  }
  throw new Error('La photo ne tient pas dans le budget de la fiche.');
}

/**
 * v2 (13/11) : une image publique réduite à la taille de son usage (couverture, vignette, logo), sous son budget. On baisse la
 * qualité, puis la taille ; une image qui ne passerait jamais arrête la construction plutôt que d'alourdir la page.
 */
export async function mediaPourLeSite(
  source: Uint8Array,
  format: { largeur: number; hauteur: number; budget: number },
  carre = false,
): Promise<Uint8Array> {
  if (source.length > 4194304) throw new Error('Image publique trop lourde à la source.');
  for (const echelle of [1, 0.8, 0.6, 0.45]) {
    const largeur = Math.round(format.largeur * echelle);
    const hauteur = Math.round(format.hauteur * echelle);
    for (const quality of [72, 55, 40, 28]) {
      const image = await sharp(source, { limitInputPixels: 20000000 })
        .rotate()
        .resize({
          width: largeur,
          height: hauteur,
          fit: carre ? 'cover' : 'inside',
          withoutEnlargement: !carre,
        })
        .webp({ quality })
        .toBuffer();
      if (image.length <= format.budget) return new Uint8Array(image);
    }
  }
  throw new Error('L’image ne tient pas dans le budget de la fiche.');
}
