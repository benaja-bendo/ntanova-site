// L'état public d'une zone (audit du 05/11/2026, D2) : la carte et les pages de zone lisent la même vérité.
import { describe, expect, it } from 'vitest';
import { zonesGeoJSON } from '../../src/modele/carte/donnees';
import {
  etatPublicDe,
  libelleDeploiement,
  phraseDeLaSuite,
  phraseSansEcole,
} from '../../src/modele/etat-zone';
import { lienDivision } from '../../src/modele/geo-divisions';
import type { DivisionPublique } from '../../src/modele/ports';

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

const PN = ['congo', 'pointe-noire', 'pointe-noire'];
const BZV = ['congo', 'brazzaville', 'brazzaville'];
/** L'état réel de la base le 05/11/2026 : Tié-Tié et Ngoyo en cours ; Lumumba, Mvou-Mvou, Loandjili, Mongo-Mpoukou et Brazzaville programmés. */
const DIVISIONS: DivisionPublique[] = [
  division('cg', null, 0, 'country', 'Congo', 'congo', ['congo']),
  division('pn-dep', 'cg', 1, 'department', 'Pointe-Noire', 'pointe-noire', [
    'congo',
    'pointe-noire',
  ]),
  division('pn', 'pn-dep', 2, 'city', 'Pointe-Noire', 'pointe-noire', PN, {
    position: { latitude: -4.8, longitude: 11.85 },
  }),
  division('tt', 'pn', 3, 'arrondissement', 'Tié-Tié', 'tie-tie', [...PN, 'tie-tie'], {
    deploiement: 'actif',
    position: { latitude: -4.77, longitude: 11.9 },
  }),
  division('ng', 'pn', 3, 'arrondissement', 'Ngoyo', 'ngoyo', [...PN, 'ngoyo'], {
    deploiement: 'actif',
    position: { latitude: -4.85, longitude: 11.85 },
  }),
  division('lo', 'pn', 3, 'arrondissement', 'Loandjili', 'loandjili', [...PN, 'loandjili'], {
    deploiement: 'programme',
    position: { latitude: -4.75, longitude: 11.88 },
  }),
  division('mv', 'pn', 3, 'arrondissement', 'Mvou-Mvou', 'mvou-mvou', [...PN, 'mvou-mvou'], {
    deploiement: 'programme',
    position: { latitude: -4.79, longitude: 11.85 },
  }),
  division('bz-dep', 'cg', 1, 'department', 'Brazzaville', 'brazzaville', ['congo', 'brazzaville']),
  division('bz', 'bz-dep', 2, 'city', 'Brazzaville', 'brazzaville', BZV, {
    deploiement: 'programme',
    position: { latitude: -4.27, longitude: 15.27 },
  }),
  division('do-dep', 'cg', 1, 'department', 'Niari', 'niari', ['congo', 'niari']),
  division('do', 'do-dep', 2, 'city', 'Dolisie', 'dolisie', ['congo', 'niari', 'dolisie']),
];
const par = (id: string) => DIVISIONS.find((d) => d.id === id)!;

describe('etatPublicDe', () => {
  it('une zone dit d’abord son propre état', () => {
    expect(etatPublicDe(par('tt'), DIVISIONS)).toBe('actif');
    expect(etatPublicDe(par('lo'), DIVISIONS)).toBe('programme');
    expect(etatPublicDe(par('bz'), DIVISIONS)).toBe('programme');
  });
  it('sans état propre, une ville prend celui de ce qu’elle contient : « en cours » avant « programmé »', () => {
    expect(etatPublicDe(par('pn'), DIVISIONS)).toBe('actif');
    const sansActif = DIVISIONS.map((d) =>
      d.deploiement === 'actif' ? { ...d, deploiement: null } : d,
    );
    expect(
      etatPublicDe(
        sansActif.find((d) => d.id === 'pn')!,
        sansActif,
      ),
    ).toBe('programme');
  });
  it('le pays prend celui de ses villes', () => {
    expect(etatPublicDe(par('cg'), DIVISIONS)).toBe('actif');
  });
  it('sans état ni dessous ni dessus, rien : la carte n’en dit rien, les pages non plus', () => {
    expect(etatPublicDe(par('do'), DIVISIONS)).toBeNull();
    expect(etatPublicDe(par('do-dep'), DIVISIONS)).toBeNull();
  });
  it('un département de même adresse que sa ville ne lui prête pas son état, et ne le prend pas d’elle', () => {
    // Brazzaville (ville) est programmé ; son département, qui a la même adresse, n'a pas d'état et n'en prend pas.
    expect(etatPublicDe(par('bz-dep'), DIVISIONS)).toBeNull();
  });
});

describe('la carte et les pages disent la même chose', () => {
  const zones = zonesGeoJSON({ divisions: DIVISIONS, ecoles: [], contourDe: () => null });
  const parLien = new Map(DIVISIONS.map((d) => [lienDivision(d.adresse), d]));

  it('chaque zone de la carte a l’état, et les mots, que les pages de zone lisent', () => {
    expect(zones.features.length).toBeGreaterThan(0);
    for (const f of zones.features) {
      const d = parLien.get(f.properties.lien);
      expect(d, `la page de ${f.properties.nom} existe dans les données`).toBeDefined();
      // Pour une adresse partagée (la ville et son département), c'est la ville, la plus fine, qui porte la page.
      const celle = DIVISIONS.filter((x) => lienDivision(x.adresse) === f.properties.lien).at(-1)!;
      expect(etatPublicDe(celle, DIVISIONS)).toBe(f.properties.etat);
      expect(libelleDeploiement[f.properties.etat]).toBe(f.properties.libelle);
    }
  });
  it('Loandjili, Mongo-Mpoukou, Mvou-Mvou et Brazzaville sont « Déploiement programmé », Tié-Tié et Ngoyo « Relevé en cours »', () => {
    const dit = (id: string) => libelleDeploiement[etatPublicDe(par(id), DIVISIONS)!];
    expect(dit('lo')).toBe('Déploiement programmé');
    expect(dit('mv')).toBe('Déploiement programmé');
    expect(dit('bz')).toBe('Déploiement programmé');
    expect(dit('tt')).toBe('Relevé en cours');
    expect(dit('ng')).toBe('Relevé en cours');
  });
});

describe('les phrases d’une zone', () => {
  it('une zone sans école dit son état, sans en inventer un', () => {
    expect(phraseSansEcole('actif')).toBe(
      'Aucune école publiée pour l’instant : le relevé est en cours.',
    );
    expect(phraseSansEcole('programme')).toBe(
      'Aucune école publiée pour l’instant : le déploiement est programmé.',
    );
    expect(phraseSansEcole(null)).toBe('Aucune école publiée pour l’instant.');
  });
  it('ne se contredit jamais (« pas encore relevée : relevé en cours »)', () => {
    for (const etat of ['actif', 'programme', null] as const) {
      expect(phraseDeLaSuite(etat)).not.toMatch(/pas encore relevée\s?:\s?relevé en cours/);
      expect(phraseSansEcole(etat)).not.toMatch(
        /relevé en cours.*programmé|programmé.*relevé en cours/,
      );
    }
  });
});
