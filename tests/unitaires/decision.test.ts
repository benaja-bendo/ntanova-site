import { describe, expect, it } from 'vitest';
import { messageManquant } from '../../src/modele/decision';

// Une décision qui renvoie ou refuse une fiche dit toujours quoi faire (ticket #80) : avec le motif « autre », la
// phrase de repli (« Une information est à revoir. ») ne dit rien, le message est donc obligatoire.

describe('messageManquant', () => {
  it('« autre » sans message : la phrase qui dit quoi faire', () => {
    expect(messageManquant('autre', null)).toMatch(/message/);
    expect(messageManquant('autre', '')).toMatch(/message/);
  });

  it('« autre » avec des espaces seulement : toujours sans message', () => {
    expect(messageManquant('autre', '   \n ')).toMatch(/message/);
  });

  it('« autre » avec un message : rien à dire', () => {
    expect(messageManquant('autre', 'Le nom écrit sur le portail est différent.')).toBeNull();
  });

  it('les autres motifs ont leur phrase automatique : le message reste facultatif', () => {
    expect(messageManquant('photo_floue', null)).toBeNull();
    expect(messageManquant('position_imprecise', '')).toBeNull();
    expect(messageManquant('doublon', null)).toBeNull();
    expect(messageManquant('enfant_sur_photo', null)).toBeNull();
  });

  it('une ancienne demande (hors_lot) se relit toujours', () => {
    expect(messageManquant('hors_lot', null)).toBeNull();
  });
});
