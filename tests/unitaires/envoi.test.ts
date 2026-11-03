import { describe, expect, it } from 'vitest';
import { nouvelleFiche, type FicheLocale, type PhotoLocale } from '../../src/modele/fiche';
import {
  apresEchecInattendu,
  apresEchecReseau,
  apresRejet,
  type BilanEnvoi,
  doitJournaliserLEchec,
  enAlerte,
  enseigneExigeeManquante,
  ESSAIS_AVANT_ALERTE,
  etapeEnCours,
  explicationDuRejet,
  gestesDEnvoi,
  peutEtreModifiee,
  pourModifier,
  phraseDEchecDeLaFiche,
  phraseDuBilan,
  pourReessayer,
  rejetEnseigneAbsente,
  rejetPhotoIllisible,
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
  // Le contact ne dépend pas des photos : il part avant elles (ticket #94).
  it('le relevé d’abord, puis le contact, puis les photos', () => {
    expect(etapeEnCours({ envoyes: { releve: false, photo: false, contact: false } })).toBe(
      'releve',
    );
    expect(etapeEnCours({ envoyes: { releve: true, photo: false, contact: false } })).toBe(
      'contact',
    );
    expect(etapeEnCours({ envoyes: { releve: true, photo: false, contact: true } })).toBe('photo');
  });
});

