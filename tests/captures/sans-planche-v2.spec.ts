// Les écrans qui n'ont pas de planche v2 (audit du 16/11, § 1.1 et 1.2), capturés tels qu'ils sont, pour être posés sur le
// canevas et redessinés. Faux serveur (scénario « admin » ou « planches ») : aucune donnée réelle. Rien n'y est vérifié.
// `CAPTURES_DOSSIER` choisit le dossier (par défaut captures/sans-planche/, que git ignore).
import { mkdirSync, appendFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { attendreLaLecture, seConnecter } from '../parcours/aides';

const dossier =
  process.env['CAPTURES_DOSSIER'] ??
  new URL('../../captures/sans-planche/', import.meta.url).pathname;
mkdirSync(dossier, { recursive: true });
const journal = `${dossier}journal.txt`;

test.use({ actionTimeout: 8_000 });

const PALMIERS = '51000000-0000-4000-8000-000000000001';

/** La page entière, d'un seul tenant (la fenêtre prend la hauteur du contenu le temps de la capture). */
async function prendre(page: Page, ecran: string) {
  await page.waitForTimeout(450);
  const taille = page.viewportSize() ?? { width: 375, height: 812 };
  const hauteur = await page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      ...[...document.querySelectorAll('[role=dialog]')].map((d) => d.scrollHeight),
    ),
  );
  await page.setViewportSize({
    width: taille.width,
    height: Math.min(Math.max(taille.height, hauteur), 4000),
  });
  await page.waitForTimeout(200);
  await page.screenshot({ animations: 'disabled', path: `${dossier}${ecran}-${taille.width}.png` });
  await page.setViewportSize(taille);
}

async function essayer(page: Page, ecran: string, ouvrir: () => Promise<void>) {
  try {
    await ouvrir();
    await prendre(page, ecran);
    appendFileSync(journal, `ok ${ecran}-${page.viewportSize()?.width}\n`);
  } catch (e) {
    appendFileSync(
      journal,
      `ÉCHEC ${ecran}-${page.viewportSize()?.width} : ${String(e).split('\n')[0]}\n`,
    );
  }
}

async function admin(page: Page, adresse: string) {
  await page.goto(`/admin/?scenario=admin${adresse}`);
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('Administration');
  await page.waitForLoadState('networkidle');
}

async function fiche(page: Page) {
  await page.keyboard.press('Escape');
  await page.goto('/admin/#ecoles');
  await page.goto(`/admin/#ecoles/fiche/${PALMIERS}`);
  await page.waitForLoadState('networkidle');
}

async function menuAutres(page: Page, geste: string) {
  await fiche(page);
  await page
    .locator('summary[aria-label^="Autres actions pour "]')
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole('button', { name: geste }).filter({ visible: true }).first().click();
  await page.waitForTimeout(300);
}

