import { expect, test } from '@playwright/test';

// La carte détourée (ticket 15), sur le catalogue fictif : à Tié-Tié, deux écoles situées à
// 270 m l'une de l'autre (une pastille de 2 sur la carte de l'arrondissement), une troisième loin
// d'elles (située par l'administration), une quatrième sans position ; à Ngoyo, aucune école.
// Sans JavaScript : toucher, c'est changer de page.

test('de la ville à la fiche : arrondissement, pastille, coin vu de près, école', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Voir la carte de Pointe-Noire' }).click();

  // La ville : Tié-Tié et Ngoyo en cours, les quatre autres pas encore.
  await expect(page).toHaveURL(/\/ecoles\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Pointe-Noire');
  await expect(
    page.getByText('Les quatre autres arrondissements : pas encore relevés.'),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Tié-Tié : 4 écoles' }).click();

  // L'arrondissement : la pastille regroupe les deux écoles situées.
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/carte\/$/);
  await expect(page.getByText('3 écoles sur la carte de Tié-Tié')).toBeVisible();
  await expect(
    page.getByText('Une autre école n’est pas encore située : elle n’est que dans la liste.'),
  ).toBeVisible();
  const pastille = page.getByRole('link', { name: /Un groupe de 2 écoles.*le voir de près/ });
  await expect(pastille).toBeVisible();
  await pastille.click();

  // Vu de près : chaque école a sa maison, et la liste du coin suit.
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/carte\/coin-1\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Un coin de Tié-Tié');
  const carte = page.getByRole('group', { name: /vues de près/ });
  await expect(
    carte.getByRole('link', { name: /Complexe scolaire Exemple.*relevée de la rue/ }),
  ).toBeVisible();
  await expect(carte.getByRole('link', { name: /Centre de formation Exemple/ })).toBeVisible();
  await expect(page.locator('#ecoles-du-coin').getByRole('link')).toHaveCount(2);
  await carte.getByRole('link', { name: /Complexe scolaire Exemple/ }).click();

  // La fiche, et son petit plan qui ramène à la carte du quartier.
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/complexe-scolaire-exemple\/$/);
  await expect(page.getByRole('group', { name: /sur la carte de Tié-Tié/ })).toBeVisible();
  await page.getByRole('link', { name: 'Voir sur la carte de Tié-Tié' }).click();
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/carte\/$/);
});

test('« Carte | Liste » : on passe de l’une à l’autre, la vue courante n’est pas un lien', async ({
  page,
}) => {
  await page.goto('/ecoles/tie-tie/');
  const bascule = page.getByRole('navigation', { name: 'Voir les écoles' });
  await expect(bascule.getByText('Liste')).toHaveAttribute('aria-current', 'page');
  await bascule.getByRole('link', { name: 'Carte' }).click();
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/carte\/$/);
  await expect(bascule.getByText('Carte')).toHaveAttribute('aria-current', 'page');
  await bascule.getByRole('link', { name: 'Liste' }).click();
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/$/);
});

test('une fiche sans position n’a pas de plan, et un arrondissement sans école dit que le relevé est en cours', async ({
  page,
}) => {
  await page.goto('/ecoles/tie-tie/ecole-sans-detail-exemple/');
  await expect(page.getByRole('link', { name: /Voir sur la carte/ })).toHaveCount(0);

  await page.goto('/ecoles/ngoyo/carte/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ngoyo');
  await expect(
    page.getByText('Aucune école sur la carte pour l’instant : le relevé est en cours.'),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: /Carte de Ngoyo/ }).getByRole('link')).toHaveCount(
    0,
  );
});

test('chaque école et chaque pastille se touchent du doigt : 44 px au moins', async ({ page }) => {
  for (const adresse of ['/ecoles/tie-tie/carte/', '/ecoles/tie-tie/carte/coin-1/']) {
    await page.goto(adresse);
    const marques = page.locator('svg a.marque');
    expect(await marques.count()).toBeGreaterThan(0);
    for (const marque of await marques.all()) {
      const boite = await marque.locator('.cible').boundingBox();
      expect(boite?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(boite?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
});

test('une école située par l’administration, sans relevé, dit qu’elle a été ajoutée par NTanova', async ({
  page,
}) => {
  await page.goto('/ecoles/tie-tie/');
  await expect(
    page.getByRole('link', { name: /\[École ajoutée Exemple\].*Ajoutée par NTanova/ }),
  ).toBeVisible();
  await page.goto('/ecoles/tie-tie/ecole-ajoutee-exemple/');
  await expect(page.getByText('Fiche ajoutée par NTanova le 3 novembre 2026')).toBeVisible();
  await expect(page.getByText(/par un jeune du quartier : seulement/)).toHaveCount(0);
  await page.goto('/ecoles/tie-tie/carte/');
  await expect(
    page.getByRole('link', { name: '[École ajoutée Exemple], ajoutée par NTanova' }),
  ).toBeVisible();
});

// L'aperçu de la carte sur l'accueil (ticket 42) : une fenêtre sur l'arrondissement où il y a des
// écoles sur la carte (Tié-Tié : trois écoles situées dans le catalogue fictif), qui mène à sa carte.

test('l’accueil montre un aperçu de la carte de Tié-Tié, qui mène à sa carte', async ({ page }) => {
  await page.goto('/');
  const apercu = page.getByRole('region', { name: 'La carte de Tié-Tié' });
  await expect(apercu).toBeVisible();
  await expect(apercu.getByText('Arrondissement 3 · 3 écoles sur la carte')).toBeVisible();

  // Le dessin est décoratif : ni groupe ni lien dedans (une pastille ne mène pas à un coin dont
  // le numéro vient de l'autre échelle), un seul des deux dessins s'affiche, et l'attribution
  // d'OpenStreetMap reste lisible.
  await expect(apercu.getByRole('group')).toHaveCount(0);
  await expect(apercu.locator('svg a')).toHaveCount(0);
  await expect(apercu.locator('svg.plateau:visible')).toHaveCount(1);
  await expect(apercu.getByRole('link', { name: /OpenStreetMap/ })).toBeVisible();

  // La porte accessible vers la carte est le bouton ; le dessin en est une autre, cachée du clavier
  // et du lecteur d'écran.
  await apercu.getByRole('link', { name: 'Voir la carte de Tié-Tié' }).click();
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/carte\/$/);
});

test('le dessin de l’aperçu est lui-même un lien vers la carte, sans entrer dans l’ordre du clavier', async ({
  page,
}) => {
  await page.goto('/');
  const lien = page
    .getByRole('region', { name: 'La carte de Tié-Tié' })
    .locator('a.plateau-lien:visible');
  await expect(lien).toHaveAttribute('href', '/ecoles/tie-tie/carte/');
  await expect(lien).toHaveAttribute('tabindex', '-1');
  await expect(lien).toHaveAttribute('aria-hidden', 'true');
  await lien.click();
  await expect(page).toHaveURL(/\/ecoles\/tie-tie\/carte\/$/);
});

test('« Voir la carte de Pointe-Noire » garde son espace à l’écran', async ({ page }) => {
  await page.goto('/');
  const lien = page.getByRole('link', { name: 'Voir la carte de Pointe-Noire' });
  // Le nom accessible garde l'espace même quand l'écran le perd (un lien en `inline-flex` ne
  // compte pas l'espace qui précède un `span`) : on lit le texte tel qu'il s'affiche.
  const affiche = await lien.evaluate((a) => (a as HTMLElement).innerText);
  expect(affiche).toBe('Voir la carte de Pointe-Noire');
});
