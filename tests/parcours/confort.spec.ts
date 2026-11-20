// Ticket 207 (A7), le confort de l'admin : une recherche dans « Écoles » porte sur toutes les écoles, quel que soit
// l'onglet ouvert ; la corbeille garde la sienne. Faux serveur.
import { expect, test } from '@playwright/test';
import { fermerContacts, seConnecter } from './aides';

test('une recherche trouve une école d’un autre onglet que celui ouvert', async ({ page }) => {
  await seConnecter(page, '/admin/#valider');
  await fermerContacts(page);
  await page.getByRole('link', { name: 'Écoles' }).click();
  const etats = page.getByRole('group', { name: 'Filtrer par état' });
  await expect(etats.getByRole('button', { name: /^À publier/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await expect(ligne).toHaveCount(0);

  await page.getByLabel('Rechercher une école').fill('ecole a situer');
  await expect(page.getByText('Recherche dans toutes les écoles.')).toBeVisible();
  await expect(ligne.first()).toBeVisible();

  await page.getByLabel('Rechercher une école').fill('');
  await expect(page.getByText('Recherche dans toutes les écoles.')).toHaveCount(0);
  await expect(ligne).toHaveCount(0);
});
