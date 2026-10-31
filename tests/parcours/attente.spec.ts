import { expect, test } from '@playwright/test';

test.describe("page d'attente", () => {
  test("s'affiche en français, sans JavaScript ni ressource extérieure", async ({
    page,
    baseURL,
  }) => {
    const exterieures: string[] = [];
    page.on('request', (r) => {
      if (!r.url().startsWith(baseURL ?? '')) exterieures.push(r.url());
    });

    const reponse = await page.goto('/');
    expect(reponse?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.locator('script:not([type="application/ld+json"])').count()).toBe(0);
    expect(exterieures).toEqual([]);
  });

  test('tient dans 360 px sans défilement horizontal', async ({ page }) => {
    await page.goto('/');
    const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(largeur).toBeLessThanOrEqual(360);
  });

  test('chaque lien ou bouton fait au moins 44 px de haut', async ({ page }) => {
    await page.goto('/');
    for (const cible of await page.locator('a, button').all()) {
      const boite = await cible.boundingBox();
      expect(boite?.height, await cible.innerText()).toBeGreaterThanOrEqual(44);
    }
  });

  test('une adresse inconnue renvoie la page introuvable', async ({ page }) => {
    await page.goto('/cette-page-n-existe-pas/');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });
});
