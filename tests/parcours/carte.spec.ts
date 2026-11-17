import { servirLesTuiles } from './aides-carte';
import { expect, test } from '@playwright/test';
test.beforeEach(async ({ page, context }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
  await servirLesTuiles(context);
});

// Une seule carte (décision du fondateur du 08/11/2026, ticket 146), sur le catalogue fictif : à Tié-Tié, deux écoles vues
// sur place, une troisième située par l'administration, une quatrième sans position ; à Ngoyo, aucune école. Les anciens
// plans dessinés (`/cartes/…`, ticket 15) ne sont plus que des renvois vers `/carte/`, cadrée sur l'arrondissement ; la
// fiche n'a plus de petit plan ; le dessin ne sert plus que sans WebGL2 (ou sans JavaScript).

test('de la ville à la fiche, par la liste', async ({ page }) => {
  await page.goto('/');
  // La carte de la ville, dans « Où ? » (lot 3) : son nom et son nombre de fiches.
  await page
    .getByRole('main')
    .getByRole('link', { name: /^Pointe-Noire \d+ écoles sur NTanova$/ })
    .click();
  await expect(page).toHaveURL(/\/ecoles\/pointe-noire\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pointe-Noire');
  await page.locator('a.zone', { hasText: 'Tié-Tié' }).click();
  await expect(page).toHaveURL(/\/ecoles\/pointe-noire\/tie-tie\/$/);
  await page
    .locator('ul.liste-lignes a.ligne-ecole', { hasText: '[Complexe scolaire Exemple]' })
    .click();
  await expect(page).toHaveURL(/\/ecoles\/complexe-scolaire-exemple-482913\/$/);
});

test('les anciens plans dessinés renvoient vers la carte, cadrée sur l’arrondissement', async ({
  page,
}) => {
  for (const ancienne of [
    '/cartes/congo/pointe-noire/tie-tie/',
    '/cartes/congo/pointe-noire/tie-tie/coin_1/',
    '/ecoles/tie-tie/carte/',
  ]) {
    await page.goto(ancienne);
    // Lot 4 bis : la vue Carte de « Les écoles », limitée à l'arrondissement (« Zone de la carte »).
    await expect(page, ancienne).toHaveURL(/\/ecoles\/\?(.+&)?vue=carte/);
    await expect(page, ancienne).toHaveURL(
      /cadre=11\.\d+(,|%2C)-4\.\d+(,|%2C)11\.\d+(,|%2C)-4\.\d+/,
    );
  }
});

test('« Liste | Carte » : la page d’un arrondissement mène à la carte cadrée sur lui ; la vue courante n’est pas un lien', async ({
  page,
}) => {
  await page.goto('/ecoles/pointe-noire/tie-tie/');
  const bascule = page.getByRole('navigation', { name: 'Affichage' });
  await expect(bascule.getByText('Liste')).toHaveAttribute('aria-current', 'page');
  await expect(bascule.getByRole('link', { name: 'Liste' })).toHaveCount(0);
  await expect(bascule.getByRole('link', { name: 'Carte' })).toHaveAttribute(
    'href',
    /^\/ecoles\/\?vue=carte&cadre=11\.\d+,-4\.\d+,11\.\d+,-4\.\d+$/,
  );
  await expect(page.locator('main svg.plateau')).toHaveCount(0);
});

test('la fiche n’a plus de petit plan : le repère en mots et « Voir sur la carte »', async ({
  page,
}) => {
  await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
  await expect(page.locator('main svg.plateau')).toHaveCount(0);
  await expect(page.getByRole('group', { name: /sur la carte de/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Voir sur la carte' })).toHaveAttribute(
    'href',
    /^\/ecoles\/\?vue=carte&ecole=\d{6}$/,
  );
  // Sans position, pas de lien vers la carte.
  await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
  await expect(page.getByRole('link', { name: /Voir .*sur la carte/ })).toHaveCount(0);
});

// Ticket #99, puis décision du fondateur du 17/11/2026 (option B, qui abroge celle du 03/11) : l'école ajoutée par NTanova
// est dans la liste ET sur la carte, en épingle en tirets, avec sa mention.
test('une école située par l’administration, sans relevé, est dans la liste avec sa mention, sans « Repère pas encore relevé »', async ({
  page,
}) => {
  await page.goto('/ecoles/pointe-noire/tie-tie/');
  const carte = page.locator('ul.liste-lignes li', { hasText: '[École ajoutée Exemple]' });
  await expect(carte.locator('.ligne-preuve')).toHaveText(
    'Ajoutée par NTanova · pas encore vue sur place',
  );
  await expect(carte).not.toContainText('Repère pas encore relevé');
  await page.goto('/ecoles/ecole-ajoutee-exemple-639158/');
  await expect(page.getByText('Ajoutée par NTanova · pas encore vue sur place')).toBeVisible();
  await expect(page.locator('.preuves')).toContainText('Ajoutée par NTanova');
  // Sa tête n'en dit pas plus ; « Écoles proches », plus bas, montre les preuves des autres (lot 4).
  await expect(page.locator('.fiche-tete').getByText(/Vue sur place ·/)).toHaveCount(0);
  // Située : elle a son épingle (en tirets), et le lien l'ouvre choisie sur la carte (17/11).
  await expect(page.getByRole('link', { name: 'Voir sur la carte', exact: true })).toHaveAttribute(
    'href',
    '/ecoles/?vue=carte&ecole=639158',
  );
});
