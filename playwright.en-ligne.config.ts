import { defineConfig, devices } from '@playwright/test';

// Les contrôles en ligne : après chaque envoi chez Cloudflare, sur le vrai site
// (ADRESSE=https://essai.ntanova.com ou https://ntanova.com), dans un téléphone
// Android de 360 px. Ils ne se connectent jamais et n'écrivent rien dans la base.
const adresse = process.env.ADRESSE;
if (!adresse) throw new Error('ADRESSE manque (ex. : ADRESSE=https://essai.ntanova.com).');

export default defineConfig({
  testDir: 'tests/en-ligne',
  forbidOnly: !!process.env.CI,
  // Le premier certificat d'un domaine peut tarder quelques minutes.
  retries: 2,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: adresse,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'android-360', use: { ...devices['Moto G4'] } }],
});
