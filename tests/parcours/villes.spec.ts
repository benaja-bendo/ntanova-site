import { expect, test, type Page } from '@playwright/test';

// « Toutes les villes » et les liens des mentions (refonte publique, lot 4, 24/11/2026) : une vraie entrée depuis l'accueil et
// le pied ; chaque nombre est celui de la page où mène son lien ; un lieu sans fiche reste du texte ; la recherche « ville ou
// quartier » ouvre la liste réelle par `ou` ; les mentions de la fiche réelle et de la démonstration mènent à leur explication.

const sousTitre = (page: Page) => page.locator('[data-sous-titre]');
async function nombreDeLaListe(page: Page): Promise<number> {
  await expect(page.locator('[data-liste][data-pret]')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  const texte = (await sousTitre(page).innerText()).trim();
  if (texte.startsWith('Aucune')) return 0;
  return Number(/^(\d+)/.exec(texte)?.[1] ?? NaN);
}
/** Le nombre d'écoles qu'annonce la page d'un lieu (« 7 écoles, dont… »). */
const nombreDuLieu = async (page: Page) =>
  Number(/^(\d+) écoles?/.exec((await page.locator('.compte').innerText()).trim())?.[1] ?? NaN);
const recherche = (page: Page) =>
  page.getByRole('searchbox', { name: 'Chercher une ville ou un quartier' });

test.describe('Toutes les villes', () => {
  test('l’accueil et le pied y mènent ; la page est indexée et listée dans le plan du site', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Voir toutes les villes' }).click();
    await expect(page).toHaveURL('/villes/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Les écoles, ville par ville');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await page.goto('/orienter/');
    await page.locator('footer').getByRole('link', { name: 'Toutes les villes' }).click();
    await expect(page).toHaveURL('/villes/');
    expect(await (await request.get('/sitemap.xml')).text()).toContain(
      '<loc>https://ntanova.com/villes/</loc>',
    );
    expect(await (await request.get('/llms.txt')).text()).toContain('https://ntanova.com/villes/');
  });

  test('chaque ville et chaque arrondissement annoncent le nombre de la page où ils mènent', async ({
    page,
  }) => {
    await page.goto('/villes/');
    const region = page.getByRole('region', { name: 'Avec des fiches' });
    const liens = await region
      .locator('a')
      .evaluateAll((l) =>
        l.map((a): [string, string] => [a.getAttribute('href') ?? '', a.textContent ?? '']),
      );
    expect(liens.length).toBeGreaterThan(4);
    for (const [href, texte] of liens) {
      const annonce = Number(/(\d+) écoles?/.exec(texte)?.[1]);
      await page.goto(href);
      expect(await nombreDuLieu(page), `${href} : ${texte}`).toBe(annonce);
    }
    // Les mêmes villes et les mêmes nombres que l'accueil.
    await page.goto('/');
    const accueil = await page
      .getByRole('region', { name: 'Par ville' })
      .locator('a.ville')
      .evaluateAll((l) =>
        l.map((a) => [a.getAttribute('href'), /(\d+) écoles?/.exec(a.textContent ?? '')?.[1]]),
      );
    await page.goto('/villes/');
    const villes = await page
      .locator('.ville-lien')
      .evaluateAll((l) =>
        l.map((a) => [a.getAttribute('href'), /(\d+) écoles?/.exec(a.textContent ?? '')?.[1]]),
      );
    expect(villes).toEqual(accueil);
  });

  test('un lieu connu sans fiche reste du texte, avec son département, jamais un lien', async ({
    page,
  }) => {
    await page.goto('/villes/');
    const sans = page.getByRole('region', { name: 'Pas encore de fiche' });
    await expect(sans).toContainText('Owando · Cuvette');
    await expect(sans.getByRole('link')).toHaveCount(0);
    await expect(page.locator('a[href*="owando"]')).toHaveCount(0);
    // Les départements des villes publiées viennent du référentiel.
    await expect(page.getByRole('region', { name: 'Avec des fiches' })).toContainText(
      'Département : Niari',
    );
  });

  test('la recherche « ville ou quartier » ouvre la liste réelle, garde le lieu et dit zéro sans supposer', async ({
    page,
  }) => {
    await page.goto('/villes/');
    // Vide : le navigateur refuse l'envoi (validation native), la page ne bouge pas.
    await page.getByRole('button', { name: 'Chercher' }).click();
    await expect(page).toHaveURL('/villes/');
    expect(await recherche(page).evaluate((e: HTMLInputElement) => e.validity.valid)).toBe(false);
    await recherche(page).fill('Loandjili');
    await recherche(page).press('Enter');
    await expect(page).toHaveURL(/\/ecoles\/\?ou=Loandjili$/);
    await page.goto('/ecoles/pointe-noire/loandjili/');
    const attendu = await nombreDuLieu(page);
    await page.goto('/ecoles/?ou=Loandjili');
    expect(await nombreDeLaListe(page)).toBe(attendu);
    // Un lieu connu sans fiche : zéro, le lieu se corrige ou se retire.
    await page.goto('/villes/');
    await recherche(page).fill('Owando');
    await page.getByRole('button', { name: 'Chercher' }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?ou=Owando$/);
    expect(await nombreDeLaListe(page)).toBe(0);
    await expect(
      page.locator('[data-vide]').getByRole('searchbox', { name: 'Modifier le lieu' }),
    ).toHaveValue('Owando');
  });

  test('« Votre ville n’y est pas ? » : formulaires fermés, la porte reste WhatsApp', async ({
    page,
  }) => {
    await page.goto('/villes/');
    await expect(
      page.getByRole('link', { name: 'Signaler une école sur WhatsApp' }),
    ).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
    await expect(page.getByRole('link', { name: 'Vous dirigez une école ?' })).toHaveAttribute(
      'href',
      '/pour-les-ecoles/',
    );
    await expect(page.locator('a[href^="/contact/"], a[href^="/contribuer/"]')).toHaveCount(0);
  });

  test('au clavier : la recherche, puis les villes, avec un focus visible', async ({ page }) => {
    await page.goto('/villes/');
    await recherche(page).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Chercher' })).toBeFocused();
    await page.keyboard.press('Tab');
    const premiere = page.locator('.ville-lien').first();
    await expect(premiere).toBeFocused();
    const contour = await premiere.evaluate((e) => getComputedStyle(e).outlineStyle);
    expect(contour).toBe('solid');
  });
});

