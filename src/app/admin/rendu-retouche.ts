/** Le rendu d'une photo retouchée dans le navigateur (ticket 236) : les zones floutées sur les pixels, puis le recadrage. */
import { pixelliser, type Zone } from '../../modele/retouche';

export function nouvelleToile(largeur: number, hauteur: number) {
  const toile = document.createElement('canvas');
  toile.width = largeur;
  toile.height = hauteur;
  const contexte = toile.getContext('2d');
  if (!contexte) throw new Error('Ce navigateur ne sait pas retoucher une image.');
  return { toile, contexte };
}

/** Floute chaque zone du dessin (en pixels de ce dessin). */
export function flouter(contexte: CanvasRenderingContext2D, zones: readonly Zone[]) {
  for (const z of zones) {
    if (z.largeur < 1 || z.hauteur < 1) continue;
    const morceau = contexte.getImageData(z.x, z.y, z.largeur, z.hauteur);
    pixelliser(morceau.data, morceau.width, morceau.height);
    contexte.putImageData(morceau, z.x, z.y);
  }
}

/** La nouvelle image, en PNG, avant sa réduction : la photo d'origine n'est pas modifiée. */
export async function imageRetouchee(
  photo: ImageBitmap,
  { zones, cadre }: { zones: readonly Zone[]; cadre: Zone | null },
): Promise<Blob> {
  const entiere = nouvelleToile(photo.width, photo.height);
  entiere.contexte.drawImage(photo, 0, 0);
  flouter(entiere.contexte, zones);
  const c = cadre ?? { x: 0, y: 0, largeur: photo.width, hauteur: photo.height };
  const sortie = nouvelleToile(c.largeur, c.hauteur);
  sortie.contexte.drawImage(
    entiere.toile,
    c.x,
    c.y,
    c.largeur,
    c.hauteur,
    0,
    0,
    c.largeur,
    c.hauteur,
  );
  return new Promise((ok, echec) =>
    sortie.toile.toBlob(
      (b) => (b ? ok(b) : echec(new Error('L’image retouchée ne s’est pas écrite.'))),
      'image/png',
    ),
  );
}
