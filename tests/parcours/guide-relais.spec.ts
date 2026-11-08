import { expect, test, type Page } from '@playwright/test';
import { GUIDE, dateLisible, nomsDesFichiers } from '../../src/modele/guide-relais';
import { seConnecter } from './aides';

// Le guide du relais (ticket #110), construit avec le faux serveur :
//   - /guide-relais/ : public mais non listé (noindex, aucun lien depuis le site public) ;
//   - /relais/guide/ : le même, dans l'espace relais, gardé par le service worker pour se lire sans réseau ;
//   - le PDF et les images pour WhatsApp sont publiés à côté, à la version et à la date du guide ;
//   - l'écran « Compte » du relais y mène.
// `test:parcours` construit le site puis exporte le guide (outils/guide-relais/exporter.ts).

const noms = nomsDesFichiers();
const versionLue = `Version ${GUIDE.version} · mise à jour le ${dateLisible(GUIDE.miseAJour)}`;

test.use({ permissions: ['geolocation'] });

test.describe('la page publique non listée', () => {
  test('affiche le guide, sa version et sa date, et se lit sans défiler de côté', async ({
    page,
  }) => {
    const reponse = await page.goto('/guide-relais/');
    expect(reponse?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Le guide du relais' })).toBeVisible();
    await expect(page.getByTestId('version-du-guide')).toHaveText(versionLue);
    // Six pages et la carte de passage, chacune sa section nommée.
    await expect(page.locator('section.guide-page')).toHaveCount(GUIDE.pages.length + 1);
    for (const [i, p] of GUIDE.pages.entries()) {
      await expect(page.locator(`#page-${i + 1} h2`)).toContainText(
        p.titre.replace(/<[^>]+>/g, ''),
      );
    }
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement, 'aucun défilement de côté').toBeLessThanOrEqual(0);
  });

  test('n’est pas indexée', async ({ page }) => {
    await page.goto('/guide-relais/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.goto('/relais/guide/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('aucune page du site public n’y mène, ni la recherche', async ({ request }) => {
    for (const adresse of ['/', '/a-propos/', '/pour-les-ecoles/', '/ecoles/', '/carte/']) {
      const corps = await (await request.get(adresse)).text();
      expect(corps, `${adresse} ne doit pas mener au guide`).not.toContain('guide-relais');
    }
    const recherche = await (await request.get('/recherche.json')).text();
    expect(recherche).not.toContain('guide-relais');
    // Le plan du site (ticket 146) et robots.txt existent, mais ne le listent pas.
    const plan = await request.get('/sitemap.xml');
    expect(plan.status()).toBe(200);
    expect(await plan.text()).not.toContain('guide-relais');
    expect(await (await request.get('/robots.txt')).text()).not.toContain('guide-relais');
  });

  test('porte le numéro WhatsApp de la configuration, écrit avec des espaces, sur la carte de passage', async ({
    page,
  }) => {
    await page.goto('/guide-relais/');
    const carte = page.locator('#carte-de-passage');
    await expect(carte).toContainText('Aucune photo d’enfant');
    await expect(carte.locator('.tel')).toHaveText(/^\+242\s*\d{2}\s*\d{3}\s*\d{2}\s*\d{2}$/);
  });

  test('propose le PDF et les images, publiés à la version et à la date du guide', async ({
    page,
    request,
  }) => {
    await page.goto('/guide-relais/');
    const pdf = page.getByRole('link', { name: 'Télécharger le PDF' });
    await expect(pdf).toHaveAttribute('href', `/guide-relais/${noms.pdf}`);

    const reponse = await request.get(`/guide-relais/${noms.pdf}`);
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()['content-type']).toContain('pdf');
    expect(reponse.headers()['x-robots-tag'] ?? '').toContain('noindex');
    const octets = await reponse.body();
    expect(octets.subarray(0, 4).toString()).toBe('%PDF');
    // Six pages et la carte de passage.
    expect((octets.toString('latin1').match(/\/Type\s*\/Page(?![\w])/g) ?? []).length).toBe(
      GUIDE.pages.length + 1,
    );

    const liens = page.locator('#images a');
    await expect(liens).toHaveCount(noms.images.length + 1);
    for (const fichier of [...noms.images.map((i) => i.fichier), noms.carte]) {
      await expect(page.locator(`#images a[href="/guide-relais/${fichier}"]`)).toHaveCount(1);
      const image = await request.get(`/guide-relais/${fichier}`);
      expect(image.status(), fichier).toBe(200);
      expect(image.headers()['content-type'], fichier).toContain('image/png');
    }
  });

  // La page est lisible par quiconque a le lien : les montants ne sont que dans le document complet remis aux relais.
  test('ne montre aucun montant, et ne publie pas le document complet qui en a', async ({
    page,
    request,
  }) => {
    for (const adresse of ['/guide-relais/', '/relais/guide/']) {
      await page.goto(adresse);
      await expect(page.locator('body')).not.toContainText('FCFA');
      await expect(page.locator('#page-5')).toContainText('Les montants');
    }
    const complet = nomsDesFichiers(GUIDE, { complet: true });
    for (const fichier of [complet.pdf, complet.carte, ...complet.images.map((i) => i.fichier)]) {
      expect((await request.get(`/guide-relais/${fichier}`)).status(), fichier).toBe(404);
    }
  });

  test('dit ce qui a changé, du plus récent au plus ancien', async ({ page }) => {
    await page.goto('/guide-relais/');
    const lignes = page.locator('#ce-qui-a-change li');
    await expect(lignes).toHaveCount(GUIDE.changements.length);
    await expect(lignes.first()).toContainText(dateLisible(GUIDE.changements[0]?.date ?? ''));
  });
});

/** Le service worker du relais contrôle la page (il est installé et a gardé ses fichiers). */
async function attendreLeServiceWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

test.describe('dans l’espace relais', () => {
  test('l’écran Compte mène au guide, et le guide ramène à l’application', async ({ page }) => {
    await seConnecter(page, '/relais/');
    await page.goto('/relais/#compte');
    await expect(page.getByRole('heading', { name: 'Compte' })).toBeVisible();

    await page.getByRole('link', { name: 'Lire le guide du relais' }).click();
    await expect(page).toHaveURL(/\/relais\/guide\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Le guide du relais' })).toBeVisible();
    await expect(page.getByTestId('version-du-guide')).toHaveText(versionLue);

    await page.getByRole('link', { name: 'Retour à l’application' }).click();
    await expect(page).toHaveURL(/\/relais\/#compte$/);
    await expect(page.getByRole('heading', { name: 'Compte' })).toBeVisible();
  });

  test('le guide public n’a pas de lien « Retour à l’application »', async ({ page }) => {
    await page.goto('/guide-relais/');
    await expect(page.getByRole('link', { name: 'Retour à l’application' })).toHaveCount(0);
  });

  // Le service worker du relais répond par la coquille de l'application à toute navigation sous /relais/ : sans
  // exception pour le guide, un relais qui a installé l'application verrait l'application au lieu du guide.
  test('un relais dont l’application est installée voit le guide, pas la coquille de l’application', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await attendreLeServiceWorker(page);
    await page.goto('/relais/guide/');
    await expect(page.getByRole('heading', { level: 1, name: 'Le guide du relais' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Sommaire du guide' })).toBeVisible();
  });

  test('se lit sans réseau, images comprises', async ({ page, context }) => {
    await seConnecter(page, '/relais/');
    await attendreLeServiceWorker(page);

    await context.setOffline(true);
    await page.goto('/relais/guide/');
    await expect(page.getByTestId('version-du-guide')).toHaveText(versionLue);
    await expect(page.locator('section.guide-page')).toHaveCount(GUIDE.pages.length + 1);

    // Les captures se chargent au défilement : elles sortent du cache.
    for (const image of await page.locator('.guide-page img').all()) {
      await image.scrollIntoViewIfNeeded();
      await expect
        .poll(() => image.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), {
          message: 'une capture du guide manque hors ligne',
        })
        .toBe(true);
    }
    await context.setOffline(false);
  });
});
