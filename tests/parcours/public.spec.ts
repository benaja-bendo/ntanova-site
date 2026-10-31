import { expect, test, type Locator } from '@playwright/test';

/** Le nom d'une cible pour le message d'erreur : son texte, ou celui qu'elle donne au lecteur d'écran (un lien de la carte, en SVG). */
const nomDe = async (cible: Locator) =>
  (await cible.getAttribute('aria-label')) ?? (await cible.textContent()) ?? '';

// Le site public, construit avec le catalogue fictif (une école publiée à Tié-Tié).
// Chaque page : en français, sans JavaScript, sans ressource extérieure, lisible
// dans 360 px, avec des cibles d'au moins 44 px.

const pages = [
  '/',
  '/ecoles/tie-tie/',
  '/ecoles/ngoyo/',
  '/ecoles/',
  '/ecoles/tie-tie/carte/',
  '/ecoles/tie-tie/carte/coin-1/',
  '/ecoles/ngoyo/carte/',
  '/ecoles/tie-tie/complexe-scolaire-exemple/',
  '/ecoles/tie-tie/centre-de-formation-exemple/',
  '/ecoles/tie-tie/ecole-sans-detail-exemple/',
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
        expect(boite?.height, await nomDe(cible)).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('de l’accueil à la fiche d’une école, puis vers « Pour les écoles »', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('link', { name: /Tié-Tié.*Arrondissement 3.*3 écoles/ }),
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

  test.describe('toutes les écoles, de la crèche au supérieur (ticket 12)', () => {
    test('la fiche dit le type, les niveaux et le programme de l’école', async ({ page }) => {
      await page.goto('/ecoles/tie-tie/complexe-scolaire-exemple/');
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes.getByText('Privée', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Maternelle, Primaire')).toBeVisible();
      await expect(proprietes.getByText('Programme et langues', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Programme français-congolais, bilingue')).toBeVisible();
      // Tout est renseigné : rien à ranger parmi ce qui manque.
      const manque = page.locator('ul.pastilles-vides');
      await expect(manque).not.toContainText("Type d'école");
      await expect(manque).not.toContainText('Niveaux');
    });

    test('un type « Pas indiqué » ou l’absence de niveaux ne s’écrit pas : ils rejoignent « Pas encore sur la fiche »', async ({
      page,
    }) => {
      await page.goto('/ecoles/tie-tie/ecole-sans-detail-exemple/');
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes).not.toContainText('Pas indiqué');
      await expect(proprietes).not.toContainText('Non indiqués');
      await expect(proprietes.getByText('Type', { exact: true })).toHaveCount(0);
      await expect(proprietes.getByText('Niveaux', { exact: true })).toHaveCount(0);
      await expect(proprietes.getByText('Programme et langues')).toHaveCount(0);
      const manque = page.locator('ul.pastilles-vides');
      await expect(manque).toContainText("Type d'école");
      await expect(manque).toContainText('Niveaux');
    });

    test('un type « Autre » ne s’écrit pas non plus, et « Autre formation » est un niveau comme un autre', async ({
      page,
    }) => {
      await page.goto('/ecoles/tie-tie/centre-de-formation-exemple/');
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes.getByText('Autre formation', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Type', { exact: true })).toHaveCount(0);
      await expect(page.locator('ul.pastilles-vides')).toContainText("Type d'école");
    });

    test('la liste écrit niveaux, type et repère, sans jamais écrire « Pas indiqué »', async ({
      page,
    }) => {
      await page.goto('/ecoles/tie-tie/');
      const liste = page.locator('ul.ecoles');
      await expect(liste.getByRole('link', { name: /Complexe scolaire Exemple/ })).toContainText(
        'Maternelle · Primaire · Privée',
      );
      // Le nom, puis le niveau (le type « Autre » ne s'écrit pas), puis l'état : rien d'autre.
      await expect(liste.getByRole('link', { name: /Centre de formation Exemple/ })).toHaveText(
        /^\[Centre de formation Exemple\]\s*Autre formation\s*Relevée de la rue$/,
      );
      await expect(liste.getByRole('link', { name: /École sans détail/ })).toHaveText(
        /^\[École sans détail Exemple\]\s*Relevée de la rue$/,
      );
      await expect(liste).not.toContainText('Pas indiqué');
    });

    test('la fiche donne la date du relevé, pas celle de la dernière modification', async ({
      page,
    }) => {
      // Relevée le 2 novembre, modifiée depuis le 20 : elle dit toujours « relevée le 2 novembre ».
      await page.goto('/ecoles/tie-tie/centre-de-formation-exemple/');
      await expect(page.getByText(/Fiche relevée le 2 novembre 2026/)).toBeVisible();
      await expect(page.getByText(/20 novembre/)).toHaveCount(0);
    });

    test('sans date de relevé (une fiche d’avant), la fiche retombe sur la dernière mise à jour', async ({
      page,
    }) => {
      await page.goto('/ecoles/tie-tie/ecole-sans-detail-exemple/');
      await expect(page.getByText(/Fiche relevée le 5 novembre 2026/)).toBeVisible();
    });

    test('la description de la page d’un arrondissement va de la crèche au supérieur', async ({
      page,
    }) => {
      await page.goto('/ecoles/tie-tie/');
      await expect(page.locator('meta[name=description]')).toHaveAttribute(
        'content',
        /de la crèche au supérieur/,
      );
    });
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
