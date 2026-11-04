// Le petit serveur de développement des tuiles (ticket 114) : les fichiers statiques du site ne savent pas répondre à une
// requête partielle (mesuré le 03/11 : HTTP 200 au lieu de 206), or un PMTiles se lit par morceaux. Ce serveur le sait.
import { mkdtempSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creerServeur, lirePlage } from '../../outils/fond-de-carte/servir';

describe('lire une plage d’octets', () => {
  it.each([
    ['bytes=0-99', 1000, { debut: 0, fin: 99 }],
    ['bytes=500-', 1000, { debut: 500, fin: 999 }],
    ['bytes=-100', 1000, { debut: 900, fin: 999 }],
    ['bytes=990-5000', 1000, { debut: 990, fin: 999 }],
    ['bytes=0-0', 1000, { debut: 0, fin: 0 }],
  ])('%s sur %i octets', (entete, taille, attendu) => {
    expect(lirePlage(entete, taille)).toEqual(attendu);
  });

  it('rend « tout le fichier » quand il n’y a pas de plage', () => {
    expect(lirePlage(undefined, 1000)).toBeNull();
  });

  it.each([
    'bytes=1000-',
    'bytes=5-2',
    'bytes=-0',
    'octets=0-9',
    'bytes=0-9,20-29',
    'bytes=a-b',
    'bytes=-',
  ])('refuse %s', (entete) => {
    expect(lirePlage(entete, 1000)).toBe('invalide');
  });
});

describe('le serveur', () => {
  const dossier = mkdtempSync(join(tmpdir(), 'tuiles-'));
  const contenu = Buffer.from('PMTiles0123456789abcdefghijklmnopqrstuvwxyz');
  writeFileSync(join(dossier, 'essai.pmtiles'), contenu);
  writeFileSync(join(dossier, 'secret.txt'), 'pas une archive');
  const serveur = creerServeur(dossier);
  let base = '';

  beforeAll(async () => {
    await new Promise<void>((ok) => serveur.listen(0, '127.0.0.1', ok));
    base = `http://127.0.0.1:${(serveur.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise((ok) => serveur.close(ok)));

  it('répond 206 à une requête partielle, avec ce qu’un lecteur de PMTiles attend', async () => {
    const r = await fetch(`${base}/essai.pmtiles`, {
      headers: { Range: 'bytes=0-6', Origin: 'http://localhost:4321' },
    });
    expect(r.status).toBe(206);
    expect(await r.text()).toBe('PMTiles');
    expect(r.headers.get('content-range')).toBe(`bytes 0-6/${contenu.length}`);
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(r.headers.get('access-control-expose-headers')).toMatch(/etag/i);
    expect(r.headers.get('etag')).toBeTruthy();
  });

  it('répond 200 avec tout le fichier quand on ne demande pas de plage', async () => {
    const r = await fetch(`${base}/essai.pmtiles`);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer())).toEqual(contenu);
  });

  it('répond 416 à une plage impossible', async () => {
    const r = await fetch(`${base}/essai.pmtiles`, { headers: { Range: 'bytes=900-' } });
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe(`bytes */${contenu.length}`);
  });

  it('répond au contrôle préalable (CORS) du navigateur', async () => {
    const r = await fetch(`${base}/essai.pmtiles`, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'range,if-match',
      },
    });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toMatch(/range/i);
    expect(r.headers.get('access-control-allow-headers')).toMatch(/if-match/i);
  });

  it('ne sert que des archives du dossier : ni autre fichier, ni sortie du dossier', async () => {
    expect((await fetch(`${base}/secret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/..%2Fsecret.pmtiles`)).status).toBe(404);
    expect((await fetch(`${base}/absent.pmtiles`)).status).toBe(404);
    expect((await fetch(`${base}/essai.pmtiles`, { method: 'POST' })).status).toBe(405);
  });
});
