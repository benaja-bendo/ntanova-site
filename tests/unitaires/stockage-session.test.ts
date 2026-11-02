// La session de connexion d'un relais vit dans IndexedDB (jamais dans `localStorage`), et une session ouverte par la
// version d'avant, qui est dans `localStorage`, est reprise une seule fois : à la mise à jour, personne n'est déconnecté
// (un relais déconnecté sans réseau ne pourrait plus rouvrir l'application). Dexie est remplacé par une table en
// mémoire : ce qui est éprouvé ici est la logique de reprise, pas IndexedDB.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const lignes = new Map<string, { cle: string; valeur: string }>();

vi.mock('dexie', () => ({
  default: class {
    version() {
      return { stores: () => undefined };
    }
    lignes = {
      get: async (cle: string) => lignes.get(cle),
      put: async (ligne: { cle: string; valeur: string }) => void lignes.set(ligne.cle, ligne),
      delete: async (cle: string) => void lignes.delete(cle),
    };
  },
}));

const { stockageSession } = await import('../../src/infra/supabase/stockage-session');

/** Un `localStorage` d'avant : ce qui y est écrit, et ce qui en est retiré. */
function fauxLocalStorage(contenu: Record<string, string> = {}) {
  const donnees = new Map(Object.entries(contenu));
  const appels = { setItem: 0 };
  vi.stubGlobal('localStorage', {
    getItem: (cle: string) => donnees.get(cle) ?? null,
    setItem: (cle: string, valeur: string) => {
      appels.setItem++;
      donnees.set(cle, valeur);
    },
    removeItem: (cle: string) => void donnees.delete(cle),
  });
  return { donnees, appels };
}

beforeEach(() => {
  lignes.clear();
  vi.unstubAllGlobals();
});

const CLE = 'sb-projet-auth-token';

describe('la session de connexion', () => {
  it('se garde dans IndexedDB, se relit et s’efface, sans jamais écrire dans localStorage', async () => {
    const { appels } = fauxLocalStorage();
    await stockageSession.setItem(CLE, '{"access_token":"a"}');
    expect(lignes.get(CLE)?.valeur).toBe('{"access_token":"a"}');
    await expect(stockageSession.getItem(CLE)).resolves.toBe('{"access_token":"a"}');
    await stockageSession.removeItem(CLE);
    await expect(stockageSession.getItem(CLE)).resolves.toBeNull();
    expect(appels.setItem).toBe(0);
  });

  it('une session de la version d’avant (dans localStorage) est reprise une seule fois, puis retirée de là', async () => {
    const { donnees } = fauxLocalStorage({ [CLE]: '{"access_token":"ancienne"}' });
    await expect(stockageSession.getItem(CLE)).resolves.toBe('{"access_token":"ancienne"}');
    // Elle est maintenant dans IndexedDB, et plus dans localStorage.
    expect(lignes.get(CLE)?.valeur).toBe('{"access_token":"ancienne"}');
    expect(donnees.has(CLE)).toBe(false);
    // La relecture vient d'IndexedDB.
    await expect(stockageSession.getItem(CLE)).resolves.toBe('{"access_token":"ancienne"}');
  });

  it('la session d’IndexedDB l’emporte sur une ancienne restée dans localStorage', async () => {
    fauxLocalStorage({ [CLE]: '{"access_token":"ancienne"}' });
    await stockageSession.setItem(CLE, '{"access_token":"nouvelle"}');
    await expect(stockageSession.getItem(CLE)).resolves.toBe('{"access_token":"nouvelle"}');
  });

  it('sans session nulle part : rien', async () => {
    fauxLocalStorage();
    await expect(stockageSession.getItem(CLE)).resolves.toBeNull();
  });

  it('sans localStorage (un contexte qui n’en a pas) ou avec un localStorage qui refuse : rien, jamais d’erreur', async () => {
    vi.stubGlobal('localStorage', undefined);
    await expect(stockageSession.getItem(CLE)).resolves.toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('accès refusé');
      },
    });
    await expect(stockageSession.getItem(CLE)).resolves.toBeNull();
  });
});
