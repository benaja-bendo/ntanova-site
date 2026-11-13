// Lot 3 du cahier : « Est-ce une école connue ? ». Le verdict suit la base (`similar_schools`) : 100 m, 500 m, 0,45.
import { describe, expect, it } from 'vitest';
import { verdictDeProximite } from '../../src/modele/fiche-admin';

describe('le verdict de proximité', () => {
  it('à moins de 100 m, c’est le même endroit, quel que soit le nom', () => {
    expect(verdictDeProximite(40, 0)).toBe('deja_la');
  });
  it('à moins de 500 m avec un nom proche, aussi', () => {
    expect(verdictDeProximite(450, 0.6)).toBe('deja_la');
  });
  it('un nom proche plus loin : un autre site', () => {
    expect(verdictDeProximite(1100, 0.6)).toBe('autre_site');
    expect(verdictDeProximite(null, 0.5)).toBe('autre_site');
  });
  it('un autre nom à moins de 500 m : une voisine', () => {
    expect(verdictDeProximite(300, 0.1)).toBe('voisine');
  });
  it('rien de proche, ni par le nom ni par la distance', () => {
    expect(verdictDeProximite(2000, 0.2)).toBeNull();
    expect(verdictDeProximite(null, 0.2)).toBeNull();
  });
});
