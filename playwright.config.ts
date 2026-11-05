import { defineConfig, devices } from '@playwright/test';
import { portDesParcours } from './playwright.port';

// Les parcours tournent sur le site construit (dist/), servi par wrangler comme en
// production (pages 404, barres obliques, en-têtes), dans un téléphone Android de
// 360 px de large : la taille des écrans des relais et des familles. La mise en page
// (mise-en-page.spec.ts) tourne aussi sur une tablette (768 px) et un ordinateur
// (1 280 px).
// Réglable par `PLAYWRIGHT_PORT` (voir `playwright.port.ts`) : deux suites sur un même Mac ne se disputent plus le port.
const port = portDesParcours();

export default defineConfig({
  testDir: 'tests/parcours',
  forbidOnly: !!process.env.CI,
  ...(process.env.CI ? { workers: 1, fullyParallel: true, globalTimeout: 12 * 60 * 1000 } : {}),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'android-360', use: { ...devices['Moto G4'] } },
    {
      name: 'tablette-768',
      testMatch: /mise-en-page\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'ordinateur-1280',
      testMatch: /mise-en-page\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${port}`,
    env: { WRANGLER_SEND_METRICS: 'false' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
