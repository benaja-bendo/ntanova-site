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
async function connexion(page: import('@playwright/test').Page, valeur: object | undefined) {
  await page.addInitScript(
    (v) => Object.defineProperty(navigator, 'connection', { value: v, configurable: true }),
    valeur,
  );
}
test('l’accueil reçoit le composant partagé et active la carte visible sans information réseau', async ({
  page,
}) => {
  await connexion(page, undefined);
  await page.goto('/');
  await expect(page.locator('[data-carte-page=accueil]')).toBeVisible({ timeout: 1000 });
  await page.locator('.explorateur').scrollIntoViewIfNeeded();
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  await expect(page.locator('.carte-repli')).toBeHidden();
  await expect(page.locator('.plein-ecran')).toBeVisible();
  await expect(page.locator('.plein-ecran')).toHaveAttribute('href', /\/carte\/#/);
});
for (const c of [
  { saveData: true },
  { effectiveType: 'slow-2g' },
  { effectiveType: '2g' },
  { effectiveType: '3g' },
])
  test(`connexion ${JSON.stringify(c)} : rien avant activation explicite`, async ({ page }) => {
    await connexion(page, c);
    const carte: string[] = [];
    page.on('request', (r) => {
      if (
        /tuiles\.ntanova|\/_astro\/(esm|ilot|maplibre)|\/carte\/(style\.json|.*geojson)/.test(
          r.url(),
        )
      )
        carte.push(r.url());
    });
    await page.goto('/');
    await page.locator('.explorateur').scrollIntoViewIfNeeded();
    await expect(
      page.getByRole('button', { name: 'Explorer la carte interactive', exact: true }),
    ).toBeVisible();
    expect(carte).toEqual([]);
    await page.getByRole('button', { name: 'Explorer la carte interactive', exact: true }).click();
    await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
    expect(carte.length).toBeGreaterThan(0);
  });
test('bonne connexion : carte sous le pli, chargement à son arrivée dans la vue', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 300 });
  await connexion(page, { effectiveType: '4g' });
  const grosses: string[] = [];
  page.on('request', (r) => {
    if (/tuiles\.ntanova|\/_astro\/(esm|ilot|maplibre)/.test(r.url())) grosses.push(r.url());
  });
  await page.goto('/');
  expect(grosses).toEqual([]);
  await page.locator('.explorateur').scrollIntoViewIfNeeded();
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
});
test('sans WebGL2 : zéro téléchargement de carte, repli et liste accessibles', async ({ page }) => {
  await connexion(page, undefined);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      return type === 'webgl2'
        ? null
        : (original as (...a: unknown[]) => unknown).call(this, type, ...args);
    } as typeof original;
  });
  const grosses: string[] = [];
  page.on('request', (r) => {
    if (/tuiles\.ntanova|\/_astro\/(esm|ilot|maplibre)/.test(r.url())) grosses.push(r.url());
  });
  await page.goto('/');
  await page.locator('.explorateur').scrollIntoViewIfNeeded();
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'repli-sans-webgl2');
  expect(grosses).toEqual([]);
  await expect(
    page.getByRole('link', { name: 'Voir toutes les écoles', exact: true }),
  ).toBeVisible();
});
test('le plein écran conserve la vue choisie', async ({ page }) => {
  await connexion(page, undefined);
  await page.goto('/');
  await page.locator('.explorateur').scrollIntoViewIfNeeded();
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  await page.evaluate(() => {
    const m = (window as unknown as { ntanovaCarte: { jumpTo: (x: object) => void } }).ntanovaCarte;
    m.jumpTo({ center: [15.27, -4.27], zoom: 10 });
  });
  await expect(page.locator('.plein-ecran')).toHaveAttribute('href', /#10\/-4.27\/15.27$/);
  await page.locator('.plein-ecran').click();
  await expect(page.locator('.explorateur-app')).toHaveAttribute('data-active', 'oui');
  await expect(page).toHaveURL(/#10\/-4.27\/15.27$/);
});

test('la molette sans modificateur laisse défiler la page sans zoomer la carte intégrée', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await connexion(page, undefined);
  await page.goto('/');
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  const avant = await page.evaluate(() => ({
    y: scrollY,
    z: (window as unknown as { ntanovaCarte: { getZoom: () => number } }).ntanovaCarte.getZoom(),
  }));
  const b = await page.locator('#carte').boundingBox();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2);
  await page.mouse.wheel(0, 250);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(avant.y);
  expect(
    await page.evaluate(() =>
      (window as unknown as { ntanovaCarte: { getZoom: () => number } }).ntanovaCarte.getZoom(),
    ),
  ).toBeCloseTo(avant.z, 2);
});
test('la popup de l’accueil partage le même aperçu et les deux preuves datées', async ({
  page,
}) => {
  await connexion(page, undefined);
  await page.goto('/');
  await page.locator('.explorateur').scrollIntoViewIfNeeded();
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  const position = await page.evaluate(() => {
    const m = (
      window as unknown as {
        ntanovaCarte: {
          jumpTo: (p: object) => void;
          project: (c: number[]) => { x: number; y: number };
          getCanvas: () => HTMLCanvasElement;
        };
      }
    ).ntanovaCarte;
    m.jumpTo({ center: [11.928, -4.7955], zoom: 15 });
    return true;
  });
  expect(position).toBe(true);
  await expect.poll(() => page.locator('.maplibregl-canvas').count()).toBe(1);
  const point = await page.evaluate(() => {
    const m = (
      window as unknown as {
        ntanovaCarte: {
          project: (c: number[]) => { x: number; y: number };
          getCanvas: () => HTMLCanvasElement;
        };
      }
    ).ntanovaCarte;
    const p = m.project([11.928, -4.7955]);
    const r = m.getCanvas().getBoundingClientRect();
    return { x: r.x + p.x, y: r.y + p.y };
  });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('.carte-apercu')).toContainText('Vue sur place le');
  await expect(page.locator('.carte-apercu')).toContainText('Confirmée par la direction le');
  await expect(
    page.locator('.carte-apercu').getByRole('link', { name: 'Partager sur WhatsApp' }),
  ).toBeVisible();
});
test.describe('sans JavaScript actif', () => {
  test.use({ javaScriptEnabled: false });
  test('le dessin et les liens restent utilisables', async ({ page }) => {
    const demandes: string[] = [];
    page.on('request', (r) => demandes.push(r.url()));
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Explorer la carte', exact: true })).toBeVisible();
    await expect(page.locator('.carte-repli')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Voir toutes les écoles', exact: true }),
    ).toBeVisible();
    expect(demandes.filter((u) => u.includes('tuiles.ntanova'))).toEqual([]);
  });
});
