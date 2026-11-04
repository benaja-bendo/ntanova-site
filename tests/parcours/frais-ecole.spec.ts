import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';
test.use({ permissions: ['geolocation'] });
test('frais déclarés : ajout, relecture, modification et retrait, sans badge ni publication', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await ligne.getByRole('button', { name: 'Frais déclarés', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Frais de [École 1]' });
  const f = dialog.getByRole('form');
  await f.getByRole('combobox', { name: 'Cycle', exact: true }).selectOption('primaire');
  await f.getByLabel('Montant minimum ou unique (FCFA)', { exact: true }).fill('25 000');
  await f.getByLabel('Maximum si fourchette (facultatif, FCFA)').fill('30 000');
  await f.getByRole('combobox', { name: 'Période', exact: true }).selectOption('mois');
  await f
    .getByLabel('Date de déclaration')
    .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  await f.getByRole('button', { name: 'Enregistrer les frais' }).click();
  await expect(dialog).toContainText('Confirme que ces frais ont été communiqués');
  await f.getByLabel('Ces frais ont été communiqués par l’école pour être affichés.').check();
  await f.getByRole('button', { name: 'Enregistrer les frais' }).click();
  await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  await expect(dialog.getByRole('list')).toContainText(/25\s*000 à 30\s*000 FCFA/);
  await expect(ligne).toContainText('Prête');
  await expect(ligne).not.toContainText('vérifiée par la direction');
  const b = await dialog.boundingBox();
  expect(b!.x).toBeGreaterThanOrEqual(0);
  expect(b!.x + b!.width).toBeLessThanOrEqual(360);
  expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(ligne.getByRole('button', { name: 'Frais déclarés', exact: true })).toBeFocused();
  await page.reload();
  await ligne.getByRole('button', { name: 'Frais déclarés', exact: true }).click();
  await dialog.getByRole('button', { name: 'Modifier les frais de Primaire' }).click();
  await expect(f.getByLabel('Montant minimum ou unique (FCFA)', { exact: true })).toHaveValue(
    '25000',
  );
  await expect(f.getByLabel('Frais d’inscription (facultatif, FCFA)')).toHaveValue('');
  await expect(
    f.getByLabel('Ces frais ont été communiqués par l’école pour être affichés.'),
  ).not.toBeChecked();
  await f.getByLabel('Montant minimum ou unique (FCFA)', { exact: true }).fill('0');
  await f.getByLabel('Maximum si fourchette (facultatif, FCFA)').fill('');
  await f.getByLabel('Frais d’inscription (facultatif, FCFA)').fill('0');
  await f.getByLabel('Ces frais ont été communiqués par l’école pour être affichés.').check();
  await f.getByRole('button', { name: 'Enregistrer les frais' }).click();
  await expect(dialog.getByRole('list')).toContainText('0 FCFA');
  await dialog.getByRole('button', { name: 'Retirer les frais de Primaire' }).click();
  await expect(page.getByRole('status')).toContainText('retirés du catalogue');
  await expect(dialog.getByRole('list')).toHaveCount(0);
});
test('fiche publique : fourchette, période, date et inconnues, sans total annuel inventé', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/');
  const bloc = page.getByRole('region', { name: 'Frais déclarés par l’école' });
  await expect(bloc).toContainText(/25\s*000 à 30\s*000 FCFA/);
  await expect(bloc).toContainText('Par mois');
  await expect(bloc).toContainText('Année scolaire non précisée');
  await expect(bloc).toContainText('Frais d’inscription : non communiqués');
  await expect(bloc).toContainText('Déclarés par l’école le 3 novembre 2026.');
  await expect(bloc).not.toContainText(/300\s*000|360\s*000|Confirmée par la direction/);
});
test('sans déclaration de frais : état vide honnête', async ({ page }) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/centre-de-formation-exemple/');
  await expect(page.getByRole('region', { name: 'Frais déclarés par l’école' })).toHaveCount(0);
  await expect(page.getByText('Frais', { exact: true })).toBeVisible();
});
