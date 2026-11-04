// Les règles CORS du seau R2 des tuiles (ticket 114, décision D4 du fondateur) : le fichier est celui que le fondateur envoie
// à Cloudflare avec `wrangler r2 bucket cors set`. Wrangler refuse le format d'Amazon S3 et un tableau sans `rules` ; ce test
// garde le format de R2, les origines du site, et surtout l'absence de joker : les tuiles ne sont lisibles que depuis nos pages.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Regle {
  allowed: { origins: string[]; methods: string[]; headers: string[] };
  exposeHeaders: string[];
  maxAgeSeconds: number;
}
const fichier = JSON.parse(
  readFileSync(new URL('../../outils/fond-de-carte/cors.json', import.meta.url), 'utf8'),
) as { rules: Regle[] };

describe('cors.json', () => {
  it('a le format de R2 : un objet avec un tableau `rules`, des clés en minuscules rangées dans `allowed`', () => {
    expect(Object.keys(fichier)).toEqual(['rules']);
    expect(fichier.rules).toHaveLength(1);
    const regle = fichier.rules[0]!;
    expect(Object.keys(regle).sort()).toEqual(['allowed', 'exposeHeaders', 'maxAgeSeconds']);
    expect(JSON.stringify(fichier)).not.toMatch(
      /AllowedOrigins|AllowedMethods|AllowedHeaders|CORSRules/,
    );
  });

  it('ne laisse lire les tuiles qu’aux pages du site : la production, l’essai et le développement local', () => {
    const origines = fichier.rules[0]!.allowed.origins;
    expect(origines).toContain('https://ntanova.com');
    expect(origines).toContain('https://essai.ntanova.com');
    expect(origines).not.toContain('*');
    expect(
      origines.every((o) => /^https:\/\/(essai\.)?ntanova\.com$|^http:\/\/localhost:\d+$/.test(o)),
    ).toBe(true);
  });

  it('ne permet que de lire (GET, HEAD) et demande ce qu’un lecteur de PMTiles envoie : Range et If-Match', () => {
    const { allowed } = fichier.rules[0]!;
    expect([...allowed.methods].sort()).toEqual(['GET', 'HEAD']);
    expect(allowed.headers.map((h) => h.toLowerCase()).sort()).toEqual(['if-match', 'range']);
  });

  it('laisse lire l’ETag (le lecteur s’en sert pour détecter un fichier remplacé)', () => {
    expect(fichier.rules[0]!.exposeHeaders.map((h) => h.toLowerCase())).toContain('etag');
  });
});
