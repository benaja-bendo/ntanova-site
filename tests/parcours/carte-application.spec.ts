import { expect, test } from '@playwright/test';
import { servirLesTuiles } from './aides-carte';
test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
});
test.beforeEach(async ({ context }) => {
  await servirLesTuiles(context);
});
async function ouvrir(page: import('@playwright/test').Page) {
  await page.goto('/carte/');
  await expect(page.locator('.explorateur')).toHaveAttribute('data-active', 'oui');
}
test('depuis l’accueil : accès direct visible, sans charger MapLibre avant le clic', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
  const demandes: string[] = [];
  page.on('request', (r) => demandes.push(r.url()));
  await page.goto('/');
  const bouton = page.getByRole('link', { name: 'Explorer la carte', exact: true });
  await expect(bouton).toBeInViewport();
  expect(demandes.some((u) => /\/_astro\/(esm|ilot|maplibre)/.test(u))).toBe(false);
  await bouton.click();
  await expect(page).toHaveURL(/\/carte\//);
  await expect(page.locator('.explorateur')).toHaveAttribute('data-active', 'oui');
  const b = await page.locator('#carte').boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(641);
  const toile = await page.locator('.maplibregl-canvas').boundingBox();
  expect(toile!.height).toBeGreaterThan(500);
  expect(Math.abs(toile!.height - b!.height)).toBeLessThan(3);
});
test('liste accessible, recherche hors de la vue, école sans épingle et filtre', async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await expect(page.locator('[data-resultats]')).toContainText('Exemple');
  await page.getByRole('searchbox').fill('École ajoutée');
  await page.getByRole('button', { name: 'Chercher', exact: true }).click();
  await expect(page.locator('[data-resultats]')).toContainText('École ajoutée Exemple');
  await expect(page.locator('[data-resultats]')).toContainText(
    'n’est pas encore visible sur la carte',
  );
  await expect(
    page.locator('[data-resultats]').getByRole('button', { name: 'Voir sur la carte' }),
  ).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByRole('combobox', { name: 'Cycle' }).selectOption('M');
  await expect(page.locator('[data-resultats]')).not.toContainText('Centre de formation Exemple');
});
test('sélection, deux preuves datées, partage puis retour sans quitter la carte', async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await page.getByRole('searchbox').fill('Groupe scolaire quartier');
  await page.getByRole('button', { name: 'Chercher', exact: true }).click();
  await page
    .locator('[data-resultats]')
    .getByRole('button', { name: 'Voir sur la carte' })
    .first()
    .click();
  const apercu = page.locator('.carte-apercu');
  await expect(apercu).toContainText('Vue sur place le');
  await expect(apercu).toContainText('Confirmée par la direction le');
  await expect(page).toHaveURL(/ecole=/);
  await expect(apercu.getByRole('link', { name: 'Partager sur WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa.me\/\?text=/,
  );
  const url = page.url();
  await page.goBack();
  await expect(apercu).toHaveCount(0);
  await expect(page).toHaveURL(/\/carte\//);
  await page.goto(url);
  await expect(apercu).toContainText('Groupe scolaire');
});
test('GPS refusé : recherche disponible, aucune demande avant le geste', async ({ page }) => {
  await page.addInitScript(() => {
    let appels = 0;
    Object.defineProperty(window, 'appelsGPS', { get: () => appels });
    navigator.geolocation.getCurrentPosition = ((
      _ok: PositionCallback,
      erreur?: PositionErrorCallback | null,
    ) => {
      appels++;
      erreur?.({
        code: 1,
        message: 'refus',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    }) as typeof navigator.geolocation.getCurrentPosition;
  });
  await ouvrir(page);
  expect(await page.evaluate(() => (window as unknown as { appelsGPS: number }).appelsGPS)).toBe(0);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toContainText('n’a pas pu être obtenue');
  await expect(page.getByRole('button', { name: 'Ma position', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { appelsGPS: number }).appelsGPS)).toBe(1);
});
test('GPS obtenu : aucune coordonnée personnelle dans URL, stockage ou partage', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = ((ok: PositionCallback) =>
      ok({
        coords: {
          latitude: -4.81234567,
          longitude: 11.91234567,
          accuracy: 20,
          toJSON: () => ({}),
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      })) as typeof navigator.geolocation.getCurrentPosition;
  });
  await ouvrir(page);
  const demandes: string[] = [];
  page.on('request', (r) => demandes.push(r.url() + (r.postData() ?? '')));
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toContainText('ne conserve pas votre position');
  await page.waitForTimeout(500);
  expect(page.url()).not.toContain('812345');
  expect(demandes.join(' ')).not.toMatch(/812345|912345/);
  expect(
    await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage)),
  ).not.toMatch(/812345|912345/);
});

test('plein écran : aucun flash du dessin pendant le chargement du moteur', async ({ page }) => {
  let liberer!: () => void;
  const attente = new Promise<void>((resolve) => (liberer = resolve));
  await page.route('**/_astro/*.js', async (route) => {
    await attente;
    await route.continue();
  });
  try {
    // Le HTML peut être peint alors que son premier module n’est pas encore reçu.
    await page.goto('/carte/#12/-4.8/11.93', { waitUntil: 'commit' });
    await expect(page.locator('#carte')).toBeVisible();
    await expect(page.locator('.carte-repli')).toBeHidden();
    await expect(page.locator('.carte-attente')).toBeVisible();
    await expect(page.locator('.listes-repli')).toBeVisible();
  } finally {
    liberer();
  }
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  await expect(page.locator('.carte-attente')).toBeHidden();
});

test.describe('plein écran sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('le dessin et les listes restent immédiatement disponibles', async ({ page }) => {
    await page.goto('/carte/');
    await expect(page.locator('.carte-repli')).toBeVisible();
    await expect(page.locator('.listes-repli')).toBeVisible();
    await expect(page.locator('.carte-attente')).toBeHidden();
  });
});
