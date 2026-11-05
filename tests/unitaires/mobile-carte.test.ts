import { describe, expect, it } from 'vitest';
import {
  MESSAGES_DE_POSITION,
  PERTE_MINIMALE_DU_CLAVIER,
  dansLePays,
  messageDErreurDePosition,
  zoneVisibleAvecClavier,
} from '../../src/modele/carte/mobile';

describe('zoneVisibleAvecClavier', () => {
  it('rend la partie vue quand le clavier mange la moitié de l’écran', () => {
    expect(zoneVisibleAvecClavier(844, { height: 520, offsetTop: 0, scale: 1 })).toEqual({
      haut: 0,
      hauteur: 520,
    });
  });
  it('suit le glissement que le navigateur impose pour montrer le champ', () => {
    expect(zoneVisibleAvecClavier(844, { height: 520, offsetTop: 96.4, scale: 1 })).toEqual({
      haut: 96,
      hauteur: 520,
    });
  });
  it('ignore la barre d’adresse qui se replie : quelques dizaines de pixels ne sont pas un clavier', () => {
    expect(zoneVisibleAvecClavier(844, { height: 844 - 80, offsetTop: 0, scale: 1 })).toBeNull();
    expect(zoneVisibleAvecClavier(844, { height: 844, offsetTop: 0, scale: 1 })).toBeNull();
  });
  it('compte un clavier dès la perte minimale', () => {
    expect(
      zoneVisibleAvecClavier(844, {
        height: 844 - PERTE_MINIMALE_DU_CLAVIER,
        offsetTop: 0,
        scale: 1,
      }),
    ).not.toBeNull();
  });
  it('ignore un zoom par pincement, qui rétrécit aussi l’écran vu', () => {
    expect(zoneVisibleAvecClavier(844, { height: 400, offsetTop: 0, scale: 2 })).toBeNull();
  });
  it('ne rend jamais un décalage négatif (rebond de défilement de l’iPhone)', () => {
    expect(zoneVisibleAvecClavier(844, { height: 500, offsetTop: -12, scale: 1 })?.haut).toBe(0);
  });
});

describe('dansLePays', () => {
  it('Pointe-Noire et Brazzaville sont dans la boîte du pays', () => {
    expect(dansLePays(11.86, -4.78)).toBe(true);
    expect(dansLePays(15.28, -4.27)).toBe(true);
  });
  it('la France, le Maroc et le Cameroun du nord n’y sont pas', () => {
    expect(dansLePays(2.35, 48.85)).toBe(false);
    expect(dansLePays(-7.6, 33.6)).toBe(false);
    expect(dansLePays(13.5, 10)).toBe(false);
  });
});

describe('les mots de « Ma position »', () => {
  it('une permission refusée se dit autrement qu’une position introuvable', () => {
    expect(messageDErreurDePosition(1)).toBe(MESSAGES_DE_POSITION.refusee);
    expect(messageDErreurDePosition(2)).toBe(MESSAGES_DE_POSITION.impossible);
    expect(messageDErreurDePosition(3)).toBe(MESSAGES_DE_POSITION.impossible);
  });
  it('hors du pays, la carte reste centrée sur le pays', () => {
    expect(MESSAGES_DE_POSITION.horsDuPays).toBe(
      'Vous êtes actuellement hors du Congo-Brazzaville. La carte reste centrée sur le pays.',
    );
  });
  it('la connexion non sécurisée est nommée, et la suite reste possible', () => {
    expect(MESSAGES_DE_POSITION.nonSecurisee).toContain('connexion sécurisée');
    expect(MESSAGES_DE_POSITION.nonSecurisee).toContain('Cherchez une école');
  });
});
