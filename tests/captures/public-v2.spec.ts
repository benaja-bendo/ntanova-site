// Lot 3 (14/11) : la fiche publique d'une école, classique et du supérieur, capturée à 375 et 1 280 px pour être comparée
// côte à côte aux planches « Public » et « Sup » du fondateur. Aucun contrôle ici.
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

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

test('public : la fiche d’une école classique', async ({ page }) => {
  await page.goto('/ecoles/groupe-scolaire-exemple-158427/');
  await prendre(page, 'public-ecole');
});

test('public : la fiche d’une école du supérieur', async ({ page }) => {
  await page.goto('/ecoles/institut-superieur-exemple-527064/');
  await prendre(page, 'public-sup');
});
