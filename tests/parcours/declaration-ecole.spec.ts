import { expect, test } from '@playwright/test';
import { seConnecter } from './aides';

test('déclaration école : date et transmission explicites, brouillon et origine conservés', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#ecoles');
  await page.getByRole('button', { name: 'Ajouter ou importer des écoles' }).click();
  await page.getByRole('button', { name: 'Déclaration d’une école', exact: true }).click();
  const f = page.getByRole('form', { name: 'Ajouter une école' });
  await expect(f.getByLabel('Date de déclaration de l’école')).toHaveValue('');
  await expect(
    f.getByRole('checkbox', { name: 'L’école a transmis ces informations pour publication.' }),
  ).not.toBeChecked();
  await expect(f.getByLabel("Numéro sur l'enseigne")).toHaveCount(0);
  await f.getByLabel('Nom de l’école', { exact: true }).fill('[École déclarée Exemple]');
  await f.getByRole('button', { name: 'Ajouter l’école', exact: true }).click();
  await expect(f).toContainText('Indique une date réelle');
  await f.getByLabel('Date de déclaration de l’école').fill('2026-11-01');
  await f
    .getByRole('checkbox', { name: 'L’école a transmis ces informations pour publication.' })
    .check();
  await f.getByRole('button', { name: 'Ajouter l’école', exact: true }).click();
  const row = page.getByRole('row', { name: /\[École déclarée Exemple\]/ });
  await expect(row).toContainText('Déclarée par l’école le 1 novembre 2026');
  await expect(row).toContainText('À situer');
  await expect(row).not.toContainText('Publiée');
  await expect(row).not.toContainText('vérifiée par la direction');
  await page.reload();
  await expect(row).toContainText('Déclarée par l’école le 1 novembre 2026');
});
test('public : origine déclarée datée, sans preuve terrain et porte ouverte au Congo', async ({
  page,
}) => {
  await page.goto('/ecoles/congo/brazzaville/moungali/ecole-de-brazzaville-exemple/');
  await expect(
    page.getByText('Déclarée par l’école le 1 novembre 2026', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Pas encore vue sur place/)).toBeVisible();
  await expect(page.getByText('Confirmée par la direction', { exact: true })).toHaveCount(0);
  await page.goto('/pour-les-ecoles/#referencer');
  const section = page.getByRole('region', { name: 'Confirmez ou ajoutez votre école' });
  await expect(section).toContainText('Partout au Congo-Brazzaville');
  await expect(section).toContainText('ne publie pas automatiquement');
  await expect(section.getByRole('link', { name: 'Écrire sur WhatsApp' })).toHaveAttribute(
    'href',
    /wa.me/,
  );
});
