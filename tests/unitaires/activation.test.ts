import { describe, expect, it } from 'vitest';
import { messageDActivation } from '../../src/modele/compte';

// Le compte en attente dit quoi faire (ticket #78) : NTanova ne peut pas « prévenir sur WhatsApp » un relais dont il n'a
// pas le numéro. C'est le relais qui écrit, avec l'adresse de son compte : l'administration la retrouve dans « Relais ».

describe('messageDActivation', () => {
  it('dit l’adresse de connexion, pour que NTanova relie le compte à la personne', () => {
    const message = messageDActivation('marie@exemple.test');
    expect(message).toContain('marie@exemple.test');
    expect(message).toMatch(/activer mon compte/);
  });

  it('sans adresse connue, le message se lit quand même', () => {
    const message = messageDActivation(null);
    expect(message).toMatch(/activer mon compte/);
    expect(message).not.toMatch(/null|undefined/);
  });

  it('ne dit rien d’autre que l’adresse : ni prix, ni promesse, ni numéro', () => {
    expect(messageDActivation('marie@exemple.test')).not.toMatch(/FCFA|gratuit|prix|\+242|\d{6}/);
  });
});
