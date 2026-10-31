import { expect, test } from '@playwright/test';

// Le site public, construit avec le catalogue fictif (une école publiée à Tié-Tié).
// Chaque page : en français, sans JavaScript, sans ressource extérieure, lisible
// dans 360 px, avec des cibles d'au moins 44 px.

const pages = [
  '/',
  '/ecoles/tie-tie/',
  '/ecoles/ngoyo/',
  '/ecoles/tie-tie/complexe-scolaire-exemple/',
  '/pour-les-ecoles/',
  '/a-propos/',
];

test.describe('site public', () => {
  for (const adresse of pages) {
    test(`${adresse} : sans JavaScript, 360 px, cibles de 44 px`, async ({ page, baseURL }) => {
      const exterieures: string[] = [];
      page.on('request', (r) => {
        if (!r.url().startsWith(baseURL ?? '')) exterieures.push(r.url());
      });
      const reponse = await page.goto(adresse);
      expect(reponse?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.locator('script:not([type="application/ld+json"])').count()).toBe(0);
      expect(exterieures).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
      for (const cible of await page.locator('a, button').all()) {
        // Un lien caché à cette largeur (la navigation du haut, réservée aux écrans larges) n'est pas une cible.
        if (!(await cible.isVisible())) continue;
        const boite = await cible.boundingBox();
        expect(boite?.height, await cible.innerText()).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('de l’accueil à la fiche d’une école, puis vers « Pour les écoles »', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: /Tié-Tié.*Arrondissement 3.*1 école/ }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Ngoyo.*relevé en cours/ })).toBeVisible();
    await page
      .getByRole('link', { name: /Tié-Tié/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Tié-Tié', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /\[Complexe scolaire Exemple\]/ }).click();

    await expect(page.getByRole('heading', { name: '[Complexe scolaire Exemple]' })).toBeVisible();
    await expect(page.getByText(/Fiche relevée le 2 novembre 2026/)).toBeVisible();
    await expect(page.getByText('Maternelle, Primaire')).toBeVisible();
    await expect(page.getByRole('link', { name: '+242 06 000 00 01' })).toHaveAttribute(
      'href',
      'tel:+242060000001',
    );
    await expect(page.getByRole('link', { name: 'Y aller' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-4.79105,11.925',
    );
    await page.getByRole('link', { name: 'Confirmer la fiche' }).click();
    await expect(page.getByRole('heading', { name: 'Vous dirigez une école ?' })).toBeVisible();
  });

  test('le code de la fiche de liaison part sur WhatsApp, sans JavaScript', async ({ page }) => {
    await page.goto('/pour-les-ecoles/');
    const formulaire = page.locator('form');
    await expect(formulaire).toHaveAttribute('action', /^https:\/\/wa\.me\/\d+$/);
    await expect(formulaire).toHaveAttribute('method', 'get');
    await expect(page.getByLabel('Le code à 4 chiffres écrit dessus')).toHaveAttribute(
      'name',
      'text',
    );
  });

  test('« À propos » dit ce qui est publié, ce qui est gardé, et la loi', async ({ page }) => {
    await page.goto('/a-propos/');
    await expect(page.getByRole('heading', { name: 'Ce que nous publions' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ce que nous gardons pour nous' }),
    ).toBeVisible();
    await expect(page.getByText(/loi congolaise n°\s29-2019 du 10\soctobre 2019/)).toBeVisible();
  });

  test('l’ancienne adresse d’une fiche fusionnée renvoie vers l’école gardée, sans JavaScript', async ({
    request,
  }) => {
    const reponse = await request.get('/ecoles/tie-tie/ancienne-fiche-exemple/');
    expect(reponse.status()).toBe(200);
    const html = await reponse.text();
    expect(html).toContain(
      '<meta http-equiv="refresh" content="0; url=/ecoles/tie-tie/complexe-scolaire-exemple/">',
    );
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  });

  test('une adresse inconnue renvoie la page introuvable', async ({ page }) => {
    const reponse = await page.goto('/cette-page-n-existe-pas/');
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    // Une école retirée n'a plus de page : rien d'elle n'est dit, pas même son nom.
    await expect(page.getByText(/n'est plus publiée/)).toBeVisible();
  });
});