test.describe('les liens des mentions', () => {
  test('la démonstration et l’accueil mènent à l’explication des mentions', async ({ page }) => {
    await page.goto('/demo/fiche-ecole/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await page.getByRole('link', { name: 'Fiabilité des informations' }).first().click();
    await expect(page).toHaveURL('/methode/#m-mentions');
    await expect(
      page.getByRole('heading', { name: 'Ce que disent les mentions' }),
    ).toBeInViewport();
    await page.goto('/');
    await page
      .getByRole('region', { name: 'Des informations datées, avec leur origine' })
      .getByRole('link', { name: 'Fiabilité des informations' })
      .click();
    await expect(page).toHaveURL('/methode/#m-mentions');
  });

  test('sans JavaScript, les ancres de Fiabilité mènent chacune à sa section', async ({
    browser,
    baseURL,
  }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL ?? '' });
    const page = await contexte.newPage();
    await page.goto('/methode/');
    const sommaire = page.getByRole('navigation', { name: 'Sur cette page' });
    for (const lien of await sommaire.getByRole('link').all()) {
      const ancre = (await lien.getAttribute('href'))!;
      await lien.click();
      await expect(page).toHaveURL(new RegExp(`/methode/${ancre}$`));
      await expect(page.locator(ancre)).toBeInViewport();
      await page.goto('/methode/');
    }
    await contexte.close();
  });
});
