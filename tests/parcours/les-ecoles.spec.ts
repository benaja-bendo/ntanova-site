// Lot 4 bis (16/11/2026) : « Les écoles », une page, deux vues (planches « Les écoles » de la version 46). Sur le catalogue
// fictif : 9 écoles publiées (7 à Pointe-Noire, 1 à Brazzaville, 1 dans le Niari), dont 5 vues sur place et situées.
import { expect, test, type Page } from '@playwright/test';
import { servirLesTuiles } from './aides-carte';

const cartes = (page: Page) => page.locator('[data-cartes] > li');
const option = (page: Page, groupe: string, valeur: string) =>
  page.locator(`[data-filtres-corps] [data-groupe="${groupe}"][data-valeur="${valeur}"]`);

test.describe('la liste', () => {
  test('construite : les écoles déjà là, la première au premier écran du téléphone, sans JavaScript', async ({
    browser,
    baseURL,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: baseURL ?? '',
      viewport: { width: 360, height: 740 },
    });
    const page = await contexte.newPage();
    await page.goto('/ecoles/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les écoles');
    await expect(cartes(page)).toHaveCount(9);
    const premiere = await cartes(page).first().boundingBox();
    expect(premiere!.y).toBeLessThan(740);
    // Les vues sur place d'abord, la plus récente en tête ; les ajoutées par NTanova à la fin.
    await expect(cartes(page).first()).toContainText('Vue sur place');
    await expect(cartes(page).last()).toContainText('Ajoutée par NTanova');
    // Chaque carte est un seul lien vers sa fiche.
    for (const c of await cartes(page).all()) await expect(c.getByRole('link')).toHaveCount(1);
    await contexte.close();
  });

  test('un choix filtre, compte, se lit dans l’adresse ; le lien partagé rouvre la même liste', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    await page.locator('[data-puces] [data-groupe="ville"][data-valeur="pointe-noire"]').click();
    await expect(page).toHaveURL(/\/ecoles\/\?ville=pointe-noire$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les écoles à Pointe-Noire');
    await expect(cartes(page)).toHaveCount(7);
    await expect(page.locator('[data-sous-titre]')).toContainText('7 écoles');
    // Les compteurs suivent : sous Pointe-Noire, un arrondissement paraît, avec son nombre.
    await page.locator('[data-ouvrir-filtres]').click();
    await expect(page.locator('[data-filtres-corps] [data-groupe="arrondissement"]').first()).toBeVisible();
    await expect(page.locator('[data-nombre-filtres]').first()).toHaveText('1');
    await option(page, 'niveau', 'P').click();
    await expect(page).toHaveURL(/ville=pointe-noire&niveau=P/);
    const nombre = await cartes(page).count();
    await expect(page.locator('[data-voir]')).toHaveText(new RegExp(`^Voir ${nombre} école`));
    await page.locator('[data-voir]').click();
    // Le même lien, ouvert ailleurs : la même liste.
    const adresse = page.url();
    await page.goto(adresse);
    await expect(cartes(page)).toHaveCount(nombre);
  });

  test('une option cochée qui tombe à 0 reste, grisée ; une option à 0 non cochée disparaît', async ({
    page,
  }) => {
    await page.goto('/ecoles/?ville=brazzaville&niveau=S');
    await page.locator('[data-ouvrir-filtres]').click();
    const superieur = option(page, 'niveau', 'S');
    await expect(superieur).toHaveAttribute('aria-pressed', 'true');
    await expect(superieur).toHaveClass(/filtre-vide/);
    await expect(superieur).toContainText('(0)');
    await expect(page.locator('[data-filtres-corps] .filtre-option:not([aria-pressed="true"])')).not.toContainText(
      ['(0)'],
    );
  });

  test('un résultat vide propose toujours une sortie, avec ce qu’elle débloque', async ({ page }) => {
    await page.goto('/ecoles/?q=zzzz');
    const vide = page.locator('[data-vide]');
    await expect(vide).toBeVisible();
    await expect(cartes(page)).toHaveCount(0);
    const sortie = vide.getByRole('button', { name: /Retirer « zzzz » · 9 écoles/ });
    await sortie.click();
    await expect(cartes(page)).toHaveCount(9);
    await expect(page).toHaveURL(/\/ecoles\/$/);
  });

  test('la recherche trouve le sigle et le repère ; « Effacer tout » rend la liste entière', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    await page.getByRole('searchbox', { name: 'Chercher une école' }).fill('gse');
    await expect(cartes(page)).toHaveCount(1);
    await expect(cartes(page).first()).toContainText('[Groupe scolaire Exemple]');
    await page.getByRole('searchbox', { name: 'Chercher une école' }).fill('marché');
    await expect(cartes(page)).toHaveCount(1);
    await page.locator('[data-ouvrir-filtres]').click();
    await page.locator('.filtres-pied [data-effacer]').click();
    await expect(page.locator('[data-nombre-filtres]').first()).toBeHidden();
  });

  test('« Autour de moi » refusé : la liste reste, le message dit quoi faire', async ({ page }) => {
    await page.goto('/ecoles/');
    await page.locator('[data-puces] [data-rayon="3000"]').click();
    await expect(page.locator('[data-message]')).toContainText('Position refusée');
    await expect(cartes(page)).toHaveCount(9);
  });

  test.describe('position donnée', () => {
    test.use({ geolocation: { latitude: -4.79105, longitude: 11.925 }, permissions: ['geolocation'] });
    test('« Autour de moi » : 3 km, la plus proche d’abord, les rayons comptés', async ({ page }) => {
      await page.goto('/ecoles/');
      await page.locator('[data-puces] [data-rayon="3000"]').click();
      await expect(page).toHaveURL(/rayon=3000&tri=proches/);
      await expect(cartes(page).first()).toContainText(/ · \d+ m/);
      await page.locator('[data-ouvrir-filtres]').click();
      await expect(page.locator('[data-filtres-corps] [data-rayon="10000"]')).toContainText(/\(\d+\)/);
      // La position ne quitte jamais le téléphone : ni dans l'adresse, ni gardée dans le navigateur.
      expect(page.url()).not.toMatch(/-4\.79|11\.92/);
      const garde = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
      expect(garde).not.toMatch(/-4\.79|11\.92/);
    });
  });
});

