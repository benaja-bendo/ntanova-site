import { expect, test, type Page } from '@playwright/test';
import { seConnecter } from './aides';

// La mise en page selon la largeur de l'écran. Ce fichier tourne à trois largeurs
// (les projets de playwright.config.ts) : 360 px (téléphone), 768 px (tablette) et
// 1 280 px (ordinateur). L'administration est pensée pour l'ordinateur : au téléphone
// elle reste utilisable, mais ses tableaux défilent dans leur cadre et ce n'est pas
// un objectif.

/** 64 rem : jusqu'à cette largeur, la barre de l'administration est en haut ; au-delà, sur le côté. */
const CHARNIERE_ADMIN = 1024;

const largeurDe = (page: Page) => page.viewportSize()?.width ?? 0;

/** La barre de l'administration : en haut sans s'étirer, ou une colonne sur toute la hauteur. */
async function verifierLaBarre(page: Page, nom: string) {
  const fenetre = page.viewportSize();
  const barre = await page.locator('aside.admin-cote').boundingBox();
  if (!fenetre || !barre) throw new Error('la barre de l’administration est introuvable');
  if (fenetre.width <= CHARNIERE_ADMIN) {
    expect(barre.width, `${nom} : barre sur toute la largeur`).toBeGreaterThanOrEqual(
      fenetre.width - 1,
    );
    // Dès la tablette, une ligne (68 px), ou deux (120 px) quand la pastille de « À valider »
    // élargit les onglets ; plus étroit, la marque, les onglets et le compte passent chacun à la
    // ligne (155 px). Avant, la barre s'étirait à 224–280 px au téléphone et à plus de 500 px
    // sur une tablette.
    const plafond = fenetre.width >= 768 ? 130 : 200;
    expect(barre.height, `${nom} : barre du haut sans s’étirer`).toBeLessThanOrEqual(plafond);
  } else {
    expect(barre.width, `${nom} : colonne sur le côté`).toBeLessThanOrEqual(300);
    expect(barre.height, `${nom} : colonne sur toute la hauteur`).toBeGreaterThanOrEqual(
      fenetre.height - 1,
    );
  }
}

/** Aucun tableau de l'écran ne défile dans son cadre. */
async function verifierLesTableaux(page: Page, nom: string) {
  await expect(page.locator('.admin-tableau').first()).toBeVisible();
  for (const cadre of await page.locator('.admin-tableau').all()) {
    const [contenu, visible] = await cadre.evaluate((e) => [e.scrollWidth, e.clientWidth] as const);
    expect(contenu, `${nom} : un tableau défile dans son cadre`).toBeLessThanOrEqual(visible);
  }
}

async function aucunDefilementDeCote(page: Page, nom: string) {
  const [contenu, fenetre] = await page.evaluate(
    () => [document.documentElement.scrollWidth, window.innerWidth] as const,
  );
  expect(contenu, `${nom} : la page défile de côté`).toBeLessThanOrEqual(fenetre);
}

test.describe('administration', () => {
  test('la barre est en haut jusqu’à 1 024 px sans s’étirer, puis sur le côté sur toute la hauteur', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/');
    await expect(page.getByRole('heading', { name: 'À valider' })).toBeVisible();
    await verifierLaBarre(page, 'À valider (vide)');
  });

  for (const ecran of ['valider', 'ecoles', 'relais']) {
    test(`« ${ecran} » : la page ne défile pas de côté, la barre garde sa forme`, async ({
      page,
    }) => {
      await seConnecter(page, '/admin/');
      await page.goto(`/admin/#${ecran}`);
      await expect(page.locator('main h1')).toBeVisible();
      await aucunDefilementDeCote(page, ecran);
      await verifierLaBarre(page, ecran);
    });
  }

  test('dès la tablette, les tableaux tiennent dans leur cadre', async ({ page }) => {
    test.skip(largeurDe(page) < 768, 'au téléphone, les tableaux défilent dans leur cadre');
    await seConnecter(page, '/admin/');
    for (const ecran of ['ecoles', 'relais']) {
      await page.goto(`/admin/#${ecran}`);
      await expect(page.locator('main h1')).toBeVisible();
      await verifierLesTableaux(page, ecran);
    }
  });

  test('aux largeurs charnières, la barre et les tableaux suivent', async ({ page }, info) => {
    test.skip(info.project.name !== 'ordinateur-1280', 'une seule fois, avec ses propres largeurs');
    await seConnecter(page, '/admin/');
    for (const largeur of [820, 1000, CHARNIERE_ADMIN, CHARNIERE_ADMIN + 1, 1440]) {
      await page.setViewportSize({ width: largeur, height: 800 });
      for (const ecran of ['ecoles', 'relais']) {
        await page.goto(`/admin/#${ecran}`);
        await expect(page.locator('main h1')).toBeVisible();
        const nom = `${ecran} à ${largeur} px`;
        await aucunDefilementDeCote(page, nom);
        await verifierLaBarre(page, nom);
        await verifierLesTableaux(page, nom);
      }
    }
  });
});
