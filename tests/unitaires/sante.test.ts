import { describe, expect, it } from 'vitest';
import {
  appareilLisible,
  debutDePeriode,
  expliquerCode,
  periodeParDefaut,
  regrouper,
  type LigneJournal,
} from '../../src/modele/sante';

// « Santé des envois » (ticket #77) : le journal des téléphones, lisible par l'administration. Aucun mot de la base
// ni du navigateur : une phrase par signal, regroupée par relais.

const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const APP_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function ligne(autres: Partial<LigneJournal> = {}): LigneJournal {
  return {
    id: crypto.randomUUID(),
    relaisPrenom: 'Marie',
    survenueLe: '2026-11-03T10:00:00.000Z',
    ecran: 'envoi',
    code: 'position_refusee',
    detail: null,
    versionApp: 'abc1234',
    appareil: CHROME_IPHONE,
    ...autres,
  };
}

describe('expliquerCode', () => {
  it('dit chaque blocage de position avec les mots du relais', () => {
    expect(expliquerCode('position_refusee', null)).toMatch(/Réglages/);
    expect(expliquerCode('position_indisponible', null)).toMatch(/signal|localisation/i);
    expect(expliquerCode('position_trop_longue', null)).toMatch(/trop de temps/);
  });

  it('dit les échecs d’envoi par étape', () => {
    expect(expliquerCode('reseau_releve', null)).toMatch(/relevé/);
    expect(expliquerCode('reseau_photo', null)).toMatch(/photo/);
    expect(expliquerCode('reseau_contact', null)).toMatch(/contact/);
    expect(expliquerCode('delai_depasse', null)).toMatch(/temps limite/);
    expect(expliquerCode('photo_illisible', null)).toMatch(/plus lisible|ne peut pas être lue/);
  });

  it('reconnaît une ancienne version de l’application à la table qu’elle cherche', () => {
    const detail =
      "Error : PGRST205 : Could not find the table 'public.releves' in the schema cache";
    expect(expliquerCode('lecture_refusee', detail)).toMatch(/ancienne version/i);
    expect(expliquerCode('envoi_refuse', detail)).toMatch(/ancienne version/i);
    // Sans cet indice, une lecture refusée reste une lecture refusée.
    expect(expliquerCode('lecture_refusee', 'Error : PGRST116')).not.toMatch(/ancienne version/i);
  });

  it('dit un refus de la base par son code, sans erreur', () => {
    expect(expliquerCode('rejet_photo_absente', null)).toMatch(/refus/i);
  });

  it('dit les tests des premiers pas : le relais sait avant le terrain (ticket #79)', () => {
    expect(expliquerCode('test_position_ok', null)).toMatch(/Test du téléphone.*position marche/);
    expect(expliquerCode('test_position_refusee', null)).toMatch(/Test du téléphone.*refusée/);
    expect(expliquerCode('test_photo_illisible', null)).toMatch(
      /Test du téléphone.*ne se relit pas/,
    );
    expect(expliquerCode('test_photo_ok', null)).toMatch(/Test du téléphone.*photo/);
    expect(expliquerCode('test_connexion_ok', null)).toMatch(/Test du téléphone.*NTanova répond/);
    expect(expliquerCode('test_connexion_echec', null)).toMatch(/Test du téléphone/);
  });

  it('un code inconnu s’affiche tel quel : jamais d’erreur', () => {
    const phrase = expliquerCode('une_nouveaute', null);
    expect(phrase).toContain('une_nouveaute');
  });
});

describe('appareilLisible', () => {
  it('nomme le navigateur et le téléphone', () => {
    expect(appareilLisible(CHROME_IPHONE)).toBe('Chrome sur iPhone');
    expect(appareilLisible(SAFARI_IPHONE)).toBe('Safari sur iPhone');
    expect(appareilLisible(CHROME_ANDROID)).toBe('Chrome sur téléphone Android');
    expect(appareilLisible(CHROME_MAC)).toBe('Chrome sur ordinateur');
  });

  it('reconnaît une page ouverte dans une autre app', () => {
    expect(appareilLisible(APP_IPHONE)).toMatch(/autre app|intégré/i);
  });

  it('un identifiant absent ne casse rien', () => {
    expect(appareilLisible(null)).toBe('Appareil inconnu');
    expect(appareilLisible('')).toBe('Appareil inconnu');
  });
});

describe('regrouper', () => {
  it('une même erreur répétée devient une ligne avec son nombre et ses dates', () => {
    const lignes = [
      ligne({ survenueLe: '2026-11-03T08:00:00.000Z' }),
      ligne({ survenueLe: '2026-11-03T09:00:00.000Z' }),
      ligne({ survenueLe: '2026-11-03T10:00:00.000Z' }),
      ligne({ code: 'delai_depasse', survenueLe: '2026-11-03T07:00:00.000Z' }),
    ];
    const groupes = regrouper(lignes);
    expect(groupes).toHaveLength(2);
    const position = groupes.find((g) => g.code === 'position_refusee');
    expect(position?.nombre).toBe(3);
    expect(position?.premiere).toBe('2026-11-03T08:00:00.000Z');
    expect(position?.derniere).toBe('2026-11-03T10:00:00.000Z');
    expect(position?.appareil).toBe('Chrome sur iPhone');
  });

  it('le plus récent d’abord', () => {
    const groupes = regrouper([
      ligne({ code: 'delai_depasse', survenueLe: '2026-11-03T07:00:00.000Z' }),
      ligne({ code: 'position_refusee', survenueLe: '2026-11-03T12:00:00.000Z' }),
    ]);
    expect(groupes.map((g) => g.code)).toEqual(['position_refusee', 'delai_depasse']);
  });

  it('deux relais, deux versions, deux appareils : jamais mélangés', () => {
    const groupes = regrouper([
      ligne({ relaisPrenom: 'Marie' }),
      ligne({ relaisPrenom: 'Paul' }),
      ligne({ versionApp: 'zzz9999' }),
      ligne({ appareil: CHROME_ANDROID }),
    ]);
    expect(groupes).toHaveLength(4);
  });

  it('garde le détail de la dernière ligne, pour qui veut creuser', () => {
    const groupes = regrouper([
      ligne({
        code: 'reseau_photo',
        detail: 'Load failed | essai 1',
        survenueLe: '2026-11-03T08:00:00.000Z',
      }),
      ligne({
        code: 'reseau_photo',
        detail: 'Load failed | essai 2',
        survenueLe: '2026-11-03T09:00:00.000Z',
      }),
    ]);
    expect(groupes[0]?.detail).toBe('Load failed | essai 2');
  });

  it('un journal vide donne une liste vide', () => {
    expect(regrouper([])).toEqual([]);
  });
});

describe('debutDePeriode', () => {
  const maintenant = new Date('2026-11-10T12:00:00.000Z');

  it('compte en jours en arrière', () => {
    expect(debutDePeriode(7, maintenant)).toBe('2026-11-03T12:00:00.000Z');
    expect(debutDePeriode(1, maintenant)).toBe('2026-11-09T12:00:00.000Z');
  });

  it('« tout » n’a pas de début', () => {
    expect(debutDePeriode(null, maintenant)).toBeNull();
  });

  it('la période par défaut est de 7 jours : le bruit d’une nuit de bascule en sort', () => {
    expect(periodeParDefaut).toBe(7);
  });
});
