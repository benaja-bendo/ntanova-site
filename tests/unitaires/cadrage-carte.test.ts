// Le cadre par défaut de la carte interactive, son zoom borné, la règle de chargement et le nom des marqueurs
// (ticket 103, décisions D7 et D9 du fondateur, 03/11/2026). Les fichiers GeoJSON viennent des vrais constructeurs.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cadreParDefaut, boiteDes, villeDuLien } from '../../src/modele/carte/cadrage';
import {
  ATTENTE_DE_LA_CARTE,
  modeDeChargement,
  resteDuSigne,
} from '../../src/modele/carte/chargement';
import { ecolesGeoJSON, zonesGeoJSON } from '../../src/modele/carte/donnees';
import {
  BOITE_DU_PAYS,
  FENETRES_DES_VILLES,
  ZOOM_MAX_DE_LA_CARTE,
  ZOOM_MAX_DU_CADRE_PAR_DEFAUT,
  ZOOM_MAX_HORS_DES_VILLES,
  zoomMaxEn,
} from '../../src/modele/carte/fond';
import {
  JETON_DU_CYCLE,
  LETTRES_DES_CYCLES,
  lireLEpingle,
  nomDeLEpingle,
} from '../../src/modele/carte/marqueurs';
import type { MultiPolygone } from '../../src/modele/geo';
import type { DivisionPublique, EcolePubliee } from '../../src/modele/ports';

const division = (
  id: string,
  parentId: string | null,
  niveau: number,
  genre: DivisionPublique['genre'],
  nom: string,
  slug: string,
  adresse: string[],
  reste: Partial<DivisionPublique> = {},
): DivisionPublique => ({
  id,
  parentId,
  niveau,
  genre,
  nom,
  slug,
  adresse,
  ordinal: null,
  alias: [],
  verifieeLe: '2026-11-03',
  ouverte: false,
  deploiement: null,
  position: null,
  contour: null,
  ...reste,
});

const carre = (ouest: number, sud: number, est: number, nord: number): MultiPolygone => [
  [
    [
      [ouest, sud],
      [est, sud],
      [est, nord],
      [ouest, nord],
      [ouest, sud],
    ],
  ],
];

const POINTE_NOIRE = [
  division('pn-dep', null, 1, 'department', 'Pointe-Noire', 'pointe-noire', [
    'congo',
    'pointe-noire',
  ]),
  division('pn', 'pn-dep', 2, 'city', 'Pointe-Noire', 'pointe-noire', ['congo', 'pointe-noire'], {
    position: { latitude: -4.7975, longitude: 11.8503 },
  }),
  division(
    'tie',
    'pn',
    3,
    'arrondissement',
    'Tié-Tié',
    'tie-tie',
    ['congo', 'pointe-noire', 'tie-tie'],
    { ouverte: true, deploiement: 'actif', contour: carre(11.9, -4.8, 11.95, -4.75) },
  ),
  division(
    'lum',
    'pn',
    3,
    'arrondissement',
    'Lumumba',
    'lumumba',
    ['congo', 'pointe-noire', 'lumumba'],
    { deploiement: 'programme', contour: carre(11.82, -4.85, 11.87, -4.8) },
  ),
];
const BRAZZAVILLE = [
  division('bzv-dep', null, 1, 'department', 'Brazzaville', 'brazzaville', [
    'congo',
    'brazzaville',
  ]),
  division('bzv', 'bzv-dep', 2, 'city', 'Brazzaville', 'brazzaville', ['congo', 'brazzaville'], {
    position: { latitude: -4.2694, longitude: 15.2712 },
    deploiement: 'programme',
    contour: carre(15.2, -4.35, 15.35, -4.2),
  }),
];

