import { describe, expect, it } from 'vitest';
import {
  messageDeSupportPremiersPas,
  resumeDesTests,
  testsTermines,
  verdictConnexion,
  verdictPhoto,
  verdictPosition,
  type ResultatsTests,
} from '../../src/modele/premiers-pas';
import { lireEnvironnement } from '../../src/modele/aide-position';

// Les premiers pas (ticket #79) : le relais teste son téléphone AVANT sa première fiche. Une phrase par test, pour qu'un
// téléphone qui refuse la position ou qui ne relit pas ses photos le sache avant d'être devant l'école, sans réseau.

const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const env = lireEnvironnement({ userAgent: CHROME_IPHONE });

describe('verdictPosition', () => {
  it('bonne jusqu’à la précision qui suffit à une fiche', () => {
    expect(verdictPosition(12)).toMatchObject({ bon: true });
    expect(verdictPosition(12).phrase).toMatch(/12 m/);
    expect(verdictPosition(50).bon).toBe(true);
  });

  it('approximative au-delà : elle dit quoi faire', () => {
    const v = verdictPosition(180);
    expect(v.bon).toBe(false);
    expect(v.phrase).toMatch(/180 m/);
    expect(v.phrase).toMatch(/devant l’entrée|dehors/);
  });
});

describe('verdictPhoto', () => {
  it('lisible : sa taille, et rien n’est envoyé', () => {
    const v = verdictPhoto({ octets: 87_400, relue: true });
    expect(v.bon).toBe(true);
    expect(v.phrase).toMatch(/87 Ko/);
  });

  it('une photo qui ne se relit pas une fois rangée : on le dit avant la première fiche', () => {
    const v = verdictPhoto({ octets: 87_400, relue: false });
    expect(v.bon).toBe(false);
    expect(v.phrase).toMatch(/ne se relit pas/);
    expect(v.phrase).toMatch(/NTanova/);
  });
});

describe('verdictConnexion', () => {
  it('NTanova répond', () => {
    expect(verdictConnexion({ enLigne: true, repond: true })).toMatchObject({ bon: true });
  });

  it('pas de réseau : ce n’est pas une panne, les fiches partiront plus tard', () => {
    const v = verdictConnexion({ enLigne: false, repond: false });
    expect(v.bon).toBe(false);
    expect(v.phrase).toMatch(/partiront plus tard/);
  });

  it('du réseau mais pas de réponse de NTanova', () => {
    const v = verdictConnexion({ enLigne: true, repond: false });
    expect(v.bon).toBe(false);
    expect(v.phrase).toMatch(/ne répond pas/);
  });
});

describe('le résumé et le message à NTanova', () => {
  const tout: ResultatsTests = {
    position: { ok: false, erreur: 'refusee' },
    photo: { ok: true, octets: 87_400 },
    connexion: { enLigne: true, repond: true },
  };

  it('le résumé du journal ne dit rien de personnel', () => {
    const resume = resumeDesTests(tout, false);
    expect(resume).toMatch(/position : refusée/);
    expect(resume).toMatch(/photo : lisible \(87 Ko\)/);
    expect(resume).toMatch(/connexion : ok/);
    expect(resume).toMatch(/écran d’accueil : non/);
    expect(resume).not.toMatch(/\d{2} \d{2} \d{2}|@|\+242/);
  });

  it('le message à NTanova dit le téléphone et ce qui ne marche pas', () => {
    const message = messageDeSupportPremiersPas(env, tout);
    expect(message).toMatch(/iPhone/);
    expect(message).toMatch(/Chrome/);
    expect(message).toMatch(/position/);
    expect(message).not.toMatch(/photo.*ne se relit pas/);
  });

  it('les tests sont terminés quand les trois ont un résultat', () => {
    expect(testsTermines(tout)).toBe(true);
    expect(testsTermines({ position: { ok: true, precisionM: 12 } })).toBe(false);
    expect(testsTermines({})).toBe(false);
  });
});
