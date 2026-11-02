import { afterEach, describe, expect, it, vi } from 'vitest';

// Deux sessions (ou deux suites) sur un même Mac ne doivent plus se disputer le port de `wrangler dev` : il se règle
// par `PLAYWRIGHT_PORT` (4329 par défaut). La même valeur doit mener l'URL de base, la commande et l'attente du serveur.

type Configuration = {
  use?: { baseURL?: string };
  webServer?: { command?: string; url?: string };
};

const anciennePort = process.env['PLAYWRIGHT_PORT'];

afterEach(() => {
  if (anciennePort === undefined) delete process.env['PLAYWRIGHT_PORT'];
  else process.env['PLAYWRIGHT_PORT'] = anciennePort;
  vi.resetModules();
});

async function charger(fichier: 'parcours' | 'captures', port?: string): Promise<Configuration> {
  vi.resetModules();
  if (port === undefined) delete process.env['PLAYWRIGHT_PORT'];
  else process.env['PLAYWRIGHT_PORT'] = port;
  const module =
    fichier === 'parcours'
      ? await import('../../playwright.config')
      : await import('../../playwright.captures.config');
  return module.default as Configuration;
}

describe.each(['parcours', 'captures'] as const)(
  'le port de la configuration « %s »',
  (fichier) => {
    it('vaut 4329 sans variable, partout', async () => {
      const c = await charger(fichier);
      expect(c.use?.baseURL).toBe('http://127.0.0.1:4329');
      expect(c.webServer?.command).toContain('--port 4329');
      expect(c.webServer?.url).toBe('http://127.0.0.1:4329');
    });

    it('suit PLAYWRIGHT_PORT : l’URL de base, la commande et l’attente du serveur changent ensemble', async () => {
      const c = await charger(fichier, '4411');
      expect(c.use?.baseURL).toBe('http://127.0.0.1:4411');
      expect(c.webServer?.command).toContain('--port 4411');
      expect(c.webServer?.command).not.toContain('4329');
      expect(c.webServer?.url).toBe('http://127.0.0.1:4411');
    });

    it('refuse une valeur qui n’est pas un port, plutôt que de lancer le serveur au hasard', async () => {
      await expect(charger(fichier, 'abc')).rejects.toThrow(/PLAYWRIGHT_PORT/);
      await expect(charger(fichier, '70000')).rejects.toThrow(/PLAYWRIGHT_PORT/);
    });
  },
);
