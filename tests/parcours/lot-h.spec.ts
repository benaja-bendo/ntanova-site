// Lot H (13/11/2026) : l'accueil « Missions » remplace « Mon secteur », l'aide, et « Compte » (le numéro Mobile Money du
// relais, « Mon téléphone est prêt »).
import { expect, test } from '@playwright/test';
import { attendreLaLecture, seConnecter } from './aides';

test('l’accueil : le bouton d’abord, « Vos missions », « Cette semaine », l’aide ; l’onglet « Missions »', async ({
  page,
}) => {
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/, level: 1 })).toBeVisible();
  await attendreLaLecture(page);
  await expect(page.getByRole('region', { name: 'Mon secteur' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ajouter une école' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Vos missions' })).toContainText(/\d+ à faire/);
  const semaine = page.getByRole('region', { name: 'Cette semaine' });
  await expect(semaine).toContainText('envoyées');
  await expect(semaine).toContainText('acceptées');
  await expect(semaine).toContainText('en attente');
  await expect(
    page.getByRole('navigation', { name: 'Espace relais' }).getByRole('link', { name: 'Missions' }),
  ).toHaveAttribute('aria-current', 'page');
  // Le « ? » ouvre l'aide « Quoi dire en entrant ».
  await page.getByRole('link', { name: 'Aide', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quoi dire en entrant', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'À dire en entrant' })).toContainText('Jamais');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('« Compte » : le relais ajoute puis change son numéro Mobile Money ; un numéro mal écrit est refusé', async ({
  page,
}) => {
  await seConnecter(page, '/relais/');
  await page.goto('/relais/#compte');
  const paie = page.getByRole('region', { name: 'Pour recevoir la paie' });
  await expect(paie).toContainText('Aucun numéro enregistré');
  await paie.getByRole('button', { name: 'Ajouter' }).click();
  await paie.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(paie.getByRole('alert')).toHaveText(
    'Choisissez l’opérateur : MTN, Airtel ou autre.',
  );
  await paie.getByRole('button', { name: 'MTN' }).click();
  await paie.getByLabel('Numéro').fill('06 123');
  await paie.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(paie.getByRole('alert')).toContainText('Écrivez le numéro');
  await paie.getByLabel('Numéro').fill('06 123 45 67');
  await paie.getByLabel('Au nom de').fill('[Titulaire Exemple]');
  await paie.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(paie.getByRole('status')).toContainText('Numéro enregistré');
  await expect(paie).toContainText('MTN');
  await expect(paie).toContainText('+242 06 123 45 67');

  // Il se relit après un rechargement, et se change.
  await page.reload();
  await expect(paie).toContainText('+242 06 123 45 67');
  await paie.getByRole('button', { name: 'Modifier' }).click();
  await paie.getByRole('button', { name: 'Airtel' }).click();
  await paie.getByLabel('Numéro').fill('05 765 43 21');
  await paie.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(paie).toContainText('Airtel');
  await expect(paie).toContainText('+242 05 765 43 21');
});

test('« Compte » : l’aide en trois pages, le guide et WhatsApp', async ({ page }) => {
  await seConnecter(page, '/relais/');
  await page.goto('/relais/#compte');
  const aide = page.getByRole('navigation', { name: 'Aide du relais' });
  await aide.getByRole('link', { name: /Les règles du relais/ }).click();
  await expect(page.getByRole('heading', { name: 'Les règles du relais', level: 1 })).toBeVisible();
  await expect(page.getByText('Aucun enfant en photo.')).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();
  await aide.getByRole('link', { name: /Comment je suis payé/ }).click();
  await expect(page.getByText('500 FCFA par fiche acceptée')).toBeVisible();
  await page.getByRole('button', { name: 'Retour' }).click();
  await expect(aide.getByRole('link', { name: /Lire le guide du relais/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' })).toBeVisible();
});
