import { expect, test } from '@playwright/test';
import { seConnecter } from './aides';

// Une école connue sans position, confiée à un relais, relevée sur place, puis
// située puis publiée par l'administration (faux serveur : l'utilisateur est les deux).

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

test.use({ permissions: ['geolocation'] });

test('une école à situer, confiée à un relais, est relevée sur place puis publiée', async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });

  // L'administration confie l'école à situer.
  await seConnecter(page, '/admin/');
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await expect(ligne.getByText('À situer', { exact: true })).toBeVisible();
  await ligne.getByLabel(/Ce que le relais doit vérifier/).fill('Le nom exact');
  await ligne.getByRole('button', { name: 'Confier' }).click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);

  // Le relais la voit dans « Mon lot » et la complète.
  await page.goto('/relais/');
  await expect(page.getByText('À compléter · 1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('À vérifier : Le nom exact')).toBeVisible();
  await page.getByRole('button', { name: 'Compléter' }).click();
  await expect(page.getByText(/Contre-visite\s*: \[École à situer\]/)).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByText('Position prise')).toBeVisible();
  await expect(page.getByText('Est-ce la même école ?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByLabel("Nom sur l'enseigne")).toHaveValue('[École à situer]');
  await page.getByLabel("Nom sur l'enseigne").fill('[École à situer, nom exact]');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Absente' }).click();
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await page.getByRole('link', { name: 'Mon lot' }).click();
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/À compléter/)).toHaveCount(0);

  // L'administration la situe et la publie.
  await page.goto('/admin/');
  await page.getByRole('link', { name: /\[École à situer, nom exact\]/ }).click();
  await expect(page.getByText('Contre-visite', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: /^Situer/ }).click();
  await expect(page.getByRole('status')).toHaveText(/est mise à jour/);
  await page.getByRole('link', { name: 'Écoles' }).click();
  const situee = page.getByRole('row', { name: /\[École à situer, nom exact\]/ });
  await expect(situee.getByText('Prête', { exact: true })).toBeVisible();
  await situee.getByRole('button', { name: 'Publier', exact: true }).click();
  const publiee = page.getByRole('row', { name: /\[École à situer, nom exact\]/ });
  await expect(publiee.getByText('Publiée', { exact: true })).toBeVisible();
  // Le quartier et l'arrondissement du même nom ne s'affichent qu'une fois.
  await expect(publiee.getByText('Tié-Tié', { exact: true })).toBeVisible();
});
