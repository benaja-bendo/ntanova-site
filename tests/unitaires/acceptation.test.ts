import { describe, expect, it } from 'vitest';
import {
  avantDAccepter,
  ceQuiManquePourAccepter,
  divisionRequise,
  heriterDeLOrigine,
  type Cible,
  type EntreeAvantAccepter,
} from '../../src/modele/acceptation';

// Accepter une fiche (ticket #89). Le bouton « Accepter » ne se grise jamais sans dire pourquoi, et une correction d'une
// fiche pas encore acceptée (le relais qui reprend sa photo après un « à corriger ») hérite de la position de la fiche
// d'origine : la base crée l'école à partir de la correction.

const nouvelle: Cible = { mode: 'nouvelle' };
const POSITION = { latitude: -4.8, longitude: 11.9 };

/** Ce que l'écran sait d'une fiche, avant tout héritage. */
const fiche = (champs: Partial<Parameters<typeof divisionRequise>[0]> = {}) => ({
  essai: false,
  type: 'releve' as const,
  corrigeUneFicheEnAttente: false,
  divisionId: null,
  position: null,
  lot: null,
  ...champs,
});

describe('heriterDeLOrigine', () => {
  const correction = { type: 'correction' as const, position: null, divisionId: null, lot: null };

  it('une correction d’une fiche pas encore acceptée reprend sa position, sa division et son secteur', () => {
    const h = heriterDeLOrigine(correction, {
      campusId: null,
      position: POSITION,
      divisionId: 'd-tie-tie',
      lot: 'Tié-Tié',
    });
    expect(h).toEqual({
      corrigeUneFicheEnAttente: true,
      position: POSITION,
      divisionId: 'd-tie-tie',
      lot: 'Tié-Tié',
      positionDeLaFicheDOrigine: true,
      lotDeLaFicheDOrigine: true,
    });
  });

  it('la position de la correction l’emporte : le relais l’a refaite', () => {
    const neuve = { latitude: -4.81, longitude: 11.91 };
    const h = heriterDeLOrigine(
      { ...correction, position: neuve },
      { campusId: null, position: POSITION, divisionId: null, lot: null },
    );
    expect(h.position).toEqual(neuve);
    expect(h.positionDeLaFicheDOrigine).toBe(false);
  });

  it('une correction d’une école déjà créée ne reprend rien : la base met à jour l’école', () => {
    const h = heriterDeLOrigine(correction, {
      campusId: 'campus-1',
      position: POSITION,
      divisionId: 'd',
      lot: 'x',
    });
    expect(h).toMatchObject({ corrigeUneFicheEnAttente: false, position: null, divisionId: null });
  });

  it('une fiche qui n’est pas une correction n’hérite de rien', () => {
    const h = heriterDeLOrigine(
      { type: 'releve', position: null, divisionId: null, lot: null },
      { campusId: null, position: POSITION, divisionId: 'd', lot: 'x' },
    );
    expect(h.corrigeUneFicheEnAttente).toBe(false);
    expect(h.position).toBeNull();
  });

  // Ticket #95 : l'écran montrait « Lot Essai » sur la correction d'ESTAM, alors que Theodore n'avait plus de lot et que
  // sa correction n'en avait pas. C'était le lot de la fiche d'origine, repris pour déduire la division.
  it('le lot repris de la fiche d’origine est dit : ce n’est pas celui de la correction', () => {
    const h = heriterDeLOrigine(correction, {
      campusId: null,
      position: POSITION,
      divisionId: 'd',
      lot: 'Essai',
    });
    expect(h.lot).toBe('Essai');
    expect(h.lotDeLaFicheDOrigine).toBe(true);
  });

  it('le lot de la correction elle-même n’est pas « de la fiche d’origine »', () => {
    const h = heriterDeLOrigine(
      { ...correction, lot: 'Tié-Tié' },
      { campusId: null, position: POSITION, divisionId: 'd', lot: 'Essai' },
    );
    expect(h.lot).toBe('Tié-Tié');
    expect(h.lotDeLaFicheDOrigine).toBe(false);
  });

  it('sans lot nulle part : rien à dire', () => {
    const h = heriterDeLOrigine(correction, {
      campusId: null,
      position: POSITION,
      divisionId: 'd',
      lot: null,
    });
    expect(h.lotDeLaFicheDOrigine).toBe(false);
  });

  it('une origine introuvable se lit comme « rien à hériter », jamais une erreur', () => {
    expect(heriterDeLOrigine(correction, null)).toMatchObject({
      corrigeUneFicheEnAttente: false,
      position: null,
    });
  });
});

