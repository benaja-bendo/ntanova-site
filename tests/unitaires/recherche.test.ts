import { describe, expect, it } from 'vitest';
import {
  chercher,
  ecrireDistance,
  enumererLesFacettes,
  filtresAvances,
  facettesPubliques,
  lienFacette,
  ligneDe,
  lignesDeRecherche,
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
    numero: '123456',
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
  it('cherche aussi un nom entouré de parenthèses ou crochets', () => {
    expect(normaliser('[École ajoutée] (Centre)')).toBe('ecole ajoutee centre');
  });
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

  it('chaque valeur mène à la page « Écoles » filtrée (ticket 146 : les pages /formations/ y renvoient)', () => {
    expect(lienFacette({ facette: 'serie', valeur: 'c' })).toBe('/ecoles/?serie=c');
    expect(lienFacette({ facette: 'domaine', valeur: 'informatique' })).toBe(
      '/ecoles/?domaine=informatique',
    );
    expect(lienFacette({ facette: 'niveau', valeur: 'college' })).toBe('/ecoles/?niveau=college');
  });
});

describe('une école, en abrégé, dans le fichier de recherche', () => {
  it('garde l’adresse de la fiche, la zone, les cycles, les formations et la position', () => {
    const l = ligneDe(institut);
    expect(l).toMatchObject({
      i: 'ins',
      n: 'Institut Supérieur Ngoyo',
      u: '/ecoles/ins-123456/',
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
    // Le type (« privée ») se lit sur la fiche : la ligne d'une école l'écrit. Rien d'autre.
    expect(Object.keys(avecNumero).sort()).toEqual(['c', 'd', 'f', 'i', 'k', 'n', 'u', 'z']);
  });

  it('dit si l’école a été vue sur place ou déclarée par elle-même, et le jour de sa preuve la plus forte', () => {
    // La carte d'une école dit sa preuve datée (canevas validé le 08/11/2026, ticket 146) : le jour que la fiche publie déjà.
    const vue = ligneDe(ecole('v', 'V', { releveeLe: '2026-11-02T10:00:00Z' }));
    expect(vue.o).toBe(1);
    expect(vue.t).toBe('2026-11-02T10:00:00Z');
    const declaree = ligneDe(ecole('g', 'G', { origine: 'school', declareeLe: '2026-11-01' }));
    expect(declaree.g).toBe(1);
    expect(declaree.t).toBe('2026-11-01');
    const ajoutee = ligneDe(ecole('a', 'A'));
    expect(ajoutee).not.toHaveProperty('o');
    expect(ajoutee).not.toHaveProperty('g');
    expect(ajoutee).not.toHaveProperty('t');
  });

  it('un type « Pas indiqué » ou « Autre » n’est pas écrit', () => {
    expect(ligneDe(ecole('n', 'N', { typeEcole: 'non_indique' }))).not.toHaveProperty('k');
    expect(ligneDe(ecole('o', 'O', { typeEcole: 'autre' }))).not.toHaveProperty('k');
    expect(ligneDe(ecole('p', 'P', { typeEcole: 'publique' })).k).toBe('publique');
  });
});

describe('chercher', () => {
  it('un cycle choisi par sa lettre (M, P, C, L, T, S) trouve toutes les écoles qui l’enseignent', () => {
    expect(noms(chercher(LIGNES, { cycle: 'L' }))).toEqual(['mix', 'lyc']);
    expect(noms(chercher(LIGNES, { cycle: 'C' }))).toEqual(['lyc']);
    expect(noms(chercher(LIGNES, { cycle: 'S' }))).toEqual(['mix', 'ins']);
    expect(noms(chercher(LIGNES, { cycle: 'T' }))).toEqual([]);
  });

  it('la lettre S rassemble le supérieur et les autres formations ; M, la crèche et la maternelle', () => {
    const creche = ligneDe(ecole('cr', 'Crèche', { niveaux: ['creche'] }));
    const autre = ligneDe(ecole('af', 'Atelier', { niveaux: ['autre_formation'] }));
    expect(noms(chercher([creche, autre], { cycle: 'M' }))).toEqual(['cr']);
    expect(noms(chercher([creche, autre], { cycle: 'S' }))).toEqual(['af']);
  });

  it('un cycle et une série portent sur la même formation : « L » et série C, oui ; « S » et série C, non', () => {
    expect(noms(chercher(LIGNES, { cycle: 'L', serie: 'c' }))).toEqual(['mix', 'lyc']);
    expect(noms(chercher(LIGNES, { cycle: 'S', serie: 'c' }))).toEqual([]);
  });

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

  it('par type : seulement les écoles dont le type est connu et le même (ticket 146)', () => {
    const lignes = [
      ligneDe(ecole('pub', 'Pub', { typeEcole: 'publique' })),
      ligneDe(ecole('pri', 'Pri', { typeEcole: 'privee' })),
      ligneDe(ecole('inc', 'Inc', { typeEcole: 'non_indique' })),
    ];
    expect(noms(chercher(lignes, { type: 'publique' }))).toEqual(['pub']);
    expect(noms(chercher(lignes, { type: 'privee' }))).toEqual(['pri']);
    expect(noms(chercher(lignes, {})).sort()).toEqual(['inc', 'pri', 'pub']);
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

describe('les filtres avancés de la recherche (audit du 05/11/2026, D8)', () => {
  const facettes = facettesPubliques(ECOLES, DOMAINES);

  it('ne montrent que les facettes qui ont au moins une valeur dans les données construites', () => {
    expect(filtresAvances(facettes).map((f) => f.facette)).toEqual([
      'serie',
      'diplome',
      'domaine',
      'rythme',
    ]);
    // Deux écoles sans aucune formation : seuls les niveaux existent, aucun menu avancé n'est proposé.
    const sansFormation = facettesPubliques([ecole('a', 'A'), ecole('b', 'B')], DOMAINES);
    expect(sansFormation.map((f) => f.facette)).toEqual(['niveau']);
    expect(filtresAvances(sansFormation)).toEqual([]);
  });

  it('une seule facette présente : un seul filtre', () => {
    const rythme = facettesPubliques(
      [ecole('r', 'R', { formations: [formation({ titre: 'X', rythmes: ['soir'] })] })],
      DOMAINES,
    );
    expect(filtresAvances(rythme).map((f) => f.facette)).toEqual(['rythme']);
    expect(filtresAvances(rythme)[0]).toMatchObject({ titre: 'Rythme', tous: 'Tous' });
  });

  it('la page « par formation » ne promet que ce qu’elle montre', () => {
    expect(enumererLesFacettes(['niveau'])).toBe('niveau');
    expect(enumererLesFacettes(['niveau', 'serie'])).toBe('niveau et série du bac');
    expect(enumererLesFacettes(['niveau', 'serie', 'diplome', 'domaine', 'rythme'])).toBe(
      'niveau, série du bac, diplôme, domaine et rythme',
    );
    expect(enumererLesFacettes([])).toBe('');
  });
});

describe('les autres écritures des zones se cherchent (audit du 07/11/2026)', () => {
  const TIE = ['congo', 'pointe-noire', 'pointe-noire', 'tie-tie'];
  const zones = [
    { adresse: ['congo', 'pointe-noire'], alias: ['Pointe Noire ville'] },
    { adresse: ['congo', 'pointe-noire', 'pointe-noire'], alias: ['PN'] },
    { adresse: TIE, alias: ['Tietie', 'Tié Tié'] },
    { adresse: ['congo', 'pointe-noire', 'pointe-noire', 'ngoyo'], alias: [] },
  ];
  const dansTie = ecole('t', 'Collège Exemple');
  const ailleurs = ecole('a', 'Autre école', {
    adresse: ['congo', 'brazzaville', 'moungali'],
    divisionNoms: ['Congo', 'Brazzaville', 'Moungali'],
  });
  const lignes = lignesDeRecherche([dansTie, ailleurs], zones);

  it('l’école porte les écritures de toutes les zones où elle se trouve, sans les afficher', () => {
    expect(lignes[0]?.a).toBe('Pointe Noire ville PN Tietie Tié Tié');
    expect(lignes[0]?.d).toBe('Congo › Pointe-Noire › Tié-Tié');
  });

  it('le département et la ville de même nom partagent leur adresse : leurs écritures se rejoignent', () => {
    expect(lignes[0]?.a).toMatch(/^Pointe Noire ville PN /);
  });

  it('sans écriture, la ligne ne porte rien de plus (le fichier de recherche ne grossit pas)', () => {
    expect('a' in lignes[1]!).toBe(false);
    expect(lignesDeRecherche([dansTie], [])[0]).toEqual(ligneDe(dansTie));
  });

  it('« tietie » trouve les écoles de Tié-Tié, et seulement elles', () => {
    expect(chercher(lignes, { texte: 'tietie' }).map((r) => r.ligne.i)).toEqual(['t']);
    expect(chercher(lignes, { texte: 'collège pn' }).map((r) => r.ligne.i)).toEqual(['t']);
  });

  it('sans les écritures, la même recherche ne trouve rien', () => {
    expect(chercher([ligneDe(dansTie)], { texte: 'tietie' })).toEqual([]);
  });
});
