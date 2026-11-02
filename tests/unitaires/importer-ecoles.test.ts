import { describe, expect, it } from 'vitest';
import { lireCsv, niveauxDe, typeDe, versEcoles, versEntrees } from '../../outils/importer-ecoles';
import { lireImportation } from '../../src/modele/import-ecoles';

// Des écoles fictives : aucune donnée réelle dans le dépôt.
const csv = `ID établissement,Nom,Ville,Quartier,Statut,Niveaux,Notes,Adresse ou repère,Téléphone de l'enseigne
ETB-901,"[École A] (nom tiré d'un fichier, à confirmer)",Pointe-Noire,,Privé (probable),"Primaire, collège, lycée","Note d'entretien, jamais importée",,
ETB-902,École à confirmer,Pointe-Noire,,,,,,
ETB-903,[Université B],Pointe-Noire,,Enseignement supérieur : HORS CIBLE,Supérieur,,,
ETB-904,[École C],À confirmer,,Privé,Primaire,,,
ETB-905,"[École D d'Ngoyo]",Pointe-Noire,"Ngoyo (arrêt ""[Arrêt]"")",Privé,"Crèche, maternelle, primaire, collège (pas de lycée)",,"Ngoyo, arrêt [Arrêt]",06 000 00 01 ; 06 000 00 02
ETB-906,[École E],Pointe-Noire,,Communautaire,"Garderie, maternelle",,,
`;

describe('l’import des écoles connues par les entretiens', () => {
  const { ecoles, ecartees } = versEcoles(lireCsv(csv));

  it('garde toutes les écoles nommées de Pointe-Noire, du supérieur à la crèche', () => {
    expect(ecoles.map((e) => e.reference)).toEqual(['ETB-901', 'ETB-903', 'ETB-905', 'ETB-906']);
    expect(ecartees).toEqual([
      { reference: 'ETB-902', raison: 'nom inconnu' },
      { reference: 'ETB-904', raison: 'ville inconnue ou hors de Pointe-Noire' },
    ]);
  });

  it('n’écarte plus l’enseignement supérieur : l’annuaire couvre toutes les écoles', () => {
    expect(ecoles.find((e) => e.reference === 'ETB-903')).toMatchObject({
      nom: '[Université B]',
      niveaux: ['superieur'],
      typeEcole: 'non_indique',
    });
  });

  it('reprend seulement ce qui se voit de la rue', () => {
    const [a, , d] = ecoles;
    expect(a).toMatchObject({
      nom: '[École A]',
      niveaux: ['primaire', 'college', 'lycee'],
      arrondissement: null,
      numeroEnseigne: null,
    });
    expect(d).toMatchObject({
      quartier: 'Ngoyo',
      arrondissement: 'ngoyo',
      niveaux: ['creche', 'maternelle', 'primaire', 'college'],
      numeroEnseigne: '242060000001',
    });
    expect(JSON.stringify(ecoles)).not.toContain('Note d');
  });

  it('range « crèche » et « garderie » dans leur propre niveau, pas dans « maternelle »', () => {
    expect(niveauxDe('Crèche, garderie')).toEqual(['creche']);
    expect(niveauxDe('Garderie, maternelle')).toEqual(['creche', 'maternelle']);
    expect(ecoles.find((e) => e.reference === 'ETB-906')?.niveaux).toEqual([
      'creche',
      'maternelle',
    ]);
    // « Formation professionnelle » se range avec le technique.
    expect(niveauxDe('Formation professionnelle')).toEqual(['technique']);
  });

  it('lit le type : « communautaire » existe, et un « probable » n’est pas une certitude', () => {
    expect(typeDe('Privé')).toBe('privee');
    expect(typeDe('Public')).toBe('publique');
    expect(typeDe('Privé confessionnel')).toBe('confessionnelle');
    expect(typeDe('Communautaire')).toBe('communautaire');
    // Déduit d'un indice (la présence d'un PDG), jamais vu : on ne le publie pas comme un fait.
    expect(typeDe('Privé (probable)')).toBe('non_indique');
    expect(typeDe('')).toBe('non_indique');
    expect(ecoles.find((e) => e.reference === 'ETB-901')?.typeEcole).toBe('non_indique');
    expect(ecoles.find((e) => e.reference === 'ETB-906')?.typeEcole).toBe('communautaire');
  });

  it('écrit le format de l’import de l’administration : une institution, un campus, ses cycles, sans position', () => {
    const entrees = versEntrees(ecoles);
    expect(entrees.map((e) => e.reference)).toEqual(['ETB-901', 'ETB-903', 'ETB-905', 'ETB-906']);
    const d = entrees.find((e) => e.reference === 'ETB-905');
    expect(d).toEqual({
      reference: 'ETB-905',
      nom: "[École D d'Ngoyo]",
      genre: 'privee',
      campus: [
        {
          etiquette: null,
          division: 'congo.pointe_noire.pointe_noire.ngoyo',
          quartier: 'Ngoyo',
          repere: 'Ngoyo, arrêt [Arrêt]',
          numeroEnseigne: '242060000001',
          position: null,
          programme: null,
          cycles: [
            { cycle: 'creche', formations: [] },
            { cycle: 'maternelle', formations: [] },
            { cycle: 'primaire', formations: [] },
            { cycle: 'college', formations: [] },
          ],
        },
      ],
    });
    // Aucune position inventée : l'école reste « à situer ».
    for (const e of entrees) expect(e.campus[0]?.position).toBeNull();
    // Un arrondissement inconnu : la division est à choisir dans l'administration.
    expect(entrees.find((e) => e.reference === 'ETB-901')?.campus[0]?.division).toBeNull();
  });

  it('le fichier produit est accepté tel quel par l’import de l’administration', () => {
    const json = JSON.stringify(versEntrees(ecoles));
    const lecture = lireImportation(json);
    expect(lecture.erreurs).toEqual([]);
    expect(lecture.entrees).toHaveLength(4);
    // Rejoué, il reste identique : la référence rend l'import idempotent côté base.
    expect(lecture.entrees.map((e) => e.reference)).toEqual([
      'ETB-901',
      'ETB-903',
      'ETB-905',
      'ETB-906',
    ]);
  });

  it('ne reprend que ce qui se voit de la rue : ni note d’entretien, ni personne interrogée', () => {
    expect(JSON.stringify(versEntrees(ecoles))).not.toContain('Note d');
  });
});
