import { describe, expect, it } from 'vitest';
import { lireNumeroDePaie } from '../../src/modele/numero-de-paie';

describe('le numéro Mobile Money du relais', () => {
  it('un numéro national prend l’indicatif du Congo', () => {
    expect(lireNumeroDePaie('mtn', '06 123 45 67')).toEqual({ ok: true, numero: '242061234567' });
    expect(lireNumeroDePaie('airtel', '+242 05 123 45 67')).toEqual({
      ok: true,
      numero: '242051234567',
    });
  });
  it('sans opérateur, un numéro illisible ou d’une mauvaise longueur : une phrase', () => {
    expect(lireNumeroDePaie(null, '06 123 45 67').ok).toBe(false);
    expect(lireNumeroDePaie('mtn', 'abc').ok).toBe(false);
    const r = lireNumeroDePaie('mtn', '+242 006 123 45 67');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur).toMatch(/10 chiffres après 242/);
  });
});
