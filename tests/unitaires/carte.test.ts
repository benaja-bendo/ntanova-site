import { describe, expect, it } from 'vitest';
import {
  boiteDePoints,
  cheminContour,
  cheminLignes,
  elargir,
  projection,
  regrouper,
} from '../../src/modele/carte/geometrie';
import {
  arrondissementsDessines,
  cadreArrondissement,
  cadreCoin,
  cadreVille,
  planer,
  ruesDe,
  situees,
  TAILLE_MARQUE,
  type EcoleSurCarte,
} from '../../src/modele/carte/plan';
import { dansContour, distanceMetres } from '../../src/modele/geo';

const ecole = (
  id: string,
  latitude: number,
  longitude: number,
  etat: EcoleSurCarte['etat'] = 'relevee',
): EcoleSurCarte => ({
  id,
  nom: `[École ${id}]`,
  lien: `/ecoles/tie-tie/${id}/`,
  etat,
  latitude,
  longitude,
});

describe('la projection', () => {
  const boite = { ouest: 11.9, est: 11.95, sud: -4.85, nord: -4.8 };

  it('met le coin nord-ouest en haut à gauche et le sud-est en bas à droite, dans la marge', () => {
    const p = projection(boite, { largeur: 400, marge: 10 });
    const [x0, y0] = p.versEcran({ latitude: -4.8, longitude: 11.9 });
    const [x1, y1] = p.versEcran({ latitude: -4.85, longitude: 11.95 });
    expect(x0).toBe(10);
    expect(y0).toBe(10);
    expect(x1).toBe(390);
    expect(y1).toBeCloseTo(p.hauteur - 10, 0);
  });

  it('ne déforme pas : un kilomètre fait autant d’unités en largeur qu’en hauteur', () => {
    const p = projection(boite, { largeur: 400 });
    const centre = { latitude: -4.825, longitude: 11.925 };
    const [cx, cy] = p.versEcran(centre);
    // Un point à 1 km à l'est, un autre à 1 km au sud.
    const est = {
      latitude: centre.latitude,
      longitude: centre.longitude + 1000 / (111_320 * Math.cos((4.825 * Math.PI) / 180)),
    };
    const sud = { latitude: centre.latitude - 1000 / 111_320, longitude: centre.longitude };
    expect(distanceMetres(centre, est)).toBeCloseTo(1000, -1);
    expect(distanceMetres(centre, sud)).toBeCloseTo(1000, -1);
    const [ex] = p.versEcran(est);
    const [, sy] = p.versEcran(sud);
    expect(ex - cx).toBeCloseTo(sy - cy, 0);
    expect(p.metresParUnite * (ex - cx)).toBeCloseTo(1000, -1);
  });

  it('réduit un dessin trop haut et le centre en largeur', () => {
    const haute = { ouest: 11.9, est: 11.91, sud: -4.9, nord: -4.8 };
    const p = projection(haute, { largeur: 400, hauteurMax: 300, marge: 0 });
    expect(p.hauteur).toBe(300);
    const [x0] = p.versEcran({ latitude: -4.8, longitude: 11.9 });
    const [x1] = p.versEcran({ latitude: -4.8, longitude: 11.91 });
    expect(x0 + x1).toBeCloseTo(400, 0);
  });

  it('élargit une boîte trop petite (un seul point) autour de lui', () => {
    const b = elargir(boiteDePoints([{ latitude: -4.8, longitude: 11.9 }]), {
      largeur: 300,
      hauteur: 300,
    });
    const largeur = distanceMetres(
      { latitude: -4.8, longitude: b.ouest },
      { latitude: -4.8, longitude: b.est },
    );
    const hauteur = distanceMetres(
      { latitude: b.sud, longitude: 11.9 },
      { latitude: b.nord, longitude: 11.9 },
    );
    expect(largeur).toBeCloseTo(300, -1);
    expect(hauteur).toBeCloseTo(300, -1);
  });
});

describe('les chemins SVG', () => {
  const p = projection({ ouest: 0, est: 1, sud: -1, nord: 0 }, { largeur: 100, marge: 0 });

  it('ferme chaque anneau d’un contour', () => {
    const carre = [
      [
        [
          [0, 0],
          [1, 0],
          [1, -1],
          [0, -1],
          [0, 0],
        ],
      ],
    ];
    expect(cheminContour(carre, p)).toMatch(/^M0 0L100 0L100 100L0 100L0 0Z$/);
  });

  it('ne trace pas une rue entièrement hors du dessin', () => {
    const dedans = [
      [0.2, -0.2],
      [0.8, -0.2],
    ];
    const loin = [
      [5, 5],
      [6, 5],
    ];
    const chemin = cheminLignes([dedans, loin], p, 0);
    expect(chemin.match(/M/g)).toHaveLength(1);
  });

  it('garde une rue qui traverse le dessin sans y avoir de point', () => {
    const traversante = [
      [-1, -0.5],
      [2, -0.5],
    ];
    expect(cheminLignes([traversante], p, 0)).not.toBe('');
  });
});