test('admin : écrans et panneaux sans planche', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/admin/?scenario=admin');
  await essayer(page, 'admin-connexion', async () => {
    await expect(
      page.getByRole('button', { name: 'Continuer avec mon compte Google' }),
    ).toBeVisible();
  });
  await admin(page, '#accueil');

  for (const [ecran, adresse] of [
    ['admin-paie', '#paie'],
    ['admin-sante', '#sante'],
  ] as const)
    await essayer(page, ecran, async () => {
      await page.goto(`/admin/${adresse}`);
      await page.waitForLoadState('networkidle');
    });

  await essayer(page, 'admin-ajouter-une-ecole', async () => {
    await page.goto('/admin/#ecoles');
    await page
      .getByRole('button', { name: 'Ajouter une école', exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole('form', { name: 'Ajouter une école' })).toBeVisible();
  });
  await essayer(page, 'admin-importer-une-liste', async () => {
    await page
      .getByRole('group', { name: 'Comment ajouter' })
      .getByRole('button', { name: /Une liste/ })
      .click();
    await expect(page.getByRole('region', { name: 'Importer des écoles' })).toBeVisible();
  });
  await essayer(page, 'admin-ajouter-un-site', async () => {
    await page.keyboard.press('Escape');
    await page.goto(`/admin/#ecoles/fiche/${PALMIERS}/site`);
    await expect(page.getByRole('form', { name: /Ajouter un site à/ })).toBeVisible();
  });

  await essayer(page, 'admin-ecoles-d-une-zone', async () => {
    await page.keyboard.press('Escape');
    await page.goto('/admin/#zones');
    await page.waitForLoadState('networkidle');
    const lien = await page.locator('a[href*="#ecoles/zone/"]').first().getAttribute('href');
    await page.goto(`/admin/${lien ?? '#ecoles'}`);
    await page.waitForLoadState('networkidle');
  });
  await essayer(page, 'admin-ajouter-une-zone', async () => {
    await page.goto('/admin/#zones');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: /Ajouter une zone/ })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  // Les rubriques de la fiche d'une école qui n'ont pas de planche.
  for (const [ecran, carte] of [
    ['admin-fiche-en-bref', 'En bref : ouvrir'],
    ['admin-fiche-places', 'Places et effectifs : ouvrir'],
    ['admin-fiche-contact', 'Contact et inscriptions : ouvrir'],
    ['admin-fiche-mot-direction', 'Mot de la direction : ouvrir'],
    ['admin-fiche-formations-lycee', 'Formations : ouvrir'],
  ] as const)
    await essayer(page, ecran, async () => {
      await fiche(page);
      await page.getByRole('button', { name: carte }).filter({ visible: true }).first().click();
      await page.waitForTimeout(300);
    });
  await essayer(page, 'admin-fiche-couverture-logo', async () => {
    await fiche(page);
    await page
      .getByRole('button', { name: /Changer la couverture|Ajouter une image/ })
      .filter({ visible: true })
      .first()
      .click();
  });
  await essayer(page, 'admin-fiche-photos', async () => {
    await fiche(page);
    await page
      .getByRole('region', { name: 'Photos' })
      .getByRole('button')
      .filter({ visible: true })
      .first()
      .click();
  });
  for (const [ecran, geste] of [
    ['admin-fiche-site-de', 'C’est un site de…'],
    ['admin-fiche-fusionner', 'Fusionner avec un doublon'],
    ['admin-fiche-retirer', 'Retirer de la publication'],
    ['admin-fiche-corbeille', 'Mettre à la corbeille'],
  ] as const)
    await essayer(page, ecran, () => menuAutres(page, geste));
  await essayer(page, 'admin-fiche-situer', async () => {
    await page.keyboard.press('Escape');
    await page.goto('/admin/#ecoles');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('button', { name: 'Situer', exact: true })
      .filter({ visible: true })
      .first()
      .click();
  });
});

test('relais : écrans sans planche', async ({ page, context }) => {
  test.setTimeout(180_000);
  await context.addInitScript(() => localStorage.setItem('ntanova-faux-scenario', 'planches'));
  await context.setGeolocation({ latitude: -4.757, longitude: 11.899, accuracy: 8 });
  await page.goto('/relais/');
  await essayer(page, 'relais-connexion', async () => {
    await expect(
      page.getByRole('button', { name: 'Continuer avec mon compte Google' }),
    ).toBeVisible();
  });
  await seConnecter(page, '/relais/');
  await attendreLaLecture(page);
  await essayer(page, 'relais-tester-mon-telephone', async () => {
    await page.goto('/relais/#premiers-pas');
    await page.waitForLoadState('networkidle');
  });
  await essayer(page, 'relais-aide-entrer', async () => {
    await page.goto('/relais/#aide/entrer');
    await page.waitForLoadState('networkidle');
  });
  await essayer(page, 'relais-une-fiche-recue', async () => {
    await page.goto('/relais/#fiches');
    await page.waitForLoadState('networkidle');
    await page
      .getByRole('link')
      .filter({ hasText: /reçue|acceptée|Déjà/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');
  });
});
