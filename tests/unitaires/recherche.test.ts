import { describe, expect, it } from 'vitest';
import {
  chercher,
  ecrireDistance,
  facettesPubliques,
  lienFacette,
  ligneDe,
  normaliser,
  type LigneRecherche,
} from '../../src/modele/recherche';
import type { DomainePublic, EcolePubliee, FormationPublique } from '../../src/modele/ports';

function ecole(id: string, nom: string, reste: Partial<EcolePubliee> = {}): EcolePubliee {
  return {
    id,
    institutionId: `i-${id}`,
    divisionId: 'tt',
    slug: id,
    nom,
    etiquette: null,
    arrondissement: 'tie-tie',
    adresse: ['congo', 'pointe-noire', 'tie-tie'],
    divisionNoms: ['Congo', 'Pointe-Noire', 'Tié-Tié'],
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

const formation = (f: Partial<FormationPublique> & { titre: string }): FormationPublique => ({
  cycle: 'lycee',
  domaine: null,
  serie: null,
  diplome: null,
  rythmes: [],
  ...f,
});

const DOMAINES: DomainePublic[] = [
  { slug: 'informatique', nom: 'Informatique', ordre: 10 },
  { slug: 'gestion', nom: 'Gestion', ordre: 20 },
  { slug: 'sante', nom: 'Santé', ordre: 30 },
];

const lycee = ecole('lyc', 'Lycée Exemple', {
  niveaux: ['college', 'lycee'],
  quartier: 'Mpita',
  repere: 'Près du marché',
  latitude: -4.79,
  longitude: 11.92,
  formations: [
    formation({ titre: 'Série C', serie: 'c', diplome: 'bac', rythmes: ['jour'] }),
    formation({ titre: 'Série F2', serie: 'f2', diplome: 'bac', rythmes: ['jour'] }),
  ],
});
const institut = ecole('ins', 'Institut Supérieur Ngoyo', {
  niveaux: ['superieur'],
  adresse: ['congo', 'pointe-noire', 'ngoyo'],
  divisionNoms: ['Congo', 'Pointe-Noire', 'Ngoyo'],
  latitude: -4.73,
  longitude: 11.85,
  etat: 'verifiee',
  formations: [
    formation({
      cycle: 'superieur',
      titre: 'BTS Informatique de gestion',
      domaine: { slug: 'informatique', nom: 'Informatique' },
      diplome: 'bts',
      rythmes: ['soir', 'weekend'],
    }),
    formation({
      cycle: 'superieur',
      titre: 'Licence Gestion',
      domaine: { slug: 'gestion', nom: 'Gestion' },
      diplome: 'licence',
      rythmes: ['jour'],
    }),
  ],
});
const mixte = ecole('mix', 'Centre Mixte', {
  niveaux: ['lycee', 'superieur'],
  formations: [
    formation({ titre: 'Série C', serie: 'c', diplome: 'bac', rythmes: ['jour'] }),
    formation({
      cycle: 'superieur',
      titre: 'BTS Gestion',
      domaine: { slug: 'gestion', nom: 'Gestion' },
      diplome: 'bts',
      rythmes: ['soir'],
    }),
  ],
});
const maternelle = ecole('mat', 'École Étoile du Matin', { niveaux: ['maternelle', 'primaire'] });
const ECOLES = [lycee, institut, mixte, maternelle];
const LIGNES = ECOLES.map(ligneDe);
const noms = (r: ReturnType<typeof chercher>) => r.map((x) => x.ligne.i);

describe('normaliser', () => {
  it('lit « Tié-Tié » comme « tie tie », sans accent, sans tiret, sans apostrophe', () => {
    expect(normaliser('Tié-Tié')).toBe('tie tie');
    expect(normaliser('  Lycée   de  l’Étoile ')).toBe('lycee de l etoile');
    expect(normaliser("M'Pita")).toBe('m pita');
    expect(normaliser('')).toBe('');
  });
});

describe('les facettes publiques', () => {
  const facettes = facettesPubliques(ECOLES, DOMAINES);
  const valeurs = (facette: string) =>
    facettes.filter((f) => f.facette === facette).map((f) => f.valeur);

  it('ne contiennent que des valeurs qui ont au moins une école, jamais une page vide', () => {
    expect(valeurs('niveau')).toEqual(['maternelle', 'primaire', 'college', 'lycee', 'superieur']);
    expect(valeurs('domaine')).toEqual(['informatique', 'gestion']);
    expect(valeurs('rythme')).toEqual(['jour', 'soir', 'weekend']);
    expect(valeurs('diplome')).toEqual(['bac', 'bts', 'licence']);
    for (const f of facettes) expect(f.ecoles.length).toBeGreaterThan(0);
  });

  it('une série F rassemble F, F1 à F4 ; la série C ne rassemble que C', () => {
    const f = facettes.find((x) => x.facette === 'serie' && x.valeur === 'f');
    expect(f?.ecoles.map((e) => e.id)).toEqual(['lyc']);
    expect(f?.libelle).toMatch(/toutes les variantes/i);
    const f2 = facettes.find((x) => x.facette === 'serie' && x.valeur === 'f2');
    expect(f2?.libelle).toBe('Série F2');
    const c = facettes.find((x) => x.facette === 'serie' && x.valeur === 'c');
    expect(c?.ecoles.map((e) => e.id).sort()).toEqual(['lyc', 'mix']);
  });

  it('chaque valeur a sa page', () => {
    expect(lienFacette({ facette: 'serie', valeur: 'c' })).toBe('/formations/serie/c/');
    expect(lienFacette({ facette: 'domaine', valeur: 'informatique' })).toBe(
      '/formations/domaine/informatique/',
    );
  });
});

describe('une école, en abrégé, dans le fichier de recherche', () => {
  it('garde l’adresse de la fiche, la zone, les cycles, les formations et la position', () => {
    const l = ligneDe(institut);
    expect(l).toMatchObject({
      i: 'ins',
      n: 'Institut Supérieur Ngoyo',
      u: '/ecoles/congo/pointe-noire/ngoyo/ins/',
      d: 'Congo › Pointe-Noire › Ngoyo',
      z: 'congo/pointe-noire/ngoyo',
      c: ['superieur'],
      la: -4.73,
      lo: 11.85,
      v: 1,
    });
    expect(l.f[0]).toEqual({
      c: 'superieur',
      t: 'BTS Informatique de gestion',
      d: 'bts',
      m: 'informatique',
      y: ['soir', 'weekend'],
    });
  });

  it('n’écrit rien de ce qui est vide : pas de position, pas de « vérifiée », pas de quartier', () => {
    const l = ligneDe(maternelle);
    expect(l).not.toHaveProperty('la');
    expect(l).not.toHaveProperty('lo');
    expect(l).not.toHaveProperty('v');
    expect(l).not.toHaveProperty('q');
    expect(l).not.toHaveProperty('r');
    expect(l).not.toHaveProperty('e');
  });

  it('ne publie ni numéro de téléphone, ni date de relevé, ni état interne', () => {
    const avecNumero = ligneDe(ecole('x', 'X', { numeroEnseigne: '242060000001' }));
    expect(JSON.stringify(avecNumero)).not.toContain('242060000001');
    expect(Object.keys(avecNumero).sort()).toEqual(['c', 'd', 'f', 'i', 'n', 'u', 'z']);
  });
});

describe('chercher', () => {
  it('par le nom, sans tenir compte des accents ni des majuscules', () => {
    expect(noms(chercher(LIGNES, { texte: 'etoile' }))).toEqual(['mat']);
    expect(noms(chercher(LIGNES, { texte: 'LYCÉE' }))).toEqual(['lyc']);
  });

  it('par le quartier, le repère, le nom de la zone et le titre d’une formation', () => {
    expect(noms(chercher(LIGNES, { texte: 'mpita' }))).toEqual(['lyc']);
    expect(noms(chercher(LIGNES, { texte: 'marché' }))).toEqual(['lyc']);
    expect(noms(chercher(LIGNES, { texte: 'ngoyo' }))).toEqual(['ins']);
    expect(noms(chercher(LIGNES, { texte: 'licence' }))).toEqual(['ins']);
  });

  it('un mot cherché est le début d’un mot de l’école : « tie » trouve « Tié-Tié », pas « quartier »', () => {
    const quartier = ligneDe(
      ecole('q', 'Groupe scolaire', {
        quartier: 'Quartier Exemple',
        divisionNoms: ['Congo', 'Pointe-Noire', 'Loandjili'],
      }),
    );
    const tieTie = ligneDe(
      ecole('t', 'Complexe', { divisionNoms: ['Congo', 'Pointe-Noire', 'Tié-Tié'] }),
    );
    expect(noms(chercher([quartier, tieTie], { texte: 'tie tie' }))).toEqual(['t']);
    expect(noms(chercher([quartier, tieTie], { texte: 'quart' }))).toEqual(['q']);
    // Le milieu d'un mot ne compte pas.
    expect(chercher([quartier, tieTie], { texte: 'artier' })).toEqual([]);
  });

  it('tous les mots doivent se trouver, dans n’importe quel ordre', () => {
    expect(noms(chercher(LIGNES, { texte: 'ngoyo institut' }))).toEqual(['ins']);
    expect(chercher(LIGNES, { texte: 'ngoyo lycée' })).toEqual([]);
  });

  it('sans critère, toutes les écoles, classées par nom', () => {
    expect(noms(chercher(LIGNES, {}))).toEqual(['mix', 'mat', 'ins', 'lyc']);
  });

  it('par niveau', () => {
    expect(noms(chercher(LIGNES, { niveau: 'superieur' }))).toEqual(['mix', 'ins']);
    expect(noms(chercher(LIGNES, { niveau: 'creche' }))).toEqual([]);
  });

  it('par zone : la zone et tout ce qu’elle contient, pas une zone au nom qui commence pareil', () => {
    expect(noms(chercher(LIGNES, { zone: 'congo/pointe-noire/ngoyo' }))).toEqual(['ins']);
    expect(noms(chercher(LIGNES, { zone: 'congo/pointe-noire' })).sort()).toEqual([
      'ins',
      'lyc',
      'mat',
      'mix',
    ]);
    expect(chercher(LIGNES, { zone: 'congo/pointe' })).toEqual([]);
    expect(chercher(LIGNES, { zone: 'congo/pointe-noire/ngo' })).toEqual([]);
  });

  it('par série, par diplôme, par domaine, par rythme', () => {
    expect(noms(chercher(LIGNES, { serie: 'c' }))).toEqual(['mix', 'lyc']);
    expect(noms(chercher(LIGNES, { diplome: 'licence' }))).toEqual(['ins']);
    expect(noms(chercher(LIGNES, { domaine: 'gestion' }))).toEqual(['mix', 'ins']);
    expect(noms(chercher(LIGNES, { rythme: 'weekend' }))).toEqual(['ins']);
  });

  it('« F » et « G » trouvent aussi les variantes ; « F1 » ne trouve pas F2', () => {
    expect(noms(chercher(LIGNES, { serie: 'f' }))).toEqual(['lyc']);
    expect(chercher(LIGNES, { serie: 'f1' })).toEqual([]);
    expect(noms(chercher(LIGNES, { serie: 'f2' }))).toEqual(['lyc']);
    expect(chercher(LIGNES, { serie: 'g' })).toEqual([]);
  });

  it('les critères de formation portent sur UNE MÊME formation', () => {
    // Le Centre Mixte a une série C du jour ET un BTS du soir, mais pas de série C du soir.
    expect(noms(chercher(LIGNES, { serie: 'c', rythme: 'jour' }))).toEqual(['mix', 'lyc']);
    expect(chercher(LIGNES, { serie: 'c', rythme: 'soir' })).toEqual([]);
    // BTS de gestion du soir : une seule formation les réunit.
    expect(noms(chercher(LIGNES, { diplome: 'bts', domaine: 'gestion', rythme: 'soir' }))).toEqual([
      'mix',
    ]);
    // Licence du soir : l'institut a une licence (du jour) et un BTS (du soir), pas les deux ensemble.
    expect(chercher(LIGNES, { diplome: 'licence', rythme: 'soir' })).toEqual([]);
  });

  it('le niveau choisi vaut aussi pour la formation : « supérieur » + « gestion » ne prend pas un lycée', () => {
    expect(noms(chercher(LIGNES, { niveau: 'superieur', domaine: 'gestion' }))).toEqual([
      'mix',
      'ins',
    ]);
    expect(chercher(LIGNES, { niveau: 'lycee', domaine: 'gestion' })).toEqual([]);
    expect(noms(chercher(LIGNES, { niveau: 'lycee', serie: 'c' }))).toEqual(['mix', 'lyc']);
  });

  it('autour de moi : classe par distance, la plus proche d’abord, les non situées à la fin', () => {
    const pres = { latitude: -4.79, longitude: 11.92 };
    const r = chercher(LIGNES, { pres });
    expect(noms(r)).toEqual(['lyc', 'ins', 'mix', 'mat']);
    expect(r[0]?.distance).toBeCloseTo(0, 0);
    expect(r[1]?.distance).toBeGreaterThan(5000);
    expect(r[2]?.distance).toBeNull();
    expect(r[3]?.distance).toBeNull();
  });

  it('avec un rayon, écarte les écoles plus loin et celles dont on ignore la position', () => {
    const pres = { latitude: -4.79, longitude: 11.92 };
    expect(noms(chercher(LIGNES, { pres, rayonM: 1000 }))).toEqual(['lyc']);
    expect(noms(chercher(LIGNES, { pres, rayonM: 50_000 }))).toEqual(['lyc', 'ins']);
  });

  it('sans position demandée, la distance est vide', () => {
    for (const r of chercher(LIGNES, {})) expect(r.distance).toBeNull();
  });

  it('un fichier vide ne casse rien', () => {
    const aucune: LigneRecherche[] = [];
    expect(chercher(aucune, { texte: 'x', serie: 'c' })).toEqual([]);
  });
});

describe('ecrireDistance', () => {
  it('arrondit aux dix mètres sous le kilomètre, puis passe en kilomètres avec une virgule', () => {
    expect(ecrireDistance(3)).toBe('10\u00a0m');
    expect(ecrireDistance(124)).toBe('120\u00a0m');
    expect(ecrireDistance(949)).toBe('950\u00a0m');
    expect(ecrireDistance(950)).toBe('1\u00a0km');
    expect(ecrireDistance(1234)).toBe('1,2\u00a0km');
    expect(ecrireDistance(3000)).toBe('3\u00a0km');
    expect(ecrireDistance(12_000)).toBe('12\u00a0km');
  });
});
