// Le style complet de la carte interactive (ticket 103) : le fond, puis les couches de NTanova. Ces tests gardent ce qui
// peut se casser sans bruit dans un navigateur : un style invalide, des hachures au-dessus du fleuve, une couleur qui n'est
// pas un jeton, une deuxième police, une adresse de GeoJSON que le site ne sert pas, un marqueur mal nommé.
import { existsSync, readFileSync } from 'node:fs';
import {
  expression,
  latest as styleSpec,
  validateStyleMin,
} from '@maplibre/maplibre-gl-style-spec';
import { describe, expect, it } from 'vitest';
import {
  ADRESSE_DES_ECOLES,
  ADRESSE_DES_ZONES,
  COUCHE_EPINGLES,
  COUCHE_GROUPES,
  RAYON_DES_GROUPES,
  SOURCE_ECOLES,
  ZOOM_MAX_DES_GROUPES,
  ZOOM_MAX_DES_VILLES,
  couchesDeLaCarte,
  couleursDeLaCarte,
} from '../../src/modele/carte/couches';
import { POLICE_DE_LA_CARTE } from '../../src/modele/carte/fond';
import { IMAGE_ECUSSON, IMAGE_HACHURES, nomDeLEpingle } from '../../src/modele/carte/marqueurs';
import { styleDeLaCarte, styleDuFond } from '../../src/modele/carte/style';

const css = readFileSync('src/ui/jetons.css', 'utf8');
const style = styleDeLaCarte(css);
const fond = styleDuFond(css);
const couches = couchesDeLaCarte(couleursDeLaCarte(css));

const idsDe = (l: { id: string }[]) => l.map((x) => x.id);
const sourceLayer = (l: unknown) => (l as Record<string, unknown>)['source-layer'];

describe('le style complet de la carte', () => {
  it('est un style MapLibre valide (aucune erreur du validateur officiel)', () => {
    const erreurs = validateStyleMin(style as never);
    expect(erreurs.map((e) => e.message)).toEqual([]);
  });

  it('ne dessine rien deux fois et ne renvoie qu’à des sources qui existent', () => {
    const ids = idsDe(style.layers);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of style.layers) {
      if ('source' in l && l.source) expect(Object.keys(style.sources)).toContain(l.source);
    }
  });

  it('range les zones sous l’eau : le fleuve de Brazzaville n’est jamais hachuré', () => {
    const ids = idsDe(style.layers);
    const premiereEau = style.layers.findIndex((l) => sourceLayer(l) === 'water');
    for (const id of idsDe(couches.sousLEau)) {
      expect(ids.indexOf(id)).toBeGreaterThan(-1);
      expect(ids.indexOf(id)).toBeLessThan(premiereEau);
    }
    // … mais au-dessus de la terre, de l'occupation du sol et sous les routes (les pistes d'aéroport passent dessous).
    const terre = style.layers.findIndex((l) => sourceLayer(l) === 'earth');
    const parc = ids.indexOf('landuse_park');
    expect(ids.indexOf('zones-fond-programme')).toBeGreaterThan(terre);
    expect(ids.indexOf('zones-fond-programme')).toBeGreaterThan(parc);
    expect(ids.indexOf('zones-fond-programme')).toBeLessThan(ids.indexOf('roads_minor'));
  });

  it('range les contours sous les noms du fond, et tout le reste tout en haut', () => {
    const ids = idsDe(style.layers);
    const premierNom = style.layers.findIndex((l) => l.type === 'symbol' && !('metadata' in l));
    const indices = idsDe(couches.contours).map((id) => ids.indexOf(id));
    for (const i of indices) expect(i).toBeLessThan(premierNom + indices.length);
    const fin = ids.slice(-couches.dessus.length);
    expect(fin).toEqual(idsDe(couches.dessus));
    expect(ids.at(-1)).toBe(COUCHE_EPINGLES);
  });

  it('garde toutes les couches du fond, dans le même ordre', () => {
    const d = new Set(idsDe(fond.layers));
    expect(idsDe(style.layers).filter((id) => d.has(id))).toEqual(idsDe(fond.layers));
  });

  it('lit ses deux fichiers GeoJSON là où le site les construit', () => {
    expect(style.sources.zones).toMatchObject({ type: 'geojson', data: ADRESSE_DES_ZONES });
    expect(style.sources[SOURCE_ECOLES]).toMatchObject({
      type: 'geojson',
      data: ADRESSE_DES_ECOLES,
    });
    expect(existsSync('src/pages/carte/zones.geojson.ts')).toBe(true);
    expect(existsSync('src/pages/carte/ecoles.geojson.ts')).toBe(true);
    expect(ADRESSE_DES_ZONES).toBe('/carte/zones.geojson');
    expect(ADRESSE_DES_ECOLES).toBe('/carte/ecoles.geojson');
  });

  it('regroupe les écoles proches jusqu’au zoom 14, et sait si une école d’un groupe est confirmée', () => {
    expect(style.sources[SOURCE_ECOLES]).toMatchObject({
      cluster: true,
      clusterRadius: RAYON_DES_GROUPES,
      clusterMaxZoom: ZOOM_MAX_DES_GROUPES,
    });
    expect(RAYON_DES_GROUPES).toBe(56);
    expect(ZOOM_MAX_DES_GROUPES).toBe(14);
    const source = style.sources[SOURCE_ECOLES] as { clusterProperties: Record<string, unknown> };
    expect(Object.keys(source.clusterProperties)).toEqual(['confirmees']);
    expect(idsDe(couches.dessus)).toContain(COUCHE_GROUPES);
  });
});

