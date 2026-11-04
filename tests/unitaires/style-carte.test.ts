// Le fond de la carte interactive (ticket #114, décisions D5 et D6 du fondateur) : un style MapLibre écrit à la
// construction, aux jetons du dépôt, pour le fichier de tuiles allégé de `outils/fond-de-carte/`. Ces tests gardent
// ce qui peut se casser sans bruit : une couleur qui n'est pas un jeton, une couche que le fichier n'a plus, un
// pictogramme (le style n'a pas de sprite), une deuxième police (une seule est servie), une adresse de tiers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { brotliCompressSync, constants } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { REGLES_SOBRES } from '../../outils/fond-de-carte/alleger';
import {
  ADRESSE_DES_GLYPHES,
  ADRESSE_DES_TUILES,
  COUCHES_DU_FOND,
  FENETRES_DES_VILLES,
  POLICE_DE_LA_CARTE,
  ZOOM_MAX_DES_TUILES,
} from '../../src/modele/carte/fond';
import { couleursDuFond, drapeauDuFond, styleDuFond } from '../../src/modele/carte/style';

const css = readFileSync('src/ui/jetons.css', 'utf8');

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [clair, fonce] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (clair + 0.05) / (fonce + 0.05);
}

/** Toutes les chaînes d'une valeur de style, à n'importe quelle profondeur (les expressions MapLibre sont imbriquées). */
function chaines(valeur: unknown, sortie: string[] = []): string[] {
  if (typeof valeur === 'string') sortie.push(valeur);
  else if (Array.isArray(valeur)) valeur.forEach((v) => chaines(v, sortie));
  else if (valeur && typeof valeur === 'object')
    Object.values(valeur).forEach((v) => chaines(v, sortie));
  return sortie;
}

const style = styleDuFond(css);

