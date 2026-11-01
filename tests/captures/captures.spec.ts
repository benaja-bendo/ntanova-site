import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from '../parcours/aides';

// Une capture de chaque écran, à la largeur du projet (voir playwright.captures.config.ts).
// Les images s'appellent <écran>-<largeur>.png et vont dans captures/ (ignoré par git).

test.use({ permissions: ['geolocation'] });

const dossier = new URL('../../captures/', import.meta.url).pathname;

test('une capture de chaque écran', async ({ page, context }) => {
  test.setTimeout(120_000);
  mkdirSync(dossier, { recursive: true });
  const largeur = page.viewportSize()?.width ?? 0;
  const prendre = (ecran: string) =>
    page.screenshot({ path: `${dossier}${ecran}-${largeur}.png`, fullPage: true });

  for (const [ecran, adresse] of [
    ['public-accueil', '/'],
    ['public-liste', '/ecoles/tie-tie/'],
    ['public-carte-ville', '/ecoles/'],
    ['public-carte-arrondissement', '/ecoles/tie-tie/carte/'],
    ['public-carte-coin', '/ecoles/tie-tie/carte/coin-1/'],
    ['public-fiche', '/ecoles/tie-tie/complexe-scolaire-exemple/'],
    ['public-fiche-autre', '/ecoles/tie-tie/centre-de-formation-exemple/'],
    ['public-fiche-sans-detail', '/ecoles/tie-tie/ecole-sans-detail-exemple/'],
    ['public-pour-les-ecoles', '/pour-les-ecoles/'],
    ['public-a-propos', '/a-propos/'],
    ['public-introuvable', '/cette-page-n-existe-pas/'],
  ] as const) {
    await page.goto(adresse);
    await prendre(ecran);
  }

  await uneFicheEnvoyee(page, context, { programme: 'Programme français-congolais, bilingue' });
  await prendre('relais-mon-lot');

  // L'étape 2/3 d'« Ajouter une école » : telle qu'on l'ouvre, puis remplie.
  await page.goto('/relais/#ajouter/2');
  await page.getByRole('heading', { name: 'Ce qui se voit de la rue' }).waitFor();
  await prendre('relais-ajouter-2');
  await page.getByLabel("Nom sur l'enseigne").fill('[École exemple]');
  await page.getByRole('button', { name: 'Maternelle', exact: true }).click();
  await page.getByRole('button', { name: 'Primaire', exact: true }).click();
  await page.getByRole('button', { name: 'Communautaire', exact: true }).click();
  await page
    .getByLabel(/Programme, langues ou autre mention écrite/)
    .fill('Programme français-congolais, bilingue');
  await prendre('relais-ajouter-2-rempli');

  await ouvrirLaFiche(page);
  await prendre('admin-a-valider');

  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('status').waitFor();
  await page.getByRole('button', { name: 'Décidées' }).click();
  await page.getByRole('link', { name: /\[École 1\]/ }).click();
  await page.getByRole('button', { name: /Effacer le contact/ }).click();
  await prendre('admin-effacer-le-contact');

  await page.getByRole('link', { name: 'Écoles' }).click();
  await page.getByRole('button', { name: /Publier l’école prête de Tié-Tié/ }).click();
  await page.getByRole('status').waitFor();
  await prendre('admin-ecoles');
  await page
    .getByRole('row', { name: /\[École 1\]/ })
    .getByRole('button', { name: 'Modifier la fiche' })
    .click();
  await page.getByRole('form', { name: 'Modifier [École 1]' }).waitFor();
  await prendre('admin-modifier-la-fiche');
  await page
    .getByRole('form', { name: 'Modifier [École 1]' })
    .getByRole('button', { name: 'Annuler' })
    .click();
  await page
    .getByRole('row', { name: /\[École 1\]/ })
    .getByRole('button', { name: 'Retirer du site' })
    .click();
  await prendre('admin-retirer-du-site');

  await page.getByRole('link', { name: 'Relais' }).click();
  await page.getByRole('heading', { name: 'Relais', level: 1 }).waitFor();
  await prendre('admin-relais');
});
