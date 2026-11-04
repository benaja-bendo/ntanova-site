import { expect, it } from 'vitest';
import sharp from 'sharp';
import { BUDGET_PHOTO_PUBLIQUE } from '../../src/modele/photos-publiques';
import { photoPourLeSite } from '../../src/partage/photos';
it('allège une image, retire les métadonnées et borne les dimensions', async () => {
  const source = await sharp({
    create: { width: 1600, height: 1200, channels: 3, background: 'white' },
  })
    .jpeg()
    .withMetadata()
    .toBuffer();
  const photo = await photoPourLeSite(source);
  expect(photo.length).toBeLessThanOrEqual(BUDGET_PHOTO_PUBLIQUE);
  const m = await sharp(photo).metadata();
  expect(m.format).toBe('webp');
  expect(m.width).toBeLessThanOrEqual(720);
  expect(m.height).toBeLessThanOrEqual(480);
  expect(m.exif).toBeUndefined();
});
it('arrête la construction si le fichier ne se décode pas', async () => {
  await expect(photoPourLeSite(new Uint8Array([1, 2, 3]))).rejects.toThrow();
});
