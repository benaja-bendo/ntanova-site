import { describe, expect, it } from 'vitest';
import {
  avantDAccepter,
  ceQuiManqueDuNumero,
  ceQuiManquePourAccepter,
  divisionRequise,
  heriterDeLOrigine,
  numeroAConfirmer,
  numeroPeutEtreRetire,
  peutSaisirLaPosition,
  type Cible,
  type EntreeAvantAccepter,
  type PositionSaisie,
} from '../../src/modele/acceptation';
import { afficherTelephone } from '../../src/modele/telephone';

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
      entree({
        fiche: { ...entree().fiche, numeroEnseigne: '2420064970301' },
        choixNumero: 'verifie',
      }),
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

  it('une enseigne pas encore contrôlée ne paraîtra pas : c’est dit', () => {
    const une = entree({ photos: [{ role: 'signboard', publiable: false }] });
    expect(ligne(une, 'photos')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(une, 'photos')?.texte).toMatch(/pas encore contrôlée/);
    expect(ligne(une, 'photos')?.texte).toMatch(/Contrôler pour publication/);

    // Une enseigne et une vue du bâtiment, une seule contrôlée : l'autre ne paraîtra pas.
    const mixte = entree({
      photos: [
        { role: 'signboard', publiable: true },
        { role: 'building', publiable: false },
      ],
    });
    expect(ligne(mixte, 'photos')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(mixte, 'photos')?.texte).toMatch(/2 reçues, 1 contrôlée pour publication/);

    const toutes = entree({
      photos: [
        { role: 'signboard', publiable: true },
        { role: 'building', publiable: true },
      ],
    });
    expect(ligne(toutes, 'photos')).toMatchObject({ etat: 'ok' });
    expect(ligne(toutes, 'photos')?.texte).toMatch(/la première pourra paraître/);
  });

  it('le panneau des formations et le prospectus ne promettent jamais une photo publique', () => {
    // Contrôlés ou non, ils restent privés : seuls l'enseigne et la vue du bâtiment comptent.
    const prives = entree({
      photos: [
        { role: 'programs_board', publiable: true },
        { role: 'brochure', publiable: false },
      ],
    });
    expect(ligne(prives, 'photos')).toMatchObject({ etat: 'a_faire' });
    expect(ligne(prives, 'photos')?.texte).toMatch(/Ni enseigne ni vue du bâtiment/);
    expect(ligne(prives, 'photos')?.texte).toMatch(/restent privées/);

    // Une enseigne contrôlée avec un panneau pas contrôlé : l'école aura son image, le panneau ne change rien.
    const enseigneEtPanneau = entree({
      photos: [
        { role: 'signboard', publiable: true },
        { role: 'programs_board', publiable: false },
      ],
    });
    expect(ligne(enseigneEtPanneau, 'photos')).toMatchObject({ etat: 'ok' });
    expect(ligne(enseigneEtPanneau, 'photos')?.texte).toMatch(
      /1 reçue, contrôlée pour publication/,
    );
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

  describe('le numéro écrit sur l’enseigne', () => {
    const avec = (champs: Partial<EntreeAvantAccepter> = {}, numero = '242064970301') =>
      entree({ fiche: { ...entree().fiche, numeroEnseigne: numero }, ...champs });

    it('aucun numéro saisi : rien à dire, rien qui bloque', () => {
      expect(ligne(entree(), 'numero')).toBeUndefined();
      expect(avantDAccepter(entree()).bloque).toBe(false);
    });

    it('un numéro saisi par le relais bloque tant qu’on n’a pas dit s’il est sur la photo (trois numéros non vérifiés ont paru le 06/11)', () => {
      const e = avec();
      expect(ligne(e, 'numero')).toMatchObject({ etat: 'bloque' });
      expect(ligne(e, 'numero')?.texte).toContain(afficherTelephone('242064970301'));
      expect(ligne(e, 'numero')?.texte).toMatch(/photo de l’enseigne/);
      expect(ligne(e, 'numero')?.texte).toMatch(/« Appeler »/);
      expect(avantDAccepter(e).bloque).toBe(true);
    });

    it('« vérifié sur la photo » : prêt, et c’est dit', () => {
      const e = avec({ choixNumero: 'verifie' });
      expect(ligne(e, 'numero')).toMatchObject({ etat: 'ok' });
      expect(ligne(e, 'numero')?.texte).toMatch(/Vérifié sur la photo/);
      expect(avantDAccepter(e).bloque).toBe(false);
    });

    it('un numéro vérifié mais qui n’a pas 9 chiffres garde son avertissement, sans bloquer', () => {
      const e = avec({ choixNumero: 'verifie' }, '2420064970301');
      expect(ligne(e, 'numero')).toMatchObject({ etat: 'a_faire' });
      expect(ligne(e, 'numero')?.texte).toMatch(/10 chiffres après \+242/);
      expect(avantDAccepter(e).bloque).toBe(false);
    });

    it('« pas sur la photo » : le numéro ne sera pas publié', () => {
      const e = avec({ choixNumero: 'retire' });
      expect(ligne(e, 'numero')).toMatchObject({ etat: 'ok' });
      expect(ligne(e, 'numero')?.texte).toMatch(/ne sera pas publié/);
      expect(avantDAccepter(e).bloque).toBe(false);
    });

    it('un numéro corrigé par l’administration est un numéro qu’elle a lu : rien à confirmer', () => {
      const e = avec({ numeroCorrige: true });
      expect(ligne(e, 'numero')).toBeUndefined();
      expect(avantDAccepter(e).bloque).toBe(false);
    });

    it('le lot d’entraînement n’est jamais publié : aucun numéro à confirmer', () => {
      const e = entree({
        fiche: { ...entree().fiche, essai: true, numeroEnseigne: '242064970301' },
      });
      expect(ligne(e, 'numero')).toBeUndefined();
    });

    it('un autre blocage reste dit, avec le numéro', () => {
      const e = avec({ cible: { mode: 'update_campus', campusId: '' } });
      expect(avantDAccepter(e).bloque).toBe(true);
      expect(ceQuiManquePourAccepter(e.fiche, e.cible, '')).toMatch(/implantation/);
    });
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

describe('le numéro de l’enseigne, avant d’accepter', () => {
  it('à confirmer : celui du relais, sauf corrigé par l’administration, sans numéro ou en essai', () => {
    const saisi = { essai: false, numeroEnseigne: ' +242 05 056 40 40 ' };
    expect(numeroAConfirmer(saisi, false)).toBe('+242 05 056 40 40');
    expect(numeroAConfirmer(saisi, true)).toBeNull();
    expect(
      numeroAConfirmer({ essai: true, numeroEnseigne: '+242 05 056 40 40' }, false),
    ).toBeNull();
    expect(numeroAConfirmer({ essai: false, numeroEnseigne: null }, false)).toBeNull();
    expect(numeroAConfirmer({ essai: false, numeroEnseigne: '   ' }, false)).toBeNull();
  });

  it('manque : un choix, seulement quand il y a un numéro à confirmer', () => {
    expect(ceQuiManqueDuNumero('+242 05 056 40 40', null)).toMatch(/sur la photo/);
    expect(ceQuiManqueDuNumero('+242 05 056 40 40', 'verifie')).toBeNull();
    expect(ceQuiManqueDuNumero('+242 05 056 40 40', 'retire')).toBeNull();
    expect(ceQuiManqueDuNumero(null, null)).toBeNull();
  });

  it('se retire partout, sauf pour la correction d’une école déjà créée (on ne sait pas quel numéro elle a déjà)', () => {
    expect(numeroPeutEtreRetire({ type: 'releve', corrigeUneFicheEnAttente: false })).toBe(true);
    expect(numeroPeutEtreRetire({ type: 'contre_visite', corrigeUneFicheEnAttente: false })).toBe(
      true,
    );
    expect(numeroPeutEtreRetire({ type: 'correction', corrigeUneFicheEnAttente: true })).toBe(true);
    expect(numeroPeutEtreRetire({ type: 'correction', corrigeUneFicheEnAttente: false })).toBe(
      false,
    );
  });
});

// La position saisie par l'administration sur la fiche (ticket 144) : le téléphone du relais n'a pas pu la mesurer, et
// l'administration la lit sur une capture de Google Maps. Elle entre dans la même décision que l'acceptation.

describe('la position saisie sur la fiche (ticket 144)', () => {
  const lue = (contour: string | null = 'Ngoyo'): PositionSaisie => ({
    illisible: false,
    position: { latitude: -4.84841, longitude: 11.90712 },
    contour,
  });
  const illisible: PositionSaisie = { illisible: true, position: null, contour: null };
  const sansSaisie: PositionSaisie = { illisible: false, position: null, contour: null };

  describe('peutSaisirLaPosition', () => {
    it('une fiche sans position : oui, pour une nouvelle école, une implantation ou une mise à jour', () => {
      expect(peutSaisirLaPosition(fiche(), nouvelle)).toBe(true);
      expect(peutSaisirLaPosition(fiche(), { mode: 'new_campus', institutionId: 'i' })).toBe(true);
      expect(peutSaisirLaPosition(fiche(), { mode: 'update_campus', campusId: 'c' })).toBe(true);
    });

    it('la position mesurée par le relais fait foi : pas de champ', () => {
      expect(peutSaisirLaPosition(fiche({ position: POSITION }), nouvelle)).toBe(false);
    });

    it('ajouter des niveaux ne change pas la position de l’école', () => {
      expect(peutSaisirLaPosition(fiche(), { mode: 'add_cycle', campusId: 'c' })).toBe(false);
    });

    it('le lot d’entraînement ne se publie jamais : pas de champ', () => {
      expect(peutSaisirLaPosition(fiche({ essai: true }), nouvelle)).toBe(false);
    });

    it('une correction d’une école déjà créée met l’école à jour : pas de champ', () => {
      expect(peutSaisirLaPosition(fiche({ type: 'correction' }), nouvelle)).toBe(false);
    });

    it('une correction d’une fiche pas encore acceptée, sans position nulle part : oui', () => {
      const enAttente = { type: 'correction' as const, corrigeUneFicheEnAttente: true };
      expect(peutSaisirLaPosition(fiche(enAttente), nouvelle)).toBe(true);
      // Elle a hérité de la position de la fiche d'origine : celle-ci fait foi.
      expect(peutSaisirLaPosition(fiche({ ...enAttente, position: POSITION }), nouvelle)).toBe(
        false,
      );
    });
  });

  describe('divisionRequise', () => {
    it('une position lue dans un contour connu : la division se déduit, rien à choisir', () => {
      expect(divisionRequise(fiche(), nouvelle, lue('Ngoyo'))).toBe(false);
    });

    it('une position qu’aucun contour connu ne contient : à choisir, comme pour une position du relais', () => {
      expect(divisionRequise(fiche(), nouvelle, lue(null))).toBe(true);
    });

    it('le secteur du relais ne remplace plus la position saisie : hors contour, la division se choisit', () => {
      expect(divisionRequise(fiche({ lot: 'Tié-Tié' }), nouvelle, lue(null))).toBe(true);
    });

    it('sans position saisie, rien ne change : le secteur du relais suffit encore', () => {
      expect(divisionRequise(fiche({ lot: 'Tié-Tié' }), nouvelle, sansSaisie)).toBe(false);
      expect(divisionRequise(fiche(), nouvelle, sansSaisie)).toBe(true);
    });

    it('une mise à jour ne demande jamais de division, même avec une position saisie', () => {
      expect(divisionRequise(fiche(), { mode: 'update_campus', campusId: 'c' }, lue(null))).toBe(
        false,
      );
    });
  });

  describe('ceQuiManquePourAccepter', () => {
    it('une position illisible : l’écran le dit, même quand tout le reste est prêt', () => {
      expect(ceQuiManquePourAccepter(fiche({ divisionId: 'd' }), nouvelle, '', illisible)).toMatch(
        /position/i,
      );
    });

    it('une position lue dans un contour connu : plus rien ne manque', () => {
      expect(ceQuiManquePourAccepter(fiche(), nouvelle, '', lue('Ngoyo'))).toBeNull();
    });

    it('une position lue hors de tout contour connu : la division manque, puis plus rien', () => {
      expect(ceQuiManquePourAccepter(fiche(), nouvelle, '', lue(null))).toMatch(/division/);
      expect(ceQuiManquePourAccepter(fiche(), nouvelle, 'd-1', lue(null))).toBeNull();
    });
  });

  describe('avantDAccepter', () => {
    const base = (champs: Partial<EntreeAvantAccepter> = {}): EntreeAvantAccepter => ({
      fiche: {
        essai: false,
        type: 'releve',
        corrigeUneFicheEnAttente: false,
        divisionId: null,
        position: null,
        positionDeLaFicheDOrigine: false,
        precisionM: null,
        lot: null,
        lotDeLaFicheDOrigine: false,
        niveaux: ['primaire'],
        numeroEnseigne: null,
        direction: 'vue',
      },
      photos: [{ role: 'signboard', publiable: true }],
      contact: true,
      contactDeLaFicheDOrigine: false,
      nombreDeFormations: 0,
      formationsAttendues: false,
      cible: nouvelle,
      divisionChoisie: '',
      divisionNom: null,
      ...champs,
    });
    const ligne = (e: EntreeAvantAccepter, cle: string) =>
      avantDAccepter(e).lignes.find((l) => l.cle === cle);

    it('sans position saisie : « Sans position », comme avant', () => {
      expect(ligne(base({ positionSaisie: sansSaisie }), 'position')?.texte).toMatch(
        /Sans position/,
      );
      expect(ligne(base(), 'position')?.texte).toMatch(/Sans position/);
    });

    it('une position saisie dans un contour connu : dite, avec sa zone, sans bloquer', () => {
      const entree = base({ positionSaisie: lue('Ngoyo') });
      expect(ligne(entree, 'position')).toMatchObject({ etat: 'ok' });
      expect(ligne(entree, 'position')?.texte).toMatch(/Saisie par toi/);
      expect(ligne(entree, 'position')?.texte).toMatch(/-4\.84841, 11\.90712/);
      expect(ligne(entree, 'zone')).toMatchObject({ etat: 'ok' });
      expect(ligne(entree, 'zone')?.texte).toMatch(/Ngoyo/);
      expect(avantDAccepter(entree).bloque).toBe(false);
    });

    it('une position saisie hors de tout contour : la zone bloque jusqu’au choix de la division', () => {
      const entree = base({ positionSaisie: lue(null) });
      expect(ligne(entree, 'zone')).toMatchObject({ etat: 'bloque' });
      expect(ligne(entree, 'zone')?.texte).toMatch(
        /aucun contour connu ne contient cette position/,
      );
      expect(avantDAccepter(entree).bloque).toBe(true);
      const choisie = base({
        positionSaisie: lue(null),
        divisionChoisie: 'd-1',
        divisionNom: 'Ngoyo',
      });
      expect(ligne(choisie, 'zone')).toMatchObject({ etat: 'ok' });
      expect(avantDAccepter(choisie).bloque).toBe(false);
    });

    it('une position illisible bloque, et le dit sur la ligne « Position »', () => {
      const entree = base({ positionSaisie: illisible });
      expect(ligne(entree, 'position')).toMatchObject({ etat: 'bloque' });
      expect(ligne(entree, 'position')?.texte).toMatch(/illisible/);
      expect(avantDAccepter(entree).bloque).toBe(true);
    });
  });
});
