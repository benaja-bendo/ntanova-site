import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';
test.use({ permissions: ['geolocation'] });
test('contact public : accord distinct, ajout, relecture et retrait sans badge', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await ligne.getByRole('button', { name: 'Contact public', exact: true }).click();
  const f = page.getByRole('form', { name: 'Contact public de [École 1]', exact: true });
  // Pas de copie du contact privé reçu avec la fiche.
  await expect(f.getByLabel('Numéro public', { exact: true })).toHaveValue('');
  await f.getByLabel('Numéro public', { exact: true }).fill('06 000 00 01');
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await f.getByLabel('Date de l’accord de publication').fill(hier);
  await f
    .getByLabel('Fonction de la personne ayant autorisé la publication')
    .selectOption('directeur');
  await f.getByLabel('Canal de l’accord').selectOption('appel');
  await f.getByRole('button', { name: 'Enregistrer le contact public' }).click();
  await expect(f).toContainText('Confirme l’autorisation de publier');
  await f.getByLabel('La direction autorise la publication de ce numéro sur le site.').check();
  await f.getByRole('button', { name: 'Enregistrer le contact public' }).click();
  await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  await expect(f).toContainText('+242 06 000 00 01');
  await expect(ligne).not.toContainText('vérifiée par la direction');
  await page.reload();
  await ligne.getByRole('button', { name: 'Contact public', exact: true }).click();
  await expect(f.getByLabel('Numéro public', { exact: true })).toHaveValue('242060000001');
  await expect(
    f.getByLabel('La direction autorise la publication de ce numéro sur le site.'),
  ).not.toBeChecked();
  await f.getByRole('button', { name: 'Retirer le contact public' }).click();
  await expect(page.getByRole('status')).toContainText('retiré de la base');
  await expect(f.getByLabel('Numéro public', { exact: true })).toHaveValue('');
  await expect(f.getByRole('button', { name: 'Retirer le contact public' })).toHaveCount(0);
});

test('fiche publique : accord daté et numéro d’enseigne gardent leur provenance', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/');
  await expect(page.getByText('Contact communiqué par l’école', { exact: true })).toBeVisible();
  await expect(page.getByText('Publication autorisée le 3 novembre 2026.')).toBeVisible();
  await expect(page.locator('a[href="tel:+242060000009"]')).toHaveCount(1);
  await expect(page.getByText('Confirmée par la direction', { exact: true })).toHaveCount(0);
});
test('même numéro sur l’enseigne et communiqué : un appel, deux provenances', async ({ page }) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/ecole-sans-detail-exemple/');
  await expect(page.locator('a[href="tel:+242060000002"]')).toHaveCount(1);
  await expect(page.getByText('Également lu sur l’enseigne.')).toBeVisible();
  await expect(page.getByText("Contact de l'école", { exact: true })).toHaveCount(0);
});
test('sans accord public : pas de nouveau contact ni de mention inventée', async ({ page }) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/centre-de-formation-exemple/');
  await expect(page.getByText('Contact communiqué par l’école', { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contact de l'école", { exact: true })).toBeVisible();
});