describe('les couleurs du fond', () => {
  const couleurs = couleursDuFond(css);

  it('viennent des jetons --fond-de-carte-…, lus jusqu’à une couleur', () => {
    for (const [nom, valeur] of Object.entries(couleurs)) {
      expect(valeur, nom).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('un jeton absent de jetons.css fait échouer la construction, il n’est pas remplacé en silence', () => {
    expect(() => couleursDuFond(css.replace('--fond-de-carte-eau:', '--autre-eau:'))).toThrow(
      /--fond-de-carte-eau/,
    );
  });

  it('les noms se lisent sur la terre, l’eau et les routes', () => {
    expect(contraste(couleurs.nom, couleurs.terre)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(couleurs.nom, couleurs.parc)).toBeGreaterThanOrEqual(4.5);
    // Les villes ressortent plus que les rues.
    expect(contraste(couleurs.nomFort, couleurs.terre)).toBeGreaterThanOrEqual(6);
    expect(contraste(couleurs.nomFort, couleurs.terre)).toBeGreaterThan(
      contraste(couleurs.nom, couleurs.terre),
    );
    expect(contraste(couleurs.nomEau, couleurs.eau)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(couleurs.nom, couleurs.route)).toBeGreaterThanOrEqual(4.5);
  });

  it('le fond reste clair : les routes se détachent de la terre sans couleur forte', () => {
    expect(luminance(couleurs.terre)).toBeGreaterThan(0.85);
    expect(contraste(couleurs.route, couleurs.terre)).toBeLessThan(1.2);
    expect(contraste(couleurs.routeBord, couleurs.terre)).toBeLessThan(1.3);
  });
});

describe('le drapeau des couleurs', () => {
  it('ne contient que des couleurs de jetons et le nom de la seule police', () => {
    const couleurs = couleursDuFond(css);
    const permises = new Set(Object.values(couleurs));
    const drapeau = drapeauDuFond(couleurs);
    const polices = new Set<string>();
    for (const [cle, valeur] of Object.entries(drapeau)) {
      if (cle === 'regular' || cle === 'bold' || cle === 'italic') polices.add(String(valeur));
      else for (const c of chaines(valeur)) expect(permises.has(c), `${cle} : ${c}`).toBe(true);
    }
    expect([...polices]).toEqual([POLICE_DE_LA_CARTE]);
  });
});

describe('le style', () => {
  it('lit le fichier de tuiles par pmtiles:// et dit d’où viennent les données (ODbL)', () => {
    expect(style.version).toBe(8);
    const source = style.sources.fond;
    expect(source).toMatchObject({ type: 'vector', url: `pmtiles://${ADRESSE_DES_TUILES}` });
    const attribution = (source as { attribution?: string }).attribution ?? '';
    expect(attribution).toContain('contributeurs d’OpenStreetMap');
    expect(attribution).toContain('https://www.openstreetmap.org/copyright');
  });

  it('prend une autre adresse de tuiles (le serveur local du développement)', () => {
    const local = styleDuFond(css, { adresseDesTuiles: 'http://127.0.0.1:8077/congo.pmtiles' });
    expect(local.sources.fond).toMatchObject({
      url: 'pmtiles://http://127.0.0.1:8077/congo.pmtiles',
    });
  });

  it('n’appelle aucun tiers : à part les tuiles, aucune adresse sauf le lien de l’attribution', () => {
    const adresses = chaines(style).flatMap((c) => c.match(/https?:\/\/[^\s"'<>)]+/g) ?? []);
    for (const a of adresses) {
      expect(
        a === `pmtiles://${ADRESSE_DES_TUILES}` ||
          a === ADRESSE_DES_TUILES ||
          a === 'https://www.openstreetmap.org/copyright',
        a,
      ).toBe(true);
    }
  });

  it('sert ses glyphes depuis le site, et ce fichier existe', () => {
    expect(style.glyphs).toBe(ADRESSE_DES_GLYPHES);
    expect(ADRESSE_DES_GLYPHES.startsWith('/polices/carte/')).toBe(true);
    const premier = ADRESSE_DES_GLYPHES.replace('{fontstack}', POLICE_DE_LA_CARTE).replace(
      '{range}',
      '0-255',
    );
    expect(statSync(`public${premier}`).isFile()).toBe(true);
  });

  it('ne dessine que des couches que le fichier contient', () => {
    for (const regle of REGLES_SOBRES) {
      if (regle.zoomMax !== undefined) continue;
      for (const retiree of regle.couches) expect(COUCHES_DU_FOND).not.toContain(retiree);
    }
    const dessinees = new Set(
      style.layers.map((c) => ('source-layer' in c ? c['source-layer'] : undefined)),
    );
    for (const couche of dessinees) {
      if (couche !== undefined) expect(COUCHES_DU_FOND, String(couche)).toContain(couche);
    }
    expect(dessinees.has('buildings')).toBe(false);
    expect(dessinees.has('pois')).toBe(false);
  });

  it('ne dessine pas l’occupation du sol là où le fichier n’en a pas (zooms 0 à 10)', () => {
    const jusqua = REGLES_SOBRES.find((r) => r.couches.includes('landuse'))?.zoomMax ?? 0;
    const occupation = style.layers.filter(
      (c) => 'source-layer' in c && c['source-layer'] === 'landuse',
    );
    expect(occupation.length).toBeGreaterThan(0);
    for (const c of occupation) expect(c.minzoom ?? 0, c.id).toBeGreaterThan(jusqua);
  });

  it('n’a aucun pictogramme et pas de sprite (D6)', () => {
    expect(style.sprite).toBeUndefined();
    for (const c of style.layers) {
      const cles = Object.keys((c as { layout?: object }).layout ?? {});
      expect(
        cles.filter((k) => k.startsWith('icon-')),
        c.id,
      ).toEqual([]);
    }
  });

  it('n’a qu’une police, et chaque étiquette écrit les noms en français', () => {
    const polices = new Set<string>();
    for (const c of style.layers) {
      const layout = (c as { layout?: Record<string, unknown> }).layout ?? {};
      if ('text-font' in layout) chaines(layout['text-font']).forEach((p) => polices.add(p));
    }
    // Les expressions ajoutent des mots-clés (« literal », « case »…) : on ne garde que ce qui ressemble à un nom de police.
    const noms = [...polices].filter((p) => /Noto|Sans|-Regular/.test(p));
    expect(new Set(noms)).toEqual(new Set([POLICE_DE_LA_CARTE]));
    const textes = style.layers.filter((c) => c.type === 'symbol');
    expect(textes.length).toBeGreaterThan(0);
    for (const c of textes) {
      const champ = JSON.stringify(
        (c as { layout?: Record<string, unknown> }).layout?.['text-field'],
      );
      expect(champ, c.id).toBe('["coalesce",["get","name:fr"],["get","name"]]');
    }
  });

  it('n’écrit aucune couleur qui ne soit pas un jeton', () => {
    const permises = new Set(Object.values(couleursDuFond(css)));
    const trouvees = chaines(style.layers).filter((c) =>
      /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\()/i.test(c),
    );
    expect(trouvees.length).toBeGreaterThan(20);
    for (const c of trouvees) expect(permises.has(c.toLowerCase()), c).toBe(true);
  });

  it('a des identifiants uniques, un fond, et une eau', () => {
    const ids = style.layers.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(style.layers[0]?.type).toBe('background');
    expect(ids).toContain('water');
  });

  it('est le même à chaque construction, et reste léger (mesuré le 04/11 : 21 Ko, 2,5 Ko compressés)', () => {
    const json = JSON.stringify(style);
    expect(JSON.stringify(styleDuFond(css))).toBe(json);
    expect(json.length).toBeLessThan(32 * 1024);
    const brotli = brotliCompressSync(Buffer.from(json), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length;
    expect(brotli).toBeLessThan(4 * 1024);
  });
});

describe('les glyphes de la police', () => {
  const dossier = `public/polices/carte/${POLICE_DE_LA_CARTE}`;

  it('sont des fichiers de glyphes de Noto Sans Regular, pas une page d’erreur', () => {
    for (const fichier of readdirSync(dossier)) {
      const octets = readFileSync(`${dossier}/${fichier}`);
      // Un message protobuf « glyphs » : le champ 1 (une pile), puis son nom (champ 1) et sa plage (champ 2). Le nom
      // que MapLibre demande (`text-font`) n'est pas relu dans le fichier : seul le dossier compte.
      expect(octets[0], fichier).toBe(0x0a);
      const texte = octets.subarray(0, 80).toString('latin1');
      expect(texte, fichier).toContain('Sans Regular');
      expect(texte, fichier).toContain(fichier.replace('.pbf', ''));
    }
  });

  it('la première plage (le latin, tout ce que le français demande) pèse ≈ 74 Ko, le budget annoncé', () => {
    expect(statSync(`${dossier}/0-255.pbf`).size).toBeLessThan(80 * 1024);
  });

  it('la licence de la police (SIL Open Font License) est servie avec elle', () => {
    expect(readFileSync('public/polices/LICENCE-noto-sans.txt', 'utf8')).toContain(
      'SIL OPEN FONT LICENSE',
    );
  });
});

describe('les fenêtres des deux villes', () => {
  it('sont celles que fabriquer.sh extrait (une seule vérité pour le fichier et pour l’îlot)', () => {
    const script = readFileSync('outils/fond-de-carte/fabriquer.sh', 'utf8');
    const lire = (nom: string) =>
      new RegExp(`^${nom}="([^"]+)"`, 'm').exec(script)?.[1]?.split(',').map(Number);
    expect(lire('POINTE_NOIRE')).toEqual([...FENETRES_DES_VILLES['pointe-noire']]);
    expect(lire('BRAZZAVILLE')).toEqual([...FENETRES_DES_VILLES.brazzaville]);
    expect(script).toContain(`--maxzoom=${ZOOM_MAX_DES_TUILES}`);
  });
});
