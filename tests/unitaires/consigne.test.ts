// Ce que le relais lit d'une consigne de mission : jamais une référence interne (audit de la fiche relais, 08/11/2026).
import { describe, expect, it } from 'vitest';
import { texteDestineAuRelais } from '../../src/modele/consigne';

describe('la consigne montrée au relais', () => {
  it('retire la phrase qui cite une référence d’entretien, et garde le reste', () => {
    expect(
      texteDestineAuRelais(
        'Entretien ENT-004 du 20/10, enquêtrice hors application. Nom entendu « Adora », à vérifier. Ville, quartier et niveaux non dits : à retrouver avec elle.',
      ),
    ).toBe(
      'Nom entendu « Adora », à vérifier. Ville, quartier et niveaux non dits : à retrouver avec elle.',
    );
  });

  it('reconnaît toutes les références internes, quelle que soit la casse', () => {
    for (const ref of ['ENT-12', 'etb-0003', 'PER-7', 'PRB-021']) {
      expect(texteDestineAuRelais(`Voir ${ref}. Passez voir le nom écrit.`)).toBe(
        'Passez voir le nom écrit.',
      );
    }
  });

  it('une consigne sans référence passe telle quelle (espaces nettoyés)', () => {
    expect(texteDestineAuRelais('  Vérifiez   le nom sur l’enseigne.  ')).toBe(
      'Vérifiez le nom sur l’enseigne.',
    );
  });

  it('rien à montrer quand il ne reste rien, ou qu’il n’y a rien', () => {
    expect(texteDestineAuRelais('Entretien ENT-004 du 20/10.')).toBeNull();
    expect(texteDestineAuRelais('')).toBeNull();
    expect(texteDestineAuRelais(null)).toBeNull();
    expect(texteDestineAuRelais(undefined)).toBeNull();
  });

  it('un mot qui ressemble sans en être une n’est pas retiré', () => {
    expect(texteDestineAuRelais('Le centre ENTRAIDE-1 est à côté.')).toBe(
      'Le centre ENTRAIDE-1 est à côté.',
    );
  });
});
