import { describe, expect, it } from 'vitest';
import {
  cheminLisible,
  compterEcoles,
  construireArbre,
  deLieu,
  ecolesSous,
  lienDivision,
  lienEcole,
  lieuAvecPreposition,
  nomAffiche,
  phraseDeCompte,
  sansRepetition,
} from '../../src/modele/geo-divisions';
import type { DivisionPublique, EcolePubliee } from '../../src/modele/ports';

type Genre = DivisionPublique['genre'];

function division(
  id: string,
  parentId: string | null,
  niveau: number,
  genre: Genre,
  nom: string,
  slug: string,
  reste: Partial<DivisionPublique> = {},
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
    ...reste,
  };
}

function ecole(id: string, divisionId: string, nom: string, reste: Partial<EcolePubliee> = {}) {
  return {
    id,
    institutionId: `i-${id}`,
    divisionId,
    slug: nom
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-'),
    nom,
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
  } satisfies EcolePubliee;
}

/** Un petit Congo : un département et une ville de même nom, trois arrondissements, un quartier, un autre département. */
const DIVISIONS: DivisionPublique[] = [
  division('cg', null, 0, 'country', 'Congo', 'congo'),
  division('pn-dep', 'cg', 1, 'department', 'Pointe-Noire', 'pointe-noire'),
  division('pn', 'pn-dep', 2, 'city', 'Pointe-Noire', 'pointe-noire'),
  division('tt', 'pn', 3, 'arrondissement', 'Tié-Tié', 'tie-tie', { ordinal: 3, ouverte: true }),
  division('ng', 'pn', 3, 'arrondissement', 'Ngoyo', 'ngoyo', { ordinal: 6 }),
  division('lo', 'pn', 3, 'arrondissement', 'Loandjili', 'loandjili', { ordinal: 5 }),
  division('mm', 'lo', 4, 'quarter', 'Mongo-Mpoukou', 'mongo-mpoukou'),
  division('ni', 'cg', 1, 'department', 'Niari', 'niari'),
  division('do', 'ni', 2, 'city', 'Dolisie', 'dolisie'),
];

describe('les adresses publiques', () => {
  it('une adresse ne répète pas une ville qui porte le nom de son département', () => {
    expect(sansRepetition(['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'])).toEqual([
      'congo',
      'pointe-noire',
      'tie-tie',
    ]);
    // Seules les répétitions qui se suivent sont ôtées.
    expect(sansRepetition(['a', 'b', 'a'])).toEqual(['a', 'b', 'a']);
    expect(sansRepetition([])).toEqual([]);
  });

  it('la zone et la fiche ont leur adresse, du pays au bout', () => {
    const adresse = ['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'];
    expect(lienDivision(adresse)).toBe('/ecoles/congo/pointe-noire/tie-tie/');
    expect(lienEcole({ adresse, slug: 'complexe-exemple' })).toBe(
      '/ecoles/congo/pointe-noire/tie-tie/complexe-exemple/',
    );
  });

  it('« Les écoles du Congo-Brazzaville », de Pointe-Noire, d’Owando : le complément d’un lieu (ticket 146)', () => {
    expect(deLieu('Congo', 0)).toBe('du Congo-Brazzaville');
    expect(deLieu('Pointe-Noire', 2)).toBe('de Pointe-Noire');
    expect(deLieu('Owando', 2)).toBe('d’Owando');
    expect(deLieu('Éboué', 4)).toBe('d’Éboué');
  });

  it('le fil d’Ariane lisible ne répète pas non plus le nom', () => {
    expect(cheminLisible('tt', DIVISIONS)).toBe('Congo › Pointe-Noire › Tié-Tié');
    expect(cheminLisible('cg', DIVISIONS)).toBe('Congo');
    expect(cheminLisible('inconnu', DIVISIONS)).toBe('');
  });

  it('« 1 école », « 3 écoles », « 0 école » au pluriel seulement à partir de deux', () => {
    expect(compterEcoles(1)).toBe('1 école');
    expect(compterEcoles(3)).toBe('3 écoles');
    expect(compterEcoles(0)).toBe('0 écoles');
  });
});