describe('divisionRequise', () => {
  it('une nouvelle fiche avec une position que nul contour ne contient : à choisir', () => {
    expect(divisionRequise(fiche({ position: POSITION }), nouvelle)).toBe(true);
  });

  it('une nouvelle fiche sans position mais dans un secteur : le secteur suffit', () => {
    expect(divisionRequise(fiche({ lot: 'Tié-Tié' }), nouvelle)).toBe(false);
  });

  it('une nouvelle fiche sans position ni secteur : à choisir', () => {
    expect(divisionRequise(fiche(), nouvelle)).toBe(true);
  });

  it('une division connue : rien à choisir', () => {
    expect(divisionRequise(fiche({ divisionId: 'd', position: POSITION }), nouvelle)).toBe(false);
  });

  it('le lot d’essai ne se publie jamais : rien à choisir', () => {
    expect(divisionRequise(fiche({ essai: true }), nouvelle)).toBe(false);
  });

  it('LE DÉFAUT DU #89 : une correction d’une école déjà créée ne demande jamais de division, même d’un relais sans secteur', () => {
    // Elle n'a ni position ni secteur, mais la base met à jour l'école, qui a déjà sa division.
    expect(divisionRequise(fiche({ type: 'correction' }), nouvelle)).toBe(false);
  });

  it('une correction d’une fiche pas encore acceptée se traite comme une nouvelle fiche', () => {
    expect(
      divisionRequise(fiche({ type: 'correction', corrigeUneFicheEnAttente: true }), nouvelle),
    ).toBe(true);
    expect(
      divisionRequise(
        fiche({ type: 'correction', corrigeUneFicheEnAttente: true, divisionId: 'd' }),
        nouvelle,
      ),
    ).toBe(false);
  });

  it('mettre à jour une implantation connue ne demande pas de division', () => {
    expect(
      divisionRequise(fiche({ position: POSITION }), { mode: 'update_campus', campusId: 'c' }),
    ).toBe(false);
  });
});

describe('ceQuiManquePourAccepter', () => {
  it('rien ne manque : le bouton est actif', () => {
    expect(ceQuiManquePourAccepter(fiche({ divisionId: 'd' }), nouvelle, '')).toBeNull();
  });

  it('la division manque : l’écran le dit, au lieu de griser sans un mot', () => {
    const phrase = ceQuiManquePourAccepter(fiche({ position: POSITION }), nouvelle, '');
    expect(phrase).toMatch(/division/);
    // Une fois choisie, plus rien ne manque.
    expect(ceQuiManquePourAccepter(fiche({ position: POSITION }), nouvelle, 'd-1')).toBeNull();
  });

  it('l’institution manque pour une nouvelle implantation', () => {
    expect(
      ceQuiManquePourAccepter(
        fiche({ divisionId: 'd' }),
        { mode: 'new_campus', institutionId: '' },
        '',
      ),
    ).toMatch(/institution/);
  });

  it('l’implantation manque pour une mise à jour ou des niveaux ajoutés', () => {
    expect(ceQuiManquePourAccepter(fiche(), { mode: 'update_campus', campusId: '' }, '')).toMatch(
      /implantation/,
    );
    expect(ceQuiManquePourAccepter(fiche(), { mode: 'add_cycle', campusId: '' }, '')).toMatch(
      /implantation/,
    );
  });
});

// Avant d'accepter (ticket #95) : le fondateur ne savait pas « pourquoi il ne pouvait pas publier » ; le bouton était
// actif, rien ne bloquait, et l'écran ne le disait pas. Une fonction pure dit, ligne par ligne, ce qui est prêt, ce qui
// manque sans bloquer, et ce qui bloque.

