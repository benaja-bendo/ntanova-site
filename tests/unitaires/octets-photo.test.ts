import { describe, expect, it } from 'vitest';
import { lireLesOctets } from '../../src/modele/octets-photo';

// Ticket #74 : la photo part de la mémoire, jamais du fichier de la base du téléphone, que WebKit ne sait pas toujours
// relire pour l'envoyer. Si la lecture échoue, l'échec est net (jamais pris pour une panne de réseau).
describe('lire les octets d’une photo avant de l’envoyer', () => {
  it('rend les octets du fichier', async () => {
    const octets = await lireLesOctets(
      new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' }),
    );
    expect(octets).not.toBeNull();
    expect([...new Uint8Array(octets!)]).toEqual([1, 2, 3, 4]);
  });

  it('un fichier vide n’est pas une photo', async () => {
    expect(await lireLesOctets(new Blob([], { type: 'image/webp' }))).toBeNull();
  });

  it('un fichier qui ne se lit pas n’est pas une photo non plus, et ne fait jamais tomber l’envoi', async () => {
    const illisible = {
      arrayBuffer: () =>
        Promise.reject(new DOMException('The object can not be found here', 'NotFoundError')),
    } as unknown as Blob;
    expect(await lireLesOctets(illisible)).toBeNull();
  });
});