describe('l’arbre des zones du site public', () => {
  const ecoles = [
    ecole('e1', 'tt', 'Complexe Zéta'),
    ecole('e2', 'tt', 'Collège Alpha'),
    ecole('e3', 'tt', 'Collège Alpha', { etiquette: 'Campus du quartier' }),
    ecole('e4', 'mm', 'Institut Oméga'),
    ecole('e5', 'do', 'Lycée de Dolisie'),
  ];
  const arbre = construireArbre(DIVISIONS, ecoles);

  it('confond la ville et le département de même nom : une seule page, portée par la ville', () => {
    const ville = arbre.parAdresse.get('congo/pointe-noire');
    expect(ville?.division.id).toBe('pn');
    expect(ville?.fusionnees.map((d) => d.id)).toEqual(['pn-dep']);
    // L'ancienne division se retrouve par son identifiant.
    expect(arbre.parId.get('pn-dep')).toBe(ville);
    expect(arbre.parId.get('pn')).toBe(ville);
    expect(ville?.noms).toEqual(['Congo', 'Pointe-Noire']);
    expect(ville?.parent?.division.id).toBe('cg');
  });

  it('range chaque campus dans sa division, et compte ceux qui sont dessous', () => {
    const tieTie = arbre.parAdresse.get('congo/pointe-noire/tie-tie');
    expect(tieTie?.ecoles).toHaveLength(3);
    const ville = arbre.parAdresse.get('congo/pointe-noire');
    expect(ville?.ecoles).toHaveLength(0);
    expect(ville ? ecolesSous(ville).map((e) => e.id) : []).toEqual(
      expect.arrayContaining(['e1', 'e2', 'e3', 'e4']),
    );
    expect(ville ? ecolesSous(ville) : []).toHaveLength(4);
  });

  it('classe les écoles par nom, puis par implantation, sans tenir compte des accents', () => {
    const tieTie = arbre.parAdresse.get('congo/pointe-noire/tie-tie');
    expect(tieTie?.ecoles.map((e) => e.id)).toEqual(['e2', 'e3', 'e1']);
  });

  it('une zone sans école, qui n’est pas ouverte, n’a pas de page ; un quartier avec école fait venir sa zone', () => {
    // Ngoyo : ni école, ni relevé ouvert.
    expect(arbre.parAdresse.has('congo/pointe-noire/ngoyo')).toBe(false);
    // Mongo-Mpoukou a une école : Loandjili, au-dessus, a donc une page.
    expect(arbre.parAdresse.has('congo/pointe-noire/loandjili')).toBe(true);
    expect(arbre.parAdresse.has('congo/pointe-noire/loandjili/mongo-mpoukou')).toBe(true);
    // Le Niari a la ville de Dolisie, qui a une école.
    expect(arbre.parAdresse.has('congo/niari/dolisie')).toBe(true);
    expect(arbre.parAdresse.has('congo/niari')).toBe(true);
  });

  it('une zone ouverte aux relais garde une page, même vide : « relevé en cours »', () => {
    const vide = construireArbre(DIVISIONS, []);
    const tieTie = vide.parAdresse.get('congo/pointe-noire/tie-tie');
    expect(tieTie).toBeDefined();
    expect(tieTie?.ecoles).toEqual([]);
    expect(tieTie?.releve).toBe(true);
    // Les zones fermées sans école sont absentes ; la ville au-dessus de la zone ouverte reste.
    expect(vide.parAdresse.has('congo/pointe-noire/loandjili')).toBe(false);
    expect(vide.parAdresse.has('congo/pointe-noire')).toBe(true);
    expect(vide.parAdresse.has('congo/niari')).toBe(false);
  });

  it('une zone qui a son état public a sa page, même sans école ni relevé ouvert (Brazzaville, déploiement programmé)', () => {
    const avecBrazzaville: DivisionPublique[] = [
      ...DIVISIONS,
      division('bz-dep', 'cg', 1, 'department', 'Brazzaville', 'brazzaville'),
      division('bz', 'bz-dep', 2, 'city', 'Brazzaville', 'brazzaville', {
        deploiement: 'programme',
      }),
    ];
    const a = construireArbre(avecBrazzaville, []);
    const page = a.parAdresse.get('congo/brazzaville');
    // Le lien de la carte (`/ecoles/congo/brazzaville/`) mène à une vraie page, portée par la ville.
    expect(page?.division.id).toBe('bz');
    expect(page?.ecoles).toEqual([]);
    expect(lienDivision(page!.adresse)).toBe('/ecoles/congo/brazzaville/');
    expect(a.parAdresse.get('congo')?.enfants.map((p) => p.division.slug)).toContain('brazzaville');
    // Sans état, sans école et sans relevé ouvert, la ville voisine n'en a toujours pas.
    expect(a.parAdresse.has('congo/niari/dolisie')).toBe(false);
  });

  it('l’état du département de même nom compte aussi pour la page de la ville', () => {
    const dep: DivisionPublique[] = [
      division('cg', null, 0, 'country', 'Congo', 'congo'),
      division('bz-dep', 'cg', 1, 'department', 'Brazzaville', 'brazzaville', {
        deploiement: 'programme',
      }),
      division('bz', 'bz-dep', 2, 'city', 'Brazzaville', 'brazzaville'),
    ];
    expect(construireArbre(dep, []).parAdresse.has('congo/brazzaville')).toBe(true);
  });

  it('ouvrir un pays entier ne crée pas la page de chacune de ses villes', () => {
    const paysOuvert = DIVISIONS.map((d) => (d.id === 'cg' ? { ...d, ouverte: true } : d));
    const a = construireArbre(paysOuvert, []);
    expect(a.parAdresse.has('congo')).toBe(true);
    expect(a.parAdresse.get('congo')?.releve).toBe(true);
    expect(a.parAdresse.has('congo/niari')).toBe(false);
    expect(a.parAdresse.has('congo/pointe-noire/loandjili')).toBe(false);
  });

  it('range les zones du pays au quartier, par numéro d’ordre puis par nom', () => {
    const niveaux = arbre.tous.map((p) => p.division.niveau);
    expect(niveaux).toEqual([...niveaux].sort((a, b) => a - b));
    const ville = arbre.parAdresse.get('congo/pointe-noire');
    // Tié-Tié (3e) avant Loandjili (5e).
    expect(ville?.enfants.map((p) => p.division.nom)).toEqual(['Tié-Tié', 'Loandjili']);
    // Une seule racine : le pays.
    expect(arbre.racines.map((p) => p.division.id)).toEqual(['cg']);
  });

  it('le relevé est « en cours » dans une zone dont un parent est ouvert', () => {
    const paysOuvert = DIVISIONS.map((d) => (d.id === 'lo' ? { ...d, ouverte: true } : d));
    const a = construireArbre(paysOuvert, [ecole('e4', 'mm', 'Institut Oméga')]);
    expect(a.parAdresse.get('congo/pointe-noire/loandjili/mongo-mpoukou')?.releve).toBe(true);
    expect(a.parAdresse.get('congo/niari')).toBeUndefined();
  });

  it('un campus dans une division inconnue est écarté sans casser la construction', () => {
    const a = construireArbre(DIVISIONS, [ecole('x', 'nulle-part', 'Perdue')]);
    expect(a.tous.flatMap((p) => p.ecoles)).toEqual([]);
  });

  it('la liste de toutes les pages ne contient que des pages qui ont un sens', () => {
    for (const page of arbre.tous) {
      const sens =
        page.ecoles.length > 0 || page.division.ouverte || page.enfants.length > 0 || page.releve;
      expect(sens, page.adresse.join('/')).toBe(true);
    }
  });
});

