import { afterEach, describe, expect, it, vi } from 'vitest';
import { charger, lettreDeCycle } from '../../src/ui/recherche-client';

// Une coupure de réseau ne doit pas figer la recherche (audit du 05/11/2026, D8) : la promesse rejetée n'est pas gardée en
// mémoire, un nouvel essai recharge vraiment le fichier.
afterEach(() => vi.unstubAllGlobals());

const reponse = (corps: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => corps }) as unknown as Response;

describe('le fichier de recherche', () => {
  it('un échec n’est pas gardé : le nouvel essai lit de nouveau le réseau, puis le succès est gardé', async () => {
    const lire = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(reponse([{ i: 'a' }]));
    vi.stubGlobal('fetch', lire);

    await expect(charger()).rejects.toThrow('Failed to fetch');
    expect(lire).toHaveBeenCalledTimes(1);

    // Le second essai ne rend pas la promesse rejetée : il recharge.
    await expect(charger()).resolves.toEqual([{ i: 'a' }]);
    expect(lire).toHaveBeenCalledTimes(2);

    // Réussi, le fichier est lu une seule fois.
    await charger();
    expect(lire).toHaveBeenCalledTimes(2);
  });

  it('une réponse en erreur (404, 500) est un échec comme un autre, et n’est pas gardée non plus', async () => {
    // Le succès du test précédent est gardé : on le vide en échouant d'abord, sur un module neuf.
    vi.resetModules();
    const { charger: neuf } = await import('../../src/ui/recherche-client');
    const lire = vi
      .fn()
      .mockResolvedValueOnce(reponse(null, false, 503))
      .mockResolvedValue(reponse([]));
    vi.stubGlobal('fetch', lire);
    await expect(neuf()).rejects.toThrow('recherche.json 503');
    await expect(neuf()).resolves.toEqual([]);
    expect(lire).toHaveBeenCalledTimes(2);
  });
});

describe('le cycle lu dans une adresse', () => {
  it('la lettre, en majuscule ou non, ou l’ancien mot', () => {
    expect(lettreDeCycle('L')).toBe('L');
    expect(lettreDeCycle('l')).toBe('L');
    expect(lettreDeCycle('lycee')).toBe('L');
    expect(lettreDeCycle('creche')).toBe('M');
    expect(lettreDeCycle('autre_formation')).toBe('S');
  });

  it('une valeur inconnue ne choisit rien', () => {
    expect(lettreDeCycle('x')).toBe('');
    expect(lettreDeCycle('')).toBe('');
  });
});
