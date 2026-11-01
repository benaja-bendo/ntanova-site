import { describe, expect, it } from 'vitest';
import {
  boiteDeContours,
  boiteDePoints,
  cheminContour,
  cheminLignes,
  elargir,
  projection,
  regrouper,
  type Projection,
} from '../../src/modele/carte/geometrie';
import {
  APERCU_ORDINATEUR,
  APERCU_TELEPHONE,
  arrondissementDeLApercu,
  arrondissementsDessines,
  cadreApercu,
  cadreArrondissement,
  cadreCoin,
  cadreVille,
  compteApercu,
  ENCOMBREMENT_MARQUE,
  FENETRE_SANS_ECOLE,
  planer,
  PLANCHER_APERCU,
  ruesDe,
  situees,
  TAILLE_MARQUE,
  type ArrondissementDessine,
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

  it('dessine les rues de Tié-Tié et de Ngoyo, pas encore celles des quatre autres', () => {
    expect(ruesDe('tie-tie')?.rues.length).toBeGreaterThan(100);
    expect(ruesDe('ngoyo')?.rues.length).toBeGreaterThan(100);
    expect(ruesDe('ngoyo')?.avenues.length).toBeGreaterThan(20);
    for (const slug of ['lumumba', 'mvou-mvou', 'loandjili', 'mongo-mpoukou']) {
      expect(ruesDe(slug), slug).toBeNull();
    }
  });

  it('ne touche pas aux rues de Tié-Tié, celles du relevé du 30/10 (ticket 46)', () => {
    const rues = ruesDe('tie-tie')!;
    expect(rues.rues).toHaveLength(312);
    expect(rues.avenues).toHaveLength(61);
    expect([...rues.rues, ...rues.avenues].flat()).toHaveLength(942);
  });

  it('place les rues de Ngoyo à Ngoyo : longitude puis latitude, dans la boîte de l’arrondissement (ticket 46)', () => {
    const ngoyo = arrondissementsDessines.find((a) => a.slug === 'ngoyo')!;
    const b = boiteDeContours([ngoyo.contour]);
    // La requête déborde de 0,002° : une rue du bord peut dépasser d'autant.
    const marge = 0.003;
    const rues = ruesDe('ngoyo')!;
    const points = [...rues.rues, ...rues.avenues].flat();
    expect(points.length).toBeGreaterThan(500);
    const dehors = points.filter(
      ([longitude = 0, latitude = 0]) =>
        longitude < b.ouest - marge ||
        longitude > b.est + marge ||
        latitude < b.sud - marge ||
        latitude > b.nord + marge,
    );
    expect(dehors).toEqual([]);
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

describe('la fenêtre de l’aperçu de la carte sur l’accueil (ticket 42)', () => {
  const tieTie = arrondissementsDessines.find((a) => a.slug === 'tie-tie')!;
  const formats = [
    ['ordinateur', APERCU_ORDINATEUR],
    ['téléphone', APERCU_TELEPHONE],
  ] as const;
  const metres = (p: Projection, unites: number) => unites * p.metresParUnite;

  // Des écoles de Tié-Tié : une seule, deux serrées, trois étalées sur 2 km du nord au sud.
  const ensembles: [string, EcoleSurCarte[]][] = [
    ['une seule école', [ecole('a', -4.79105, 11.925)]],
    ['deux écoles à 270 m', [ecole('a', -4.79105, 11.925), ecole('b', -4.7931, 11.9262)]],
    [
      'trois écoles étalées sur 2 km du nord au sud',
      [ecole('a', -4.785, 11.925), ecole('b', -4.795, 11.926), ecole('c', -4.803, 11.924)],
    ],
  ];

  it.each(formats)('donne au dessin la taille de la place (%s)', (_nom, format) => {
    const { projection: p } = cadreApercu(tieTie, [ecole('a', -4.79105, 11.925)], format);
    expect(p.largeur).toBe(format.largeur);
    expect(p.hauteur).toBeCloseTo(format.hauteur, 0);
  });

  describe.each(ensembles)('%s', (_titre, ecoles) => {
    it.each(formats)(
      'chaque maison tient entière dans le dessin, hors des bandes réservées (%s)',
      (_nom, format) => {
        const { boite, projection: p } = cadreApercu(tieTie, ecoles, format);
        const { marques } = planer(boite, ecoles, p);
        expect(marques.length).toBeGreaterThan(0);
        for (const m of marques) {
          // Le drapeau monte jusqu'à 56 unités au-dessus du point, la porte descend à 8.
          expect(m.x - ENCOMBREMENT_MARQUE.gauche, 'bord gauche').toBeGreaterThanOrEqual(0);
          expect(m.x + ENCOMBREMENT_MARQUE.droite, 'bord droit').toBeLessThanOrEqual(p.largeur);
          expect(m.y - ENCOMBREMENT_MARQUE.haut, 'sous la légende').toBeGreaterThanOrEqual(
            format.reserveHaut,
          );
          expect(m.y + ENCOMBREMENT_MARQUE.bas, 'au-dessus du cartouche').toBeLessThanOrEqual(
            p.hauteur - format.reserveBas,
          );
        }
      },
    );
  });

  it.each(formats)(
    'ne descend pas sous 900 × 600 m : une seule école n’est pas un zoom de rue (%s)',
    (_nom, format) => {
      const { projection: p } = cadreApercu(tieTie, [ecole('a', -4.79105, 11.925)], format);
      expect(metres(p, p.largeur)).toBeGreaterThanOrEqual(PLANCHER_APERCU.largeur - 1);
      expect(metres(p, p.hauteur)).toBeGreaterThanOrEqual(PLANCHER_APERCU.hauteur - 1);
    },
  );

  it.each(formats)(
    'ne dépasse jamais l’arrondissement : deux écoles à ses deux bouts (%s)',
    (_nom, format) => {
      const b = boiteDeContours([tieTie.contour]);
      const milieu = (b.ouest + b.est) / 2;
      const { projection: p } = cadreApercu(
        tieTie,
        [ecole('nord', b.nord, milieu), ecole('sud', b.sud, milieu)],
        format,
      );
      const kx = Math.cos((((b.sud + b.nord) / 2) * Math.PI) / 180);
      expect(metres(p, p.largeur)).toBeLessThanOrEqual((b.est - b.ouest) * kx * 111_320 * 1.01);
      expect(metres(p, p.hauteur)).toBeLessThanOrEqual((b.nord - b.sud) * 111_320 * 1.01);
    },
  );

  it.each(formats)(
    'sans école, regarde le cœur de l’arrondissement : 2,5 km de large, avec des rues à lire (%s)',
    (_nom, format) => {
      const { boite, projection: p } = cadreApercu(tieTie, [], format);
      expect(Math.abs(metres(p, p.largeur) - FENETRE_SANS_ECOLE.largeur)).toBeLessThan(25);
      const centre = {
        latitude: (boite.sud + boite.nord) / 2,
        longitude: (boite.ouest + boite.est) / 2,
      };
      expect(dansContour(centre, tieTie.contour)).toBe(true);
      // Le cœur est là où les rues sont serrées : la fenêtre en voit bien plus que sa part moyenne.
      const rues = ruesDe('tie-tie')!;
      const toutes = [...rues.rues, ...rues.avenues].flat();
      const pointsVus = toutes.filter(
        ([longitude = 0, latitude = 0]) =>
          longitude >= boite.ouest &&
          longitude <= boite.est &&
          latitude >= boite.sud &&
          latitude <= boite.nord,
      );
      const b = boiteDeContours([tieTie.contour]);
      const aireArrondissement =
        ((b.est - b.ouest) *
          Math.cos((((b.sud + b.nord) / 2) * Math.PI) / 180) *
          111_320 *
          ((b.nord - b.sud) * 111_320)) /
        1e6;
      const aireFenetre = (metres(p, p.largeur) * metres(p, p.hauteur)) / 1e6;
      const densiteMoyenne = toutes.length / aireArrondissement;
      const densiteFenetre = pointsVus.length / aireFenetre;
      expect(densiteFenetre, 'densité des rues dans la fenêtre').toBeGreaterThan(
        1.5 * densiteMoyenne,
      );
    },
  );

  /** Une école au milieu de l'arrondissement : le point du contour le plus près du milieu de sa boîte. */
  const uneEcoleAuMilieuDe = (a: ArrondissementDessine) => {
    const b = boiteDeContours([a.contour]);
    const milieu = { latitude: (b.sud + b.nord) / 2, longitude: (b.ouest + b.est) / 2 };
    const grille = Array.from({ length: 19 * 19 }, (_, i) => ({
      latitude: b.sud + ((b.nord - b.sud) * (Math.floor(i / 19) + 1)) / 20,
      longitude: b.ouest + ((b.est - b.ouest) * ((i % 19) + 1)) / 20,
    }));
    const dedans = grille
      .filter((c) => dansContour(c, a.contour))
      .sort((x, y) => distanceMetres(x, milieu) - distanceMetres(y, milieu))[0]!;
    return { b, milieu, ecoles: [ecole('a', dedans.latitude, dedans.longitude)] };
  };

  it.each(formats)(
    'sans rues dessinées (Loandjili), montre l’arrondissement sur toute sa largeur : une fenêtre serrée ne serait qu’un aplat (%s)',
    (_nom, format) => {
      const loandjili = arrondissementsDessines.find((a) => a.slug === 'loandjili')!;
      expect(ruesDe('loandjili')).toBeNull();
      const { b, milieu, ecoles } = uneEcoleAuMilieuDe(loandjili);

      const { boite, projection: p } = cadreApercu(loandjili, ecoles, format);
      const kx = Math.cos((milieu.latitude * Math.PI) / 180);
      expect(metres(p, p.largeur)).toBeGreaterThanOrEqual((b.est - b.ouest) * kx * 111_320);
      // La maison tient toujours entière, hors des bandes réservées.
      const { marques } = planer(boite, ecoles, p);
      expect(marques).toHaveLength(1);
      const m = marques[0]!;
      expect(m.x - ENCOMBREMENT_MARQUE.gauche).toBeGreaterThanOrEqual(0);
      expect(m.x + ENCOMBREMENT_MARQUE.droite).toBeLessThanOrEqual(p.largeur);
      expect(m.y - ENCOMBREMENT_MARQUE.haut).toBeGreaterThanOrEqual(format.reserveHaut);
      expect(m.y + ENCOMBREMENT_MARQUE.bas).toBeLessThanOrEqual(p.hauteur - format.reserveBas);
    },
  );

  it.each(formats)(
    'avec ses rues dessinées (Ngoyo, ticket 46), garde la fenêtre serrée autour de l’école : au plancher, pas sur toute la largeur (%s)',
    (_nom, format) => {
      const ngoyo = arrondissementsDessines.find((a) => a.slug === 'ngoyo')!;
      expect(ruesDe('ngoyo')).not.toBeNull();
      const { b, milieu, ecoles } = uneEcoleAuMilieuDe(ngoyo);

      const { projection: p } = cadreApercu(ngoyo, ecoles, format);
      const kx = Math.cos((milieu.latitude * Math.PI) / 180);
      const largeurArrondissement = (b.est - b.ouest) * kx * 111_320;
      expect(metres(p, p.largeur)).toBeGreaterThanOrEqual(PLANCHER_APERCU.largeur - 1);
      expect(metres(p, p.largeur)).toBeLessThan(2 * PLANCHER_APERCU.largeur);
      expect(metres(p, p.largeur)).toBeLessThan(largeurArrondissement / 2);
    },
  );

  it('ne dépend pas de l’ordre des écoles', () => {
    const [, trois] = ensembles[2]!;
    const a = cadreApercu(tieTie, trois, APERCU_ORDINATEUR).boite;
    const b = cadreApercu(tieTie, [...trois].reverse(), APERCU_ORDINATEUR).boite;
    expect(b).toEqual(a);
  });
});

describe('l’arrondissement que l’aperçu montre (ticket 42)', () => {
  // L'ordre du catalogue est alphabétique : Ngoyo avant Tié-Tié.
  const ouverts = [{ slug: 'ngoyo' }, { slug: 'tie-tie' }];
  const ecolesSituees = (arrondissement: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      arrondissement,
      latitude: -4.79 - i / 1000,
      longitude: 11.92,
    }));
  const sansPosition = (arrondissement: string, n: number) =>
    Array.from({ length: n }, () => ({ arrondissement, latitude: null, longitude: null }));

  it('prend celui qui a le plus d’écoles sur la carte', () => {
    const ngoyo3 = [...ecolesSituees('ngoyo', 3), ...ecolesSituees('tie-tie', 1)];
    expect(arrondissementDeLApercu(ouverts, ngoyo3)?.slug).toBe('ngoyo');
    const tie2 = [...ecolesSituees('ngoyo', 1), ...ecolesSituees('tie-tie', 2)];
    expect(arrondissementDeLApercu(ouverts, tie2)?.slug).toBe('tie-tie');
  });

  it('prend, parmi ceux dont les rues sont dessinées, le plus petit numéro quand aucune école n’est située', () => {
    // Tié-Tié (3) avant Ngoyo (6), pourtant premier du catalogue par ordre alphabétique.
    expect(arrondissementDeLApercu(ouverts, [])?.slug).toBe('tie-tie');
    // Des écoles publiées mais pas situées ne comptent pas : elles ne sont pas sur la carte.
    expect(arrondissementDeLApercu(ouverts, sansPosition('ngoyo', 5))?.slug).toBe('tie-tie');
    // Le critère est « a des rues » avant « a le plus petit numéro » : Lumumba est l'arrondissement 1,
    // Loandjili le 4, et ni l'un ni l'autre n'a encore ses rues, sa fenêtre serait un aplat.
    const lumumbaEtTieTie = [{ slug: 'lumumba' }, { slug: 'tie-tie' }];
    expect(arrondissementDeLApercu(lumumbaEtTieTie, [])?.slug).toBe('tie-tie');
    const loandjiliEtNgoyo = [{ slug: 'loandjili' }, { slug: 'ngoyo' }];
    expect(arrondissementDeLApercu(loandjiliEtNgoyo, [])?.slug).toBe('ngoyo');
  });

  it('ignore un arrondissement que le relevé n’a pas ouvert', () => {
    const dansTieTie = ecolesSituees('tie-tie', 4);
    expect(arrondissementDeLApercu([{ slug: 'ngoyo' }], dansTieTie)?.slug).toBe('ngoyo');
  });

  it('n’en prend aucun quand aucun arrondissement ouvert n’est dessiné', () => {
    expect(arrondissementDeLApercu([{ slug: 'inconnu' }], [])).toBeNull();
    expect(arrondissementDeLApercu([], [])).toBeNull();
  });
});

describe('le compte sous l’aperçu (ticket 42)', () => {
  it('dit combien d’écoles sont sur la carte', () => {
    expect(compteApercu(4, 3)).toBe('3 écoles sur la carte');
    expect(compteApercu(1, 1)).toBe('1 école sur la carte');
  });

  it('dit que des écoles publiées ne sont pas encore situées', () => {
    expect(compteApercu(4, 0)).toBe('4 écoles, pas encore sur la carte');
    expect(compteApercu(1, 0)).toBe('1 école, pas encore sur la carte');
  });

  it('dit que le relevé est en cours quand il n’y a rien', () => {
    expect(compteApercu(0, 0)).toBe('relevé en cours');
  });
});