test('une coupure de réseau : le message le dit, et le geste suivant relit le fichier', async ({ page }) => {
  await page.goto('/ecoles/');
  await page.route('**/recherche.json', (r) => r.abort());
  await page.locator('[data-puces] [data-groupe="ville"][data-valeur="pointe-noire"]').click();
  await expect(page.locator('[data-message]')).toContainText('vérifiez la connexion');
  await expect(cartes(page)).toHaveCount(9);
  await page.unroute('**/recherche.json');
  await page.locator('[data-puces] [data-groupe="ville"][data-valeur="pointe-noire"]').click();
  await expect(cartes(page)).toHaveCount(7);
  await expect(page.locator('[data-message]')).toHaveText('');
});

test.describe('les anciennes adresses', () => {
  test('/carte/, /recherche/ et /formations/ renvoient vers « Les écoles », les paramètres suivent', async ({
    request,
  }) => {
    for (const [de, vers] of [
      ['/carte/', '/ecoles/'],
      ['/recherche/?q=lycee', '/ecoles/?q=lycee'],
      ['/formations/', '/ecoles/'],
    ] as const) {
      const r = await request.get(de, { maxRedirects: 0 });
      expect(r.status(), de).toBe(301);
      expect(new URL(r.headers()['location']!, 'http://x').pathname + new URL(r.headers()['location']!, 'http://x').search).toBe(vers);
    }
  });

  test('le plan du site n’a plus /carte/ ni de lieu sans fiche', async ({ request }) => {
    const plan = await (await request.get('/sitemap.xml')).text();
    expect(plan).not.toContain('/carte/');
    expect(plan).toContain('/ecoles/');
  });
});

test.describe('la vue Carte', () => {
  test.use({
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  });
  test.beforeEach(async ({ context }) => {
    await servirLesTuiles(context);
  });

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
    await page.locator('.liste-vue[data-vue="liste"], .liste-retour').filter({ visible: true }).first().click();
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