describe('avantDAccepter', () => {
  /** La correction d'ESTAM, le 03/11 : reprend la position de la fiche d'origine, sans contact, pas de formations. */
  const entree = (champs: Partial<EntreeAvantAccepter> = {}): EntreeAvantAccepter => ({
    fiche: {
      essai: false,
      type: 'correction',
      corrigeUneFicheEnAttente: true,
      divisionId: 'd-lumumba',
      position: POSITION,
      positionDeLaFicheDOrigine: true,
      precisionM: 8,
      lot: 'Essai',
      lotDeLaFicheDOrigine: true,
      niveaux: ['superieur'],
      numeroEnseigne: null,
      direction: 'vue',
    },
    photos: [
      { role: 'signboard', publiable: true },
      { role: 'programs_board', publiable: true },
    ],
    contact: false,
    contactDeLaFicheDOrigine: false,
    nombreDeFormations: 0,
    formationsAttendues: true,
    cible: nouvelle,
    divisionChoisie: '',
    divisionNom: 'Lumumba',
    ...champs,
  });
  const ligne = (e: EntreeAvantAccepter, cle: string) =>
    avantDAccepter(e).lignes.find((l) => l.cle === cle);

  it('LA FICHE D’ESTAM : rien ne bloque, et ce qui manque est dit comme facultatif', () => {
    const bilan = avantDAccepter(
      entree({ fiche: { ...entree().fiche, numeroEnseigne: '2420064970301' } }),
    );
    expect(bilan.bloque).toBe(false);
    expect(bilan.lignes.filter((l) => l.etat === 'bloque')).toEqual([]);
    expect(ligne(entree(), 'photos')).toMatchObject({ etat: 'ok' });
    expect(ligne(entree(), 'position')?.texte).toMatch(/fiche d’origine/);
    expect(ligne(entree(), 'zone')).toMatchObject({ etat: 'ok' });
    expect(ligne(entree(), 'zone')?.texte).toMatch(/Lumumba/);
    // Le contact n'est pas arrivé : ce n'est pas ce qui empêche d'accepter ni de publier.
    expect(ligne(entree(), 'contact')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(entree(), 'contact')?.texte).toMatch(/Pas reçu/);
    expect(ligne(entree(), 'contact')?.texte).toMatch(/n’empêche ni d’accepter ni de publier/);
    expect(ligne(entree(), 'formations')).toMatchObject({ etat: 'a_faire' });
    // Le numéro a 10 chiffres après +242 : un numéro congolais en a 9.
    const numero = bilan.lignes.find((l) => l.cle === 'numero');
    expect(numero).toMatchObject({ etat: 'a_faire' });
    expect(numero?.texte).toMatch(/10 chiffres après \+242/);
    expect(numero?.texte).toMatch(/9/);
  });

  it('le lot de la fiche d’origine est dit, sans passer pour celui de la correction', () => {
    expect(ligne(entree(), 'lot')?.texte).toMatch(/lot « Essai »/);
    expect(ligne(entree(), 'lot')?.texte).toMatch(/Cette correction n’est dans aucun lot/);
    // Une fiche qui a son propre lot, ou aucun : rien à dire.
    const sienne = entree({ fiche: { ...entree().fiche, lotDeLaFicheDOrigine: false } });
    expect(ligne(sienne, 'lot')).toBeUndefined();
  });

  it('une photo pas encore vérifiée ne paraîtra pas : c’est dit', () => {
    const une = entree({ photos: [{ role: 'signboard', publiable: false }] });
    expect(ligne(une, 'photos')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(une, 'photos')?.texte).toMatch(/pas encore vérifiée/);
    expect(ligne(une, 'photos')?.texte).toMatch(/Marquer publiable/);

    const mixte = entree({
      photos: [
        { role: 'signboard', publiable: true },
        { role: 'programs_board', publiable: false },
      ],
    });
    expect(ligne(mixte, 'photos')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(mixte, 'photos')?.texte).toMatch(/2 reçues, 1 vérifiée/);
  });

  it('aucune photo : dit, sans bloquer', () => {
    const sans = entree({ photos: [] });
    expect(ligne(sans, 'photos')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(sans, 'photos')?.texte).toMatch(/Aucune photo reçue/);
    expect(avantDAccepter(sans).bloque).toBe(false);
  });

  it('pas de position : l’école ne sera pas sur la carte', () => {
    const sans = entree({
      fiche: { ...entree().fiche, position: null, positionDeLaFicheDOrigine: false },
    });
    expect(ligne(sans, 'position')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(sans, 'position')?.texte).toMatch(/pas sur la carte/);
  });

  it('une division à choisir et pas choisie : c’est ce qui bloque', () => {
    const a = entree({
      fiche: { ...entree().fiche, divisionId: null },
      divisionNom: null,
    });
    expect(ceQuiManquePourAccepter(a.fiche, a.cible, a.divisionChoisie)).not.toBeNull();
    expect(avantDAccepter(a).bloque).toBe(true);
    expect(ligne(a, 'zone')).toMatchObject({ etat: 'bloque' });

    // Choisie : la ligne est prête, avec son nom.
    const b = entree({
      fiche: { ...entree().fiche, divisionId: null },
      divisionChoisie: 'd-ngoyo',
      divisionNom: 'Ngoyo',
    });
    expect(avantDAccepter(b).bloque).toBe(false);
    expect(ligne(b, 'zone')).toMatchObject({ etat: 'ok' });
    expect(ligne(b, 'zone')?.texte).toMatch(/Ngoyo/);
  });

  it('le contact arrivé est dit, et d’où il vient', () => {
    expect(ligne(entree({ contact: true }), 'contact')).toMatchObject({
      etat: 'ok',
      texte: 'Reçu.',
    });
    expect(ligne(entree({ contact: true, contactDeLaFicheDOrigine: true }), 'contact')?.texte).toBe(
      'Reçu, avec la fiche d’origine.',
    );
  });

  it('une direction absente, ou dont le relais n’a rien dit : facultatif aussi', () => {
    for (const direction of ['absente', null] as const) {
      const e = entree({ fiche: { ...entree().fiche, direction } });
      expect(ligne(e, 'contact'), String(direction)).toMatchObject({ etat: 'a_faire' });
      expect(avantDAccepter(e).bloque).toBe(false);
    }
  });

  it('les formations : dites quand le niveau en demande, prêtes quand il y en a', () => {
    expect(ligne(entree(), 'formations')?.texte).toMatch(/Facultatif pour accepter/);
    expect(ligne(entree({ nombreDeFormations: 2 }), 'formations')).toMatchObject({
      etat: 'ok',
      texte: '2 saisies ci-dessus.',
    });
    expect(ligne(entree({ nombreDeFormations: 1 }), 'formations')?.texte).toBe(
      '1 saisie ci-dessus.',
    );
    expect(ligne(entree({ formationsAttendues: false }), 'formations')).toBeUndefined();
  });

  it('un numéro à 9 chiffres, ou aucun : rien à dire', () => {
    expect(ligne(entree(), 'numero')).toBeUndefined();
    const bon = entree({ fiche: { ...entree().fiche, numeroEnseigne: '242064970301' } });
    expect(ligne(bon, 'numero')).toBeUndefined();
  });

  it('dit ce que fait « Accepter », selon ce qu’on en fait', () => {
    expect(avantDAccepter(entree()).phrase).toMatch(/devient « prête »/);
    expect(avantDAccepter(entree()).phrase).toMatch(/Écoles › Publier/);
    const maj = entree({ cible: { mode: 'update_campus', campusId: 'c1' } });
    expect(avantDAccepter(maj).phrase).toMatch(/met à jour/);
    expect(avantDAccepter(maj).phrase).toMatch(/prochaine mise en ligne/);
    // La correction d'une école déjà créée met l'école à jour.
    const corrige = entree({
      fiche: { ...entree().fiche, corrigeUneFicheEnAttente: false },
    });
    expect(avantDAccepter(corrige).phrase).toMatch(/met à jour/);
  });

  it('la correction d’une école déjà créée : pas de zone, pas de position à dire', () => {
    const corrige = entree({
      fiche: {
        ...entree().fiche,
        corrigeUneFicheEnAttente: false,
        position: null,
        positionDeLaFicheDOrigine: false,
        divisionId: null,
      },
      divisionNom: null,
    });
    expect(ligne(corrige, 'zone')).toBeUndefined();
    expect(avantDAccepter(corrige).bloque).toBe(false);
  });
});
