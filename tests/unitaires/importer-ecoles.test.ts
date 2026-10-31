import { describe, expect, it } from 'vitest';
import { lireCsv, niveauxDe, typeDe, versEcoles, versSql } from '../../outils/importer-ecoles';

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

  it('écrit un SQL en brouillon, sans position, qui se relance sans doublon', () => {
    const texte = versSql(ecoles, ecartees, '[source]');
    expect(texte).toContain("'brouillon'");
    expect(texte).not.toMatch(/insert into public\.ecoles \([^)]*position/);
    expect(texte).toContain(
      "where not exists (select 1 from prive.ecoles_sources where reference = 'ETB-905')",
    );
    expect(texte).toContain("'[École D d''Ngoyo]'");
    expect(texte).toContain('--   ETB-902 : nom inconnu');
    expect(texte).not.toContain('hors cible');
  });

  it('remet à « Pas indiqué » le type seulement probable d’une école déjà importée, tant qu’elle est en brouillon', () => {
    const texte = versSql(ecoles, ecartees, '[source]');
    expect(texte).toContain(
      `update public.ecoles e set type_ecole = 'non_indique'
  from prive.ecoles_sources s
  where s.ecole_id = e.id and s.reference = 'ETB-901'
    and e.type_ecole = 'privee' and e.publication = 'brouillon';`,
    );
    // Seulement les « probables » : une école au type sûr n'est pas touchée.
    expect(texte).not.toContain("s.reference = 'ETB-905'\n    and e.type_ecole");
  });
});