const ecole = (
  id: string,
  ville: 'pointe-noire' | 'brazzaville',
  longitude: number,
  latitude: number,
): EcolePubliee => ({
  id,
  institutionId: `i-${id}`,
  divisionId: ville === 'pointe-noire' ? 'tie' : 'bzv',
  slug: `ecole-${id}`,
  nom: `[École ${id}]`,
  etiquette: null,
  arrondissement: ville === 'pointe-noire' ? 'tie-tie' : 'brazzaville',
  adresse:
    ville === 'pointe-noire' ? ['congo', 'pointe-noire', 'tie-tie'] : ['congo', 'brazzaville'],
  divisionNoms: [],
  quartier: null,
  typeEcole: 'privee',
  niveaux: ['primaire'],
  programme: null,
  formations: [],
  repere: null,
  numeroEnseigne: null,
  latitude,
  longitude,
  etat: 'relevee',
  verifieeLe: null,
  releveeLe: '2026-11-02T10:00:00Z',
  situeeLe: null,
  misAJourLe: '2026-11-02T10:00:00Z',
});

const cadrer = (divisions: DivisionPublique[], ecoles: EcolePubliee[]) =>
  cadreParDefaut(
    zonesGeoJSON({ divisions, ecoles, contourDe: () => null }).features,
    ecolesGeoJSON(ecoles).features,
  );

describe('la ville d’une adresse', () => {
  it('lit le pays et la ville dans le lien d’une zone ou d’une école', () => {
    expect(villeDuLien('/ecoles/congo/pointe-noire/tie-tie/')).toBe('congo/pointe-noire');
    expect(villeDuLien('/ecoles/congo/brazzaville/ecole-a/')).toBe('congo/brazzaville');
    expect(villeDuLien('/formations/')).toBeNull();
  });

  it('suit le lien que les vrais constructeurs écrivent', () => {
    const [vue] = ecolesGeoJSON([ecole('a', 'pointe-noire', 11.92, -4.79)]).features;
    expect(villeDuLien(vue?.properties.lien ?? '')).toBe('congo/pointe-noire');
    const zones = zonesGeoJSON({
      divisions: [...POINTE_NOIRE, ...BRAZZAVILLE],
      ecoles: [],
      contourDe: () => null,
    });
    expect(new Set(zones.features.map((z) => villeDuLien(z.properties.lien)))).toEqual(
      new Set(['congo/pointe-noire', 'congo/brazzaville']),
    );
  });
});

