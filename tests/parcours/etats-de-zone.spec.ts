import { expect, test } from '@playwright/test';

// Audit du 05/11/2026, Vague 1 : ce que les pages de zone disent de l'état d'une zone est ce que la carte en dit (D2), et
// chaque lien de la carte mène à une vraie page (D1, Brazzaville). Sur le site construit avec le catalogue fictif, qui reprend
// l'état de la base : Tié-Tié et Ngoyo « Relevé en cours » ; Loandjili, Mongo-Mpoukou, Mvou-Mvou et Brazzaville
// « Déploiement programmé ».
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
});

interface ZoneDeLaCarte {
  properties: { nom: string; etat: 'actif' | 'programme'; libelle: string; lien: string };
}

test('chaque zone de la carte a une page qui répond et qui dit le même état', async ({
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
    await expect(
      page.locator('.etat-zone'),
      `${zone.nom} dit « ${zone.libelle} », comme la carte`,
    ).toHaveText(zone.libelle);
  }
});

test('Brazzaville a sa page, qui dit « Déploiement programmé » et propose d’écrire sur WhatsApp', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/brazzaville/');
  await expect(page.getByRole('heading', { name: 'Brazzaville', level: 1 })).toBeVisible();
  await expect(page.locator('.etat-zone')).toHaveText('Déploiement programmé');
  await expect(page.getByRole('link', { name: '← Congo-Brazzaville' })).toBeVisible();
});

test('une zone programmée sans école : son état, et un seul état vide avec la porte WhatsApp', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/mvou-mvou/');
  await expect(page.getByRole('heading', { name: 'Mvou-Mvou', level: 1 })).toBeVisible();
  await expect(page.locator('.etat-zone')).toHaveText('Déploiement programmé');
  await expect(
    page.getByText('Aucune école publiée pour l’instant : le déploiement est programmé.'),
  ).toBeVisible();
  // Jamais « relevé en cours » pour une zone qui ne l'est pas, et jamais la contradiction d'avant.
  await expect(page.locator('main')).not.toContainText('relevé en cours');
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
});

test('la ville liste ses zones avec l’état de la carte, jamais « relevé en cours » par défaut', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/');
  const zone = (nom: string) => page.locator('a.zone', { hasText: nom });
  await expect(zone('Tié-Tié')).toContainText('Relevé en cours');
  await expect(zone('Ngoyo')).toContainText('Relevé en cours');
  await expect(zone('Loandjili')).toContainText('Déploiement programmé');
  await expect(zone('Loandjili')).toContainText('2 écoles');
  await expect(zone('Mongo-Mpoukou')).toContainText('Déploiement programmé');
  await expect(zone('Mvou-Mvou')).toContainText('Arrondissement 2 · Déploiement programmé');
  await expect(page.locator('.etat-zone')).toHaveText('Relevé en cours');
});

test('le schéma de la ville dessine les zones programmées en pointillés et le dit dans sa légende', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/');
  await expect(page.getByText(/En vert\s:\srelevé en cours\./)).toBeVisible();
  await expect(page.getByText(/En pointillés\s:\sdéploiement programmé\./)).toBeVisible();
  // Tié-Tié et Ngoyo en vert ; Loandjili, Mongo-Mpoukou et Mvou-Mvou en pointillés (un arrondissement sans état : « pas encore »).
  await expect(page.locator('svg path.quartier.en-cours')).toHaveCount(2);
  await expect(page.locator('svg path.quartier.programme')).toHaveCount(3);
});

test('le pays s’appelle « Congo-Brazzaville », et la phrase de recherche est juste', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/');
  await expect(page.getByRole('heading', { name: 'Congo-Brazzaville', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Chercher une école au Congo-Brazzaville' }),
  ).toBeVisible();
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
