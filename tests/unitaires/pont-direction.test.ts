import { describe, expect, it } from 'vitest';
import {
  lienPont,
  messageDirection,
  messageHonnete,
  MOTS_INTERDITS,
} from '../../src/modele/pont-direction';

describe('le premier message à la direction', () => {
  const infos = { ecole: '[École exemple]', ville: 'Pointe-Noire', enLigne: true };

  it('dit qui écrit, pourquoi, et ce qu’on demande, au vouvoiement', () => {
    const m = messageDirection(infos);
    expect(m).toContain('ici NTanova (ntanova.com)');
    expect(m).toContain('l’annuaire des écoles de Pointe-Noire');
    expect(m).toContain('[École exemple]');
    expect(m).toContain('quelle est votre fonction');
    expect(m).toMatch(/Pouvez-vous/);
  });

  it('demande l’accord pour « Vérifié par la direction » sans le présumer, et note qu’il sera daté', () => {
    const m = messageDirection(infos);
    expect(m).toContain('« Vérifié par la direction »');
    expect(m).toContain('Répondez « OK » si vous êtes d’accord');
    expect(m).toContain('nous noterons la date de votre accord');
    expect(m).toContain('Sinon, dites-nous ce qu’il faut corriger');
  });

  it('ne dit « en ligne » que si la fiche l’est vraiment', () => {
    expect(messageDirection(infos)).toContain('est en ligne sur ntanova.com');
    expect(messageDirection({ ...infos, enLigne: false })).toContain('est en préparation');
    expect(messageDirection({ ...infos, enLigne: false })).not.toContain('est en ligne');
  });

  it('sans ville connue, il n’en nomme aucune', () => {
    const m = messageDirection({ ...infos, ville: null });
    expect(m).toContain('un annuaire des écoles');
    expect(m).not.toContain('Pointe-Noire');
  });

  it('reste honnête : pas de prix, de « gratuit », d’audience, de couverture, ni de ce que gagne le relais', () => {
    for (const enLigne of [true, false]) {
      for (const ville of ['Pointe-Noire', 'Dolisie', null]) {
        const m = messageDirection({ ecole: '[École]', ville, enLigne });
        expect(messageHonnete(m)).toBe(true);
        for (const mot of MOTS_INTERDITS) expect(m).not.toMatch(mot);
      }
    }
  });

  it('ne contient aucun numéro de téléphone', () => {
    expect(messageDirection(infos)).not.toMatch(/\d{6,}/);
    expect(messageDirection(infos)).not.toMatch(/\+\d/);
  });
});

describe('ce que le message ne doit jamais promettre', () => {
  it.each([
    'C’est gratuit pour votre école.',
    'Pour 5 000 FCFA par mois.',
    'Notre prix est très bas.',
    'Un tarif spécial.',
    'Nos visiteurs sont nombreux.',
    'Notre audience grandit.',
    'Toutes les écoles de la ville sont chez nous.',
    'Le relais sera payé quand vous répondez.',
    'Un abonnement simple.',
  ])('refuse : %s', (phrase) => {
    expect(messageHonnete(phrase)).toBe(false);
  });

  it('le nom de l’école n’est pas contrôlé : un nom propre qui contient « prix » ou « visiteurs » ne bloque rien', () => {
    const infos = { ecole: 'Collège Grand Prix', ville: 'Pointe-Noire', enLigne: true };
    const message = messageDirection(infos);
    expect(messageHonnete(message)).toBe(false);
    expect(messageHonnete(message, [infos.ecole])).toBe(true);
    // Le reste du message reste contrôlé.
    expect(messageHonnete(`${message}\nC’est gratuit.`, [infos.ecole])).toBe(false);
    expect(messageHonnete(`${message}\nLe prix est bas.`, [infos.ecole])).toBe(false);
  });

  it('accepte un message qui ne promet rien', () => {
    expect(messageHonnete('Bonjour, ici NTanova. Pouvez-vous nous répondre ?')).toBe(true);
  });
});

describe('le lien qui ouvre WhatsApp', () => {
  const infos = { ecole: '[École]', ville: 'Pointe-Noire', enLigne: false };

  it('n’existe pas sans l’accord de la direction d’être contactée', () => {
    expect(lienPont({ whatsapp: '242060000001', accord: false }, infos)).toBeNull();
  });

  it('n’existe pas sans numéro WhatsApp', () => {
    expect(lienPont({ whatsapp: null, accord: true }, infos)).toBeNull();
    expect(lienPont({ whatsapp: '12', accord: true }, infos)).toBeNull();
  });

  it('ouvre la conversation avec le message prêt, encodé', () => {
    const lien = lienPont({ whatsapp: '242060000001', accord: true }, infos);
    expect(lien).toMatch(/^https:\/\/wa\.me\/242060000001\?text=/);
    const texte = new URL(lien ?? '').searchParams.get('text');
    expect(texte).toBe(messageDirection(infos));
  });
});
