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
  await page.goto('/ecoles/pointe-noire/tie-tie/');
  await expect(page.getByRole('link', { name: 'Ajouter mon école' })).toHaveAttribute(
    'href',
    '/pour-les-ecoles/#referencer',
  );
  await expect(page.locator('main')).not.toContainText('Référencez');
  await page.goto('/');
  // Lot 3 : la porte des directions est « Espace écoles », en bas de l'accueil.
  await expect(page.getByRole('link', { name: 'Ouvrir l’Espace écoles' })).toHaveAttribute(
    'href',
    '/pour-les-ecoles/',
  );
  await expect(page.locator('main')).not.toContainText(/référenc/i);
});

test('« Qui sommes-nous ? » dit qui est NTanova, sans périmètre écrit à la main, et renvoie vers les quatre pages de transparence (ticket 149)', async ({
  page,
}) => {
  await page.goto('/a-propos/');
  await expect(page.getByRole('heading', { name: 'Qui sommes-nous ?' })).toBeVisible();
  const chapeau = page.locator('.tete');
  await expect(chapeau).toContainText('les écoles du Congo-Brazzaville');
  // Le périmètre en chiffres vit sur « Données », daté de la construction : plus de date écrite à la main ici.
  await expect(chapeau).toContainText('en nombres et en dates');
  await expect(chapeau.getByRole('link', { name: 'Données' })).toHaveAttribute('href', '/donnees/');
  await expect(page.locator('main')).not.toContainText('Au 5 novembre 2026');
  await expect(page.locator('main')).not.toContainText('commence à Tié-Tié');
  // Les données personnelles ont déménagé : ni leur titre ni la loi ici, un lien vers leur page.
  await expect(page.getByRole('heading', { name: 'Vos droits' })).toHaveCount(0);
  await expect(page.locator('#transparence').getByRole('link')).toHaveText([
    'Méthode',
    'Données',
    'Confidentialité',
    'Mentions légales',
    'Écrire à NTanova sur WhatsApp',
  ]);
  // L'ancre que les fiches visaient avant la page Méthode reste, et renvoie vers elle.
  await expect(page.locator('#ce-que-nous-publions').getByRole('link')).toHaveAttribute(
    'href',
    '/methode/',
  );
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

test('le pied de page : trois groupes de liens, et la phrase « NTanova · Congo-Brazzaville » tient sur une ligne', async ({
  page,
}) => {
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  // Ticket 146 : Rechercher et Autour de moi sont des filtres de la page « Écoles ». Lot 3 (version 44) : les villes qui ont
  // des fiches, dans l'ordre de l'accueil.
  await expect(pied.getByRole('list', { name: 'Trouver une école' }).getByRole('link')).toHaveText([
    'Les écoles',
    'Carte',
    'Brazzaville',
    'Dolisie',
    'Pointe-Noire',
  ]);
  await expect(pied.getByRole('list', { name: 'NTanova' }).getByRole('link')).toHaveText([
    'Pour les écoles',
    'À propos',
    'Écrire à NTanova sur WhatsApp',
  ]);
  // Ticket 149 : les pages qu'une administration lit, sur toutes les pages publiques.
  await expect(pied.getByRole('list', { name: 'Transparence' }).getByRole('link')).toHaveText([
    'Méthode',
    'Données',
    'Confidentialité',
    'Mentions légales',
  ]);
  // La phrase : une seule ligne à toutes les largeurs.
  const phrase = pied.getByText('NTanova · Congo-Brazzaville');
  const boite = await phrase.boundingBox();
  const ligne = await phrase.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(boite!.height).toBeLessThan(ligne * 1.5);
  // Chaque lien reste une cible de 44 px.
  for (const lien of await pied.getByRole('link').all())
    expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('le pied de page de téléphone reste serré : deux groupes côte à côte, « Transparence » dessous, des lignes de 44 px et pas plus', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) > 400, 'téléphone seulement');
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  // Planche « Accueil · téléphone » de la version 44 : « Trouver une école » et « NTanova » côte à côte, « Transparence »
  // dessous. Au doigt, chaque lien est une ligne de 44 px (la cible de la charte), sans rien de plus.
  const [trouver, ntanova, transparence] = await Promise.all(
    ['Trouver une école', 'NTanova', 'Transparence'].map((nom) =>
      pied.getByRole('list', { name: nom }).boundingBox(),
    ),
  );
  expect(Math.abs(trouver!.y - ntanova!.y), 'deux groupes sur la même ligne').toBeLessThan(2);
  expect(ntanova!.x).toBeGreaterThan(trouver!.x + trouver!.width);
  expect(transparence!.y).toBeGreaterThanOrEqual(trouver!.y + trouver!.height);
  for (const lien of await pied.locator('nav').getByRole('link').all()) {
    const boite = (await lien.boundingBox())!;
    expect(boite.height, await lien.innerText()).toBeLessThanOrEqual(46);
  }
});

test('l’accueil : « Autour de moi » et « Voir la carte » ne se touchent pas et ont la même hauteur ; « Chercher » tient dans le champ', async ({
  page,
}) => {
  await page.goto('/');
  const [autour, carte] = await Promise.all(
    ['Autour de moi', 'Voir la carte'].map((nom) =>
      page.locator('.ou-actions').getByRole('link', { name: nom, exact: true }).boundingBox(),
    ),
  );
  const memeLigne = Math.abs(autour!.y - carte!.y) < 4;
  if (memeLigne) expect(carte!.x - (autour!.x + autour!.width)).toBeGreaterThanOrEqual(16);
  else expect(carte!.y).toBeGreaterThanOrEqual(autour!.y + autour!.height);
  // D17 : deux portes voisines, une seule hauteur (la cible de 44 px de la charte).
  expect(autour!.height).toBeCloseTo(44, 0);
  expect(carte!.height).toBeCloseTo(44, 0);
  // Le bouton est posé dans le champ (planche « Accueil »), sans en déborder.
  const champ = (await page.getByRole('searchbox', { name: 'Chercher une école' }).boundingBox())!;
  const bouton = (await page.getByRole('button', { name: 'Chercher' }).boundingBox())!;
  expect(bouton.x).toBeGreaterThan(champ.x);
  expect(bouton.x + bouton.width).toBeLessThanOrEqual(champ.x + champ.width);
  expect(bouton.y).toBeGreaterThanOrEqual(champ.y);
  expect(bouton.y + bouton.height).toBeLessThanOrEqual(champ.y + champ.height);
  expect(bouton.height).toBeGreaterThanOrEqual(44);
});
