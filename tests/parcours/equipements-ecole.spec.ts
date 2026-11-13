import { ouvrirGestion } from './aides';
import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';
test.use({ permissions: ['geolocation'] });
test('équipement : provenance explicite, ajout relecture modification et retrait sans badge', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await expect(page.getByRole('combobox', { name: 'Zone à publier' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await ouvrirGestion(ligne, 'Équipements');
  const d = page.getByRole('dialog', { name: 'Gérer [École 1]' }),
    f = d.getByRole('form');
  await f.getByRole('combobox', { name: 'Équipement', exact: true }).selectOption('cloture');
  await f.getByRole('combobox', { name: 'État', exact: true }).selectOption('absent');
  await f.getByRole('combobox', { name: 'Source', exact: true }).selectOption('terrain');
  await f
    .getByLabel('Date de déclaration ou d’observation')
    .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  await f.getByRole('checkbox').check();
  await f.getByRole('button', { name: 'Enregistrer l’équipement' }).click();
  await expect(d).toContainText('Le terrain atteste seulement un élément réellement visible');
  await f.getByRole('combobox', { name: 'État', exact: true }).selectOption('present');
  await f.getByRole('button', { name: 'Enregistrer l’équipement' }).click();
  await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  await expect(d.getByRole('list')).toContainText('Observé sur place');
  await expect(ligne).toContainText('Prête');
  await expect(ligne).not.toContainText('vérifiée par la direction');
  const b = await d.boundingBox();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(360);
  expect(await d.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(ligne.getByRole('button', { name: 'Gérer la fiche', exact: true })).toBeFocused();
  await page.reload();
  await ouvrirGestion(ligne, 'Équipements');
  await d.getByRole('button', { name: 'Modifier Clôture', exact: true }).click();
  await expect(f.getByRole('combobox', { name: 'Source', exact: true })).toHaveValue('terrain');
  await expect(f.getByRole('checkbox')).not.toBeChecked();
  await f.getByRole('combobox', { name: 'Source', exact: true }).selectOption('ecole');
  await f.getByRole('combobox', { name: 'État', exact: true }).selectOption('non_precise');
  await f.getByRole('checkbox').check();
  await f.getByRole('button', { name: 'Enregistrer l’équipement' }).click();
  await expect(d.getByRole('list')).toContainText('Non précisé par l’école');
  await d.getByRole('button', { name: 'Retirer Clôture', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('retiré du catalogue');
  await expect(d.getByRole('list')).toHaveCount(0);
});
test('fiche publique : observé, déclaré absent et non précisé restent distincts et datés', async ({
  page,
}) => {
  await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
  const b = page.getByRole('region', { name: 'Équipements et infrastructures' });
  // v2 (13/11) : « Sur place », une ligne par équipement, et à droite qui l'affirme et quand.
  await expect(b.getByRole('heading')).toHaveText('Sur place');
  await expect(b.getByRole('listitem').filter({ hasText: 'Clôture' })).toContainText(
    'vu sur place le 3 nov. 2026',
  );
  await expect(b.getByRole('listitem').filter({ hasText: 'Cantine' })).toContainText(
    'absent, d’après l’école (3 nov. 2026)',
  );
  await expect(b.getByRole('listitem').filter({ hasText: 'Eau' })).toContainText(
    'non précisé par l’école (3 nov. 2026)',
  );
  await expect(b).not.toContainText('Non renseignés :');
  await expect(b).not.toContainText('Confirmée par la direction');
});
test('sans information : aucun équipement supposé absent', async ({ page }) => {
  await page.goto('/ecoles/centre-de-formation-exemple-315702/');
  await expect(page.getByRole('region', { name: 'Équipements et infrastructures' })).toHaveCount(0);
  await expect(page.getByText('Équipements', { exact: true })).toHaveCount(0);
});
