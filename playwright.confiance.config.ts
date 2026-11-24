import { defineConfig, devices } from '@playwright/test';
import { portDesParcours } from './playwright.port';

// Captures des pages de confiance et des villes (refonte, lot 4) aux quatre largeurs demandées : 360, 390, 768 et 1 440 px. Les
// gestes sont ceux des parcours ; rien n'y est vérifié de plus. Les images vont dans captures/confiance/, que git ignore.
const port = portDesParcours();
const tel = (width: number) => ({
  ...devices['Pixel 7'],
  viewport: { width, height: 844 },
  deviceScaleFactor: 1,
});

export default defineConfig({
  testDir: 'tests/captures',
  testMatch: /confiance-v2\.spec\.ts/,
  reporter: 'list',
  workers: 2,
  use: { baseURL: `http://127.0.0.1:${port}` },
  projects: [
    { name: '360', use: tel(360) },
    { name: '390', use: tel(390) },
    { name: '768', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    {
      name: '1440',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: {
    command: `pnpm exec wrangler dev --ip 127.0.0.1 --port ${port}`,
    env: { WRANGLER_SEND_METRICS: 'false' },
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: true,
  },
});
