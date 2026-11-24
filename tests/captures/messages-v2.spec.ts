// Les écrans de « Messages reçus » (refonte, lot 3B2), avec le scénario « admin » du faux serveur : capturés à 360, 390, 768 et
// 1 440 px pour être comparés à l'œil aux planches du canevas. Aucun contrôle ici : `pnpm exec playwright test -c
// playwright.messages.config.ts`.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const dossier = new URL('../../captures/messages/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });

const prendre = async (page: Page, ecran: string) => {
  await page.waitForTimeout(350);
  await page.screenshot({
    animations: 'disabled',
    path: `${dossier}${ecran}-${page.viewportSize()?.width ?? 0}.png`,
  });
};

const ouvrir = async (page: Page, adresse = '') => {
  await page.goto(`/admin/?scenario=admin#demandes${adresse}`);
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Messages reçus' })).toBeAttached();
  await page.waitForLoadState('networkidle');
};

test('la boîte et un message', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page);
  await expect(page.getByText('C-3MWD-8RTA')).toBeVisible();
  await prendre(page, 'liste');
  await page.getByRole('link', { name: /A-7K4P-2QXM/ }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: '[Complexe scolaire Exemple]' }),
  ).toBeVisible();
  await prendre(page, 'message');
  await page.getByRole('button', { name: 'Décider', exact: true }).click();
  await page.getByRole('radio', { name: 'Non retenue' }).check();
  await prendre(page, 'decider');
  await page.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await prendre(page, 'decide');
  await page.getByRole('button', { name: 'Répondre', exact: true }).click();
  await prendre(page, 'repondre');
  await page.getByRole('radio', { name: 'Un autre jour' }).check();
  await prendre(page, 'repondre-autre-jour');
  await page.getByRole('radio', { name: 'Aujourd’hui' }).check();
  await page.getByRole('button', { name: 'Noter l’envoi' }).click();
  await page.getByRole('button', { name: 'Clore', exact: true }).click();
  await prendre(page, 'clore');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clore', exact: true }).click();
  await expect(page.getByText(/Effacé automatiquement le/)).toBeVisible();
  await prendre(page, 'clos');
});

test('versions, limite, rattacher, indésirables', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page, '/A-9HZE-4NBV');
  await expect(page.getByRole('button', { name: 'Voir la version 1' })).toBeVisible();
  await prendre(page, 'versions');
  await page.getByRole('button', { name: 'Voir la version 1' }).click();
  await prendre(page, 'version-1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Changer de fiche' }).click();
  await page.getByRole('searchbox').fill('palm');
  await prendre(page, 'rattacher');
  await page.goto('/admin/#demandes/C-3MWD-8RTA');
  await expect(page.getByText(/Limite d’envois atteinte/).first()).toBeVisible();
  await prendre(page, 'limite');
  await page.goto('/admin/#demandes/indesirables');
  await page.getByRole('link', { name: /C-2GZX-4LWD/ }).click();
  await expect(page.getByRole('button', { name: 'Ce n’est pas indésirable' })).toBeVisible();
  await prendre(page, 'indesirable');
  await page.goto('/admin/#demandes/alertes');
  await page.waitForTimeout(400);
  await prendre(page, 'alertes');
});

test('un retrait, étape par étape', async ({ page }) => {
  test.setTimeout(120_000);
  await ouvrir(page, '/retraits');
  await expect(page.getByText('R-6KDT-4WQZ')).toBeVisible();
  await prendre(page, 'retraits');
  await page.getByRole('link', { name: /R-2XFG-7MPA/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Vérifier que la personne est concernée' }),
  ).toBeVisible();
  await prendre(page, 'retrait-verifier');
  await page.getByRole('radio', { name: /Elle écrit depuis/ }).check();
  await page.getByRole('button', { name: 'Noter la vérification' }).click();
  await page.getByRole('checkbox', { name: 'Le contact public' }).check();
  await page.getByRole('checkbox', { name: 'Une photo' }).check();
  await page.waitForTimeout(400);
  await prendre(page, 'retrait-cible');
  await page.getByRole('checkbox', { name: 'Une photo' }).uncheck();
  await page.getByRole('button', { name: 'Noter ce qui est à retirer' }).click();
  await page.getByRole('button', { name: 'Noter : retiré de la base' }).click();
  await expect(page.getByText(/Encore publié/)).toBeVisible();
  await prendre(page, 'retrait-refuse');
  await page.goto('/admin/#demandes/R-6KDT-4WQZ');
  await expect(page.getByRole('heading', { name: 'Constater en ligne' })).toBeVisible();
  await prendre(page, 'retrait-constater');
});

test('aujourd’hui et « Plus »', async ({ page }) => {
  await ouvrir(page);
  await page.goto('/admin/#accueil');
  await expect(page.getByRole('link', { name: /messages reçus/ })).toBeVisible();
  await prendre(page, 'aujourdhui');
  if ((page.viewportSize()?.width ?? 0) < 1024) {
    await page.getByRole('button', { name: 'Plus' }).click();
    await prendre(page, 'plus');
  }
});

test('pannes et conflits', async ({ page }) => {
  await ouvrir(page, '/A-7K4P-2QXM');
  await page.getByRole('button', { name: 'Décider', exact: true }).click();
  await page.getByRole('radio', { name: 'Introuvable pour l’instant' }).check();
  await page.evaluate(() => localStorage.setItem('ntanova-faux-messages-panne', 'geste'));
  await page.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(page.getByText('Ce geste n’est pas confirmé.')).toBeVisible();
  await prendre(page, 'geste-panne');
  await page.evaluate(() => {
    localStorage.removeItem('ntanova-faux-messages-panne');
    const e = JSON.parse(localStorage.getItem('ntanova-faux-messages') ?? '{}') as {
      messages: { reference: string; version: number }[];
    };
    for (const m of e.messages) if (m.reference === 'A-7K4P-2QXM') m.version += 1;
    localStorage.setItem('ntanova-faux-messages', JSON.stringify(e));
  });
  await page.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(page.getByText('Ce message a changé entre-temps.')).toBeVisible();
  await prendre(page, 'geste-conflit');
  await page.evaluate(() => localStorage.setItem('ntanova-faux-messages-panne', 'lecture'));
  await page.goto('/admin/#demandes/clos');
  await page.reload();
  await expect(page.getByText('Les messages ne se chargent pas.')).toBeVisible();
  await prendre(page, 'liste-panne');
});
