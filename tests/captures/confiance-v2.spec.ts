// Les pages de confiance et « Toutes les villes » (refonte, lot 4), sur le faux serveur : capturées à 360, 390, 768 et
// 1 440 px pour être comparées à l'œil aux planches « Fiabilité des informations », « Toutes les villes », « À propos » et à la
// fiche de démonstration. Aucun contrôle ici (les parcours les font) :
// `pnpm exec playwright test -c playwright.confiance.config.ts`, après `pnpm test:parcours:preparer`.
import { mkdirSync } from 'node:fs';
import { test, type Page } from '@playwright/test';

const dossier = new URL('../../captures/confiance/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });

const prendre = async (page: Page, ecran: string) => {
  await page.waitForTimeout(250);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: `${dossier}${ecran}-${page.viewportSize()?.width ?? 0}.png`,
  });
};

for (const [ecran, adresse] of [
  ['methode', '/methode/'],
  ['donnees', '/donnees/'],
  ['a-propos', '/a-propos/'],
  ['villes', '/villes/'],
  ['demo', '/demo/fiche-ecole/'],
  ['accueil', '/'],
  ['fiche', '/ecoles/complexe-scolaire-exemple-482913/'],
] as const)
  test(`${ecran} : ${adresse}`, async ({ page }) => {
    await page.goto(adresse);
    // Les dessins sous le premier écran se chargent au défilement : on les force pour la capture.
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('img[loading="lazy"]'))
        img.removeAttribute('loading');
    });
    await page.waitForLoadState('networkidle');
    await prendre(page, ecran);
  });
