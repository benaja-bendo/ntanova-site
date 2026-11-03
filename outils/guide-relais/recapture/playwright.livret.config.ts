import { defineConfig, devices } from '@playwright/test';

// Captures du livret du relais : téléphone 360 px à 3× (images de 1 080 px), port à part.
// LIVRET_NAVIGATEUR : le chemin d'un navigateur déjà installé (session cloud) ; sinon celui de Playwright.
const port = 4339;
const navigateur = process.env['LIVRET_NAVIGATEUR'];

export default defineConfig({
  testDir: 'tests/livret',
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...(navigateur ? { launchOptions: { executablePath: navigateur, args: ['--no-sandbox'] } } : {}),
  },
  projects: [{ name: 'telephone-360-x3', use: { ...devices['Moto G4'], deviceScaleFactor: 3 } }],
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${port}`,
    env: { WRANGLER_SEND_METRICS: 'false' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
