import { describe, expect, it } from 'vitest';
import { listes } from '../../src/modele/listes';
import type { EcoleACompleter, ReleveRecu } from '../../src/modele/ports';
import { tachesDeLaCorrection, tachesDeLaMission } from '../../src/modele/taches';

// Ce que NTanova attend du relais sur une école qu'elle lui confie, ou pour une fiche qu'elle lui renvoie
// (ticket #55, PR 4). Le relais ne redonne que ce qui manque : une photo que NTanova a déjà n'est pas à reprendre
// quand le motif de la correction ne la concerne pas.

const ecole = (champs: Partial<EcoleACompleter> = {}): EcoleACompleter => ({
  id: 'ecole-1',
  nom: '[École connue]',
  quartier: '[Quartier]',
  typeEcole: 'privee',
  niveaux: ['primaire'],
  programme: null,
  repere: '[Repère]',
  numeroEnseigne: null,
  note: null,
  genre: 'complete',
  position: { latitude: -4.8, longitude: 11.9 },
  etatVerification: 'relevee',
  photos: ['signboard'],
  contactConfirme: false,
  ...champs,
});

const recu = (champs: Partial<ReleveRecu> = {}): ReleveRecu => ({
  id: 'releve-1',
  type: 'releve',
  nomEnseigne: '[École]',
  prisLe: '2026-11-02T08:00:00.000Z',
  statut: 'a_corriger',
  motif: 'photo_floue',
  messageAuRelais: null,
  direction: 'vue',
  ficheLiaisonRemise: false,
  repasser: null,
  contactConfirmeLe: null,
  contactFonction: null,
  campusId: null,
  niveaux: ['primaire'],
  typeEcole: 'privee',
  programme: null,
  programmesVus: null,
  programmesEnPhoto: false,
  repere: '[Repère]',
  numeroEnseigne: null,
  position: { latitude: -4.8, longitude: 11.9 },
  precisionM: 10,
  photos: ['signboard'],
  aContact: true,
  ...champs,
});

describe('une école confiée au relais', () => {
  it('une enseigne que NTanova a déjà n’est pas à reprendre', () => {
    expect(tachesDeLaMission(ecole({ photos: ['signboard'] })).photo).toBe(false);
    expect(tachesDeLaMission(ecole({ photos: ['programs_board'] })).photo).toBe(true);
    expect(tachesDeLaMission(ecole({ photos: [] })).photo).toBe(true);
  });

  it('« situer » demande la position, même quand une photo existe', () => {
    const t = tachesDeLaMission(ecole({ genre: 'locate', position: null, photos: ['signboard'] }));
    expect(t.position).toBe(true);
    expect(t.photo).toBe(false);
  });

  it('« vérifier » demande la position, pour constater la présence sur place', () => {
    expect(tachesDeLaMission(ecole({ genre: 'verify' })).position).toBe(true);
  });

  it('« compléter » ne demande la position que si NTanova ne l’a pas', () => {
    expect(tachesDeLaMission(ecole({ genre: 'complete' })).position).toBe(false);
    expect(tachesDeLaMission(ecole({ genre: 'complete', position: null })).position).toBe(true);
  });

  it('demande toujours de vérifier les informations', () => {
    for (const genre of listes.mission_kind) {
      expect(tachesDeLaMission(ecole({ genre })).informations, genre).toBe(true);
    }
  });

  it('ne demande la direction que si son contact n’est pas déjà confirmé', () => {
    expect(tachesDeLaMission(ecole({ contactConfirme: false })).direction).toBe(true);
    expect(tachesDeLaMission(ecole({ contactConfirme: true })).direction).toBe(false);
  });

  it('reprend la consigne de NTanova telle qu’elle est écrite', () => {
    expect(tachesDeLaMission(ecole({ note: 'Le nom exact.' })).consigne).toBe('Le nom exact.');
    expect(tachesDeLaMission(ecole({ note: null })).consigne).toBeNull();
  });

  it('dit, pour chaque genre, pourquoi le relais y va', () => {
    const titres = listes.mission_kind.map((genre) => tachesDeLaMission(ecole({ genre })).titre);
    expect(new Set(titres).size).toBe(listes.mission_kind.length);
    for (const titre of titres) expect(titre).not.toBe('');
  });

  it('prévient quand l’école est vérifiée par la direction : un relevé ne la modifie plus', () => {
    const t = tachesDeLaMission(ecole({ etatVerification: 'verifiee' }));
    expect(t.titre).toMatch(/vérifiée par la direction/i);
  });

  it('lit une école d’avant la mise à jour, sans photos ni position', () => {
    const ancienne = ecole() as Partial<EcoleACompleter>;
    delete ancienne.photos;
    delete ancienne.position;
    delete ancienne.contactConfirme;
    delete ancienne.etatVerification;
    const t = tachesDeLaMission(ancienne as EcoleACompleter);
    // Dans le doute, on demande : mieux vaut une photo de trop qu’une école sans enseigne.
    expect(t).toMatchObject({ photo: true, position: true, direction: true });
  });
});

describe('une fiche que NTanova renvoie au relais', () => {
  it('une photo floue, ou un enfant sur la photo : la photo, et rien d’autre', () => {
    for (const motif of ['photo_floue', 'enfant_sur_photo'] as const) {
      expect(tachesDeLaCorrection(recu({ motif })), motif).toMatchObject({
        photo: true,
        position: false,
        informations: false,
        direction: false,
      });
    }
  });

  it('hors du lot : la position, pas la photo', () => {
    expect(tachesDeLaCorrection(recu({ motif: 'hors_lot' }))).toMatchObject({
      photo: false,
      position: true,
      informations: false,
      direction: false,
    });
  });

  it('un doublon : la position, pour que la question du doublon soit posée de nouveau', () => {
    expect(tachesDeLaCorrection(recu({ motif: 'doublon' }))).toMatchObject({
      photo: false,
      position: true,
    });
  });

  it('une information à revoir, ou sans motif : relire les informations, pas la photo', () => {
    for (const motif of ['autre', null] as const) {
      expect(tachesDeLaCorrection(recu({ motif })), String(motif)).toMatchObject({
        photo: false,
        position: false,
        informations: true,
      });
    }
  });

  it('une correction ne demande jamais de revoir la direction : son contact est déjà parti', () => {
    for (const motif of [...listes.motif_decision, null] as const) {
      expect(tachesDeLaCorrection(recu({ motif })).direction, String(motif)).toBe(false);
    }
  });

  it('reprend le message de NTanova, sinon le motif en clair', () => {
    expect(
      tachesDeLaCorrection(recu({ messageAuRelais: 'Reprenez la photo de face.' })).consigne,
    ).toBe('Reprenez la photo de face.');
    expect(
      tachesDeLaCorrection(recu({ messageAuRelais: null, motif: 'photo_floue' })).consigne,
    ).toBe('La photo est floue.');
    expect(tachesDeLaCorrection(recu({ messageAuRelais: null, motif: null })).consigne).toBeNull();
  });
});
