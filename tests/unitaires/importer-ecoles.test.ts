import { describe, expect, it } from 'vitest';
import { lireCsv, versEcoles, versSql } from '../../outils/importer-ecoles';

// Des écoles fictives : aucune donnée réelle dans le dépôt.
const csv = `ID établissement,Nom,Ville,Quartier,Statut,Niveaux,Notes,Adresse ou repère,Téléphone de l'enseigne
ETB-901,"[École A] (nom tiré d'un fichier, à confirmer)",Pointe-Noire,,Privé (probable),"Primaire, collège, lycée","Note d'entretien, jamais importée",,
ETB-902,École à confirmer,Pointe-Noire,,,,,,
ETB-903,[Université B],Pointe-Noire,,Enseignement supérieur : HORS CIBLE,Supérieur,,,
ETB-904,[École C],À confirmer,,Privé,Primaire,,,
ETB-905,"[École D d'Ngoyo]",Pointe-Noire,"Ngoyo (arrêt ""[Arrêt]"")",Privé,"Crèche, maternelle, primaire, collège (pas de lycée)",,"Ngoyo, arrêt [Arrêt]",06 000 00 01 ; 06 000 00 02
`;

describe('l’import des écoles connues par les entretiens', () => {
  const { ecoles, ecartees } = versEcoles(lireCsv(csv));

  it('garde les écoles nommées de Pointe-Noire, dans la cible', () => {
    expect(ecoles.map((e) => e.reference)).toEqual(['ETB-901', 'ETB-905']);
    expect(ecartees).toEqual([
      { reference: 'ETB-902', raison: 'nom inconnu' },
      { reference: 'ETB-903', raison: 'hors cible (enseignement supérieur)' },
      { reference: 'ETB-904', raison: 'ville inconnue ou hors de Pointe-Noire' },
    ]);
  });

  it('reprend seulement ce qui se voit de la rue', () => {
    const [a, d] = ecoles;
    expect(a).toMatchObject({
      nom: '[École A]',
      typeEcole: 'privee',
      niveaux: ['primaire', 'college', 'lycee'],
      arrondissement: null,
      numeroEnseigne: null,
    });
    expect(d).toMatchObject({
      quartier: 'Ngoyo',
      arrondissement: 'ngoyo',
      niveaux: ['maternelle', 'primaire', 'college'],
      numeroEnseigne: '242060000001',
    });
    expect(JSON.stringify(ecoles)).not.toContain('Note d');
  });

  it('écrit un SQL en brouillon, sans position, qui se relance sans doublon', () => {
    const texte = versSql(ecoles, ecartees, '[source]');
    expect(texte).toContain("'brouillon'");
    expect(texte).not.toMatch(/insert into public\.ecoles \([^)]*position/);
    expect(texte).toContain(
      "where not exists (select 1 from prive.ecoles_sources where reference = 'ETB-905')",
    );
    expect(texte).toContain("'[École D d''Ngoyo]'");
    expect(texte).toContain('--   ETB-903 : hors cible');
  });
});