describe('l’ordre des gestes d’un envoi (ticket #94)', () => {
  const partis = (releve: boolean, contact: boolean, photo = false) => ({
    releve,
    contact,
    photo,
  });

  it('une fiche neuve : le relevé, le contact, puis les photos', () => {
    expect(gestesDEnvoi(partis(false, false), false)).toEqual(['releve', 'contact', 'photos']);
  });

  it('une fiche neuve dont la photo ne peut pas partir ne part pas du tout', () => {
    expect(gestesDEnvoi(partis(false, false), true)).toEqual(['refus']);
  });

  // La fiche ESTAM du 03/11 : le relevé était arrivé sans photo, le contact n'était jamais parti, et la photo ne se
  // relisait plus. Le refus venait avant le contact : il était perdu.
  it('le relevé est parti et la photo ne peut pas : le contact part quand même, puis le refus', () => {
    expect(gestesDEnvoi(partis(true, false), true)).toEqual(['contact', 'refus']);
  });

  it('le contact est déjà parti : seul le refus reste', () => {
    expect(gestesDEnvoi(partis(true, true), true)).toEqual(['refus']);
  });

  it('rien ne bloque : le contact part avant les photos', () => {
    expect(gestesDEnvoi(partis(true, false), false)).toEqual(['contact', 'photos']);
    expect(gestesDEnvoi(partis(true, true), false)).toEqual(['photos']);
  });

  it('tout est parti : rien à faire', () => {
    expect(gestesDEnvoi(partis(true, true, true), false)).toEqual([]);
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

  it('dit à quelle étape la base a refusé quand le relevé et le contact sont déjà partis', () => {
    // Le contact part avant les photos (ticket #94) : un refus de photo vient quand il est parti.
    const f = fiche({ envoyes: { releve: true, photo: false, contact: true } });
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
    expect(pourModifier()).toEqual({
      etat: 'brouillon',
      rejet: null,
      essais: 0,
      dernierEchec: null,
    });
  });
});

describe('réessayer une fiche refusée', () => {
  it('la remet en file, sans refus ni essais ratés d’avant', () => {
    expect(pourReessayer()).toEqual({
      etat: 'a_envoyer',
      rejet: null,
      essais: 0,
      dernierEchec: null,
    });
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
      // Le relevé et le contact sont partis (le contact part avant les photos, ticket #94) ; la photo manque.
      fiche({ envoyes: { releve: true, photo: false, contact: true } }),
      rejetEnseigneAbsente(true),
      MAINTENANT,
    );
    expect(apres.etat).toBe('refusee');
    expect(explicationDuRejet(apres.rejet!).titre).toBe("La photo n'a pas pu être reçue.");
  });
});

// Ticket #74 : une erreur de connexion sur une fiche arrêtait toute la file en silence (« Envoyer maintenant » ne
// disait rien, les fiches suivantes n'étaient jamais essayées). Ces décisions sont celles de la file qui continue,
// qui compte l'échec et qui le dit.
describe('une fiche dont l’envoi échoue faute de connexion', () => {
  it('compte l’essai et garde l’étape, la raison et l’heure du dernier échec', () => {
    const apres = apresEchecReseau(fiche({ essais: 1 }), 'photo', 'Load failed', MAINTENANT);
    expect(apres.essais).toBe(2);
    expect(apres.dernierEchec).toEqual({ etape: 'photo', message: 'Load failed', le: MAINTENANT });
  });

  it('reste dans la file : ni refusée, ni retirée', () => {
    const apres = apresEchecReseau(fiche(), 'releve', 'Failed to fetch', MAINTENANT);
    expect(apres).not.toHaveProperty('etat');
  });

  it('ne garde pas un message démesuré', () => {
    const apres = apresEchecReseau(fiche(), 'photo', 'x'.repeat(5000), MAINTENANT);
    expect(apres.dernierEchec?.message.length).toBeLessThanOrEqual(200);
  });

  it('« Modifier » et « Réessayer » effacent le dernier échec', () => {
    expect(pourModifier()).toMatchObject({ dernierEchec: null });
    expect(pourReessayer()).toMatchObject({ dernierEchec: null });
  });

  it('dit ce qui n’est pas parti, combien d’essais, et que l’envoi reprend seul', () => {
    const f = (champs: Partial<FicheLocale>) => phraseDEchecDeLaFiche(fiche(champs));
    expect(
      f({ essais: 1, dernierEchec: { etape: 'photo', message: 'Load failed', le: MAINTENANT } }),
    ).toBe(
      'La photo n’est pas partie : la connexion a échoué. L’envoi reprend tout seul, ou touchez « Envoyer maintenant ».',
    );
    expect(
      f({ essais: 2, dernierEchec: { etape: 'releve', message: 'x', le: MAINTENANT } }),
    ).toMatch(/^La fiche n’est pas partie : la connexion a échoué \(2 essais\)\./);
    expect(
      f({ essais: 1, dernierEchec: { etape: 'contact', message: 'x', le: MAINTENANT } }),
    ).toMatch(/^Le contact n’est pas parti/);
  });

  it('au troisième essai raté, dit d’écrire à NTanova si cela continue', () => {
    const phrase = phraseDEchecDeLaFiche(
      fiche({
        essais: 3,
        dernierEchec: { etape: 'photo', message: 'Load failed', le: MAINTENANT },
      }),
    );
    expect(phrase).toMatch(/Si cela continue, écrivez à NTanova\./);
    expect(
      phraseDEchecDeLaFiche(
        fiche({ essais: 2, dernierEchec: { etape: 'photo', message: 'x', le: MAINTENANT } }),
      ),
    ).not.toMatch(/écrivez à NTanova/);
  });

  it('une fiche sans échec ne dit rien', () => {
    expect(phraseDEchecDeLaFiche(fiche())).toBeNull();
    expect(phraseDEchecDeLaFiche(fiche({ dernierEchec: null, essais: 4 }))).toBeNull();
  });

  it('journalise le premier échec, le deuxième, le cinquième, puis un sur dix : jamais tous', () => {
    const journalises = [1, 2, 3, 4, 5, 6, 9, 10, 11, 20, 21].filter(doitJournaliserLEchec);
    expect(journalises).toEqual([1, 2, 5, 10, 20]);
  });
});

describe('ce que « Envoyer maintenant » dit après un essai', () => {
  const bilan = (champs: Partial<BilanEnvoi> = {}): BilanEnvoi => ({
    le: MAINTENANT,
    envoyees: 0,
    echecs: [],
    refusees: 0,
    horsLigne: false,
    ...champs,
  });

  it('des fiches parties : combien, et à quelle heure', () => {
    expect(phraseDuBilan(bilan({ envoyees: 1 }), '03 h 39')).toEqual({
      ton: 'ok',
      texte: '1 fiche envoyée à 03 h 39.',
    });
    expect(phraseDuBilan(bilan({ envoyees: 3 }), '03 h 39')?.texte).toBe(
      '3 fiches envoyées à 03 h 39.',
    );
  });

  it('une fiche qui n’a pas pu partir : laquelle, à quelle étape, et que l’envoi reprendra', () => {
    const b = bilan({ echecs: [{ nom: '[École A]', etape: 'photo' }] });
    expect(phraseDuBilan(b, '03 h 39')).toEqual({
      ton: 'echec',
      texte:
        'Un envoi a échoué (03 h 39) : la photo de « [École A] » n’est pas partie. Il reprendra tout seul dans quelques minutes.',
    });
    expect(
      phraseDuBilan(bilan({ echecs: [{ nom: '[École B]', etape: 'releve' }] }), '03 h 39')?.texte,
    ).toMatch(/la fiche « \[École B\] » n’est pas partie/);
    expect(
      phraseDuBilan(bilan({ echecs: [{ nom: '[École C]', etape: 'contact' }] }), '03 h 39')?.texte,
    ).toMatch(/le contact de « \[École C\] » n’est pas parti/);
  });

  it('plusieurs échecs : le nombre, pas la liste', () => {
    const b = bilan({
      envoyees: 1,
      echecs: [
        { nom: '[A]', etape: 'photo' },
        { nom: '[B]', etape: 'releve' },
      ],
    });
    expect(phraseDuBilan(b, '03 h 39')?.texte).toBe(
      'Un envoi a échoué (03 h 39) : 2 fiches n’ont pas pu avancer. Il reprendra tout seul dans quelques minutes.',
    );
  });

  it('un échec l’emporte sur les fiches parties', () => {
    const b = bilan({ envoyees: 2, echecs: [{ nom: '[A]', etape: 'photo' }] });
    expect(phraseDuBilan(b, '03 h 39')?.ton).toBe('echec');
  });

  it('sans réseau, ou sans rien à envoyer : rien (la bannière le dit déjà)', () => {
    expect(phraseDuBilan(bilan({ horsLigne: true }), '03 h 39')).toBeNull();
    expect(phraseDuBilan(bilan(), '03 h 39')).toBeNull();
  });
});

describe('une photo qui ne se relit plus dans le téléphone', () => {
  it('l’enseigne exigée : la fiche est refusée avec sa raison, selon que NTanova a déjà le relevé', () => {
    const partie = rejetPhotoIllisible(true);
    const pasPartie = rejetPhotoIllisible(false);
    expect(partie.code).toBe('photo_illisible');
    expect(pasPartie.code).toBe('photo_illisible');
    expect(partie.message).toMatch(/n’est plus lisible/);
    expect(partie.message).toMatch(/arrivée chez NTanova sans elle/);
    expect(pasPartie.message).toMatch(/la fiche n’est pas partie/);
    expect(pasPartie.message).toMatch(/Modifiez la fiche/);
  });
});
