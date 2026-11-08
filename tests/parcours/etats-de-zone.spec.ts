import { expect, test } from '@playwright/test';

// Les pages de lieu (audit du 05/11/2026, Vague 1, D1 : chaque lien de la carte mène à une vraie page). Depuis la décision du
// fondateur du 08/11/2026 (ticket 146, qui revient sur D2), ni la carte ni les pages de lieu n'écrivent plus d'état de
// déploiement (« Relevé en cours », « Déploiement programmé ») : le réglage reste dans l'administration, où il décide
// quelles zones la carte dessine.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
});

interface ZoneDeLaCarte {
  properties: { nom: string; etat: 'actif' | 'programme'; lien: string };
}

const ETATS = /Relevé en cours|Déploiement programmé|relevé est en cours|déploiement est programmé/;

test('chaque zone de la carte a une page qui répond, et aucune n’écrit d’état', async ({
  page,
  request,
}) => {
  const zones = (await (await request.get('/carte/zones.geojson')).json()) as {
    features: ZoneDeLaCarte[];
  };
  const parLien = new Map(zones.features.map((f) => [f.properties.lien, f.properties]));
  expect(parLien.size).toBeGreaterThanOrEqual(5);
  for (const [lien, zone] of parLien) {
    const reponse = await page.goto(lien);
    expect(reponse?.status(), `${zone.nom} : ${lien} répond`).toBe(200);
    await expect(page.locator('main'), `${zone.nom} n’écrit pas d’état`).not.toContainText(ETATS);
    await expect(page.locator('.etat-zone')).toHaveCount(0);
  }
});

test('Brazzaville a sa page, qui renvoie au pays', async ({ page }) => {
  await page.goto('/ecoles/congo/brazzaville/');
  await expect(page.getByRole('heading', { name: 'Brazzaville', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Congo-Brazzaville' })).toBeVisible();
});

test('une zone sans école : un seul état vide avec la porte WhatsApp, et pas dans le plan du site', async ({
  page,
  request,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/mvou-mvou/');
  await expect(page.getByRole('heading', { name: 'Mvou-Mvou', level: 1 })).toBeVisible();
  await expect(page.getByText('Aucune école publiée pour l’instant.')).toBeVisible();
  await expect(page.locator('main')).not.toContainText(ETATS);
  await expect(page.locator('main')).not.toContainText('Référencez');
  // Un seul bloc, au lieu de trois messages empilés (audit du 05/11/2026, D10) : l'état, de quoi continuer, WhatsApp.
  await expect(page.locator('.etat-vide')).toHaveCount(1);
  await expect(page.locator('.etat-vide-titre')).toHaveCount(1);
  await expect(page.locator('.etat-vide .bouton')).toHaveText('Voir les écoles déjà publiées');
  const whatsapp = page.locator('main a[href*="wa.me"]');
  await expect(whatsapp).toHaveCount(1);
  await expect(whatsapp).toHaveText(/Une école manque\s?\? Écrire sur WhatsApp/);
  const message = decodeURIComponent((await whatsapp.getAttribute('href')) ?? '');
  expect(message).toContain('je connais ou je dirige une école à Mvou-Mvou');
  await expect(
    page.getByText(/Vous connaissez ou vous dirigez une école à Mvou-Mvou\s?\?/),
  ).toBeVisible();
  // Ticket 146 : une page de lieu sans fiche n'est ni indexée, ni dans `sitemap.xml`.
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  const plan = await (await request.get('/sitemap.xml')).text();
  expect(plan).not.toContain('/ecoles/congo/pointe-noire/mvou-mvou/<');
  expect(plan).toContain('/ecoles/congo/pointe-noire/tie-tie/<');
});

test('la ville liste ses zones avec leur nombre d’écoles, sans état', async ({ page }) => {
  await page.goto('/ecoles/congo/pointe-noire/');
  const zone = (nom: string) => page.locator('a.zone', { hasText: nom });
  await expect(zone('Tié-Tié')).toContainText(/\d+ écoles/);
  await expect(zone('Loandjili')).toContainText('2 écoles');
  await expect(zone('Mvou-Mvou')).toContainText('Arrondissement 2 · pas encore d’école publiée');
  await expect(page.locator('main')).not.toContainText(ETATS);
  await expect(page.locator('.etat-zone')).toHaveCount(0);
});

test('le pays s’appelle « Congo-Brazzaville », et la phrase de recherche est juste', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/');
  await expect(page).toHaveTitle('Les écoles du Congo-Brazzaville, ville par ville · NTanova');
  await expect(page.getByRole('heading', { name: 'Congo-Brazzaville', level: 1 })).toBeVisible();
  const chercher = page.getByRole('link', { name: 'Chercher une école au Congo-Brazzaville' });
  await expect(chercher).toHaveAttribute('href', '/ecoles/?zone=congo');
  await expect(page.locator('main')).not.toContainText('à Congo');
  // La ligne « Pays » sous le titre ne répète pas le titre.
  await expect(page.locator('main').getByText('Pays', { exact: true })).toHaveCount(0);
});

test('le compteur d’une zone se dit comme celui de l’accueil, sans « 2 vues sur place » nu', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/');
  await expect(page.locator('.compte')).toHaveText(/^\d+ écoles, dont \d+ vues? sur place/);
});
