import { expect, it } from 'vitest';
import { libelleProgramme } from '../../src/modele/presentation-fiche';
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