describe('les mots d’une zone', () => {
  it('le compteur se dit comme celui de l’accueil : « 2 écoles, dont 2 vues sur place et 1 confirmée par la direction »', () => {
    expect(phraseDeCompte(2, 0, 0)).toBe('2 écoles');
    expect(phraseDeCompte(1, 1, 0)).toBe('1 école, dont 1 vue sur place');
    expect(phraseDeCompte(2, 2, 0)).toBe('2 écoles, dont 2 vues sur place');
    expect(phraseDeCompte(3, 0, 1)).toBe('3 écoles, dont 1 confirmée par la direction');
    expect(phraseDeCompte(3, 2, 2)).toBe(
      '3 écoles, dont 2 vues sur place et 2 confirmées par la direction',
    );
  });
  it('le pays s’appelle « Congo-Brazzaville », jamais « à Congo »', () => {
    expect(nomAffiche('Congo', 0)).toBe('Congo-Brazzaville');
    expect(nomAffiche('Pointe-Noire', 2)).toBe('Pointe-Noire');
    expect(lieuAvecPreposition('Congo', 0)).toBe('au Congo-Brazzaville');
    expect(lieuAvecPreposition('Pointe-Noire', 2)).toBe('à Pointe-Noire');
    expect(lieuAvecPreposition('Ngoyo', 3)).toBe('à Ngoyo');
  });
});
