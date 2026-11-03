import { describe, expect, it } from 'vitest';
import {
  ceQuiManquePourAccepter,
  divisionRequise,
  heriterDeLOrigine,
  type Cible,
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
