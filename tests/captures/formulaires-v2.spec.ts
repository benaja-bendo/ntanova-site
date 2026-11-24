// Les formulaires Contact et annuaire (refonte, lot 3C), sur le faux serveur : capturés à 360, 390, 768 et 1 440 px pour être
// comparés à l'œil aux planches « Contact », « Annuaire » et « Contact · reprise et refus ». Aucun contrôle ici (les parcours
// les font) : `pnpm exec playwright test -c playwright.formulaires.config.ts`, après `pnpm test:parcours:preparer`.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const dossier = new URL('../../captures/formulaires/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });

const TEXTE = '[un message inventé pour la capture]';

const prendre = async (page: Page, ecran: string, pleine = true) => {
  await page.waitForTimeout(250);
  await page.screenshot({
    animations: 'disabled',
    fullPage: pleine,
    path: `${dossier}${ecran}-${page.viewportSize()?.width ?? 0}.png`,
  });
};
const ouvrir = async (page: Page, adresse: string) => {
  await page.goto(adresse);
  await expect(page.locator('[data-formulaire]')).toHaveAttribute('data-etat', 'pret');
};
const regler = (page: Page, nom: string, valeur: string | null) =>
  page.evaluate(
    ([n, v]) => {
      if (v === null) localStorage.removeItem(`ntanova-faux-${n}`);
      else localStorage.setItem(`ntanova-faux-${n}`, v as string);
    },
    [nom, valeur] as const,
  );
const bouton = (page: Page, nom: string) => page.getByRole('button', { name: nom, exact: true });

test('Contact : vide, erreurs, réponse, refus, reprise, enregistré', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page, '/contact/');
  await prendre(page, 'contact-vide');
  await bouton(page, 'Envoyer le message').click();
  await expect(page.locator('[data-resume]')).toBeVisible();
  await prendre(page, 'contact-erreurs');
  await page.getByLabel(/^Sujet/).selectOption('trouver');
  await page.getByLabel('Votre message').fill(TEXTE);
  await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
  await page.getByLabel('Votre numéro WhatsApp').fill('06 000 00 77');
  await prendre(page, 'contact-rempli');
  await regler(page, 'envois', 'avant');
  await bouton(page, 'Envoyer le message').click();
  await expect(page.locator('[data-refus]')).toBeVisible();
  await prendre(page, 'contact-pas-confirme');
  await regler(page, 'envois', 'plafond');
  await bouton(page, 'Réessayer').click();
  await expect(page.locator('[data-refus]')).toContainText('trop de messages');
  await prendre(page, 'contact-plafond');
  await page.reload();
  await expect(page.locator('[data-reprise]')).toBeVisible();
  await prendre(page, 'contact-reprise');
  await regler(page, 'envois', null);
  await bouton(page, 'Reprendre').click();
  await page.locator('[data-envoyer]').click();
  await expect(page.locator('[data-confirmation]')).toBeVisible();
  await prendre(page, 'contact-enregistre');
  await bouton(page, 'Écrire un autre message').click();
  await page.getByLabel('Votre message').fill(TEXTE);
  await page.getByRole('radio', { name: 'Oui, par e-mail' }).check();
  await page
    .getByLabel('Votre adresse e-mail')
    .fill('prenom@undomainevraimenttreslongpouruneseulelignedetelephone.test');
  await bouton(page, 'Envoyer le message').click();
  await expect(page.locator('[data-confirmation]')).toBeVisible();
  await prendre(page, 'contact-enregistre-adresse-longue', false);
});

test('Contact : envois fermés, sans stockage, sans JavaScript', async ({ page, browser }) => {
  test.setTimeout(120_000);
  await page.goto('/contact/');
  await regler(page, 'envois', 'fermes');
  await ouvrir(page, '/contact/');
  await page.getByLabel('Votre message').fill(TEXTE);
  await expect(page.locator('[data-refus]')).toBeVisible();
  await prendre(page, 'contact-fermes');
  await regler(page, 'envois', null);

  const sansScript = await browser.newContext({
    javaScriptEnabled: false,
    viewport: page.viewportSize(),
  });
  const p = await sansScript.newPage();
  await p.goto('/contact/');
  await prendre(p, 'contact-sans-javascript');
  await sansScript.close();
});

test('Annuaire : les quatre arrivées, la fiche reprise, le retrait', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page, '/contribuer/');
  await prendre(page, 'annuaire-choix');
  await ouvrir(page, '/contribuer/?type=manque&depuis=accueil');
  await prendre(page, 'annuaire-ecole-absente');
  await ouvrir(page, '/contribuer/?type=erreur&ecole=482913&depuis=fiche');
  await expect(page.locator('[data-fiche-choisie]')).toBeVisible();
  await page.getByRole('radio', { name: 'Téléphone ou contact' }).check();
  await prendre(page, 'annuaire-erreur-fiche');
  await page.getByRole('radio', { name: 'Frais', exact: true }).check();
  await page.getByLabel(/^Qu’est-ce qui est faux/).fill(TEXTE);
  await page.getByRole('radio', { name: 'Non, merci' }).check();
  await regler(page, 'fiches-retirees', '20000000-0000-4000-8000-000000000001');
  await bouton(page, 'Envoyer le signalement').click();
  await expect(page.locator('[data-refus]')).toContainText('n’est plus publiée');
  await prendre(page, 'annuaire-fiche-retiree');
  await regler(page, 'fiches-retirees', null);
  await bouton(page, 'Effacer ce que j’ai écrit').click();
  await ouvrir(page, '/contribuer/?type=retrait&depuis=confidentialite');
  await prendre(page, 'annuaire-retrait');
  await page.getByLabel('Nom de l’école concernée').fill('[Institut Exemple]');
  await page.getByRole('radio', { name: 'Un numéro de téléphone' }).check();
  await page.getByRole('radio', { name: 'Oui, sur WhatsApp' }).check();
  await page.getByLabel('Votre numéro WhatsApp').fill('06 000 00 77');
  await bouton(page, 'Envoyer la demande').click();
  await expect(page.locator('[data-confirmation]')).toBeVisible();
  await prendre(page, 'annuaire-retrait-enregistre');
});
