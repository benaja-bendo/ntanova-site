import { describe, expect, it } from 'vitest';
import {
  PERSONNES_MAX,
  erreursPersonne,
  ficheQuiPorteLesPersonnes,
  libellePersonne,
  peutAjouterUnePersonne,
  personneVide,
  versContactASaisir,
  type PersonneSaisie,
} from '../../src/modele/contacts';

// Les personnes à contacter pour une fiche (ticket #96) : trois au plus, un accord par personne, jamais de numéro sans lui.
// Les mêmes règles servent au relais (une personne de plus) et à l'administration (ajouter, corriger).

const personne = (champs: Partial<PersonneSaisie> = {}): PersonneSaisie => ({
  ...personneVide(),
  fonction: 'directeur',
  ...champs,
});

describe('les personnes à contacter', () => {
  it('une fiche en a trois au plus', () => {
    expect(PERSONNES_MAX).toBe(3);
    expect(peutAjouterUnePersonne(0)).toBe(true);
    expect(peutAjouterUnePersonne(2)).toBe(true);
    expect(peutAjouterUnePersonne(3)).toBe(false);
    expect(peutAjouterUnePersonne(4)).toBe(false);
  });

  it('une personne sans numéro ni accord est valide : la fonction suffit', () => {
    expect(erreursPersonne(personne())).toEqual({});
  });

  it('la fonction est obligatoire', () => {
    expect(erreursPersonne(personne({ fonction: null })).fonction).toBe('Choisissez sa fonction.');
  });

  it('sans l’accord de la personne, pas de numéro', () => {
    expect(erreursPersonne(personne({ whatsapp: '06 123 45 67', accord: false })).whatsapp).toBe(
      'Sans son accord, ne notez pas son numéro.',
    );
    expect(erreursPersonne(personne({ whatsapp: '06 123 45 67', accord: true }))).toEqual({});
  });

  it('un numéro incomplet est signalé', () => {
    expect(erreursPersonne(personne({ whatsapp: '06 12', accord: true })).whatsapp).toBe(
      'Ce numéro ne semble pas complet.',
    );
  });

  it('un nom trop long, une précision trop longue sont signalés', () => {
    expect(erreursPersonne(personne({ nom: 'x'.repeat(121) })).nom).toBe('Ce nom est trop long.');
    expect(
      erreursPersonne(personne({ fonction: 'autre', precision: 'x'.repeat(81) })).precision,
    ).toBe('Cette précision est trop longue.');
  });

  it('la précision n’a de sens que pour « autre » : ailleurs elle est ignorée à l’envoi', () => {
    expect(
      versContactASaisir(personne({ fonction: 'directeur', precision: 'propriétaire' }))
        .precisionFonction,
    ).toBeNull();
    expect(
      versContactASaisir(personne({ fonction: 'autre', precision: ' propriétaire ' }))
        .precisionFonction,
    ).toBe('propriétaire');
  });

  it('envoie le numéro en forme internationale, et seulement avec l’accord', () => {
    expect(versContactASaisir(personne({ whatsapp: '06 123 45 67', accord: true }))).toMatchObject({
      whatsapp: '242061234567',
      accord: true,
    });
    // Défense en profondeur : un numéro resté dans le champ sans accord ne part pas.
    expect(versContactASaisir(personne({ whatsapp: '06 123 45 67', accord: false }))).toMatchObject(
      { whatsapp: null, accord: false },
    );
  });

  it('un nom ou une note vide part comme « rien »', () => {
    expect(versContactASaisir(personne({ nom: '  ', note: '' }))).toMatchObject({
      nom: null,
      note: null,
    });
  });

  it('se présente par sa fonction, et son nom quand on l’a', () => {
    const base = {
      id: 'c1',
      nom: null,
      whatsapp: null,
      accord: false,
      accordLe: null,
      note: null,
      recuLe: '2026-11-03T10:00:00Z',
      source: 'relais' as const,
      precisionFonction: null,
    };
    expect(libellePersonne({ ...base, fonction: 'directeur' })).toBe('Directeur ou directrice');
    expect(libellePersonne({ ...base, fonction: 'directeur', nom: 'Mme Ngoma' })).toBe(
      'Directeur ou directrice · Mme Ngoma',
    );
    expect(libellePersonne({ ...base, fonction: 'autre', precisionFonction: 'propriétaire' })).toBe(
      'Autre : propriétaire',
    );
    expect(libellePersonne({ ...base, fonction: null })).toBe('Personne à contacter');
  });

  // Les personnes restent attachées à la fiche qui les a reçues : celle qu'on regarde, ou la fiche qu'elle corrige.
  it('une personne ajoutée va sur la fiche qui porte déjà les autres, sinon sur la fiche regardée', () => {
    const lue = (releveId: string) => ({
      id: 'c',
      fonction: null,
      precisionFonction: null,
      nom: null,
      whatsapp: null,
      accord: false,
      accordLe: null,
      note: null,
      recuLe: '2026-11-03T10:00:00Z',
      source: 'relais' as const,
      releveId,
    });
    expect(ficheQuiPorteLesPersonnes([lue('origine')], 'correction')).toBe('origine');
    expect(ficheQuiPorteLesPersonnes([], 'correction')).toBe('correction');
  });
});
