import { describe, expect, it } from 'vitest';
import { nouvelleFiche, type FicheLocale, type PhotoLocale } from '../../src/modele/fiche';
import {
  apresEchecInattendu,
  apresRejet,
  enAlerte,
  enseigneExigeeManquante,
  ESSAIS_AVANT_ALERTE,
  etapeEnCours,
  explicationDuRejet,
  peutEtreModifiee,
  pourModifier,
  pourReessayer,
  rejetEnseigneAbsente,
} from '../../src/modele/envoi';

// Les décisions de la file d'envoi, sans navigateur (ticket #55, PR 2). La file elle-même est essayée par les
// parcours (`tests/parcours/envoi.spec.ts`), avec le faux serveur.

const MAINTENANT = '2026-11-02T09:00:00.000Z';

const fiche = (champs: Partial<FicheLocale> = {}): FicheLocale => ({
  ...nouvelleFiche('10000000-0000-4000-8000-000000000001', '2026-11-02T08:00:00.000Z', null),
  etat: 'a_envoyer',
  ...champs,
});

describe('où en est l’envoi d’une fiche', () => {
  it('le relevé d’abord, puis les photos, puis le contact', () => {
    expect(etapeEnCours({ envoyes: { releve: false, photo: false, contact: false } })).toBe(
      'releve',
    );
    expect(etapeEnCours({ envoyes: { releve: true, photo: false, contact: false } })).toBe('photo');
    expect(etapeEnCours({ envoyes: { releve: true, photo: true, contact: false } })).toBe(
      'contact',
    );
  });
});

describe('une fiche que la base refuse', () => {
  it('sort de la file et garde la raison exacte, l’étape et l’heure', () => {
    const apres = apresRejet(
      fiche(),
      { code: '42501', message: 'Compte relais inactif.' },
      MAINTENANT,
    );
    expect(apres.etat).toBe('refusee');
    expect(apres.rejet).toEqual({
      code: '42501',
      message: 'Compte relais inactif.',
      etape: 'releve',
      le: MAINTENANT,
    });
  });

  it('dit à quelle étape la base a refusé quand le relevé est déjà parti', () => {
    const f = fiche({ envoyes: { releve: true, photo: false, contact: false } });
    const apres = apresRejet(f, { code: '22023', message: 'Au plus trois photos.' }, MAINTENANT);
    expect(apres.rejet?.etape).toBe('photo');
  });

  it('ne touche pas à ce qui est déjà parti', () => {
    const f = fiche({ envoyes: { releve: true, photo: false, contact: false } });
    const apres = apresRejet(f, { code: 'P0002', message: 'Relevé inconnu.' }, MAINTENANT);
    expect(apres).not.toHaveProperty('envoyes');
    expect(apres).not.toHaveProperty('photos');
  });

  it('remet à zéro le compte des essais ratés', () => {
    expect(
      apresRejet(fiche({ essais: 3 }), { code: 'P0001', message: 'x' }, MAINTENANT).essais,
    ).toBe(0);
  });
});

describe('un échec dont on ne sait rien', () => {
  it('garde la fiche dans la file et compte l’essai raté', () => {
    const une = apresEchecInattendu(fiche());
    expect(une).toEqual({ essais: 1 });
    expect(une).not.toHaveProperty('etat');
    expect(apresEchecInattendu(fiche({ essais: 4 }))).toEqual({ essais: 5 });
  });

  it('alerte le relais après plusieurs essais de suite, sans la sortir de la file', () => {
    expect(enAlerte(fiche({ essais: ESSAIS_AVANT_ALERTE - 1 }))).toBe(false);
    expect(enAlerte(fiche({ essais: ESSAIS_AVANT_ALERTE }))).toBe(true);
    expect(enAlerte(fiche())).toBe(false);
  });

  it('lit une fiche d’avant, qui n’a pas de compteur', () => {
    const ancienne = fiche();
    delete ancienne.essais;
    expect(apresEchecInattendu(ancienne)).toEqual({ essais: 1 });
    expect(enAlerte(ancienne)).toBe(false);
  });
});

describe('modifier une fiche', () => {
  it('est possible tant que le relevé n’est pas parti : en file, ou refusée', () => {
    expect(peutEtreModifiee(fiche())).toBe(true);
    expect(peutEtreModifiee(fiche({ etat: 'refusee' }))).toBe(true);
  });

  it('ne l’est plus quand NTanova a reçu le relevé : ce serait une correction', () => {
    const partie = { releve: true, photo: false, contact: false };
    expect(peutEtreModifiee(fiche({ envoyes: partie }))).toBe(false);
    expect(peutEtreModifiee(fiche({ etat: 'refusee', envoyes: partie }))).toBe(false);
  });

  it('ne l’est pas pour un brouillon (il est déjà modifiable) ni pour une fiche envoyée', () => {
    expect(peutEtreModifiee(fiche({ etat: 'brouillon' }))).toBe(false);
    expect(peutEtreModifiee(fiche({ etat: 'envoyee' }))).toBe(false);
  });

  it('ramène la fiche en brouillon, sans refus ni essais ratés d’avant', () => {
    expect(pourModifier()).toEqual({ etat: 'brouillon', rejet: null, essais: 0 });
  });
});

