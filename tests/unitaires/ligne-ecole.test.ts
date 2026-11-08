import { describe, expect, it } from 'vitest';
import { libelleProvenance } from '../../src/modele/libelles';
import { ligneDeEcole, ligneDeRecherche, niveauxEnMots } from '../../src/modele/ligne-ecole';
import type { EcolePubliee } from '../../src/modele/ports';
import { ligneDe } from '../../src/modele/recherche';

// La ligne d'une école (audit du 05/11/2026, D6) est écrite par deux rendus : la page construite (une zone, une formation) et le
// navigateur (la recherche, « Autour de moi »). Les deux doivent dire exactement la même chose d'une même école.
function ecole(reste: Partial<EcolePubliee> = {}): EcolePubliee {
  return {
    id: 'e1',
    institutionId: 'i1',
    divisionId: 'tt',
    slug: 'complexe',
    numero: '482913',
    nom: '[Complexe scolaire Exemple]',
    etiquette: null,
    arrondissement: 'tie-tie',
    adresse: ['congo', 'pointe-noire', 'tie-tie'],
    divisionNoms: ['Congo', 'Pointe-Noire', 'Tié-Tié'],
    quartier: '[Quartier]',
    typeEcole: 'privee',
    niveaux: ['maternelle', 'primaire'],
    programme: null,
    formations: [],
    repere: '[face au marché]',
    numeroEnseigne: null,
    latitude: -4.79,
    longitude: 11.92,
    etat: 'relevee',
    verifieeLe: null,
    releveeLe: '2026-11-02T10:00:00Z',
    situeeLe: null,
    misAJourLe: '2026-11-02T10:00:00Z',
    ...reste,
  };
}

const CAS: [string, Partial<EcolePubliee>][] = [
  ['vue sur place', {}],
  ['confirmée par la direction', { etat: 'verifiee', verifieeLe: '2026-11-04' }],
  ['déclarée par l’école', { origine: 'school', releveeLe: null }],
  ['ajoutée par NTanova', { releveeLe: null, situeeLe: '2026-11-03T10:00:00Z' }],
  ['sans niveau ni type', { niveaux: [], typeEcole: 'non_indique', quartier: null, repere: null }],
  ['avec une implantation', { etiquette: 'Campus de Mongo-Mpoukou', typeEcole: 'autre' }],
  ['tous les cycles', { niveaux: ['creche', 'primaire', 'college', 'lycee', 'superieur'] }],
  ['vue sur place, sans repère', { repere: null }],
  ['ajoutée par NTanova, sans repère', { releveeLe: null, repere: null }],
  ['déclarée par l’école, datée', { origine: 'school', releveeLe: null, declareeLe: '2026-11-06' }],
];

