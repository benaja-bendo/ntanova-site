import { describe, expect, it } from 'vitest';
import { lireCsv, lireImportation } from '../../src/modele/import-ecoles';

const ENTETE =
  'reference;nom;genre;etiquette;division;quartier;repere;numero;latitude;longitude;programme;cycles;formations';

describe('lireCsv', () => {
  it('reconnaît le point-virgule ou la virgule sur la première ligne', () => {
    expect(lireCsv('a;b\n1;2')).toEqual([{ a: '1', b: '2' }]);
    expect(lireCsv('a,b\n1,2')).toEqual([{ a: '1', b: '2' }]);
  });

  it('ignore le BOM d’Excel, les retours Windows et les lignes vides', () => {
    const lignes = lireCsv('\uFEFFnom;genre\r\nÉcole A;privee\r\n\r\n;\r\nÉcole B;publique\r\n');
    expect(lignes).toEqual([
      { nom: 'École A', genre: 'privee' },
      { nom: 'École B', genre: 'publique' },
    ]);
  });

  it('lit les guillemets, les guillemets doublés et les retours à la ligne dans un champ', () => {
    const lignes = lireCsv(
      'nom;repere\n"Collège; de la Paix";"Près du ""marché""\nface à la poste"',
    );
    expect(lignes).toEqual([
      { nom: 'Collège; de la Paix', repere: 'Près du "marché"\nface à la poste' },
    ]);
  });

  it('range les titres de colonnes sans accent ni majuscule', () => {
    expect(lireCsv('Numéro enseigne;Latitude\n1;2')).toEqual([
      { numero_enseigne: '1', latitude: '2' },
    ]);
  });
});

