// Lot 4 bis (16/11/2026) : la vue Carte de « Les écoles » (planches de la version 46), sur le catalogue fictif et la mini-archive
// de tuiles de `aides-carte.ts` : jamais Internet. Le navigateur doit savoir créer un contexte WebGL2.
import { expect, test, type Page } from '@playwright/test';
import { servirLesTuiles } from './aides-carte';

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
});

const cartes = (page: Page) => page.locator('[data-cartes] > li');

test.beforeEach(async ({ context }) => {
  await servirLesTuiles(context);
});

test.describe('la vue Carte', () => {
  test('« Carte » garde les filtres, montre les écoles situées, et « Liste » ramène la liste', async ({
    page,
  }) => {
    await page.goto('/ecoles/?ville=pointe-noire');
    await page.locator('.liste-vue[data-vue="carte"]').click();
    await expect(page).toHaveURL(/ville=pointe-noire&vue=carte/);
    const zone = page.locator('[data-zone-carte]');
    await expect(zone).toHaveAttribute('data-etat', 'prete', { timeout: 30_000 });
    await expect(zone).toBeVisible();
    // L'en-tête garde ses trois piliers et n'a pas de bouton « Menu » (fondateur, 16/11).
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link'),
    ).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0);
    await page
      .locator('.liste-vue[data-vue="liste"], .liste-retour')
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/ecoles\/\?ville=pointe-noire$/);
    await expect(cartes(page).first()).toBeVisible();
  });

  test('/carte/?ecole=… rouvre l’école sur la vue Carte', async ({ page }) => {
    await page.goto('/carte/?ecole=482913');
    await expect(page).toHaveURL(/\/ecoles\//);
    await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'prete', {
      timeout: 30_000,
    });
    await expect(page.locator('[data-liste]')).toHaveAttribute('data-vue-actuelle', 'carte');
  });
});

test('MapLibre ne se télécharge qu’au toucher de « Carte », et la position n’est jamais demandée', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as unknown as { demandes: number }).demandes = 0;
    navigator.geolocation.getCurrentPosition = () => {
      (window as unknown as { demandes: number }).demandes++;
    };
  });
  const fichiers: string[] = [];
  page.on('request', (r) => fichiers.push(r.url()));
  await page.goto('/ecoles/');
  await page.locator('[data-puces] [data-groupe="ville"][data-valeur="pointe-noire"]').click();
  expect(fichiers.filter((u) => /maplibre|pmtiles|style\.json/.test(u))).toEqual([]);
  await page.locator('.liste-vue[data-vue="carte"]').click();
  await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'prete', {
    timeout: 30_000,
  });
  expect(fichiers.some((u) => /style\.json/.test(u))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { demandes: number }).demandes)).toBe(0);
});

test('un fond de carte qui ne répond pas est dit calmement : les écoles restent', async ({
  page,
  context,
}) => {
  await context.unrouteAll();
  await context.route(/pmtiles/, (r) => r.abort());
  await page.goto('/ecoles/?vue=carte');
  const zone = page.locator('[data-zone-carte]');
  await expect(zone).toHaveAttribute('data-fond', 'absent', { timeout: 30_000 });
  await expect(zone).toHaveAttribute('data-etat', 'prete');
  await expect(page.locator('.zone-carte-fond')).toBeVisible();
});

test('sans WebGL2, rien de la carte n’est téléchargé : la carte le dit, la liste reste', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type, ...reste) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...reste);
    } as typeof getContext;
  });
  const fichiers: string[] = [];
  page.on('request', (r) => fichiers.push(r.url()));
  await page.goto('/ecoles/?vue=carte');
  await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'sans-carte');
  await expect(page.locator('.zone-carte-sans')).toBeVisible();
  expect(fichiers.filter((u) => /maplibre|pmtiles|style\.json/.test(u))).toEqual([]);
  await page.locator('.zone-carte-sans').getByRole('link', { name: 'Voir la liste' }).click();
  await expect(cartes(page).first()).toBeVisible();
});

test.describe('au téléphone', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= 1024,
    'l’aperçu en bas est celui du téléphone',
  );
  test('toucher une école ouvre l’aperçu en bas : Voir la fiche, Y aller', async ({ page }) => {
    await page.goto('/carte/?ecole=482913');
    const apercu = page.locator('[data-apercu]');
    await expect(apercu).toBeVisible({ timeout: 30_000 });
    await expect(apercu).toContainText('[Complexe scolaire Exemple]');
    await expect(apercu.getByRole('link', { name: 'Voir la fiche' })).toHaveAttribute(
      'href',
      '/ecoles/complexe-scolaire-exemple-482913/',
    );
    await expect(apercu.getByRole('link', { name: 'Y aller' })).toHaveAttribute(
      'href',
      /google\.com\/maps/,
    );
    await apercu.getByRole('button', { name: 'Fermer l’aperçu' }).click();
    await expect(apercu).toBeHidden();
  });
});

