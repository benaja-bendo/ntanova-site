// « Toutes les villes » (refonte publique, lot 4, 24/11/2026) : les villes, leurs départements, leurs arrondissements et leurs
// nombres viennent de l'arbre et des seules écoles publiées ; un lieu sans fiche reste du texte ; une ville nouvelle n'a pas
// besoin d'un dessin. Et « À propos » compte comme elle.
import { describe, expect, it } from 'vitest';
import { villesDeLAccueil } from '../../src/modele/accueil';
import { construireArbre, ecolesSous } from '../../src/modele/geo-divisions';
import { enumeration, perimetreDeLAnnuaire } from '../../src/modele/perimetre';
import type { DivisionPublique, EcolePubliee } from '../../src/modele/ports';
import { LIEN_VILLES, pageDesVilles } from '../../src/modele/villes';

const division = (
  id: string,
  parentId: string | null,
  niveau: number,
  genre: DivisionPublique['genre'],
  nom: string,
  slug: string,
): DivisionPublique => ({
  id,
  parentId,
  niveau,
  genre,
  nom,
  slug,
  adresse: [],
  ordinal: null,
  alias: [],
  deploiement: null,
  position: null,
  contour: null,
  verifieeLe: null,
  ouverte: false,
});

let n = 0;
const ecole = (divisionId: string, reste: Partial<EcolePubliee> = {}): EcolePubliee => {
  n += 1;
  return {
    id: `e${n}`,
    institutionId: `i${n}`,
    divisionId,
    slug: `ecole-${n}`,
    numero: String(100000 + n),
    nom: `École ${n}`,
    etiquette: null,
    arrondissement: '',
    adresse: [],
    divisionNoms: [],
    quartier: null,
    typeEcole: 'privee',
    niveaux: ['primaire'],
    programme: null,
    formations: [],
    repere: null,
    numeroEnseigne: null,
    latitude: null,
    longitude: null,
    etat: 'relevee',
    verifieeLe: null,
    releveeLe: null,
    situeeLe: null,
    misAJourLe: '2026-11-02T10:00:00Z',
    ...reste,
  };
};

const LONG = 'Commune-de-démonstration-au-nom-particulièrement-long-et-sans-espace';
const DIVISIONS: DivisionPublique[] = [
  division('cg', null, 0, 'country', 'Congo', 'congo'),
  division('pn-dep', 'cg', 1, 'department', 'Pointe-Noire', 'pointe-noire'),
  division('pn', 'pn-dep', 2, 'city', 'Pointe-Noire', 'pointe-noire'),
  division('tz', 'pn-dep', 2, 'district', 'Tchiamba-Nzassi', 'tchiamba-nzassi'),
  division('lo', 'pn', 3, 'arrondissement', 'Loandjili', 'loandjili'),
  division('ng', 'pn', 3, 'arrondissement', 'Ngoyo', 'ngoyo'),
  division('bz-dep', 'cg', 1, 'department', 'Brazzaville', 'brazzaville'),
  division('bz', 'bz-dep', 2, 'city', 'Brazzaville', 'brazzaville'),
  division('ba', 'bz', 3, 'arrondissement', 'Bacongo', 'bacongo'),
  division('sa', 'cg', 1, 'department', 'Sangha', 'sangha'),
  division('ou', 'sa', 2, 'commune', 'Ouesso', 'ouesso'),
  division('ni', 'cg', 1, 'department', 'Niari', 'niari'),
  division('do', 'ni', 2, 'commune', 'Dolisie', 'dolisie'),
  division('cu', 'cg', 1, 'department', 'Cuvette', 'cuvette'),
  division('lg', 'cu', 2, 'commune', LONG, 'commune-longue'),
];

