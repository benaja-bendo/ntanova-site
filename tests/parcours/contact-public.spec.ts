import { ouvrirGestion, retourAuxEcoles, ficheOuverte, ouvrirLesEcoles } from './aides';
import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';
test.use({ permissions: ['geolocation'] });
test('contact public : accord distinct, ajout, relecture et retrait sans badge', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await ouvrirLesEcoles(page);
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
  await expect(ficheOuverte(page)).not.toContainText('vérifiée par la direction');
  await page.reload();
  await ouvrirGestion(ligne, 'Contact public');
  // Ticket 207 (A27) : le numéro se relit écrit comme sur le site, plus en chiffres bruts.
  await expect(f.getByLabel('Numéro public', { exact: true })).toHaveValue('+242 06 000 00 01');
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
  // Lot 3 (planche) : une ligne « Téléphone » ; d'où vient le numéro se lit en note sous la carte « Contact ».
  await expect(
    page.getByText('Numéro communiqué par l’école, publication autorisée le 3 novembre 2026.'),
  ).toBeVisible();
  // Une ligne dans la fiche, plus le bouton « Appeler » de la barre d'actions : le même numéro, le contact communiqué d'abord.
  await expect(page.locator('.proprietes a[href="tel:+242060000009"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
    'href',
    'tel:+242060000009',
  );
  await expect(page.getByText('Confirmée par la direction', { exact: true })).toHaveCount(0);
});
test('même numéro sur l’enseigne et communiqué : un appel, deux provenances', async ({ page }) => {
  await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
  await expect(page.locator('.proprietes a[href="tel:+242060000002"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
    'href',
    'tel:+242060000002',
  );
  await expect(page.getByText('Également lu sur l’enseigne.')).toBeVisible();
  await expect(page.getByText("Contact de l'école", { exact: true })).toHaveCount(0);
});
test('sans accord public : pas de nouveau contact ni de mention inventée', async ({ page }) => {
  await page.goto('/ecoles/centre-de-formation-exemple-315702/');
  await expect(page.getByText('Numéro communiqué par l’école', { exact: false })).toHaveCount(0);
  await expect(page.getByText("Contact de l'école", { exact: true })).toHaveCount(0);
});

test('sur téléphone : formulaire entier dans une fenêtre, Échap rend le focus', async ({
  page,
}) => {
  await page.goto('/admin/');
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await ouvrirLesEcoles(page);
  const ouvrir = page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('link')
    .first();
  await ouvrir.click();
  const carte = page.getByRole('button', { name: 'Contact et inscriptions : ouvrir' });
  await carte.click();
  // Planche : le formulaire entier dans un tiroir, qui tient dans l'écran sans défiler de côté.
  const fenetre = page.getByRole('dialog', { name: 'Contact et inscriptions · [École à situer]' });
  await expect(fenetre).toBeVisible();
  const boite = await fenetre.boundingBox();
  expect(boite!.x).toBeGreaterThanOrEqual(0);
  expect(boite!.x + boite!.width).toBeLessThanOrEqual(360);
  expect(await fenetre.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  // Échap ferme le tiroir et rend le focus à la carte.
  await page.keyboard.press('Escape');
  await expect(fenetre).toHaveCount(0);
  await expect(carte).toBeFocused();
  await retourAuxEcoles(page);
});
