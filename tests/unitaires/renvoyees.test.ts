import { describe, expect, it } from 'vitest';
import { refusEstPerime, resumerLesRenvoyees } from '../../src/modele/renvoyees';

// Les fiches renvoyées au relais (ticket #92) : l'administration les retrouve, avec depuis quand elles attendent leur
// relais ; et le relais ne lit plus un refus gardé dans son téléphone quand NTanova a déjà décidé.

const maintenant = new Date('2026-11-03T14:00:00.000Z');
const ilYA = (heures: number) => new Date(maintenant.getTime() - heures * 3_600_000).toISOString();

describe('resumerLesRenvoyees', () => {
  it('ne compte que les fiches « à corriger », pas les acceptées ni les refusées', () => {
    const r = resumerLesRenvoyees(
      [
        { statut: 'a_corriger', decideLe: ilYA(20) },
        { statut: 'accepte', decideLe: ilYA(30) },
        { statut: 'refuse', decideLe: ilYA(40) },
        { statut: 'a_corriger', decideLe: ilYA(2) },
      ],
      maintenant,
    );
    expect(r.nombre).toBe(2);
  });

  it('dit depuis quand la plus ancienne attend son relais', () => {
    const r = resumerLesRenvoyees(
      [
        { statut: 'a_corriger', decideLe: ilYA(2) },
        { statut: 'a_corriger', decideLe: ilYA(20) },
      ],
      maintenant,
    );
    expect(r.plusAncienne?.texte).toBe('depuis 20 h');
  });

  it('rien à renvoyer : zéro, et pas d’ancienneté', () => {
    expect(resumerLesRenvoyees([], maintenant)).toEqual({ nombre: 0, plusAncienne: null });
    expect(resumerLesRenvoyees([{ statut: 'accepte', decideLe: ilYA(5) }], maintenant)).toEqual({
      nombre: 0,
      plusAncienne: null,
    });
  });

  it('une fiche sans date de décision est comptée, sans fausser l’ancienneté', () => {
    const r = resumerLesRenvoyees(
      [
        { statut: 'a_corriger', decideLe: null },
        { statut: 'a_corriger', decideLe: ilYA(3) },
      ],
      maintenant,
    );
    expect(r.nombre).toBe(2);
    expect(r.plusAncienne?.texte).toBe('depuis 3 h');
  });
});

describe('refusEstPerime', () => {
  it('une fiche qui attend NTanova : le refus gardé dans le téléphone dit encore vrai', () => {
    expect(refusEstPerime('a_valider')).toBe(false);
  });

  it('dès que NTanova a décidé (renvoyée, acceptée, refusée), il est périmé : NTanova est déjà prévenue', () => {
    expect(refusEstPerime('a_corriger')).toBe(true);
    expect(refusEstPerime('accepte')).toBe(true);
    expect(refusEstPerime('refuse')).toBe(true);
  });
});
