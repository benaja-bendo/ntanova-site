import { expect, test } from '@playwright/test';

// Audit du 05/11/2026, Vague 1 : « Pour les écoles » (D11), « Comment les fiches sont tenues » (D4), la page introuvable (D22),
// et les détails de l'accueil, du pied de page et d'« Autour de moi » (D16, D17, D20).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
});

test('« Pour les écoles » : un seul bouton plein, qui écrit sur WhatsApp, et les gains avant lui', async ({
  page,
}) => {
  await page.goto('/pour-les-ecoles/');
  const pleins = page.locator('main .bouton:not(.bouton-secondaire)');
  await expect(pleins).toHaveCount(1);
  await expect(pleins).toHaveText('Écrire sur WhatsApp');
  await expect(pleins).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
  // Le bouton du code de liaison, replié, est un bouton à contour.
  await expect(page.locator('details.liaison .bouton')).toHaveClass(/bouton-secondaire/);
  // Plus de lien « Pas de fiche de liaison ? » : le bouton principal sert aux deux cas.
  await expect(page.getByText('Pas de fiche de liaison')).toHaveCount(0);
  // Les mots : « Confirmez » ou « ajoutez », plus de « référencement ».
  await expect(page.locator('main')).not.toContainText(/référenc/i);
});

test('« Pour les écoles » : le message WhatsApp principal dit confirmer ou ajouter', async ({
  page,
}) => {
  await page.goto('/pour-les-ecoles/');
  const lien =
    (await page.locator('main .bouton:not(.bouton-secondaire)').getAttribute('href')) ?? '';
  expect(decodeURIComponent(lien)).toContain('confirmer sa fiche ou l’ajouter');
});

test('les pages de zone et l’accueil parlent de « Ajouter mon école » et de « Confirmer », jamais de « Référencez »', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/');
  await expect(page.getByRole('link', { name: 'Ajouter mon école' })).toHaveAttribute(
    'href',
    '/pour-les-ecoles/#referencer',
  );
  await expect(page.locator('main')).not.toContainText('Référencez');
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: /Pour les écoles|Confirmer la fiche de mon école/ }).last(),
  ).toBeVisible();
});

test('« Comment les fiches sont tenues » est visible en haut de la page « Qui sommes-nous ? », avec un périmètre exact et daté', async ({
  page,
}) => {
  await page.goto('/a-propos/');
  await expect(
    page.getByText('Comment les fiches sont tenues', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qui sommes-nous ?' })).toBeVisible();
  const chapeau = page.locator('.tete');
  await expect(chapeau).toContainText('les écoles du Congo-Brazzaville');
  await expect(chapeau).toContainText('Au 5 novembre 2026');
  await expect(chapeau).toContainText('les premières écoles publiées sont à Pointe-Noire');
  await expect(chapeau).toContainText('le relevé s’étend progressivement au Congo-Brazzaville');
  // L'ancien périmètre (« commence à Tié-Tié et à Ngoyo ») a disparu.
  await expect(page.locator('main')).not.toContainText('commence à Tié-Tié');
});

test('page introuvable : un accès direct aux écoles et à la carte, et le WhatsApp dans le pied', async ({
  page,
}) => {
  const reponse = await page.goto('/une-page-qui-n-existe-pas/');
  expect(reponse?.status()).toBe(404);
  const principal = page.locator('main');
  await expect(principal.getByRole('link', { name: 'Chercher une école' })).toHaveAttribute(
    'href',
    '/ecoles/',
  );
  await expect(principal.getByRole('link', { name: 'Voir la carte' })).toHaveAttribute(
    'href',
    '/carte/',
  );
  await expect(principal.getByRole('link', { name: /Revenir à l.accueil/ })).toBeVisible();
  await expect(
    page.locator('footer').getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' }),
  ).toHaveAttribute('href', /wa\.me/);
});

test('le pied de page : deux groupes de liens, et la phrase « République du Congo » tient sur une ligne', async ({
  page,
}) => {
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  // Ticket 146 : Rechercher et Autour de moi sont des filtres de la page « Écoles ».
  await expect(pied.getByRole('list', { name: 'Trouver une école' }).getByRole('link')).toHaveText([
    'Les écoles',
    'Carte',
  ]);
  await expect(pied.getByRole('list', { name: 'NTanova' }).getByRole('link')).toHaveText([
    'Pour les écoles',
    'À propos et données personnelles',
    'Écrire à NTanova sur WhatsApp',
  ]);
  // La phrase : une seule ligne à toutes les largeurs.
  const phrase = pied.getByText('NTanova · République du Congo');
  const boite = await phrase.boundingBox();
  const ligne = await phrase.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(boite!.height).toBeLessThan(ligne * 1.5);
  // Chaque lien reste une cible de 44 px.
  for (const lien of await pied.getByRole('link').all())
    expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('le pied de page de téléphone n’occupe plus qu’environ la moitié de la hauteur d’avant', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) > 400, 'téléphone seulement');
  await page.goto('/ecoles/');
  const liens = await page.locator('footer nav').boundingBox();
  // Cinq liens de 44 px en une colonne : 220 px. Deux colonnes : ≈ 3 lignes.
  expect(liens!.height).toBeLessThanOrEqual(240);
});

test('l’accueil : les liens sous les villes ne se touchent pas, et les deux boutons ont la même hauteur', async ({
  page,
}) => {
  await page.goto('/');
  const liens = await page.locator('.liens-villes a').all();
  expect(liens.length).toBe(2);
  const boites = await Promise.all(liens.map((l) => l.boundingBox()));
  for (let i = 1; i < boites.length; i++) {
    const avant = boites[i - 1]!;
    const apres = boites[i]!;
    const memeLigne = Math.abs(avant.y - apres.y) < 4;
    if (memeLigne) expect(apres.x - (avant.x + avant.width)).toBeGreaterThanOrEqual(16);
    else expect(apres.y).toBeGreaterThanOrEqual(avant.y + avant.height);
  }
  // D17 : « Explorer la carte » et « Chercher une école » mesurent 48 px, ni plus ni moins.
  for (const nom of ['Explorer la carte', 'Chercher une école']) {
    const bouton = await page
      .locator('.actions-accueil')
      .getByRole('link', { name: nom, exact: true })
      .boundingBox();
    expect(bouton!.height, nom).toBeCloseTo(48, 0);
  }
});
