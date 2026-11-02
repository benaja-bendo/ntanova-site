import { expect, test } from '@playwright/test';

// Ce qui doit marcher sur le site en ligne, juste après un envoi. Ces contrôles
// lisent seulement : aucune connexion, aucune écriture dans la base.

test.describe('le site en ligne', () => {
  test('la page d’attente répond, en français, avec le lien WhatsApp', async ({ page }) => {
    const reponse = await page.goto('/');
    expect(reponse?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('a[href^="https://wa.me/"]').first()).toBeVisible();
  });

  test('une adresse inconnue répond 404 avec la page introuvable', async ({ page }) => {
    const reponse = await page.goto('/cette-page-n-existe-pas/');
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });

  test('la position n’est permise que sur l’espace relais et sur « Autour de moi »', async ({
    request,
  }) => {
    const accueil = await request.get('/');
    expect(accueil.headers()['permissions-policy']).toContain('geolocation=()');
    const relais = await request.get('/relais/');
    expect(relais.headers()['permissions-policy']).toContain('geolocation=(self)');
    const autour = await request.get('/autour-de-moi/');
    expect(autour.headers()['permissions-policy']).toContain('geolocation=(self)');
    // Autour de moi n'a pas besoin de l'appareil photo.
    expect(autour.headers()['permissions-policy']).toContain('camera=()');
  });

  test('chaque fichier gardé pour le hors ligne existe', async ({ request }) => {
    // Un seul fichier manquant, et le service worker ne s'installe pas : plus de hors ligne.
    const sw = await request.get('/relais/sw.js');
    expect(sw.status()).toBe(200);
    const liste = /const FICHIERS = (\[[\s\S]*?\]);/.exec(await sw.text())?.[1];
    expect(liste, 'liste des fichiers dans sw.js').toBeTruthy();
    const fichiers = JSON.parse(liste ?? '[]') as string[];
    expect(fichiers).toContain('/relais/');
    for (const fichier of fichiers) {
      expect((await request.get(fichier)).status(), fichier).toBe(200);
    }
  });

  test('l’espace relais affiche la connexion Google', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await page.goto('/relais/');
    await expect(page).toHaveTitle('Espace relais · NTanova');
    await expect(
      page.getByRole('heading', { name: 'Relever les écoles de son quartier.' }),
    ).toBeVisible();
    // Le bouton de Google est une iframe : il n'apparaît que si le script de Google
    // se charge et que l'identifiant du client est dans la construction.
    await expect(page.locator('.zone-google iframe')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('PUBLIC_GOOGLE_CLIENT_ID manque.')).toHaveCount(0);
    expect(erreurs).toEqual([]);
  });

  test('l’espace relais s’installe : manifeste et service worker', async ({ page }) => {
    await page.goto('/relais/');
    const manifeste = await page.request.get('/relais/manifest.webmanifest');
    expect(manifeste.status()).toBe(200);
    expect(await manifeste.json()).toMatchObject({ scope: '/relais/', start_url: '/relais/' });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 15_000,
    });
  });
});
