/** Une photo contrôlée retenue pour une fiche publique (choix explicite ou repli). */
export interface PhotoPublique {
  id: string;
  prisLe: string | null;
}
export const BUDGET_PHOTO_PUBLIQUE = 32 * 1024;
export const cheminPhotoPublique = (p: PhotoPublique): string => `/photos/${p.id}.webp`;
