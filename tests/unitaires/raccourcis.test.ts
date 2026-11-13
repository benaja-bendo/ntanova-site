import { describe, expect, it } from 'vitest';
import { ficheApresLeGeste, gesteDeLaTouche } from '../../src/modele/raccourcis';

describe('raccourcis de « À valider »', () => {
  it('J, K et Échap ; rien dans un champ, avec Ctrl ou quand une fenêtre est ouverte', () => {
    expect(gesteDeLaTouche({ key: 'j' })).toBe('suivante');
    expect(gesteDeLaTouche({ key: 'k' })).toBe('precedente');
    expect(gesteDeLaTouche({ key: 'Escape' })).toBe('liste');
    expect(gesteDeLaTouche({ key: 'j', cible: 'INPUT' })).toBeNull();
    expect(gesteDeLaTouche({ key: 'j', cible: 'TEXTAREA' })).toBeNull();
    expect(gesteDeLaTouche({ key: 'j', modifiable: true })).toBeNull();
    expect(gesteDeLaTouche({ key: 'j', ctrlKey: true })).toBeNull();
    expect(gesteDeLaTouche({ key: 'Escape', fenetreOuverte: true })).toBeNull();
    expect(gesteDeLaTouche({ key: 'a' })).toBeNull();
    expect(gesteDeLaTouche({ key: 'ArrowDown' })).toBeNull();
  });

  it('la suivante, la précédente, sans boucler', () => {
    const ids = ['a', 'b', 'c'];
    expect(ficheApresLeGeste('suivante', ids, null)).toBe('a');
    expect(ficheApresLeGeste('suivante', ids, 'a')).toBe('b');
    expect(ficheApresLeGeste('suivante', ids, 'c')).toBeUndefined();
    expect(ficheApresLeGeste('precedente', ids, 'b')).toBe('a');
    expect(ficheApresLeGeste('precedente', ids, 'a')).toBeUndefined();
    expect(ficheApresLeGeste('precedente', ids, null)).toBe('c');
    expect(ficheApresLeGeste('liste', ids, 'b')).toBeNull();
    expect(ficheApresLeGeste('liste', ids, null)).toBeUndefined();
    expect(ficheApresLeGeste('suivante', [], null)).toBeUndefined();
  });
});
