import { existsSync, mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seConnecter } from '../parcours/aides';

// Captures de l'espace relais en haute définition, pour le livret du relais (hors dépôt).
// Les images vont dans LIVRET_SORTIE ; l'enseigne fictive (LIVRET_ENSEIGNE : enseigne.html) devient la photo prise.

test.use({ permissions: ['geolocation'] });

const sortie = process.env['LIVRET_SORTIE'] ?? '';
const enseigne = process.env['LIVRET_ENSEIGNE'] ?? '';

async function prendre(page: Page, nom: string) {
  // La page à sa hauteur entière, sans défilement : le pied de page fixe tombe en bas de l'écran.
  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: 360, height: hauteur });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${sortie}/${nom}.png` });
  await page.setViewportSize({ width: 360, height: 760 });
}

/** Le badge « ✓ Gardé sur le téléphone » tient sur une ligne, à chacune des trois étapes. */
async function badgeSurUneLigne(page: Page) {
  const badge = page.locator('.garde');
  await expect(badge).toBeVisible();
  const { hauteur, ligne } = await badge.evaluate((el) => ({
    hauteur: el.getBoundingClientRect().height,
    ligne: parseFloat(getComputedStyle(el).lineHeight) || 16,
  }));
  expect(hauteur, 'le badge « Gardé sur le téléphone » ne se coupe pas en deux lignes').toBeLessThan(ligne * 1.6);
}

test('captures du livret du relais', async ({ page, context }) => {
  test.setTimeout(180_000);
  mkdirSync(sortie, { recursive: true });

  // La photo d'enseigne fictive : « Maternelle - Primaire » doit se lire une fois réduite.
  await page.setViewportSize({ width: 1600, height: 1200 });
  await page.goto(`file://${enseigne}`);
  await expect(page.getByText('Maternelle - Primaire')).toBeVisible();
  const photo = `${sortie}/enseigne-exemple.jpg`;
  await page.screenshot({ path: photo, type: 'jpeg', quality: 88 });
  expect(existsSync(photo)).toBe(true);

  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await page.setViewportSize({ width: 360, height: 760 });
  // Une heure de matin fixe : « Dernier envoi à 7 h 30 », au lieu de l'heure de la capture.
  await page.clock.setFixedTime(new Date('2026-11-02T07:30:00'));

  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await prendre(page, 'mon-lot');

  // 1/3 : photo et position (l'enseigne obligatoire, puis le bouton des photos facultatives)
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
  await badgeSurUneLigne(page);
  await prendre(page, 'ajouter-1-vide');
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  // Le secteur est un conseil (ticket 67 de ntanova-site) : l'écran ne juge plus la distance au secteur.
  await expect(page.getByText(/hors de votre|dans votre/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ajouter d'autres photos/ })).toBeVisible();
  await prendre(page, 'ajouter-1');
  await page.getByRole('button', { name: 'Suivant' }).click();

  // 2/3 : ce qui se voit de la rue
  await expect(page.getByRole('heading', { name: 'Ce qui se voit de la rue' })).toBeVisible();
  await badgeSurUneLigne(page);
  await page.getByLabel("Nom sur l'enseigne").fill('Complexe scolaire Exemple');
  await page.getByRole('button', { name: 'Maternelle', exact: true }).click();
  await page.getByRole('button', { name: 'Primaire', exact: true }).click();
  await page.getByRole('button', { name: 'Publique', exact: true }).click();
  await prendre(page, 'ajouter-2');
  await page.getByRole('button', { name: 'Suivant' }).click();

  // 3/3 : la direction
  await expect(page.getByRole('heading', { name: 'La direction' })).toBeVisible();
  await badgeSurUneLigne(page);
  await prendre(page, 'ajouter-3-vide');
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page.getByLabel('Sa fonction').selectOption('directeur');
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await prendre(page, 'ajouter-3');
});
