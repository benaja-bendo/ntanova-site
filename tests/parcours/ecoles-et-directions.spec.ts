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

test('« Espace écoles » (/pour-les-ecoles/) : un seul bouton plein, qui écrit sur WhatsApp, et les gains avant lui', async ({
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

test('« Espace écoles » : le message WhatsApp principal dit confirmer ou ajouter', async ({
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
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Ajouter mon école' }),
  ).toHaveAttribute('href', '/pour-les-ecoles/#referencer');
  await expect(page.locator('main')).not.toContainText('Référencez');
  await page.goto('/');
  // Refonte publique, lot 1 : la porte des directions est « Présenter mon école », sous « Pour les écoles ».
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Présenter mon école' }),
  ).toHaveAttribute('href', '/pour-les-ecoles/');
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
  // Lot 4 bis : la carte est la vue Carte de « Les écoles ».
  await expect(principal.getByRole('link', { name: 'Voir la carte' })).toHaveAttribute(
    'href',
    '/ecoles/?vue=carte',
  );
  await expect(principal.getByRole('link', { name: /Revenir à l.accueil/ })).toBeVisible();
  await expect(
    page.locator('footer').getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' }),
  ).toHaveAttribute('href', /wa\.me/);
});

test('le pied de page : quatre groupes de liens, et la phrase « NTanova · Congo-Brazzaville » tient sur une ligne', async ({
  page,
}) => {
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  // Refonte publique, lot 1 (canevas « Points de repère ») : quatre groupes. Les villes qui ont des fiches, dans l'ordre de
  // l'accueil ; aucun lien vers une page qui n'existe pas encore (Contact et Compléter attendent le lot 3, WhatsApp d'ici là).
  await expect(pied.getByRole('list', { name: 'Chercher' }).getByRole('link')).toHaveText([
    'Les écoles',
    'Brazzaville',
    'Dolisie',
    'Pointe-Noire',
    'S’orienter',
  ]);
  const ecoles = pied.getByRole('list', { name: 'Pour les écoles' });
  await expect(ecoles.getByRole('link')).toHaveText(['Présenter mon école', 'Ajouter mon école']);
  await expect(ecoles.getByRole('link', { name: 'Ajouter mon école' })).toHaveAttribute(
    'href',
    '/pour-les-ecoles/#referencer',
  );
  // Ticket 149 : les pages qu'une administration lit, sur toutes les pages publiques.
  const comprendre = pied.getByRole('list', { name: 'Comprendre nos informations' });
  await expect(comprendre.getByRole('link')).toHaveText([
    'Fiabilité des informations',
    'Données de l’annuaire',
    'Signaler une erreur',
  ]);
  await expect(comprendre.getByRole('link', { name: 'Signaler une erreur' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\d+\?text=/,
  );
  await expect(pied.getByRole('list', { name: 'NTanova' }).getByRole('link')).toHaveText([
    'À propos',
    'Écrire à NTanova sur WhatsApp',
    'Confidentialité',
    'Mentions légales',
  ]);
  // Jamais « toutes les écoles » (règle du site public).
  await expect(pied).not.toContainText(/toutes les écoles/i);
  // La phrase : une seule ligne à toutes les largeurs.
  const phrase = pied.getByText('NTanova · Congo-Brazzaville');
  const boite = await phrase.boundingBox();
  const ligne = await phrase.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(boite!.height).toBeLessThan(ligne * 1.5);
  // Chaque lien reste une cible de 44 px.
  for (const lien of await pied.getByRole('link').all())
    expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('le pied de page de téléphone reste serré : deux groupes par ligne, des lignes de 44 px et pas plus', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) > 400, 'téléphone seulement');
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  const [chercher, ecoles, comprendre] = await Promise.all(
    ['Chercher', 'Pour les écoles', 'Comprendre nos informations'].map((nom) =>
      pied.getByRole('list', { name: nom }).boundingBox(),
    ),
  );
  expect(Math.abs(chercher!.y - ecoles!.y), 'deux groupes sur la même ligne').toBeLessThan(2);
  expect(ecoles!.x).toBeGreaterThan(chercher!.x + chercher!.width);
  expect(comprendre!.y).toBeGreaterThanOrEqual(chercher!.y + chercher!.height);
  for (const lien of await pied.locator('nav').getByRole('link').all()) {
    const boite = (await lien.boundingBox())!;
    expect(boite.height, await lien.innerText()).toBeLessThanOrEqual(46);
  }
});

test('l’accueil : « Autour de moi » et chaque champ de la recherche sont des cibles de 44 px ; « Chercher » tient dans la recherche', async ({
  page,
}) => {
  await page.goto('/');
  const autour = (await page.getByRole('link', { name: 'Autour de moi' }).boundingBox())!;
  expect(autour.height).toBeGreaterThanOrEqual(44);
  const recherche = page.getByRole('search', { name: 'Chercher une école' });
  const cadre = (await recherche.boundingBox())!;
  for (const nom of ['Quoi ?', 'Où ?']) {
    const champ = (await recherche.getByRole('searchbox', { name: nom }).boundingBox())!;
    expect(champ.height, nom).toBeGreaterThanOrEqual(44);
  }
  const bouton = (await recherche.getByRole('button', { name: 'Chercher' }).boundingBox())!;
  expect(bouton.height).toBeGreaterThanOrEqual(44);
  expect(bouton.x).toBeGreaterThanOrEqual(cadre.x);
  expect(bouton.x + bouton.width).toBeLessThanOrEqual(cadre.x + cadre.width);
  expect(bouton.y + bouton.height).toBeLessThanOrEqual(cadre.y + cadre.height);
});
