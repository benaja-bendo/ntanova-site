// Lot 1 de la refonte v2 : l'espace relais, rempli comme les planches (scénario « planches » du faux serveur), capturé à
// 375 et 1 280 px pour être comparé à l'œil aux planches. Rien n'y est vérifié ; les images vont dans captures/v2/.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  ajouterUneEcole,
  attendreLaLecture,
  prendrePhotoEtPosition,
  seConnecter,
} from '../parcours/aides';

const dossier = new URL('../../captures/v2/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });

// La page entière, sans que l'en-tête et le pied collants recouvrent le milieu : la fenêtre prend la hauteur du contenu le
// temps de la capture (comme la planche, dessinée d'un seul tenant).
const prendre = async (page: Page, ecran: string) => {
  await page.waitForTimeout(450);
  const taille = page.viewportSize() ?? { width: 375, height: 812 };
  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: taille.width, height: Math.max(taille.height, hauteur) });
  await page.waitForTimeout(150);
  await page.screenshot({ animations: 'disabled', path: `${dossier}${ecran}-${taille.width}.png` });
  await page.setViewportSize(taille);
};

test.beforeEach(async ({ page, context }, info) => {
  if (info.title.startsWith('relais : états')) return;
  await context.addInitScript(() => localStorage.setItem('ntanova-faux-scenario', 'planches'));
  // Pointe-Noire, Loandjili : la mini-carte dessine l'arrondissement.
  await context.setGeolocation({ latitude: -4.757, longitude: 11.899, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await attendreLaLecture(page);
});

test('relais : accueil, mission, paie, compte, aide', async ({ page }) => {
  await expect(page.getByText('à faire')).toBeVisible();
  await prendre(page, 'r-accueil');
  await page.getByRole('link', { name: /Les Palmiers/ }).click();
  await prendre(page, 'r-mission');
  await page.getByText('Je n’ai pas pu').click();
  await page.getByRole('button', { name: 'Pas de prospectus' }).click();
  await prendre(page, 'r-mission-pas-pu');
  await page.goto('/relais/#paie');
  await expect(page.getByText('FCFA').first()).toBeVisible();
  await prendre(page, 'r-paie');
  await page.goto('/relais/#compte');
  await expect(page.getByText('Au nom de')).toBeVisible();
  await prendre(page, 'r-compte');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await prendre(page, 'r-compte-deconnexion');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Modifier' }).click();
  await prendre(page, 'r-compte-modifier');
  for (const sujet of ['entrer', 'regles', 'paie']) {
    await page.goto(`/relais/#aide/${sujet}`);
    await prendre(page, `r-aide-${sujet}`);
  }
});

test('relais : mes fiches (une fiche reste sur le téléphone) et une fiche', async ({
  page,
  context,
}) => {
  await context.setOffline(true);
  await ajouterUneEcole(page, 1);
  await page.goto('/relais/#fiches').catch(() => undefined);
  await prendre(page, 'r-fiches');
  await context.setOffline(false);
  for (const [nom, ecran] of [
    ['[École Exemple]', 'r-une-fiche-corriger'],
    ['Complexe scolaire Les Palmiers', 'r-une-fiche-en-ligne'],
    ['[Centre Exemple]', 'r-une-fiche-refusee'],
  ] as const) {
    await page.goto('/relais/#fiches');
    await page.getByText(nom, { exact: true }).first().click();
    await prendre(page, ecran);
  }
});

test('relais : les étapes et le bonus', async ({ page }) => {
  await prendrePhotoEtPosition(page, 'face au marché');
  await prendre(page, 'r-etape1');
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom de l'établissement").fill('Complexe scolaire Les Pal');
  await page.waitForTimeout(600);
  await prendre(page, 'r-etape2');
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await prendre(page, 'r-etape3');
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page
    .getByRole('group', { name: 'Qui ?' })
    .getByRole('button', { name: 'Directeur', exact: true })
    .click();
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await prendre(page, 'r-etape3-oui');
  await page.getByRole('button', { name: 'Envoyer maintenant' }).click();
  await prendre(page, 'r-envoyer-sans-bonus');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Suivant : le bonus' }).click();
  await prendre(page, 'r-bonus');
});

test('relais : états non dessinés (connexion, lecture lente)', async ({ page, context }) => {
  await context.addInitScript(() => localStorage.setItem('ntanova-faux-scenario', 'planches'));
  await page.goto('/relais/');
  await expect(
    page.getByRole('button', { name: 'Continuer avec mon compte Google' }),
  ).toBeVisible();
  await prendre(page, 'r-connexion');
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await attendreLaLecture(page);
  await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '6000'));
  await page.goto('/relais/#paie');
  await page.evaluate(() => indexedDB.deleteDatabase('ntanova-relais'));
  await page.reload();
  await prendre(page, 'r-chargement');
});
