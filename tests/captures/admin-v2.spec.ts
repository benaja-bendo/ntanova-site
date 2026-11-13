// Les écrans des planches de l'administration (lot 2 de la refonte v2), avec le scénario « admin » du faux serveur :
// capturés pour être comparés à l'œil aux planches. Aucun contrôle ici.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const dossier = new URL('../../captures/v2/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });

const prendre = async (page: Page, ecran: string) => {
  await page.waitForTimeout(500);
  await page.screenshot({
    animations: 'disabled',
    path: `${dossier}${ecran}-${page.viewportSize()?.width ?? 0}.png`,
    fullPage: true,
  });
};

const ouvrir = async (page: Page, adresse: string) => {
  await page.goto(`/admin/?scenario=admin${adresse}`);
  // Le scénario repart d'un état neuf : il faut se reconnecter.
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Administration');
  await page.waitForLoadState('networkidle');
};

test('admin : aujourd’hui, à valider, écoles, fiche, relais', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page, '#aujourdhui');
  await prendre(page, 'admin-aujourdhui');

  await page.goto('/admin/#valider');
  await page.waitForLoadState('networkidle');
  await prendre(page, 'admin-valider-liste');
  const palmiers = page.getByText('Complexe scolaire Les Palmiers').first();
  if (await palmiers.count()) {
    await palmiers.click();
    await prendre(page, 'admin-valider-fiche');
  }

  await page.goto('/admin/#ecoles');
  await page.waitForLoadState('networkidle');
  await prendre(page, 'admin-ecoles');
  await page.goto('/admin/#ecoles/fiche/51000000-0000-4000-8000-000000000001');
  await page.waitForLoadState('networkidle');
  await prendre(page, 'admin-fiche-ecole');

  for (const [ecran, adresse] of [
    ['admin-relais', '#relais'],
    ['admin-zones', '#zones'],
    ['admin-paie', '#paie'],
    ['admin-sante', '#sante'],
  ] as const) {
    await page.goto(`/admin/${adresse}`);
    await page.waitForLoadState('networkidle');
    await prendre(page, ecran);
  }
});
