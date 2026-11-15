// Les écrans des planches v2 (canevas du fondateur), capturés pour être comparés à l'œil. Aucun contrôle ici.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  attendreLaLecture,
  carteDeMission,
  ouvrirGestion,
  ouvrirLaFiche,
  prendrePhotoEtPosition,
  seConnecter,
  uneFicheEnvoyee,
} from '../parcours/aides';

const dossier = new URL('../../captures/v2/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });

const prendre = async (page: Page, ecran: string) => {
  await page.waitForTimeout(400);
  await page.screenshot({
    animations: 'disabled',
    path: `${dossier}${ecran}-${page.viewportSize()?.width ?? 0}.png`,
    fullPage: true,
  });
};

test('public : la fiche d’une école', async ({ page }) => {
  await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
  await prendre(page, 'public-fiche');
  await page.goto('/ecoles/groupe-scolaire-exemple-158427/');
  await prendre(page, 'public-fiche-multi');
});

test('relais : accueil, mission, compte, paie, aide', async ({ page, context }) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await attendreLaLecture(page);
  await prendre(page, 'relais-accueil');
  if (await carteDeMission(page).count()) {
    await carteDeMission(page).first().click();
    await prendre(page, 'relais-mission');
  }
  for (const [ecran, adresse] of [
    ['relais-paie', '#paie'],
    ['relais-compte', '#compte'],
    ['relais-aide', '#aide/entrer'],
  ] as const) {
    await page.goto(`/relais/${adresse}`);
    await page.waitForLoadState('networkidle');
    await prendre(page, ecran);
  }
});

test('relais : les étapes du relevé', async ({ page, context }) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await attendreLaLecture(page);
  await prendrePhotoEtPosition(page);
  await prendre(page, 'relais-etape1');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom de l'établissement").fill('Complexe scolaire Les Pal');
  await page.waitForTimeout(600);
  await prendre(page, 'relais-etape2');
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await prendre(page, 'relais-etape3');
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await prendre(page, 'relais-etape3-oui');
  const bonus = page.getByRole('button', { name: /bonus/i }).first();
  if (await bonus.count()) {
    await bonus.click();
    await prendre(page, 'relais-bonus');
  }
});

test('relais : mes fiches et une fiche ; admin : à valider, fiche école', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await uneFicheEnvoyee(page, context);
  await page.goto('/relais/#fiches');
  await prendre(page, 'relais-mes-fiches');
  const premiere = page.locator('main a, main button').filter({ hasText: '[École 1]' }).first();
  if (await premiere.count()) {
    await premiere.click();
    await prendre(page, 'relais-une-fiche');
  }
  await page.goto('/admin/#valider');
  await expect(page.locator('main')).toBeVisible();
  await prendre(page, 'admin-valider-liste');
  await ouvrirLaFiche(page);
  await prendre(page, 'admin-valider-fiche');
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  await prendre(page, 'admin-ecoles');
  await ouvrirGestion(page.getByRole('row', { name: /\[École 1\]/ }), 'Frais déclarés').catch(
    () => undefined,
  );
  await page.goto('/admin/#ecoles');
  const ligne = page.getByRole('row', { name: /\[École 1\]/ }).first();
  await ligne
    .getByRole('link')
    .first()
    .click()
    .catch(() => undefined);
  await prendre(page, 'admin-fiche-ecole');
  await page.goto('/admin/#aujourdhui');
  await prendre(page, 'admin-aujourdhui');
  await page.goto('/admin/#relais');
  await prendre(page, 'admin-relais');
});
