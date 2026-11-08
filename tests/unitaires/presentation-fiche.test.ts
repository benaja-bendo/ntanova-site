import { describe, expect, it } from 'vitest';
import {
  compteDesFormations,
  diplomesEnMots,
  filtresDesFormations,
  invitationDirection,
  libelleProgramme,
  messageFiliere,
  nomDUneFormation,
  preuvesDeLaFiche,
  rythmesEnMots,
  titreDesFormations,
  titreOuTrouver,
} from '../../src/modele/presentation-fiche';
import { dateCourte } from '../../src/modele/pointe-noire';
it('distingue une langue seule d’un programme, sans inventer d’homologation', () => {
  expect(libelleProgramme(' Français ')).toBe('Langue d’enseignement');
  expect(libelleProgramme('ANGLAIS')).toBe('Langue d’enseignement');
  for (const texte of [
    null,
    '',
    'Programme français',
    'Programme congolais',
    'français-congolais, bilingue',
  ]) {
    expect(libelleProgramme(texte)).toBe('Programme et langues');
  }
});
it('date les preuves au Congo dans un format court', () => {
  expect(dateCourte('2026-11-02T23:30:00Z')).toBe('3 nov. 2026');
});

const FICHE = {
  etat: 'relevee' as const,
  verifieeLe: null,
  origine: 'relais',
  declareeLe: null,
  releveeLe: '2026-11-02T09:00:00Z',
  situeeLe: null,
};
const textes = (e: Parameters<typeof preuvesDeLaFiche>[0]) =>
  preuvesDeLaFiche(e).map((p) => p.texte);

describe('les preuves d’une fiche (canevas du 08/11/2026)', () => {
  it('une école vue sur place, pas encore confirmée : les deux pastilles, séparées', () => {
    expect(textes(FICHE)).toEqual([
      'Vue sur place · 2 nov. 2026',
      'Pas encore confirmée par la direction',
    ]);
  });
  it('une école confirmée garde ses deux preuves et ne dit plus « pas encore »', () => {
    expect(textes({ ...FICHE, etat: 'verifiee', verifieeLe: '2026-11-05T09:00:00Z' })).toEqual([
      'Confirmée par la direction · 5 nov. 2026',
      'Vue sur place · 2 nov. 2026',
    ]);
  });
  it('« Ajoutée par NTanova » ne s’empile jamais avec « Pas encore confirmée »', () => {
    expect(
      textes({ ...FICHE, releveeLe: null, origine: 'import', situeeLe: '2026-11-03T09:00:00Z' }),
    ).toEqual(['Ajoutée par NTanova · 3 nov. 2026']);
  });
  it('une école qui s’est déclarée elle-même attend encore sa confirmation', () => {
    expect(
      textes({ ...FICHE, releveeLe: null, origine: 'school', declareeLe: '2026-11-01' }),
    ).toEqual(['Déclarée par l’école · 1 nov. 2026', 'Pas encore confirmée par la direction']);
  });
});

describe('les mots qui suivent le nom', () => {
  it('accorde le titre et l’invitation, crochets et majuscules compris', () => {
    expect(titreOuTrouver('École Les Petits Baobabs')).toBe('Où la trouver');
    expect(titreOuTrouver('Institut Horizon Sup')).toBe('Où le trouver');
    expect(titreOuTrouver('[Institut supérieur Exemple]')).toBe('Où le trouver');
    expect(titreOuTrouver('Lycée de la Paix')).toBe('Où le trouver');
    expect(invitationDirection('Crèche Petits Pas')).toBe('Vous dirigez cette école ?');
    expect(invitationDirection('Centre de formation')).toBe('Vous dirigez cet établissement ?');
    // « Cours » est un mot entier : « Coursiers » n'est pas un cours.
    expect(titreOuTrouver('Coursiers du savoir')).toBe('Où la trouver');
  });
});

describe('les formations', () => {
  const f = (diplome: 'bts' | 'licence' | null, ...rythmes: ('jour' | 'soir')[]) => ({
    diplome,
    rythmes,
  });

  it('nomme le bloc d’après ce qu’il contient', () => {
    expect(titreDesFormations(['superieur'], true)).toBe('Filières et frais');
    expect(titreDesFormations(['lycee'], false)).toBe('Séries');
    expect(titreDesFormations(['lycee', 'superieur'], false)).toBe('Filières');
    expect(titreDesFormations(['college'], true)).toBe('Formations et frais');
    expect(compteDesFormations(4, ['superieur'])).toBe('4 filières');
    expect(nomDUneFormation(['lycee'])).toBe('Série');
    expect(nomDUneFormation(['superieur'])).toBe('Filière');
    expect(compteDesFormations(1, ['lycee'])).toBe('1 série');
  });

  it('écrit les rythmes et les diplômes sans répétition', () => {
    expect(rythmesEnMots([f('bts', 'soir'), f('licence', 'jour')])).toBe(
      'Cours du jour et du soir',
    );
    expect(rythmesEnMots([f('bts', 'soir')])).toBe('Cours du soir');
    expect(rythmesEnMots([f('bts')])).toBeNull();
    expect(diplomesEnMots([f('licence'), f('bts'), f('bts')])).toBe('BTS, Licence');
    expect(diplomesEnMots([f(null)])).toBeNull();
  });

  it('ne propose un filtre que s’il retire quelque chose', () => {
    const quatre = [
      f('bts', 'jour'),
      f('bts', 'jour'),
      f('licence', 'jour'),
      f('licence', 'jour', 'soir'),
    ];
    const filtres = filtresDesFormations(quatre);
    expect(filtres.map((x) => x.libelle)).toEqual(['BTS', 'Licence', 'Cours du soir']);
    expect([...filtres[2]!.membres]).toEqual([3]);
    // Sous quatre formations, on lit la liste : pas de filtre.
    expect(filtresDesFormations(quatre.slice(0, 3))).toEqual([]);
  });

  it('prépare le message d’une filière', () => {
    expect(messageFiliere('Informatique de gestion')).toBe(
      'Bonjour, je vous contacte depuis NTanova au sujet de la filière Informatique de gestion : ',
    );
  });
});
