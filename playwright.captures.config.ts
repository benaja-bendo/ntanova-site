import { defineConfig, devices } from '@playwright/test';

// Les captures d'écran à relire à l'œil (`pnpm captures`) : chaque écran du site construit
// avec le faux serveur, à 360 px (téléphone), 768 px (tablette), 1 280 px (ordinateur) et 1 920 px
// (grand écran).
// Rien n'y est vérifié : les contrôles sont dans tests/parcours/. Les images vont dans
// captures/, que git ignore.
const port = 4329;

export default defineConfig({
  testDir: 'tests/captures',
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: 'telephone-360', use: { ...devices['Moto G4'], deviceScaleFactor: 1 } },
    {
      name: 'tablette-768',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'ordinateur-1280',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'grand-ecran-1920',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${port}`,
    env: { WRANGLER_SEND_METRICS: 'false' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
