// L'agrément, le mot de la direction et la date limite des inscriptions (ticket 148) : les règles de saisie, les mêmes que la
// base, et ce que la fiche écrit.
import { describe, expect, it } from 'vitest';
import { intituleAgrement, lireAgrement, referenceEnMots } from '../../src/modele/agrement';
import { lireDateInscription, prochaineInscription } from '../../src/modele/inscriptions';
import { LONGUEUR_MAX_MOT, lireMotDirection } from '../../src/modele/mot-direction';

const JOUR = '2026-11-08';

describe('la saisie d’un agrément', () => {
  const saisie = {
    formationId: '',
    genre: 'agrement',
    precision: '',
    reference: 'arrêté n° [référence]',
    delivreLe: '2024-03-12',
    sourceTexte: 'Journal officiel [numéro]',
    sourceLien: '',
    controleLe: '2026-11-05',
    documentVu: true,
  };
  const erreur = (autre: Partial<typeof saisie>) => lireAgrement({ ...saisie, ...autre }, JOUR).erreur;

  it('accepte un document sans lien : la source se dit en mots', () => {
    const { agrement } = lireAgrement(saisie, JOUR);
    expect(agrement).toMatchObject({ formationId: null, sourceLien: null, precision: null });
  });

  it('nettoie les blancs et rattache la filière choisie', () => {
    const { agrement } = lireAgrement({ ...saisie, formationId: 'f1', reference: '  r  ' }, JOUR);
    expect(agrement).toMatchObject({ formationId: 'f1', reference: 'r' });
  });

  it.each([
    ['un intitulé hors de la liste', { genre: 'autre-chose' }],
    ['« Autre » sans précision', { genre: 'autre' }],
    ['une référence vide', { reference: '  ' }],
    ['une référence trop longue', { reference: 'r'.repeat(161) }],
    ['un document daté du futur', { delivreLe: '2026-11-09' }],
    ['une date absente', { delivreLe: '' }],
    ['une source vide', { sourceTexte: ' ' }],
    ['une source trop longue', { sourceTexte: 's'.repeat(201) }],
    ['un lien en http', { sourceLien: 'http://exemple.cg/doc' }],
    ['un lien avec une espace', { sourceLien: 'https://exemple.cg/un doc' }],
    ['un contrôle dans le futur', { controleLe: '2026-11-09' }],
    ['un contrôle avant le document', { controleLe: '2024-01-01' }],
    ['un document pas vu', { documentVu: false }],
  ])('refuse %s', (_cas, autre) => {
    expect(erreur(autre as Partial<typeof saisie>)).toBeTruthy();
  });

  it('garde la précision seulement pour « Autre »', () => {
    expect(lireAgrement({ ...saisie, precision: 'x' }, JOUR).agrement?.precision).toBeNull();
    expect(
      lireAgrement({ ...saisie, genre: 'autre', precision: 'Homologation' }, JOUR).agrement?.precision,
    ).toBe('Homologation');
  });
});

describe('ce que la fiche écrit d’un agrément', () => {
  const a = {
    genre: 'agrement' as const,
    precision: null,
    reference: 'arrêté n° [référence]',
    delivreLe: '2024-03-12',
    sourceTexte: 'Journal officiel',
    sourceLien: null,
  };

  it('suit l’intitulé du document', () => {
    expect(intituleAgrement(a)).toBe('Agrément');
    expect(intituleAgrement({ ...a, genre: 'autorisation_ouverture' })).toBe('Autorisation d’ouverture');
    expect(intituleAgrement({ ...a, genre: 'autre', precision: 'Homologation' })).toBe('Homologation');
  });

  it('n’invente rien pour un intitulé inconnu d’une version future', () => {
    expect(intituleAgrement({ ...a, genre: 'inconnu' as never })).toBe('Référence officielle');
  });

  it('dit la référence et la date du document', () => {
    expect(referenceEnMots(a)).toBe('arrêté n° [référence] du 12 mars 2024');
  });
});

describe('la saisie du mot de la direction', () => {
  const saisie = {
    texte: '  Nous formons aux métiers de la gestion.  ',
    ditLe: '2026-11-05',
    fonction: 'directeur',
    canal: 'whatsapp',
    accord: true,
  };

  it('garde le texte tel que remis, sans les blancs autour', () => {
    expect(lireMotDirection(saisie, JOUR).mot?.texte).toBe('Nous formons aux métiers de la gestion.');
  });

  it.each([
    ['un mot vide', { texte: '   ' }],
    ['un mot trop long', { texte: 'a'.repeat(LONGUEUR_MAX_MOT + 1) }],
    ['une date future', { ditLe: '2026-11-09' }],
    ['une fonction absente', { fonction: '' }],
    ['un canal inconnu', { canal: 'pigeon' }],
    ['pas d’accord', { accord: false }],
  ])('refuse %s', (_cas, autre) => {
    expect(lireMotDirection({ ...saisie, ...autre }, JOUR).erreur).toBeTruthy();
  });

  it('accepte 400 caractères exactement', () => {
    expect(lireMotDirection({ ...saisie, texte: 'a'.repeat(400) }, JOUR).erreur).toBeNull();
  });
});

describe('la date limite des inscriptions', () => {
  const saisie = { anneeScolaire: '2026-2027', limite: '2026-12-15', declareeLe: '2026-11-05' };

  it('accepte une limite le jour même de la déclaration', () => {
    expect(lireDateInscription({ ...saisie, limite: '2026-11-05' }, JOUR).erreur).toBeNull();
  });

  it.each([
    ['une année vide', { anneeScolaire: ' ' }],
    ['une année trop longue', { anneeScolaire: 'a'.repeat(31) }],
    ['une limite absente', { limite: '' }],
    ['une déclaration future', { declareeLe: '2026-11-09' }],
    ['une limite avant la déclaration', { limite: '2026-11-01' }],
  ])('refuse %s', (_cas, autre) => {
    expect(lireDateInscription({ ...saisie, ...autre }, JOUR).erreur).toBeTruthy();
  });

  const ligne = (id: string, limite: string) => ({ id, anneeScolaire: id, limite, declareeLe: '2026-01-01' });

  it('montre la prochaine date à venir', () => {
    const lignes = [ligne('b', '2027-09-01'), ligne('a', '2026-12-15'), ligne('c', '2026-01-10')];
    expect(prochaineInscription(lignes, JOUR)?.id).toBe('a');
  });

  it('garde la date du jour, et rien une fois toutes passées', () => {
    expect(prochaineInscription([ligne('a', JOUR)], JOUR)?.id).toBe('a');
    expect(prochaineInscription([ligne('a', '2026-11-07')], JOUR)).toBeNull();
    expect(prochaineInscription([], JOUR)).toBeNull();
  });
});
