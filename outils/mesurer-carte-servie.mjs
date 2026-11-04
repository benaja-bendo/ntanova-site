// Mesure HTTP des corps réellement compressés : node outils/mesurer-carte-servie.mjs [origine] [rapport.json] [page].
// Suit le graphe de l’îlot, worker et CSS compris ; aucune recompression locale. Le premier affichage reste à mesurer au navigateur.
import { execFileSync } from 'node:child_process';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = new URL(process.argv[2] ?? 'https://essai.ntanova.com').origin;
const dossier = mkdtempSync(join(tmpdir(), 'ntanova-poids-'));
process.on('exit', () => rmSync(dossier, { recursive: true, force: true }));
const cache = new Map();
function lire(path, encoding = 'br') {
  const key = path + '|' + encoding;
  if (cache.has(key)) return cache.get(key);
  const h = join(dossier, 'headers');
  const b = execFileSync('curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '60',
    '-D',
    h,
    '-H',
    'Accept-Encoding: ' + encoding,
    base + path,
  ]);
  const headers = readFileSync(h, 'utf8');
  const enc = /^content-encoding:\s*(\S+)/im.exec(headers)?.[1] ?? 'identity';
  const type = /^content-type:\s*([^\r\n]+)/im.exec(headers)?.[1];
  if (!/HTTP\/\S+ 200/.test(headers)) throw Error(headers);
  const decoded = enc === 'br' ? brotliDecompressSync(b) : enc === 'gzip' ? gunzipSync(b) : b;
  const value = { path, encoding: enc, bytes: b.length, type, text: decoded.toString('utf8') };
  cache.set(key, value);
  return value;
}
function refs(path) {
  const text = lire(path).text,
    statics = new Set(),
    dynamics = new Set();
  const rel = (s) => new URL(s, base + path).pathname;
  for (const m of text.matchAll(
    /\bfrom\s*["'`](\.\/[^"'`]+)["'`]|\bimport\s*["'`](\.\/[^"'`]+)["'`]/g,
  ))
    statics.add(rel(m[1] ?? m[2]));
  for (const m of text.matchAll(/\bimport\s*\(\s*["'`](\.\/[^"'`]+)["'`]/g))
    dynamics.add(rel(m[1]));
  for (const m of text.matchAll(/["'`]\/?(_astro\/[^"'`]+\.(?:js|mjs|css))["'`]/g))
    dynamics.add('/' + m[1]);
  return { statics, dynamics };
}
function closure(root, dynamic) {
  const seen = new Set(),
    q = [root];
  while (q.length) {
    const p = q.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    lire(p);
    if (!/\.(js|mjs)$/.test(p)) continue;
    const r = refs(p);
    q.push(...r.statics, ...(dynamic ? r.dynamics : []));
  }
  return seen;
}
const page = process.argv[4] ?? '/carte/';
if (!['/', '/carte/'].includes(page)) throw new Error('Page de carte attendue : / ou /carte/');
const html = lire(page);
const script = /<script[^>]*src="([^"]+\.js)"/.exec(html.text)?.[1];
if (!script) throw Error('Chargeur absent');
const initial = closure(script, false),
  all = closure(script, true),
  island = [...all].filter((p) => !initial.has(p));
const rows = (paths) =>
  paths.map((p) => {
    const r = lire(p);
    return { path: p, bytes: r.bytes, encoding: r.encoding };
  });
const sum = (rs) => rs.reduce((a, r) => a + r.bytes, 0);
const br = rows(island),
  gz = island.map((p) => {
    const r = lire(p, 'gzip');
    return { path: p, bytes: r.bytes, encoding: r.encoding };
  });
const result = {
  date: new Date().toISOString(),
  base,
  page,
  html: { bytes: html.bytes, encoding: html.encoding },
  chargeur: rows([...initial]),
  ilot: { brBytes: sum(br), gzipBytes: sum(gz), br, gzip: gz },
};
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (
  Math.max(result.ilot.brBytes, result.ilot.gzipBytes) > 500 * 1024 ||
  sum(result.chargeur) > 8 * 1024
) {
  console.error('Budget servi dépassé.');
  process.exitCode = 1;
}
