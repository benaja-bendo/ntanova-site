/**
 * Lire les octets d'une photo avant de l'envoyer (ticket #74). Le fichier gardé dans la base du téléphone (IndexedDB) est
 * relu ici, en mémoire : c'est cette copie qui part. Sur iPhone, envoyer directement le fichier de la base (en multipart)
 * échoue (« Load failed ») sans qu'une requête parte, et l'échec ressemblait à une panne de réseau. Lue d'abord, une
 * photo qu'on ne sait pas lire est dite : jamais prise pour un réseau absent.
 */

/** Les octets du fichier, ou rien quand il est vide ou qu'il ne se relit pas. Ne lève jamais. */
export async function lireLesOctets(fichier: Blob): Promise<ArrayBuffer | null> {
  try {
    const octets = await fichier.arrayBuffer();
    return octets.byteLength > 0 ? octets : null;
  } catch {
    return null;
  }
}
