import { ouvrirGestion, retourAuxEcoles, ouvrirLesEcoles } from './aides';
import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';
test.use({ permissions: ['geolocation'] });
test('équipement : provenance explicite, ajout relecture modification et retrait sans badge', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await ouvrirLesEcoles(page);
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await ouvrirGestion(ligne, 'Équipements');
  // Planche « Sur place » : un tableau, une ligne par équipement ; « + Cantine » ouvre la ligne à remplir.
  const d = page.getByRole('dialog', { name: 'Sur place · [École 1]' });
  const tableau = d.getByRole('table', { name: 'Équipements de [École 1]' });
  const cantine = tableau.getByRole('row', { name: 'Cantine', exact: true });
  const enregistrer = d.getByRole('button', { name: 'Enregistrer', exact: true });
  await d.getByRole('button', { name: '+ Cantine' }).click();
  // v2 (13/11) : le terrain peut dire « vu » pour tout, « absent » seulement pour la clôture.
  await d.getByLabel('Qui le dit').selectOption('terrain');
  await d.getByLabel('Ce qu’il dit').selectOption('absent');
  await d
    .getByLabel('Le', { exact: true })
    .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  await enregistrer.click();
  await expect(d).toContainText('Une absence ne se dit que pour la clôture');
  await d.getByLabel('Ce qu’il dit').selectOption('present');
  await enregistrer.click();
  await expect(d.getByRole('status').first()).toContainText('Reconstruis le site');
  await expect(cantine).toContainText('Vu sur place');
  await expect(cantine).toContainText('Il y en a');
  const fiche = page.locator('article[aria-label="Fiche de [École 1]"]');
  await expect(fiche).toContainText('Prête');
  await expect(fiche).not.toContainText('vérifiée par la direction');
  const b = await d.boundingBox();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(360);
  expect(await d.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await retourAuxEcoles(page);
  await page.reload();
  await ouvrirGestion(ligne, 'Équipements');
  await cantine.locator('summary').click();
  await d.getByRole('button', { name: 'Modifier Cantine', exact: true }).click();
  await expect(d.getByLabel('Qui le dit')).toHaveValue('terrain');
  await d.getByLabel('Qui le dit').selectOption('ecole');
  await d.getByLabel('Ce qu’il dit').selectOption('non_precise');
  await enregistrer.click();
  await expect(cantine).toContainText('Pas précisé');
  await cantine.locator('summary').click();
  await d.getByRole('button', { name: 'Retirer Cantine', exact: true }).click();
  await expect(d.getByRole('status').first()).toContainText('retiré du catalogue');
  await expect(cantine).toHaveCount(0);
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