describe('importer des écoles depuis un CSV', () => {
  it('lit une école complète : numéro rangé, virgule décimale, niveaux et formations', () => {
    const lecture = lireImportation(
      [
        ENTETE,
        'ETB-001;Complexe scolaire X;privée;;congo.pointe_noire.pointe_noire.tie_tie;Mpita;Près du marché;06 123 45 67;-4,79105;11,925;;maternelle|primaire;lycee:Série C:sciences-technologies:c:bac:jour+soir',
      ].join('\n'),
    );
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.lignes).toEqual([2]);
    expect(lecture.entrees).toEqual([
      {
        reference: 'ETB-001',
        nom: 'Complexe scolaire X',
        genre: 'privee',
        campus: [
          {
            etiquette: null,
            division: 'congo.pointe_noire.pointe_noire.tie_tie',
            quartier: 'Mpita',
            repere: 'Près du marché',
            numeroEnseigne: '242061234567',
            position: { latitude: -4.79105, longitude: 11.925 },
            programme: null,
            cycles: [
              { cycle: 'maternelle', formations: [] },
              { cycle: 'primaire', formations: [] },
              {
                cycle: 'lycee',
                formations: [
                  {
                    titre: 'Série C',
                    domaine: 'sciences-technologies',
                    serie: 'c',
                    diplome: 'bac',
                    rythmes: ['jour', 'soir'],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('des lignes de même référence sont les campus d’une même institution', () => {
    const lecture = lireImportation(
      [
        'reference;nom;etiquette;division;cycles',
        'ETB-002;Groupe scolaire Y;Campus A;congo.pointe_noire.pointe_noire.tie_tie;primaire',
        'ETB-003;Autre école;;;primaire',
        'ETB-002;Groupe scolaire Y;Campus B;congo.pointe_noire.pointe_noire.loandjili;college|lycee',
      ].join('\n'),
    );
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.entrees.map((e) => e.nom)).toEqual(['Groupe scolaire Y', 'Autre école']);
    expect(lecture.entrees[0]?.campus.map((c) => c.etiquette)).toEqual(['Campus A', 'Campus B']);
    // Le numéro de ligne de chaque école est celui de sa première ligne.
    expect(lecture.lignes).toEqual([2, 3]);
  });

  it('comprend les titres de colonnes d’un tableur : name, type, tel, lat, lng, niveaux', () => {
    const lecture = lireImportation(
      'ref,name,type,tel,lat,lng,niveaux\nETB-004,Collège Z,public,242060000001,-4.7,11.8,college',
    );
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.entrees[0]).toMatchObject({
      reference: 'ETB-004',
      nom: 'Collège Z',
      genre: 'publique',
    });
    expect(lecture.entrees[0]?.campus[0]).toMatchObject({
      numeroEnseigne: '242060000001',
      position: { latitude: -4.7, longitude: 11.8 },
      cycles: [{ cycle: 'college', formations: [] }],
    });
  });

  it('un genre absent devient « pas indiqué » ; un nom de cycle courant est compris', () => {
    const lecture = lireImportation(
      'nom;cycles\nÉcole A;garderie|Université|Technique ou professionnel',
    );
    expect(lecture.entrees[0]?.genre).toBe('non_indique');
    expect(lecture.entrees[0]?.campus[0]?.cycles.map((c) => c.cycle)).toEqual([
      'creche',
      'superieur',
      'technique',
    ]);
  });

  it('écarte chaque ligne fausse avec son numéro et sa raison, et garde les autres', () => {
    const lecture = lireImportation(
      [
        'reference;nom;genre;numero;latitude;longitude;cycles;formations',
        'ETB-010;;privee;;;;primaire;',
        'ETB-011;École A;étrange;;;;primaire;',
        'ETB-012;École B;privee;12;;;primaire;',
        'ETB-013;École C;privee;;-4.79;;primaire;',
        'ETB-014;École D;privee;;;;pre-primaire;',
        'ETB-015;École E;privee;;abc;11.9;primaire;',
        'ETB-016;École OK;privee;;;;primaire;',
      ].join('\n'),
    );
    expect(lecture.entrees.map((e) => e.nom)).toEqual(['École OK']);
    expect(lecture.lignes).toEqual([8]);
    const parLigne = new Map(lecture.erreurs.map((e) => [e.ligne, e]));
    expect(parLigne.get(2)?.message).toMatch(/nom est obligatoire/);
    expect(parLigne.get(3)?.message).toMatch(/genre inconnu : « étrange »/);
    expect(parLigne.get(4)?.message).toMatch(/numéro incomplet \(« 12 »\)/);
    expect(parLigne.get(5)?.message).toMatch(/latitude et la longitude vont ensemble/);
    expect(parLigne.get(6)?.message).toMatch(/cycle inconnu : « pre-primaire »/);
    expect(parLigne.get(7)?.message).toMatch(/latitude illisible/);
    expect(parLigne.get(3)?.nom).toBe('École A');
    expect(lecture.erreurs).toHaveLength(6);
  });

  it('dit ce qui ne va pas dans une formation, sans l’accepter à moitié', () => {
    const erreur = (formations: string) =>
      lireImportation(`nom;formations\nÉcole;${formations}`).erreurs[0]?.message;
    expect(erreur('lycee:Série Z::z')).toMatch(/série inconnue : « z »/);
    expect(erreur('superieur:BTS:::magicien')).toMatch(/diplôme inconnu : « magicien »/);
    expect(erreur('superieur:BTS:::bts:matin')).toMatch(/rythme inconnu : « matin »/);
    expect(erreur('lycee::')).toMatch(/formation sans titre dans le cycle « lycee »/);
    expect(erreur('primairee:Truc')).toMatch(/cycle inconnu dans les formations/);
    expect(
      lireImportation('nom;formations\nÉcole;superieur:BTS Gestion:gestion::bts:soir+week-end')
        .erreurs,
    ).toEqual([]);
  });

  it('plusieurs formations dans un même cycle, séparées par une barre', () => {
    const lecture = lireImportation(
      'nom;formations\nInstitut;superieur:BTS Gestion:gestion::bts:soir|superieur:Licence Droit:::licence:jour',
    );
    const cycle = lecture.entrees[0]?.campus[0]?.cycles[0];
    expect(cycle?.cycle).toBe('superieur');
    expect(cycle?.formations.map((f) => f.titre)).toEqual(['BTS Gestion', 'Licence Droit']);
    expect(cycle?.formations[1]).toMatchObject({ domaine: null, serie: null, diplome: 'licence' });
  });
});

describe('importer des écoles depuis un JSON', () => {
  const exemple = {
    reference: 'ETB-020',
    nom: 'Collège Z',
    genre: 'publique',
    campus: [
      {
        etiquette: null,
        division: 'congo.pointe_noire.pointe_noire.ngoyo',
        numeroEnseigne: '06 123 45 67',
        position: { latitude: -4.73, longitude: 11.85 },
        cycles: [
          'college',
          { cycle: 'lycee', formations: [{ titre: 'Série D', serie: 'd', diplome: 'bac' }] },
        ],
      },
    ],
  };

  it('lit une liste, avec des cycles écrits seuls ou avec leurs formations', () => {
    const lecture = lireImportation(JSON.stringify([exemple]));
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.entrees).toEqual([
      {
        reference: 'ETB-020',
        nom: 'Collège Z',
        genre: 'publique',
        campus: [
          {
            etiquette: null,
            division: 'congo.pointe_noire.pointe_noire.ngoyo',
            quartier: null,
            repere: null,
            numeroEnseigne: '242061234567',
            position: { latitude: -4.73, longitude: 11.85 },
            programme: null,
            cycles: [
              { cycle: 'college', formations: [] },
              {
                cycle: 'lycee',
                formations: [
                  { titre: 'Série D', domaine: null, serie: 'd', diplome: 'bac', rythmes: [] },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it('accepte aussi { "ecoles": [ … ] } et le BOM d’un éditeur', () => {
    const lecture = lireImportation(`\uFEFF${JSON.stringify({ ecoles: [exemple] })}`);
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.entrees).toHaveLength(1);
  });

  it('un JSON illisible, ou qui n’est pas une liste, est dit en une phrase', () => {
    expect(lireImportation('[{ "nom": ').erreurs[0]?.message).toMatch(/illisible/);
    expect(lireImportation('{"nom": "x"}').erreurs[0]?.message).toMatch(/liste d’écoles/);
    expect(lireImportation('{"nom": "x"}').entrees).toEqual([]);
  });

  it('écarte une école fausse avec le chemin de la faute, et garde les bonnes', () => {
    const lecture = lireImportation(
      JSON.stringify([
        { nom: 'A', genre: 'bizarre', campus: [{}] },
        { nom: 'B', campus: [] },
        { nom: 'C', campus: [{ numeroEnseigne: '12' }] },
        { nom: 'D', campus: [{ position: { latitude: 120, longitude: 11 } }] },
        { campus: [{}] },
        exemple,
      ]),
    );
    expect(lecture.entrees.map((e) => e.nom)).toEqual(['Collège Z']);
    expect(lecture.lignes).toEqual([6]);
    const parLigne = new Map(lecture.erreurs.map((e) => [e.ligne, e]));
    expect(parLigne.get(1)?.message).toMatch(/^genre/);
    expect(parLigne.get(1)?.nom).toBe('A');
    expect(parLigne.get(2)?.message).toMatch(/au moins un campus/);
    expect(parLigne.get(3)?.message).toMatch(/numéro incomplet/);
    expect(parLigne.get(4)?.message).toMatch(/campus › 0 › position › latitude/);
    expect(parLigne.get(5)?.nom).toBeNull();
    expect(lecture.erreurs).toHaveLength(5);
  });

  it('un fichier vide est refusé en une phrase', () => {
    expect(lireImportation('   \n ').erreurs[0]?.message).toBe('le fichier est vide');
    expect(lireImportation('').entrees).toEqual([]);
  });
});

describe('les domaines de formation connus', () => {
  const avecDomaine = (domaine: string) =>
    `reference;nom;formations\nETB-1;Institut;superieur:BTS Gestion:${domaine}::bts:soir`;

  it('un domaine inconnu est une erreur, pas une formation sans domaine', () => {
    const lecture = lireImportation(avecDomaine('btp'), { domaines: ['gestion', 'informatique'] });
    expect(lecture.entrees).toEqual([]);
    expect(lecture.erreurs[0]).toMatchObject({ ligne: 2, nom: 'Institut' });
    expect(lecture.erreurs[0]?.message).toMatch(/domaine inconnu : « btp »/);
  });

  it('un domaine connu, ou une formation sans domaine, passe ; sans liste, rien n’est contrôlé', () => {
    expect(lireImportation(avecDomaine('gestion'), { domaines: ['gestion'] }).entrees).toHaveLength(
      1,
    );
    expect(lireImportation(avecDomaine(''), { domaines: ['gestion'] }).entrees).toHaveLength(1);
    expect(lireImportation(avecDomaine('btp')).entrees).toHaveLength(1);
  });

  it('les numéros de ligne restent justes quand une école est écartée avant les autres', () => {
    const lecture = lireImportation(
      [
        'reference;nom;formations',
        'ETB-1;Mauvaise;superieur:BTS:btp::bts:soir',
        'ETB-2;Bonne;superieur:BTS:gestion::bts:soir',
      ].join('\n'),
      { domaines: ['gestion'] },
    );
    expect(lecture.entrees.map((e) => e.nom)).toEqual(['Bonne']);
    expect(lecture.lignes).toEqual([3]);
    expect(lecture.erreurs.map((e) => e.ligne)).toEqual([2]);
  });
});