describe('réessayer une fiche refusée', () => {
  it('la remet en file, sans refus ni essais ratés d’avant', () => {
    expect(pourReessayer()).toEqual({ etat: 'a_envoyer', rejet: null, essais: 0 });
  });
});

describe('ce que le relais lit d’un refus', () => {
  const rejet = (code: string, message = 'Message de la base.') => ({
    code,
    message,
    etape: 'releve' as const,
    le: MAINTENANT,
  });

  it('un compte inactif parle du compte, pas de la fiche, et se réessaie plus tard', () => {
    const e = explicationDuRejet(rejet('42501', 'Compte relais inactif.'));
    expect(e.titre).toMatch(/compte/i);
    expect(e.detail).toContain('Compte relais inactif.');
  });

  it('une fiche que la base ne connaît pas dit de la renvoyer', () => {
    expect(explicationDuRejet(rejet('P0002')).titre).toMatch(/connaît pas|inconnue/i);
  });

  it('une valeur refusée dit que la fiche contient quelque chose que la base n’accepte pas', () => {
    for (const code of ['22023', '23514', '23502', '22P02']) {
      expect(explicationDuRejet(rejet(code)).titre, code).toMatch(/valeur|n’accepte pas/i);
    }
  });

  it('un code inconnu ne casse rien et garde le message de la base', () => {
    const e = explicationDuRejet(rejet('ZZ999', 'Quelque chose.'));
    expect(e.titre).not.toBe('');
    expect(e.detail).toContain('Quelque chose.');
  });

  it('dit ce qui est parti quand le relevé est déjà chez NTanova', () => {
    const e = explicationDuRejet({ ...rejet('42501'), etape: 'photo' });
    expect(e.titre).toMatch(/photo/i);
  });
});

// Une photo d'enseigne exigée qui n'est plus nulle part (ticket #72). Avant, l'étape « photo » se terminait sans rien
// avoir envoyé et la fiche passait à « Envoyée » : NTanova la recevait sans photo, et personne ne le voyait.
describe('la photo d’enseigne exigée n’est plus nulle part', () => {
  const photo = (champs: Partial<PhotoLocale> = {}): PhotoLocale => ({
    id: '20000000-0000-4000-8000-000000000001',
    role: 'signboard',
    blob: new Blob(['x'], { type: 'image/jpeg' }),
    mime: 'image/jpeg',
    octets: 1,
    largeur: 10,
    hauteur: 10,
    prisLe: MAINTENANT,
    envoyee: false,
    ...champs,
  });

  it('une enseigne dans le téléphone, ou déjà partie : rien ne manque', () => {
    expect(enseigneExigeeManquante(fiche({ photos: [photo()] }))).toBe(false);
    expect(enseigneExigeeManquante(fiche({ photos: [photo({ blob: null, envoyee: true })] }))).toBe(
      false,
    );
  });

  it('aucune photo, ou une photo dont le fichier a disparu sans être partie : elle manque', () => {
    expect(enseigneExigeeManquante(fiche({ photos: [] }))).toBe(true);
    expect(enseigneExigeeManquante(fiche({ photos: [photo({ blob: null })] }))).toBe(true);
  });

  it('une autre photo ne remplace pas l’enseigne', () => {
    expect(enseigneExigeeManquante(fiche({ photos: [photo({ role: 'building' })] }))).toBe(true);
  });

  it('une fiche d’avant la mise à jour, sans liste de photos : elle manque aussi', () => {
    const ancienne = fiche() as Partial<FicheLocale>;
    delete ancienne.photos;
    expect(enseigneExigeeManquante(ancienne as FicheLocale)).toBe(true);
  });

  it('une enseigne que NTanova a déjà et que le relais n’a pas à reprendre ne manque pas', () => {
    const taches = {
      photo: false,
      position: true,
      informations: true,
      direction: false,
      consigne: null,
      titre: '[titre]',
    };
    expect(enseigneExigeeManquante(fiche({ photos: [], taches }))).toBe(false);
    expect(enseigneExigeeManquante(fiche({ photos: [], taches: { ...taches, photo: true } }))).toBe(
      true,
    );
  });

  it('le refus dit si la fiche est déjà chez NTanova, et ce que le relais peut faire', () => {
    const partie = rejetEnseigneAbsente(true);
    const pasPartie = rejetEnseigneAbsente(false);
    expect(partie.code).toBe('photo_absente');
    expect(pasPartie.code).toBe('photo_absente');
    // Relevé reçu : le relais ne peut plus la modifier, il prévient NTanova qui la lui renvoie.
    expect(partie.message).toMatch(/arrivée chez NTanova sans/);
    expect(partie.message).toMatch(/Prévenez NTanova/);
    // Relevé pas parti : « Modifier » reprend la fiche à l'étape de la photo.
    expect(pasPartie.message).toMatch(/pas partie/);
    expect(pasPartie.message).toMatch(/Modifiez la fiche/);
  });

  it('un refus de ce genre s’affiche comme un refus de photo', () => {
    const apres = apresRejet(
      fiche({ envoyes: { releve: true, photo: false, contact: false } }),
      rejetEnseigneAbsente(true),
      MAINTENANT,
    );
    expect(apres.etat).toBe('refusee');
    expect(explicationDuRejet(apres.rejet!).titre).toBe("La photo n'a pas pu être reçue.");
  });
});