describe('les groupes', () => {
  const { largeur, hauteur } = TAILLE_MARQUE;

  it('laisse seules des marques qui ne se touchent pas', () => {
    const marques = regrouper(
      [
        { x: 0, y: 0, valeur: 'a' },
        { x: largeur + 1, y: 0, valeur: 'b' },
        { x: 0, y: hauteur + 1, valeur: 'c' },
      ],
      largeur,
      hauteur,
    );
    expect(marques).toHaveLength(3);
  });

  it('fusionne deux marques qui se touchent, au milieu de leurs écoles', () => {
    const marques = regrouper(
      [
        { x: 100, y: 100, valeur: 'a' },
        { x: 110, y: 120, valeur: 'b' },
      ],
      largeur,
      hauteur,
    );
    expect(marques).toEqual([{ x: 105, y: 110, membres: ['a', 'b'] }]);
  });

  it('recommence jusqu’à ce que plus rien ne se touche, quel que soit l’ordre', () => {
    const points = Array.from({ length: 30 }, (_, i) => ({
      x: (i * 37) % 160,
      y: (i * 53) % 200,
      valeur: i,
    }));
    const marques = regrouper(points, largeur, hauteur);
    const inverse = regrouper([...points].reverse(), largeur, hauteur);
    for (let i = 0; i < marques.length; i++) {
      for (let j = i + 1; j < marques.length; j++) {
        const [a, b] = [marques[i]!, marques[j]!];
        expect(Math.abs(a.x - b.x) < largeur && Math.abs(a.y - b.y) < hauteur).toBe(false);
      }
    }
    expect(marques.flatMap((m) => m.membres).sort((a, b) => a - b)).toEqual(
      points.map((p) => p.valeur),
    );
    expect(inverse.map((m) => [m.x, m.y])).toEqual(marques.map((m) => [m.x, m.y]));
  });
});

describe('les cadrages de Pointe-Noire', () => {
  const tieTie = arrondissementsDessines.find((a) => a.slug === 'tie-tie')!;

  it('connaît les six arrondissements, numérotés de 1 à 6', () => {
    expect(arrondissementsDessines.map((a) => a.numero).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(arrondissementsDessines.map((a) => a.slug)).toContain('ngoyo');
  });

  it('dessine les rues de Tié-Tié, pas encore celles des autres', () => {
    expect(ruesDe('tie-tie')?.rues.length).toBeGreaterThan(100);
    expect(ruesDe('lumumba')).toBeNull();
  });

  it('fait tenir la ville et chaque arrondissement dans un téléphone', () => {
    expect(cadreVille().hauteur).toBeLessThanOrEqual(560);
    for (const a of arrondissementsDessines) {
      const { projection: p } = cadreArrondissement(a);
      expect(p.largeur).toBe(400);
      expect(p.hauteur).toBeLessThanOrEqual(560);
    }
  });

  it('place une école de Tié-Tié dans le contour dessiné de Tié-Tié', () => {
    // Un point connu de la base, au milieu de l'arrondissement.
    expect(dansContour({ latitude: -4.79105, longitude: 11.925 }, tieTie.contour)).toBe(true);
  });

  it('regroupe deux écoles voisines sur la carte de l’arrondissement, et les sépare vues de près', () => {
    const a = ecole('a', -4.79105, 11.925);
    const b = ecole('b', -4.7913, 11.9253, 'verifiee'); // à une quarantaine de mètres
    const c = ecole('c', -4.81, 11.94); // loin
    const { boite, projection: p } = cadreArrondissement(tieTie);
    const plan = planer(boite, [a, b, c], p);
    const groupe = plan.marques.find((m) => m.genre === 'groupe');
    expect(plan.marques).toHaveLength(2);
    expect(groupe).toMatchObject({ id: 'coin-1', verifiee: true });
    expect(groupe?.genre === 'groupe' && groupe.ecoles.map((e) => e.id)).toEqual(['a', 'b']);

    const coin = cadreCoin([a, b]);
    const pres = planer(coin.boite, [a, b, c], coin.projection);
    expect(pres.marques.map((m) => m.genre)).toEqual(['ecole', 'ecole']);
  });

  it('laisse de côté les écoles sans position', () => {
    const sansPosition = { latitude: null, longitude: null };
    const avec = { latitude: -4.79, longitude: 11.92 };
    expect(situees([sansPosition, avec])).toEqual([avec]);
  });
});
