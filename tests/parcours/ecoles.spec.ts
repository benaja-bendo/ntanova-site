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
  await ligne.getByRole('button', { name: 'Confier à un relais' }).click();
  // Une école sans position : la mission par défaut est de la situer.
  await expect(ligne.getByLabel('Ce que le relais doit faire')).toHaveValue('locate');
  await ligne.getByLabel('À vérifier').fill('Le nom exact');
  await ligne.getByRole('button', { name: 'Confier', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);

  // Le relais la voit dans « Mon secteur » et la complète.
  await page.goto('/relais/');
  await expect(page.getByText('À compléter · 1')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('À vérifier : Le nom exact')).toBeVisible();
  await expect(page.getByText(/Passez la situer/)).toBeVisible();
  await page.getByRole('button', { name: 'Compléter' }).click();
  // L'écran dit ce que le relais fait, avec un mot qu'il connaît : « Compléter », comme le bouton qu'il vient de toucher.
  await expect(page.locator('.entete-etape-titre')).toHaveText('Compléter une école');
  await expect(page.getByText(/Compléter\s*: \[École à situer\]/)).toBeVisible();
  // Pour « situer », l'encart dit ce qui manque, d'après ce que NTanova sait de l'école (ticket #55, PR 4).
  const encart = page.getByRole('region', { name: 'À faire sur cette école' });
  await expect(encart).toContainText('sans savoir où elle est');
  await expect(encart).toContainText('Le nom exact');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByText('Position prise')).toBeVisible();
  await expect(page.getByText('Est-ce la même école ?')).toHaveCount(0);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByLabel("Nom sur l'enseigne")).toHaveValue('[École à situer]');
  await page.getByLabel("Nom sur l'enseigne").fill('[École à situer, nom exact]');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Absente' }).click();
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await page.getByRole('link', { name: 'Mon secteur' }).click();
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
