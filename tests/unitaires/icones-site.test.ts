// L'icône du site dans les résultats Google (constat du 09/11/2026) : Google n'avait aucun favicon pour ntanova.com, alors que
// celui d'un autre site du fondateur s'affichait. Le seul fichier déclaré était `favicon.svg`, dont le cadre (163 × 125) n'est
// pas carré, sans `.ico`, sans PNG, sans icône tactile. Google exige un favicon carré (1:1), en multiple de 48 px, que son
// robot sait relire. Ces tests gardent les fichiers et les balises du `<head>` public ; ils ne disent pas quand Google
// rafraîchira son affichage (jours ou semaines, c'est à lui).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ICONES_SITE } from '../../src/modele/icones';

const fichier = (href: string) => readFileSync(`public${href}`);

/** Largeur et hauteur d'un PNG, lues dans son en-tête (octets 16 à 23). */
function dimensionsPng(octets: Buffer): [number, number] {
  expect(octets.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  return [octets.readUInt32BE(16), octets.readUInt32BE(20)];
}

/** Les tailles (largeur, hauteur) que contient un fichier `.ico`, et leur format interne. */
function entreesIco(octets: Buffer) {
  expect(octets.readUInt16LE(0)).toBe(0);
  expect(octets.readUInt16LE(2)).toBe(1); // 1 = icône
  const nombre = octets.readUInt16LE(4);
  return Array.from({ length: nombre }, (_, i) => {
    const debut = 6 + i * 16;
    const taille = octets.readUInt32LE(debut + 8);
    const decalage = octets.readUInt32LE(debut + 12);
    return {
      largeur: octets[debut] || 256,
      hauteur: octets[debut + 1] || 256,
      png: octets.subarray(decalage, decalage + 8).toString('hex') === '89504e470d0a1a0a',
      fin: decalage + taille,
    };
  });
}

describe('les icônes du site public', () => {
  it('déclarent un .ico, un PNG de 48 px, un SVG et une icône tactile', () => {
    expect(ICONES_SITE.map((i) => `${i.rel} ${i.href}`)).toEqual([
      'icon /favicon.ico',
      'icon /favicon-48.png',
      'icon /icone.svg',
      'apple-touch-icon /apple-touch-icon.png',
    ]);
  });

  it('pointent chacune vers un fichier de public/', () => {
    for (const { href } of ICONES_SITE) {
      expect(() => fichier(href), href).not.toThrow();
    }
  });

  it('le .ico contient du 16, du 32 et du 48 px, tous carrés, dans un fichier entier', () => {
    const ico = fichier('/favicon.ico');
    const entrees = entreesIco(ico);
    expect(entrees.map((e) => e.largeur)).toEqual([16, 32, 48]);
    for (const e of entrees) {
      expect(e.hauteur).toBe(e.largeur);
      expect(e.png).toBe(true);
      expect(e.fin).toBeLessThanOrEqual(ico.length);
    }
  });

  it('les PNG sont carrés, à la taille qu’ils annoncent, et en multiple de 48 px quand ils sont des favicons', () => {
    for (const { rel, href, sizes } of ICONES_SITE.filter((i) => i.href.endsWith('.png'))) {
      const [largeur, hauteur] = dimensionsPng(fichier(href));
      expect(largeur, href).toBe(hauteur);
      expect(`${largeur}x${hauteur}`, href).toBe(sizes);
      if (rel === 'icon') expect(largeur % 48, href).toBe(0);
    }
  });

  it('le SVG déclaré a un cadre carré (Google refuse un favicon qui ne l’est pas)', () => {
    const svg = fichier('/icone.svg').toString('utf8');
    const cadre = /viewBox="([^"]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
    expect(cadre).toHaveLength(4);
    expect(cadre?.[2]).toBeGreaterThan(0);
    expect(cadre?.[2]).toBe(cadre?.[3]);
  });

  it('la page publique les écrit toutes, et ne déclare plus le SVG rectangulaire comme icône', () => {
    const gabarit = readFileSync('src/ui/PagePublique.astro', 'utf8');
    expect(gabarit).toContain('ICONES_SITE');
    expect(gabarit).not.toMatch(/rel="icon"\s+href="\/favicon\.svg"/);
  });
});
