import { describe, expect, it } from 'vitest';
import { avecMessage, lienWhatsApp } from '../../src/modele/whatsapp';

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

describe('avecMessage', () => {
  it('garde le numéro du lien et remplace le message', () => {
    const lien = lienWhatsApp('242061234567', 'Bonjour NTanova, je suis relais. ') as string;
    expect(avecMessage(lien, 'La position est bloquée (iPhone · Chrome).')).toBe(
      'https://wa.me/242061234567?text=La%20position%20est%20bloqu%C3%A9e%20(iPhone%20%C2%B7%20Chrome).',
    );
  });

  it('ajoute le message à un lien qui n’en a pas', () => {
    expect(avecMessage('https://wa.me/242061234567', 'Bonjour')).toBe(
      'https://wa.me/242061234567?text=Bonjour',
    );
  });

  it('ne fabrique pas un lien à partir de rien', () => {
    expect(avecMessage(null, 'Bonjour')).toBeNull();
    expect(avecMessage('pas un lien', 'Bonjour')).toBeNull();
  });
});