describe('le cadre par défaut', () => {
  it('prend la ville qui a le plus d’écoles sur la carte, cadrée sur ses zones « relevé en cours » et ses écoles', () => {
    const cadre = cadrer(
      [...POINTE_NOIRE, ...BRAZZAVILLE],
      [
        ecole('a', 'pointe-noire', 11.93, -4.79),
        ecole('b', 'pointe-noire', 11.96, -4.76),
        ecole('c', 'brazzaville', 15.27, -4.27),
      ],
    );
    expect(cadre.ville).toBe('congo/pointe-noire');
    expect(cadre.ecoles).toBe(2);
    // Tié-Tié (11,90 à 11,95) et une école à 11,96 : la boîte les contient ; ni Lumumba ni Brazzaville n’y entrent.
    expect(cadre.boite[0]).toBeCloseTo(11.9, 2);
    expect(cadre.boite[2]).toBeCloseTo(11.96, 2);
    expect(cadre.boite[1]).toBeCloseTo(-4.8, 2);
    expect(cadre.boite[3]).toBeCloseTo(-4.75, 2);
  });

  it('ne laisse pas une zone « déploiement programmé » élargir le cadre', () => {
    const cadre = cadrer(POINTE_NOIRE, [ecole('a', 'pointe-noire', 11.93, -4.79)]);
    // Lumumba est programmée (11,82 à 11,87) : la boîte reste à Tié-Tié.
    expect(cadre.boite[0]).toBeGreaterThan(11.89);
  });

  it('l’emporte sur une ville plus peuplée de zones : c’est le nombre d’écoles qui décide', () => {
    const cadre = cadrer(
      [...POINTE_NOIRE, ...BRAZZAVILLE],
      [
        ecole('a', 'brazzaville', 15.27, -4.27),
        ecole('b', 'brazzaville', 15.3, -4.3),
        ecole('c', 'pointe-noire', 11.93, -4.79),
      ],
    );
    expect(cadre.ville).toBe('congo/brazzaville');
  });

  it('à égalité d’écoles, prend la ville qui a une zone « relevé en cours »', () => {
    const cadre = cadrer(
      [...POINTE_NOIRE, ...BRAZZAVILLE],
      [ecole('a', 'brazzaville', 15.27, -4.27), ecole('b', 'pointe-noire', 11.93, -4.79)],
    );
    expect(cadre.ville).toBe('congo/pointe-noire');
  });

  it('sans école, cadre la zone « relevé en cours » (jamais sur du vide ailleurs)', () => {
    const cadre = cadrer([...POINTE_NOIRE, ...BRAZZAVILLE], []);
    expect(cadre.ville).toBe('congo/pointe-noire');
    expect(cadre.ecoles).toBe(0);
    expect(cadre.boite[0]).toBeCloseTo(11.9, 2);
    expect(cadre.boite[2]).toBeCloseTo(11.95, 2);
  });

  it('sans école ni zone « relevé en cours », montre le pays entier', () => {
    const cadre = cadrer(BRAZZAVILLE, []);
    expect(cadre).toEqual({ ville: null, boite: BOITE_DU_PAYS, ecoles: 0 });
  });

  it('une seule école donne une boîte d’un point : l’îlot la borne par le zoom du cadre', () => {
    const cadre = cadrer(BRAZZAVILLE, [ecole('a', 'brazzaville', 15.27, -4.27)]);
    expect(cadre.ville).toBe('congo/brazzaville');
    expect(cadre.boite).toEqual([15.27, -4.27, 15.27, -4.27]);
    expect(ZOOM_MAX_DU_CADRE_PAR_DEFAUT).toBe(13);
  });

  it('boiteDes ne devine rien d’une liste vide', () => {
    expect(boiteDes([])).toBeNull();
    expect(boiteDes([[1, 2]])).toEqual([1, 2, 1, 2]);
  });
});

describe('le zoom borné hors des deux villes', () => {
  it('permet le zoom entier dans Pointe-Noire et Brazzaville, bords compris', () => {
    expect(zoomMaxEn(11.86, -4.79)).toBe(ZOOM_MAX_DE_LA_CARTE);
    expect(zoomMaxEn(15.27, -4.27)).toBe(ZOOM_MAX_DE_LA_CARTE);
    for (const [ouest, sud, est, nord] of Object.values(FENETRES_DES_VILLES)) {
      expect(zoomMaxEn(ouest, sud)).toBe(ZOOM_MAX_DE_LA_CARTE);
      expect(zoomMaxEn(est, nord)).toBe(ZOOM_MAX_DE_LA_CARTE);
    }
  });

  it('s’arrête au zoom 10 partout ailleurs : le fichier n’a pas de tuile plus fine (Dolisie, Kinshasa, le fleuve)', () => {
    expect(zoomMaxEn(12.67, -4.2)).toBe(ZOOM_MAX_HORS_DES_VILLES);
    expect(zoomMaxEn(15.3, -4.32)).toBe(ZOOM_MAX_DE_LA_CARTE); // Brazzaville
    expect(zoomMaxEn(15.45, -4.32)).toBe(ZOOM_MAX_HORS_DES_VILLES); // à l’est de la fenêtre
    expect(zoomMaxEn(0, 0)).toBe(10);
    expect(ZOOM_MAX_HORS_DES_VILLES).toBe(10);
  });
});