describe('la ville, puis ses écoles', () => {
  const couche = (id: string) => couches.dessus.find((l) => l.id === id);

  it('efface les pastilles de ville au zoom où les groupes d’écoles apparaissent : jamais deux nombres l’un sur l’autre', () => {
    for (const id of ['villes-pastille', 'villes-nombre', 'villes-nom']) {
      expect(couche(id)?.maxzoom, id).toBe(ZOOM_MAX_DES_VILLES);
      expect(couche(id)?.minzoom, id).toBeUndefined();
    }
    for (const id of [
      COUCHE_GROUPES,
      'ecoles-groupes-nombre',
      'ecoles-groupes-ecusson',
      COUCHE_EPINGLES,
    ]) {
      expect(couche(id)?.minzoom, id).toBe(ZOOM_MAX_DES_VILLES);
      expect(couche(id)?.maxzoom, id).toBeUndefined();
    }
  });
});

describe('les couleurs et la police des couches de NTanova', () => {
  const tout = JSON.stringify([couches.sousLEau, couches.contours, couches.dessus]);

  it('ne contiennent que des couleurs qui sont des jetons de jetons.css', () => {
    const valeurs = new Set(Object.values(couleursDeLaCarte(css)));
    const ecrites = tout.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi) ?? [];
    expect(ecrites.length).toBeGreaterThan(0);
    for (const c of ecrites) expect(valeurs.has(c.toLowerCase())).toBe(true);
  });

  it('lisent les jetons de la direction artistique', () => {
    const c = couleursDeLaCarte(css);
    expect(c.zoneActif).toBe('#0b5d4a'); // le vert de la marque : « relevé en cours »
    expect(c.zoneProgramme).toBe('#868c86'); // un gris : « déploiement programmé », jamais une promesse en vert
    expect(c.groupeTexte).toBe('#ffffff');
  });

  it('écrivent tous leurs textes dans la seule police servie par le site', () => {
    const textes = [...couches.dessus].filter(
      (l) => l.type === 'symbol' && 'text-field' in (l.layout ?? {}),
    );
    expect(textes.length).toBeGreaterThan(0);
    for (const l of textes)
      expect((l.layout as Record<string, unknown>)['text-font']).toEqual([POLICE_DE_LA_CARTE]);
  });

  it('ne demandent que des images que l’îlot sait dessiner : hachures, écusson et marqueurs', () => {
    const images = JSON.stringify(style.layers).match(/"icon-image":("[^"]*"|\[.*?\]\])/g) ?? [];
    expect(images.join('')).toContain(IMAGE_ECUSSON);
    expect(JSON.stringify(couches.sousLEau)).toContain(IMAGE_HACHURES);
    expect('sprite' in style).toBe(false);
  });
});

describe('le nom du marqueur que le style demande', () => {
  const couche = couches.dessus.find((l) => l.id === COUCHE_EPINGLES);
  const spec = styleSpec.layout_symbol['icon-image'];
  const resultat = expression.createPropertyExpression(
    (couche?.layout as Record<string, unknown>)['icon-image'],
    'icon-image',
    spec as never,
  );
  const nom = (properties: Record<string, unknown>) => {
    if (resultat.result !== 'success') throw new Error('Expression invalide');
    const image = (
      resultat.value as { evaluate: (g: unknown, f: unknown) => { name: string } }
    ).evaluate({ zoom: 14 }, { type: 1, properties });
    return image.name;
  };

  it('est le même que celui que l’îlot dessine, pour chaque lettre et chaque preuve', () => {
    for (const lettre of ['M', 'P', 'C', 'L', 'T', 'S']) {
      expect(nom({ lettre, preuve: 'terrain' })).toBe(nomDeLEpingle(lettre, false));
      expect(nom({ lettre, preuve: 'direction' })).toBe(nomDeLEpingle(lettre, true));
    }
  });

  it('est neutre quand aucun niveau n’est noté (lettre nulle ou absente)', () => {
    expect(nom({ lettre: null, preuve: 'terrain' })).toBe(nomDeLEpingle(null, false));
    expect(nom({ preuve: 'direction' })).toBe(nomDeLEpingle(null, true));
  });
});
