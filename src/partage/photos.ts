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