describe('la ligne d’une école, écrite à la construction et dans le navigateur', () => {
  for (const [nom, reste] of CAS) {
    it(`dit la même chose dans les deux rendus : ${nom}`, () => {
      const e = ecole(reste);
      expect(ligneDeRecherche(ligneDe(e), null)).toEqual(ligneDeEcole(e));
      expect(ligneDeRecherche(ligneDe(e), 350)).toEqual(ligneDeEcole(e, 350));
    });
  }

  it('le disque est la lettre du cycle le plus élevé, vide quand aucun niveau n’est noté', () => {
    expect(ligneDeEcole(ecole()).lettre).toBe('P');
    expect(ligneDeEcole(ecole({ niveaux: ['creche', 'lycee', 'superieur'] })).lettre).toBe('S');
    expect(ligneDeEcole(ecole({ niveaux: [] })).lettre).toBe('');
  });

  it('la preuve : confirmée, vue sur place, déclarée, ou pas encore vue ; jamais fusionnées', () => {
    expect(ligneDeEcole(ecole()).preuve).toBe('relevee');
    expect(ligneDeEcole(ecole({ etat: 'verifiee' })).preuve).toBe('verifiee');
    expect(ligneDeEcole(ecole({ origine: 'school', releveeLe: null })).preuve).toBe('declaree');
    expect(ligneDeEcole(ecole({ releveeLe: null })).preuve).toBe('ajoutee');
    // Les mots de la ligne sont ceux de la fiche et du ticket #99 : « Ajoutée par NTanova » dit qui a ajouté l'école.
    expect(libelleProvenance).toEqual({
      verifiee: 'Confirmée par l’école',
      relevee: 'Relevé terrain',
      declaree: 'Déclarée par l’école',
      ajoutee: 'Ajoutée par NTanova',
    });
  });

  it('les niveaux : une puce par cycle, puis les niveaux en mots et le type (canevas du 08/11/2026)', () => {
    const l = ligneDeEcole(ecole());
    expect(l.lettres).toEqual(['M', 'P']);
    expect(l.niveaux).toBe('Maternelle et primaire · Privée');
    const nue = ligneDeEcole(ecole({ niveaux: [], typeEcole: 'non_indique' }));
    expect(nue.lettres).toEqual([]);
    expect(nue.niveaux).toBe('');
  });

  it('les niveaux en mots : un seul en entier, deux liés, une suite par ses bouts, sinon une énumération', () => {
    expect(niveauxEnMots(['creche'])).toBe('Crèche ou garderie');
    expect(niveauxEnMots(['primaire', 'maternelle'])).toBe('Maternelle et primaire');
    expect(niveauxEnMots(['primaire', 'college', 'lycee'])).toBe('Du primaire au lycée');
    expect(niveauxEnMots(['maternelle', 'primaire', 'college'])).toBe(
      'De la maternelle au collège',
    );
    expect(niveauxEnMots(['creche', 'primaire', 'lycee'])).toBe('Crèche, primaire et lycée');
    expect(niveauxEnMots(['superieur', 'autre_formation', 'lycee'])).toBe(
      'Lycée, supérieur et autre formation',
    );
    expect(niveauxEnMots([])).toBe('');
  });

  it('le lieu : le plus fin en gras, puis ce qui le contient', () => {
    expect(ligneDeEcole(ecole()).lieu).toEqual({
      fort: '[Quartier]',
      reste: 'Tié-Tié · Pointe-Noire',
    });
    expect(ligneDeEcole(ecole({ quartier: null })).lieu).toEqual({
      fort: 'Tié-Tié',
      reste: 'Pointe-Noire',
    });
  });

  it('« Repère pas encore relevé » : jamais avec « Ajoutée par NTanova » (arbitrage du 08/11/2026)', () => {
    expect(ligneDeEcole(ecole()).repereManquant).toBe(false);
    expect(ligneDeEcole(ecole({ repere: null })).repereManquant).toBe(true);
    expect(
      ligneDeEcole(ecole({ repere: null, origine: 'school', releveeLe: null })).repereManquant,
    ).toBe(true);
    expect(ligneDeEcole(ecole({ repere: null, etat: 'verifiee' })).repereManquant).toBe(true);
    expect(ligneDeEcole(ecole({ repere: null, releveeLe: null })).repereManquant).toBe(false);
  });

  it('la preuve : une seule, la plus forte, datée quand la date est connue', () => {
    expect(ligneDeEcole(ecole())).toMatchObject({
      preuveTexte: 'Vue sur place le 2 nov. 2026',
      preuveDate: null,
    });
    expect(ligneDeEcole(ecole({ etat: 'verifiee', verifieeLe: '2026-11-04' }))).toMatchObject({
      preuveTexte: 'Confirmée par la direction',
      preuveDate: '4 nov. 2026',
    });
    expect(
      ligneDeEcole(ecole({ origine: 'school', releveeLe: null, declareeLe: '2026-11-06' })),
    ).toMatchObject({ preuveTexte: 'Déclarée par l’école le 6 nov. 2026', preuveDate: null });
    expect(ligneDeEcole(ecole({ releveeLe: null })).preuveTexte).toBe(
      'Ajoutée par NTanova, pas encore vue sur place',
    );
  });

  it('la distance s’écrit « À 350 m » ou « À 1,2 km », seulement quand elle est donnée', () => {
    expect(ligneDeEcole(ecole()).distance).toBeNull();
    expect(ligneDeEcole(ecole(), 350).distance).toBe('À 350 m');
    expect(ligneDeEcole(ecole(), 1230).distance).toBe('À 1,2 km');
  });
});
