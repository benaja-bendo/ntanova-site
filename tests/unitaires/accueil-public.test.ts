import { describe, expect, it } from 'vitest';
import {
  arrondissementsCites,
  jourEtMois,
  niveauxDeLAccueil,
  profilsDeLAccueil,
  villesDeLAccueil,
  voirLesEcoles,
} from '../../src/modele/accueil';
import { construireArbre } from '../../src/modele/geo-divisions';
import type { DivisionPublique, EcolePubliee } from '../../src/modele/ports';

function division(
  id: string,
  parentId: string | null,
  niveau: number,
  genre: DivisionPublique['genre'],
  nom: string,
  slug: string,
): DivisionPublique {
  return {
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
  };
}

let n = 0;
function ecole(divisionId: string, reste: Partial<EcolePubliee> = {}): EcolePubliee {
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
}

/** Un petit Congo : deux villes confondues avec leur département, des arrondissements, une commune, un district vide. */
const DIVISIONS: DivisionPublique[] = [
  division('cg', null, 0, 'country', 'Congo', 'congo'),
  division('pn-dep', 'cg', 1, 'department', 'Pointe-Noire', 'pointe-noire'),
  division('pn', 'pn-dep', 2, 'city', 'Pointe-Noire', 'pointe-noire'),
  division('lo', 'pn', 3, 'arrondissement', 'Loandjili', 'loandjili'),
  division('ng', 'pn', 3, 'arrondissement', 'Ngoyo', 'ngoyo'),
  division('lu', 'pn', 3, 'arrondissement', 'Lumumba', 'lumumba'),
  division('tt', 'pn', 3, 'arrondissement', 'Tié-Tié', 'tie-tie'),
  division('bz-dep', 'cg', 1, 'department', 'Brazzaville', 'brazzaville'),
  division('bz', 'bz-dep', 2, 'city', 'Brazzaville', 'brazzaville'),
  division('ba', 'bz', 3, 'arrondissement', 'Bacongo', 'bacongo'),
  division('ma', 'bz', 3, 'arrondissement', 'Makélékélé', 'makelekele'),
  division('ni', 'cg', 1, 'department', 'Niari', 'niari'),
  division('do', 'ni', 2, 'city', 'Dolisie', 'dolisie'),
];

describe('« Où ? » : les villes de l’accueil', () => {
  it('les villes avec des fiches, par ordre alphabétique, et leurs arrondissements du plus fourni au moins fourni', () => {
    const ecoles = [
      ecole('lo'),
      ecole('lo'),
      ecole('lo'),
      ecole('ng'),
      ecole('lu'),
      ecole('ng'),
      ecole('ba'),
      ecole('ma'),
      ecole('ba'),
    ];
    const villes = villesDeLAccueil(construireArbre(DIVISIONS, ecoles));
    expect(villes.map((v) => [v.nom, v.total, v.lien])).toEqual([
      ['Brazzaville', 3, '/ecoles/brazzaville/'],
      ['Pointe-Noire', 6, '/ecoles/pointe-noire/'],
    ]);
    expect(villes[1]?.puces).toEqual([
      { nom: 'Loandjili', lien: '/ecoles/pointe-noire/loandjili/', total: 3 },
      { nom: 'Ngoyo', lien: '/ecoles/pointe-noire/ngoyo/', total: 2 },
      { nom: 'Lumumba', lien: '/ecoles/pointe-noire/lumumba/', total: 1 },
    ]);
    // Deux arrondissements à égalité : par nom.
    expect(villes[0]?.puces.map((p) => [p.nom, p.total])).toEqual([
      ['Bacongo', 2],
      ['Makélékélé', 1],
    ]);
  });

  it('un arrondissement sans fiche n’a pas de puce, une ville sans fiche n’a pas de carte, une troisième ville paraît d’elle-même', () => {
    const sansDolisie = villesDeLAccueil(construireArbre(DIVISIONS, [ecole('lo')]));
    expect(sansDolisie.map((v) => v.nom)).toEqual(['Pointe-Noire']);
    expect(sansDolisie[0]?.puces.map((p) => p.nom)).toEqual(['Loandjili']);

    const avecDolisie = villesDeLAccueil(construireArbre(DIVISIONS, [ecole('lo'), ecole('do')]));
    expect(avecDolisie.map((v) => [v.nom, v.total, v.puces.length])).toEqual([
      ['Dolisie', 1, 0],
      ['Pointe-Noire', 1, 1],
    ]);
  });

  it('aucune école publiée : aucune ville', () => {
    expect(villesDeLAccueil(construireArbre(DIVISIONS, []))).toEqual([]);
  });
});

