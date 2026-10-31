import { describe, expect, it } from 'vitest';
import { lienWhatsApp } from '../../src/modele/whatsapp';

describe('lienWhatsApp', () => {
  it('construit le lien wa.me à partir du numéro international', () => {
    expect(lienWhatsApp('242061234567')).toBe('https://wa.me/242061234567');
  });

  it('accepte le numéro écrit avec +, espaces et tirets', () => {
    expect(lienWhatsApp('+242 06 123-45-67')).toBe('https://wa.me/242061234567');
  });

  it('ajoute le message prérempli, encodé', () => {
    expect(lienWhatsApp('242061234567', 'Bonjour NTanova, ')).toBe(
      'https://wa.me/242061234567?text=Bonjour%20NTanova%2C%20',
    );
  });

  it('ne donne aucun lien sans numéro ou avec un numéro mal formé', () => {
    expect(lienWhatsApp(undefined)).toBeNull();
    expect(lienWhatsApp('')).toBeNull();
    expect(lienWhatsApp('06 123 45 67')).toBeNull();
    expect(lienWhatsApp('242abc')).toBeNull();
  });
});
