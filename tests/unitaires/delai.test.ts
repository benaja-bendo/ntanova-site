import { describe, expect, it, vi } from 'vitest';
import { limiterLeTemps } from '../../src/modele/delai';

// Ticket #74 : un envoi qui ne finit jamais ne doit pas retenir tous les suivants. « Un seul envoi à la fois : un second
// appel attend le premier » : si le premier ne finit jamais, rien ne repart. La file se donne une limite de temps.
describe('limiter le temps d’une promesse', () => {
  it('rend le résultat quand il arrive à temps', async () => {
    await expect(limiterLeTemps(Promise.resolve('fini'), 1000, 'trop tard')).resolves.toBe('fini');
  });

  it('rend la valeur de repli quand le délai passe, et le dit', async () => {
    vi.useFakeTimers();
    try {
      const surDelai = vi.fn();
      const jamais = new Promise<string>(() => {});
      const resultat = limiterLeTemps(jamais, 150_000, 'trop tard', surDelai);
      await vi.advanceTimersByTimeAsync(149_000);
      expect(surDelai).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);
      await expect(resultat).resolves.toBe('trop tard');
      expect(surDelai).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ne dit pas « trop tard » quand le résultat est arrivé', async () => {
    vi.useFakeTimers();
    try {
      const surDelai = vi.fn();
      const resultat = limiterLeTemps(Promise.resolve('fini'), 1000, 'trop tard', surDelai);
      await expect(resultat).resolves.toBe('fini');
      await vi.advanceTimersByTimeAsync(5000);
      expect(surDelai).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('un refus arrive tel quel', async () => {
    await expect(limiterLeTemps(Promise.reject(new Error('refus')), 1000, 'x')).rejects.toThrow(
      'refus',
    );
  });
});
