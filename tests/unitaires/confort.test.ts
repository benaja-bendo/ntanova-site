// Ticket 207, le confort de l'admin : la recherche des écoles porte sur toutes les écoles (A7), le résumé d'une formation dit
// son diplôme et son domaine (A10), un équipement « autre » garde son libellé (A26).
import { describe, expect, it } from 'vitest';
import { nomEquipementCourt } from '../../src/modele/equipements-ecole';
import { correspondALaRecherche, teteDeLaFormation } from '../../src/modele/fiche-admin';

describe('A7 : chercher une école', () => {
  const ecole = {
    nom: 'ESTAM – École supérieure des technologies avancées',
    sigle: 'ESTAM',
    etiquette: 'Site 2 · Mpita',
    quartier: 'Mpita',
  };

  it('lit le nom, le sigle, le nom du site et le quartier, sans accent ni casse', () => {
    expect(correspondALaRecherche(ecole, 'estam')).toBe(true);
    expect(correspondALaRecherche(ecole, 'ecole superieure')).toBe(true);
    expect(correspondALaRecherche(ecole, 'site 2')).toBe(true);
    expect(correspondALaRecherche({ ...ecole, etiquette: null }, 'mpita')).toBe(true);
    expect(correspondALaRecherche(ecole, 'Loango')).toBe(false);
  });

  it('une recherche vide garde toutes les écoles', () => {
    expect(correspondALaRecherche(ecole, '  ')).toBe(true);
  });
});

describe('A10 : le diplôme et le domaine en tête du résumé', () => {
  it('« Licence · Informatique »', () => {
    expect(teteDeLaFormation({ diplome: 'licence', domaine: 'informatique' }, 'Informatique')).toBe(
      'Licence · Informatique',
    );
  });

  it('rien quand ni l’un ni l’autre n’est dit', () => {
    expect(teteDeLaFormation({ diplome: null, domaine: null }, null)).toBeNull();
    expect(teteDeLaFormation({ diplome: 'bts', domaine: null }, null)).toBe('BTS');
  });
});

describe('A26 : un équipement « autre » garde son libellé', () => {
  it('le libellé saisi tel quel ; les autres en minuscules dans une phrase', () => {
    expect(nomEquipementCourt({ cle: 'autre', precision: 'Résidences et laboratoires' })).toBe(
      'Résidences et laboratoires',
    );
    expect(nomEquipementCourt({ cle: 'cloture', precision: null })).toBe('clôture');
  });
});
