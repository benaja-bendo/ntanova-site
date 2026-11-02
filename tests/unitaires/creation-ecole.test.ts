import { describe, expect, it } from 'vitest';
import {
  erreursCreation,
  formulaireCreationVide,
  versEntree,
  type FormulaireCreation,
} from '../../src/modele/creation-ecole';
import { formationSerie } from '../../src/modele/formations';

const valide = (): FormulaireCreation => ({
  ...formulaireCreationVide(),
  nom: '  [Complexe exemple]  ',
  genre: 'privee',
  cycles: ['primaire', 'lycee'],
});

describe('ajouter une école depuis l’administration', () => {
  it('le formulaire neuf ne coche rien et ne choisit rien d’avance', () => {
    const f = formulaireCreationVide();
    expect(f.cycles).toEqual([]);
    expect(f.genre).toBe('non_indique');
    expect(f.formations).toEqual([]);
    expect(f.position).toBe('');
  });

  it('exige un nom, et rien d’autre', () => {
    expect(erreursCreation(formulaireCreationVide())).toEqual({ nom: 'Écris le nom de l’école.' });
    expect(erreursCreation(valide())).toEqual({});
  });

  it('refuse un nom trop long, un type hors liste, un niveau hors liste', () => {
    expect(erreursCreation({ ...valide(), nom: 'x'.repeat(201) })['nom']).toMatch(/trop long/);
    expect(erreursCreation({ ...valide(), genre: 'magique' as never })['genre']).toMatch(/type/);
    expect(erreursCreation({ ...valide(), cycles: ['collegee' as never] })['cycles']).toMatch(
      /niveaux/,
    );
  });

  it('une position illisible est dite ; une position absente est permise (l’école reste « à situer »)', () => {
    expect(erreursCreation({ ...valide(), position: 'près du marché' })['position']).toMatch(
      /illisible/,
    );
    expect(erreursCreation({ ...valide(), position: '-4.79105, 11.92500' })).toEqual({});
    expect(erreursCreation({ ...valide(), position: '' })).toEqual({});
  });

  it('un numéro incomplet est dit', () => {
    expect(erreursCreation({ ...valide(), numeroEnseigne: '123' })['numeroEnseigne']).toMatch(
      /complet/,
    );
    expect(erreursCreation({ ...valide(), numeroEnseigne: '06 123 45 67' })).toEqual({});
  });

  it('une formation doit être dans un niveau coché et avoir un titre', () => {
    const lycee = formationSerie('lycee', 'c');
    expect(erreursCreation({ ...valide(), formations: [lycee] })).toEqual({});
    expect(
      erreursCreation({ ...valide(), cycles: ['primaire'], formations: [lycee] })['formations'],
    ).toMatch(/niveau qui n’est pas coché/);
    expect(
      erreursCreation({ ...valide(), formations: [{ ...lycee, titre: ' ' }] })['formations'],
    ).toMatch(/Écris/);
  });
});

describe('ce qui part vers la base', () => {
  it('range les champs vides en « rien » et nettoie le nom', () => {
    const entree = versEntree(valide());
    expect(entree).toEqual({
      reference: null,
      nom: '[Complexe exemple]',
      genre: 'privee',
      campus: [
        {
          etiquette: null,
          division: null,
          quartier: null,
          repere: null,
          numeroEnseigne: null,
          position: null,
          programme: null,
          cycles: [
            { cycle: 'primaire', formations: [] },
            { cycle: 'lycee', formations: [] },
          ],
        },
      ],
    });
  });

  it('lit la position et le numéro, groupe les formations par cycle, dans l’ordre de la liste fermée', () => {
    const entree = versEntree({
      ...valide(),
      etiquette: ' Campus de Loandjili ',
      division: 'congo.pointe_noire.pointe_noire.loandjili',
      numeroEnseigne: '06 123 45 67',
      position: '-4,79105 ; 11,92500',
      cycles: ['lycee', 'primaire', 'superieur'],
      formations: [
        formationSerie('lycee', 'd'),
        {
          cycle: 'superieur',
          titre: ' BTS Gestion ',
          domaine: 'gestion',
          serie: null,
          diplome: 'bts',
          rythmes: ['soir'],
        },
        formationSerie('lycee', 'c'),
      ],
    });
    const campus = entree.campus[0];
    expect(campus).toMatchObject({
      etiquette: 'Campus de Loandjili',
      division: 'congo.pointe_noire.pointe_noire.loandjili',
      numeroEnseigne: '242061234567',
      position: { latitude: -4.79105, longitude: 11.925 },
    });
    // Le primaire d'abord, puis le lycée, puis le supérieur (ordre de la liste, pas des cases).
    expect(campus?.cycles.map((c) => c.cycle)).toEqual(['primaire', 'lycee', 'superieur']);
    expect(campus?.cycles[1]?.formations.map((f) => f.titre)).toEqual(['Série D', 'Série C']);
    expect(campus?.cycles[2]?.formations).toEqual([
      { titre: 'BTS Gestion', domaine: 'gestion', serie: null, diplome: 'bts', rythmes: ['soir'] },
    ]);
  });
});