describe('« Par niveau » (refonte, lot 1)', () => {
  it('les six cycles qui ont une école, dans l’ordre M, P, C, L, T, S, avec leur lien filtré', () => {
    const ecoles = [
      ecole('lo', { niveaux: ['creche', 'primaire'] }),
      ecole('lo', { niveaux: ['lycee', 'superieur'] }),
      ecole('lo', { niveaux: ['technique'] }),
    ];
    expect(niveauxDeLAccueil(ecoles)).toEqual([
      { lettre: 'M', mot: 'Maternelle', lien: '/ecoles/?niveau=M' },
      { lettre: 'P', mot: 'Primaire', lien: '/ecoles/?niveau=P' },
      { lettre: 'L', mot: 'Lycée', lien: '/ecoles/?niveau=L' },
      { lettre: 'T', mot: 'Technique', lien: '/ecoles/?niveau=T' },
      { lettre: 'S', mot: 'Supérieur', lien: '/ecoles/?niveau=S' },
    ]);
    expect(niveauxDeLAccueil([])).toEqual([]);
  });
});

describe('« S’orienter, à chaque étape » (refonte, lot 1)', () => {
  it('cinq situations comptées depuis le catalogue, chacune vers la liste qui lui répond', () => {
    const ecoles = [
      ecole('lo', { niveaux: ['creche'] }),
      ecole('lo', { niveaux: ['primaire', 'college'] }),
      ecole('lo', { niveaux: ['college', 'lycee'] }),
      ecole('lo', {
        niveaux: ['superieur'],
        formations: [{ rythmes: ['soir'] } as unknown as EcolePubliee['formations'][number]],
      }),
      ecole('lo', { niveaux: ['autre_formation'] }),
    ];
    expect(profilsDeLAccueil(ecoles).map((p) => [p.titre, p.lien, p.compte])).toEqual([
      ['Mon enfant entre à l’école', '/ecoles/?niveau=M,P', '2 écoles'],
      ['Après le CM2', '/ecoles/?niveau=C', '2 écoles'],
      ['En 3e, ou j’ai le BEPC', '/ecoles/?niveau=L', '1 école'],
      ['Au lycée, ou j’ai le bac', '/ecoles/?niveau=S', '2 écoles'],
      ['Je travaille, je veux me former', '/ecoles/?rythme=soir', '1 école'],
    ]);
  });

  it('jamais une situation vide ; le week-end quand personne n’a de cours du soir', () => {
    const ecoles = [
      ecole('lo', {
        niveaux: ['lycee'],
        formations: [{ rythmes: ['weekend'] } as unknown as EcolePubliee['formations'][number]],
      }),
    ];
    expect(profilsDeLAccueil(ecoles).map((p) => [p.detail, p.lien])).toEqual([
      ['Le lycée et ses séries', '/ecoles/?niveau=L'],
      ['Les cours du week-end', '/ecoles/?rythme=weekend'],
    ]);
    expect(profilsDeLAccueil([])).toEqual([]);
  });
});

describe('les mots de l’accueil', () => {
  it('le lien de « Trouver une école » dit le nombre de l’annuaire, jamais « toutes les écoles »', () => {
    expect(voirLesEcoles(84)).toBe('Voir les 84 écoles');
    expect(voirLesEcoles(1234)).toBe('Voir les 1\u202f234 écoles');
    expect(voirLesEcoles(1)).toBe('Voir l’école');
    expect(voirLesEcoles(0)).toBe('Voir la liste');
  });

  it('les arrondissements cités, le jour court de l’annuaire', () => {
    const villes = villesDeLAccueil(
      construireArbre(DIVISIONS, [ecole('lo'), ecole('lo'), ecole('ng'), ecole('lu'), ecole('ba')]),
    );
    expect(arrondissementsCites(villes[1]!)).toBe('Loandjili, Lumumba…');
    expect(arrondissementsCites(villes[0]!)).toBe('Bacongo');
    expect(arrondissementsCites({ puces: [] })).toBe('');
    expect(jourEtMois('2026-11-24')).toBe('24/11');
  });

  it('une ville a son dessin s’il existe ; une ville nouvelle, aucun', () => {
    const villes = villesDeLAccueil(construireArbre(DIVISIONS, [ecole('lo'), ecole('do')]));
    expect(villes.map((v) => [v.nom, v.dessin])).toEqual([
      ['Dolisie', null],
      ['Pointe-Noire', '/dessins/ville-pointe-noire.svg'],
    ]);
  });
});