// La carte qui suit la personne (17/11/2026, feu vert du fondateur) : le pays entier, un vol vers la ville choisie, et le
// premier clic sur une école de la liste qui fait voler la carte vers elle (option A).
const carteDeLaPage = (page: Page) =>
  page.evaluate(() => {
    const c = (
      window as unknown as {
        ntanovaCarte: {
          getZoom(): number;
          getBounds(): { toArray(): number[][] };
          isMoving(): boolean;
        };
      }
    ).ntanovaCarte;
    return { zoom: c.getZoom(), boite: c.getBounds().toArray().flat(), bouge: c.isMoving() };
  });
const carteImmobile = async (page: Page) => {
  await expect.poll(async () => (await carteDeLaPage(page)).bouge, { timeout: 10_000 }).toBe(false);
  return carteDeLaPage(page);
};

test.describe('sur ordinateur, la carte suit la personne', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('sans choix, le pays entier est à l’écran, nord compris', async ({ page }) => {
    await page.goto('/ecoles/?vue=carte');
    await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'prete', {
      timeout: 30_000,
    });
    const [ouest, sud, est, nord] = (await carteImmobile(page)).boite;
    expect(ouest).toBeLessThanOrEqual(11.1);
    expect(sud).toBeLessThanOrEqual(-5.1);
    expect(est).toBeGreaterThanOrEqual(18.7);
    expect(nord).toBeGreaterThanOrEqual(3.8);
  });

  test('choisir Pointe-Noire fait voler la carte vers la ville', async ({ page }) => {
    await page.goto('/ecoles/?vue=carte');
    await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'prete', {
      timeout: 30_000,
    });
    const avant = await carteImmobile(page);
    await page.locator('[data-puces] [data-groupe="ville"][data-valeur="pointe-noire"]').click();
    await expect.poll(async () => (await carteImmobile(page)).zoom).toBeGreaterThan(11);
    expect(avant.zoom).toBeLessThan(7);
  });

  test('le premier clic sur une école la montre sur la carte ; le second ouvre sa fiche', async ({
    page,
  }) => {
    await page.goto('/ecoles/?vue=carte');
    await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'prete', {
      timeout: 30_000,
    });
    await carteImmobile(page);
    const ecole = page.locator('[data-cartes] a[href="/ecoles/complexe-scolaire-exemple-482913/"]');
    await ecole.click();
    await expect(page).toHaveURL(/\/ecoles\/\?vue=carte$/);
    await expect(ecole).toHaveClass(/carte-ecole-active/);
    const apercu = page.locator('[data-apercu]');
    await expect(apercu).toBeVisible();
    await expect(apercu.getByRole('link', { name: 'Voir la fiche' })).toHaveAttribute(
      'href',
      '/ecoles/complexe-scolaire-exemple-482913/',
    );
    await expect.poll(async () => (await carteImmobile(page)).zoom).toBeGreaterThanOrEqual(15);
    await ecole.click();
    await expect(page).toHaveURL(/\/ecoles\/complexe-scolaire-exemple-482913\/$/);
  });
});

test('après un aller-retour Carte → Liste, une école de la liste ouvre toujours sa fiche', async ({
  page,
}) => {
  // Le 17/11 : `<body data-vue>` captait le clic d'une école et la vue rebasculait au lieu d'ouvrir la fiche.
  await page.goto('/ecoles/');
  await page.locator('.liste-vue[data-vue="carte"]').click();
  await expect(page).toHaveURL(/vue=carte/);
  await page
    .locator('.liste-vue[data-vue="liste"], .liste-retour')
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/ecoles\/$/);
  await page.locator('[data-cartes] a[href="/ecoles/complexe-scolaire-exemple-482913/"]').click();
  await expect(page).toHaveURL(/\/ecoles\/complexe-scolaire-exemple-482913\/$/);
});

// Décision du fondateur du 17/11/2026 (option B) : une école ajoutée par NTanova, située, a son épingle en tirets ; aucune
// école de la liste n'est absente de la carte (vu en ligne : « La Colombe de Mavie », trois sites sans épingle).
test.describe('sur ordinateur, une école ajoutée par NTanova', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('« Voir sur la carte » l’ouvre choisie, en épingle en tirets, avec sa mention', async ({
    page,
  }) => {
    await page.goto('/ecoles/ecole-ajoutee-exemple-639158/');
    await page.getByRole('link', { name: 'Voir sur la carte', exact: true }).click();
    await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-etat', 'prete', {
      timeout: 30_000,
    });
    const apercu = page.locator('[data-apercu]');
    await expect(apercu).toBeVisible();
    await expect(apercu).toContainText('[École ajoutée Exemple]');
    await expect(apercu).toContainText('Ajoutée par NTanova · pas encore vue sur place');
    // L'épingle choisie est celle en tirets (et l'école n'est pas cachée de la carte).
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as unknown as { ntanovaCarte: { listImages(): string[] } }).ntanovaCarte
            .listImages()
            .some((n) => /^epingle-.*-ajoutee-choisie$/.test(n)),
        ),
      )
      .toBe(true);
    await expect(page.locator('[data-zone-carte]')).toHaveAttribute('data-aucune', 'non');
  });
});