describe('quand charger la carte (D7)', () => {
  it('sur /carte/, toujours d’office, économiseur de données compris', () => {
    expect(modeDeChargement('carte', undefined)).toBe('d-office');
    expect(modeDeChargement('carte', { saveData: true, effectiveType: '2g' })).toBe('d-office');
  });

  it('sur l’accueil, d’office quand le navigateur ne dit rien (iPhone, Safari) ou dit une bonne connexion', () => {
    expect(modeDeChargement('accueil', undefined)).toBe('d-office');
    expect(modeDeChargement('accueil', null)).toBe('d-office');
    expect(modeDeChargement('accueil', {})).toBe('d-office');
    expect(modeDeChargement('accueil', { effectiveType: '4g' })).toBe('d-office');
    expect(modeDeChargement('accueil', { saveData: false, effectiveType: '4g' })).toBe('d-office');
  });

  it.each(['slow-2g', '2g', '3g'])(
    'sur l’accueil, attend un appui avec une connexion %s',
    (type) => {
      expect(modeDeChargement('accueil', { effectiveType: type })).toBe('sur-appui');
    },
  );

  it('sur l’accueil, attend un appui avec l’économiseur de données', () => {
    expect(modeDeChargement('accueil', { saveData: true })).toBe('sur-appui');
    expect(modeDeChargement('accueil', { saveData: true, effectiveType: '4g' })).toBe('sur-appui');
  });
});

describe('le nom des marqueurs', () => {
  it('dit la lettre du cycle et la preuve', () => {
    expect(nomDeLEpingle('P', false)).toBe('epingle-P');
    expect(nomDeLEpingle('P', true)).toBe('epingle-P-confirmee');
    expect(nomDeLEpingle(null, false)).toBe('epingle-neutre');
    expect(nomDeLEpingle('X', true)).toBe('epingle-neutre-confirmee');
  });

  it('se relit sans rien perdre, pour chaque lettre et chaque preuve', () => {
    for (const lettre of LETTRES_DES_CYCLES) {
      for (const confirmee of [false, true]) {
        for (const choisie of [false, true]) {
          expect(lireLEpingle(nomDeLEpingle(lettre, confirmee, choisie))).toEqual({
            lettre,
            confirmee,
            choisie,
          });
        }
      }
    }
    expect(lireLEpingle(nomDeLEpingle(null, true))).toEqual({
      lettre: null,
      confirmee: true,
      choisie: false,
    });
  });

  it('nomme l’épingle de l’école choisie sans toucher aux autres', () => {
    expect(nomDeLEpingle('S', false, true)).toBe('epingle-S-choisie');
    expect(nomDeLEpingle('S', true, true)).toBe('epingle-S-confirmee-choisie');
    expect(nomDeLEpingle('S', false)).toBe('epingle-S');
  });

  it('ne dessine pas ce qui n’est pas un marqueur', () => {
    expect(lireLEpingle('hachures')).toBeNull();
    expect(lireLEpingle('epingle-Z')).toBeNull();
  });

  it('a un jeton de couleur par lettre, ceux de la direction artistique', () => {
    expect(Object.keys(JETON_DU_CYCLE)).toEqual([...LETTRES_DES_CYCLES]);
  });
});

describe('le signe d’attente de la carte (canevas « Chargement », 08/11/2026, ticket 146)', () => {
  it('rien avant 0,4 s, une sortie vers la liste après 10 s', () => {
    expect(ATTENTE_DE_LA_CARTE.avantLeSigne).toBe(400);
    expect(ATTENTE_DE_LA_CARTE.lente).toBe(10_000);
  });
  it('le CSS de la carte suit les mêmes délais', () => {
    const css = readFileSync('src/ui/ExplorateurCarte.astro', 'utf8');
    expect(css).toContain(`attente-montrer 0s linear ${ATTENTE_DE_LA_CARTE.avantLeSigne / 1000}s`);
    expect(css).toContain(`attente-cacher 0s linear ${ATTENTE_DE_LA_CARTE.lente / 1000}s`);
  });
  it('une fois paru, le signe reste au moins 0,5 s : il ne clignote pas', () => {
    expect(resteDuSigne(null, 1000)).toBe(0);
    expect(resteDuSigne(1000, 1100)).toBe(400);
    expect(resteDuSigne(1000, 1500)).toBe(0);
    expect(resteDuSigne(1000, 9000)).toBe(0);
  });
});
