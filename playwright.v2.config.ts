import { defineConfig, devices } from '@playwright/test';
import { portDesParcours } from './playwright.port';

// Captures de relecture v2 (`pnpm captures:v2`) : les écrans des planches du fondateur, à 375 px (téléphone) et
// 1 280 px (ordinateur), pour les comparer à l'œil aux planches. Rien n'y est vérifié ; les images vont dans
// captures/v2/, que git ignore.
const port = portDesParcours();

export default defineConfig({
  testDir: 'tests/captures',
  testMatch: /(relais-|admin-)?v2\.spec\.ts/,
  reporter: 'list',
  workers: 2,
  use: { baseURL: `http://127.0.0.1:${port}`, permissions: ['geolocation'] },
  projects: [
    {
      name: '375',
      use: { ...devices['Pixel 7'], viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 },
    },
    { name: '1280', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${port}`,
    env: { WRANGLER_SEND_METRICS: 'false' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
});
