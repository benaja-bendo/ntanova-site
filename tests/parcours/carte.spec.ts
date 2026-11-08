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
  await page.getByRole('link', { name: 'Les arrondissements de Pointe-Noire' }).click();
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
    await expect(page, ancienne).toHaveURL(/\/carte\/#[\d.]+\/-4\.\d+\/11\.\d+$/);
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
    /^\/carte\/#[\d.]+\/-4\.\d+\/11\.\d+$/,
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
    /^\/carte\/\?ecole=.+#\d/,
  );
  // Sans position, pas de lien vers la carte.
  await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
  await expect(page.getByRole('link', { name: /Voir .*sur la carte/ })).toHaveCount(0);
});

// Ticket #99 (décision du fondateur du 03/11) : la carte est la vitrine de la preuve de terrain.
test('une école située par l’administration, sans relevé, est dans la liste avec sa mention, sans « Repère pas encore relevé »', async ({
  page,
}) => {
  await page.goto('/ecoles/pointe-noire/tie-tie/');
  const carte = page.locator('ul.liste-lignes li', { hasText: '[École ajoutée Exemple]' });
  await expect(carte.locator('.ligne-preuve')).toHaveText(
    'Ajoutée par NTanova, pas encore vue sur place',
  );
  await expect(carte.locator('.ligne-repere-vide')).toHaveCount(0);
  await page.goto('/ecoles/ecole-ajoutee-exemple-639158/');
  await expect(page.getByText('Ajoutée par NTanova · 3 nov. 2026')).toBeVisible();
  await expect(page.locator('.preuves')).toContainText('Ajoutée par NTanova');
  await expect(page.getByText(/Relevé terrain ·/)).toHaveCount(0);
  // Pas vue sur place : la carte s'ouvre sur son quartier, sans épingle, et le lien le dit.
  await expect(page.getByRole('link', { name: 'Voir le quartier sur la carte' })).toHaveAttribute(
    'href',
    /^\/carte\/#\d/,
  );
});

test('sans WebGL2, l’accueil garde le dessin de Tié-Tié, qui mène à la carte', async ({ page }) => {
  // Une bonne connexion (la carte se charge d'office), mais un téléphone sans WebGL2.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { value: {}, configurable: true });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type, ...reste) {
      return type === 'webgl2' ? null : getContext.call(this, type, ...reste);
    } as typeof getContext;
  });
  await page.goto('/');
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'repli-sans-webgl2');
  const apercu = page.getByRole('region', { name: 'La carte de Tié-Tié' });
  await expect(apercu).toBeVisible();
  await expect(apercu.getByText('Arrondissement 3 · 2 écoles sur la carte')).toBeVisible();
  await expect(page.locator('.carte-attente')).toBeHidden();
  await apercu.getByRole('link', { name: 'Voir la carte de Tié-Tié' }).click();
  await expect(page).toHaveURL(/\/carte\/$/);
});

test('avec JavaScript, l’ancien dessin ne paraît plus pendant l’attente de la carte', async ({
  page,
}) => {
  await page.goto('/carte/');
  await expect(page.locator('.carte-repli')).toBeHidden();
  await page.goto('/');
  // L'accueil d'un téléphone qui économise ses données : les barres immobiles, pas le dessin.
  await expect(page.locator('#carte')).toHaveAttribute('data-attente', 'appui');
  await expect(page.locator('.carte-repli')).toBeHidden();
  await expect(page.locator('.carte-attente .marque')).toBeVisible();
});

test('« Les arrondissements de Pointe-Noire » garde son espace à l’écran', async ({ page }) => {
  await page.goto('/');
  const lien = page.getByRole('link', { name: 'Les arrondissements de Pointe-Noire' });
  // Le nom accessible garde l'espace même quand l'écran le perd (un lien en `inline-flex` ne
  // compte pas l'espace qui précède un `span`) : on lit le texte tel qu'il s'affiche.
  const affiche = await lien.evaluate((a) => (a as HTMLElement).innerText);
  expect(affiche).toBe('Les arrondissements de Pointe-Noire');
});
