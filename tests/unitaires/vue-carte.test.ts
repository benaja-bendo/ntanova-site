// Le cadrage de la vue Carte de « Les écoles » (17/11/2026) : le pays entier tient dans la carte, un filtre recadre, et le
// zoom vient des tuiles de l'endroit visé.
import { describe, expect, it } from 'vitest';
import { etatVide } from '../../src/modele/liste-ecoles';
import {
  BOITE_DU_PAYS,
  FENETRES_DES_VILLES,
  ZOOM_MAX_DES_TUILES,
  ZOOM_MAX_HORS_DES_VILLES,
} from '../../src/modele/carte/fond';
import {
  boiteQuiTient,
  cadrageDeLaSelection,
  cleDeLaSelection,
} from '../../src/modele/carte/vue-carte';

const contient = (grande: readonly number[], petite: readonly number[]) =>
  grande[0]! <= petite[0]! &&
  grande[1]! <= petite[1]! &&
  grande[2]! >= petite[2]! &&
  grande[3]! >= petite[3]!;

describe('boiteQuiTient', () => {
  it.each([
    ['ordinateur, carte large', 900, 560],
    ['ordinateur, carte presque carrée', 518, 558],
    ['téléphone, carte haute', 375, 600],
  ])('le pays entier tient dans la carte (%s)', (_, l, h) => {
    const boite = boiteQuiTient(l, h);
    expect(contient(boite, BOITE_DU_PAYS)).toBe(true);
    // La boîte a la forme de la carte (en Mercator) : la carte peut donc reculer jusqu'à tout montrer.
    const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const forme = ((boite[2] - boite[0]) * Math.PI) / 180 / (y(boite[3]) - y(boite[1]));
    expect(forme).toBeCloseTo(l / h, 5);
  });

  it('une carte large ne voyait pas le nord dans la boîte du pays seule', () => {
    // Le défaut vu en ligne le 17/11 : la boîte du pays est plus haute que large.
    const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const [o, s, e, n] = BOITE_DU_PAYS;
    expect(((e - o) * Math.PI) / 180 / (y(n) - y(s))).toBeLessThan(518 / 558);
  });

  it('sans taille, la boîte du pays', () => {
    expect(boiteQuiTient(0, 0)).toEqual(BOITE_DU_PAYS);
  });
});

describe('cadrageDeLaSelection', () => {
  it('sans choix : le pays', () => {
    expect(cadrageDeLaSelection(etatVide(), [[11.9, -4.8]])?.boite).toEqual(BOITE_DU_PAYS);
  });

  it('une ville : ses écoles, jusqu’aux dernières tuiles (et non au zoom 10 d’ailleurs)', () => {
    const etat = { ...etatVide(), choix: { ...etatVide().choix, ville: ['pointe-noire'] } };
    const c = cadrageDeLaSelection(etat, [
      [11.85, -4.8],
      [11.9, -4.75],
    ]);
    expect(c?.boite).toEqual([11.85, -4.8, 11.9, -4.75]);
    expect(c?.zoomMax).toBe(ZOOM_MAX_DES_TUILES);
  });

  it('hors des villes : le zoom s’arrête où s’arrêtent les tuiles', () => {
    const etat = { ...etatVide(), q: 'dolisie' };
    expect(cadrageDeLaSelection(etat, [[12.66, -4.2]])?.zoomMax).toBe(ZOOM_MAX_HORS_DES_VILLES);
  });

  it('la zone de la carte de l’adresse passe avant les écoles', () => {
    const cadre = FENETRES_DES_VILLES.brazzaville;
    expect(cadrageDeLaSelection({ ...etatVide(), q: 'x', cadre }, [[11.9, -4.8]])?.boite).toEqual([
      ...cadre,
    ]);
  });

  it('aucune école située : la carte ne bouge pas', () => {
    expect(cadrageDeLaSelection({ ...etatVide(), q: 'x' }, [])).toBeNull();
  });
});

describe('cleDeLaSelection', () => {
  it('ni le tri, ni la vue, ni la zone de la carte ne recadrent', () => {
    const a = etatVide();
    expect(cleDeLaSelection({ ...a, tri: 'nom', vue: 'carte', cadre: [1, 2, 3, 4] })).toBe(
      cleDeLaSelection(a),
    );
    expect(cleDeLaSelection({ ...a, q: 'la' })).not.toBe(cleDeLaSelection(a));
  });
});
