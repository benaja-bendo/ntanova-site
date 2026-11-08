import { ouvrirGestion } from './aides';
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
  await ouvrirGestion(ligne, 'Contact public');
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
  await ouvrirGestion(ligne, 'Contact public');
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
  await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
  await expect(page.getByText('Contact communiqué par l’école', { exact: true })).toBeVisible();
  await expect(page.getByText('Publication autorisée le 3 novembre 2026.')).toBeVisible();
  // Une ligne dans la fiche, plus le bouton « Appeler » de la barre d'actions : le même numéro, le contact communiqué d'abord.
  await expect(page.locator('dl.proprietes a[href="tel:+242060000009"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
    'href',
    'tel:+242060000009',
  );
  await expect(page.getByText('Confirmée par la direction', { exact: true })).toHaveCount(0);
});
test('même numéro sur l’enseigne et communiqué : un appel, deux provenances', async ({ page }) => {
  await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
  await expect(page.locator('dl.proprietes a[href="tel:+242060000002"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
    'href',
    'tel:+242060000002',
  );
  await expect(page.getByText('Également lu sur l’enseigne.')).toBeVisible();
  await expect(page.getByText("Contact de l'école", { exact: true })).toHaveCount(0);
});
test('sans accord public : pas de nouveau contact ni de mention inventée', async ({ page }) => {
  await page.goto('/ecoles/centre-de-formation-exemple-315702/');
  await expect(page.getByText('Contact communiqué par l’école', { exact: true })).toHaveCount(0);
  await expect(page.getByText("Contact de l'école", { exact: true })).toHaveCount(0);
});

test('sur téléphone : formulaire entier dans une fenêtre, Échap rend le focus', async ({
  page,
}) => {
  await page.goto('/admin/');
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ouvrir = page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('button', { name: 'Gérer la fiche', exact: true });
  await ouvrir.click();
  await page
    .getByRole('navigation', { name: 'Sections de la fiche' })
    .getByRole('button', { name: 'Contact public', exact: true })
    .click();
  const fenetre = page.getByRole('dialog', { name: 'Gérer [École à situer]' });
  await expect(fenetre).toBeVisible();
  const boite = await fenetre.boundingBox();
  expect(boite!.x).toBeGreaterThanOrEqual(0);
  expect(boite!.x + boite!.width).toBeLessThanOrEqual(360);
  expect(boite!.height).toBeLessThanOrEqual(640);
  expect(await fenetre.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);
  await expect(ouvrir).toBeFocused();
});
