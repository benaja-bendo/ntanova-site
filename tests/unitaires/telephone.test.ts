import { describe, expect, it } from 'vitest';
import { normaliserTelephone, numeroCongolaisSuspect } from '../../src/modele/telephone';

// Un numéro congolais a 9 chiffres après l'indicatif 242 (06 123 45 67). Le numéro de l'enseigne d'ESTAM, le 03/11, était
// rangé « +242 0064970301 » pour « 06 497 03 01 » : un zéro de trop, que rien ne signalait, et qui aurait été public
// (ticket #95).

describe('un numéro congolais qui se lit mal', () => {
  it('9 chiffres après l’indicatif : rien à dire', () => {
    expect(numeroCongolaisSuspect('242064970301')).toBeNull();
    expect(numeroCongolaisSuspect(normaliserTelephone('06 497 03 01'))).toBeNull();
    expect(numeroCongolaisSuspect(normaliserTelephone('+242 06 497 03 01'))).toBeNull();
  });

  it('un zéro de trop : le nombre de chiffres est dit', () => {
    expect(numeroCongolaisSuspect('2420064970301')).toEqual({ chiffres: 10 });
    expect(numeroCongolaisSuspect(normaliserTelephone('+242 0064970301'))).toEqual({
      chiffres: 10,
    });
  });

  it('un chiffre de moins aussi', () => {
    expect(numeroCongolaisSuspect('24206497030')).toEqual({ chiffres: 8 });
  });

  it('un numéro d’un autre pays, ou qui n’est pas un numéro, n’est jamais suspect', () => {
    expect(numeroCongolaisSuspect('33612345678')).toBeNull();
    expect(numeroCongolaisSuspect('')).toBeNull();
    expect(numeroCongolaisSuspect(null)).toBeNull();
  });
});
