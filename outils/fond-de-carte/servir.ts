// Sert les archives .pmtiles d'un dossier avec les requêtes partielles (`Range`) et CORS, pour le développement
// (ticket 114) : une page de développement, ou les scripts de mesure, lisent le fond de carte comme ils le feront sur
// R2, sans attendre qu'il y soit. Pourquoi pas les fichiers statiques du site : ils répondent à `Range` par le fichier
// entier (HTTP 200, mesuré le 03/11/2026), et un PMTiles se lit par morceaux.
//
//   node outils/fond-de-carte/servir.ts [dossier] [port]       (par défaut : outils/fond-de-carte/sortie, 8077)
//
// Uniquement sur 127.0.0.1, uniquement des fichiers `*.pmtiles` du dossier, rien d'autre.
import { createReadStream, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * La plage demandée par un en-tête `Range`, sur un fichier de `taille` octets : `null` s'il n'y a pas de plage (tout le
 * fichier), `'invalide'` si elle est impossible ou si l'on en demande plusieurs (inutile pour un PMTiles).
 */
export function lirePlage(
  entete: string | undefined,
  taille: number,
): { debut: number; fin: number } | 'invalide' | null {
  if (entete === undefined) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(entete);
  if (!m || (m[1] === '' && m[2] === '')) return 'invalide';
  let debut: number;
  let fin: number;
  if (m[1] === '') {
    const dernier = Number(m[2]);
    if (dernier === 0) return 'invalide';
    debut = Math.max(0, taille - dernier);
    fin = taille - 1;
  } else {
    debut = Number(m[1]);
    fin = m[2] === '' ? taille - 1 : Math.min(Number(m[2]), taille - 1);
  }
  return debut > fin || debut >= taille ? 'invalide' : { debut, fin };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'range, if-match',
  'Access-Control-Expose-Headers': 'etag, content-range, content-length, accept-ranges',
  'Access-Control-Max-Age': '600',
};

export function creerServeur(dossier: string): Server {
  const racine = resolve(dossier);
  return createServer((requete, reponse) => {
    const fin = (statut: number, entetes: Record<string, string | number> = {}) => {
      reponse.writeHead(statut, { ...CORS, ...entetes });
      reponse.end();
    };
    if (requete.method === 'OPTIONS') return fin(204);
    if (requete.method !== 'GET' && requete.method !== 'HEAD')
      return fin(405, { Allow: 'GET, HEAD, OPTIONS' });
    const nom = decodeURIComponent((requete.url ?? '/').split('?')[0] ?? '/').slice(1);
    if (!/^[A-Za-z0-9._-]+\.pmtiles$/.test(nom) || nom.includes('..')) return fin(404);
    const chemin = join(racine, nom);
    let stat;
    try {
      stat = statSync(chemin);
    } catch {
      return fin(404);
    }
    if (!stat.isFile()) return fin(404);
    const commun = {
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: `"${stat.size}-${Math.round(stat.mtimeMs)}"`,
    };
    const plage = lirePlage(requete.headers.range, stat.size);
    if (plage === 'invalide') return fin(416, { 'Content-Range': `bytes */${stat.size}` });
    const [statut, entetes, options] = plage
      ? ([
          206,
          {
            ...commun,
            'Content-Range': `bytes ${plage.debut}-${plage.fin}/${stat.size}`,
            'Content-Length': plage.fin - plage.debut + 1,
          },
          { start: plage.debut, end: plage.fin },
        ] as const)
      : ([200, { ...commun, 'Content-Length': stat.size }, {}] as const);
    reponse.writeHead(statut, { ...CORS, ...entetes });
    if (requete.method === 'HEAD') return void reponse.end();
    createReadStream(chemin, options).pipe(reponse);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dossier = process.argv[2] ?? new URL('./sortie', import.meta.url).pathname;
  const port = Number(process.argv[3] ?? 8077);
  creerServeur(dossier).listen(port, '127.0.0.1', () => {
    console.log(
      `Tuiles servies depuis ${dossier} sur http://127.0.0.1:${port}/<archive>.pmtiles (Ctrl+C pour arrêter)`,
    );
  });
}