describe('« Toutes les villes »', () => {
  it('a son adresse', () => {
    expect(LIEN_VILLES).toBe('/villes/');
  });

  it('aucune école publiée : aucune ville avec fiche, tous les lieux connus en texte', () => {
    const page = pageDesVilles(construireArbre(DIVISIONS, []), DIVISIONS);
    expect(page.avecFiches).toEqual([]);
    expect(page.sansFiche.map((l) => l.nom)).toEqual([
      'Brazzaville',
      LONG,
      'Dolisie',
      'Ouesso',
      'Pointe-Noire',
      'Tchiamba-Nzassi',
    ]);
  });

  it('une seule école : sa ville, son département et son arrondissement, le reste sans lien', () => {
    const page = pageDesVilles(construireArbre(DIVISIONS, [ecole('lo')]), DIVISIONS);
    expect(page.avecFiches).toEqual([
      {
        nom: 'Pointe-Noire',
        lien: '/ecoles/pointe-noire/',
        total: 1,
        departement: 'Pointe-Noire',
        lieux: [{ nom: 'Loandjili', lien: '/ecoles/pointe-noire/loandjili/', total: 1 }],
      },
    ]);
    expect(page.sansFiche).toContainEqual({ nom: 'Tchiamba-Nzassi', departement: 'Pointe-Noire' });
    expect(page.sansFiche.map((l) => l.nom)).not.toContain('Pointe-Noire');
    // Un lieu sans fiche n'a jamais de lien.
    expect(JSON.stringify(page.sansFiche)).not.toContain('/ecoles/');
  });

  it('plusieurs villes : les nombres sont ceux de l’accueil et de la page du lieu', () => {
    const ecoles = [ecole('lo'), ecole('lo'), ecole('ng'), ecole('ba'), ecole('ou'), ecole('pn')];
    const arbre = construireArbre(DIVISIONS, ecoles);
    const page = pageDesVilles(arbre, DIVISIONS);
    expect(page.avecFiches.map((v) => [v.nom, v.total, v.departement])).toEqual([
      ['Brazzaville', 1, 'Brazzaville'],
      ['Ouesso', 1, 'Sangha'],
      ['Pointe-Noire', 4, 'Pointe-Noire'],
    ]);
    // Le même nombre que l'accueil et que la page du lieu (ses écoles, ce qu'il contient compris).
    const accueil = villesDeLAccueil(arbre);
    for (const v of page.avecFiches) {
      expect(accueil.find((a) => a.lien === v.lien)?.total).toBe(v.total);
      const lieu = arbre.tous.find((p) => p.division.nom === v.nom && p.chemin.length === 1)!;
      expect(ecolesSous(lieu).length).toBe(v.total);
    }
    // Une école posée sur la ville sans arrondissement compte dans la ville, pas dans un arrondissement.
    expect(page.avecFiches[2]?.lieux.map((l) => [l.nom, l.total])).toEqual([
      ['Loandjili', 2],
      ['Ngoyo', 1],
    ]);
    expect(page.sansFiche.map((l) => l.nom)).toEqual([LONG, 'Dolisie', 'Tchiamba-Nzassi']);
  });

  it('une ville nouvelle, sans dessin et au nom long, paraît dès sa première fiche', () => {
    const page = pageDesVilles(construireArbre(DIVISIONS, [ecole('lg')]), DIVISIONS);
    expect(page.avecFiches).toEqual([
      {
        nom: LONG,
        lien: '/ecoles/commune-longue/',
        total: 1,
        departement: 'Cuvette',
        lieux: [],
      },
    ]);
    expect(page.sansFiche.map((l) => l.nom)).not.toContain(LONG);
  });

  it('n’emporte que les écoles publiées : une école absente du catalogue n’ouvre aucune ville', () => {
    // Le catalogue public ne lit que les fiches publiées ; une école retirée n'y est plus, sa ville redevient du texte.
    const avant = pageDesVilles(construireArbre(DIVISIONS, [ecole('do')]), DIVISIONS);
    const apres = pageDesVilles(construireArbre(DIVISIONS, []), DIVISIONS);
    expect(avant.avecFiches.map((v) => v.nom)).toEqual(['Dolisie']);
    expect(apres.avecFiches).toEqual([]);
    expect(apres.sansFiche.map((l) => l.nom)).toContain('Dolisie');
  });
});

describe('le périmètre d’« À propos »', () => {
  it('compte les fiches, les villes et le supérieur depuis le catalogue, à zéro comme à un', () => {
    expect(perimetreDeLAnnuaire(construireArbre(DIVISIONS, []), [])).toEqual({
      fiches: 0,
      villes: [],
      superieur: 0,
    });
    const ecoles = [
      ecole('lo', { niveaux: ['superieur'] }),
      ecole('ou', { niveaux: ['lycee', 'superieur'] }),
      ecole('ba'),
    ];
    expect(perimetreDeLAnnuaire(construireArbre(DIVISIONS, ecoles), ecoles)).toEqual({
      fiches: 3,
      villes: ['Brazzaville', 'Ouesso', 'Pointe-Noire'],
      superieur: 2,
    });
  });

  it('dit une liste en français', () => {
    expect(enumeration([])).toBe('');
    expect(enumeration(['Ouesso'])).toBe('Ouesso');
    expect(enumeration(['Brazzaville', 'Ouesso', 'Pointe-Noire'])).toBe(
      'Brazzaville, Ouesso et Pointe-Noire',
    );
  });
});
