import { expect, test, type Locator, type Page } from '@playwright/test';
import { seConnecter, textesPeuLisibles } from './aides';

/** Le nom d'une cible pour le message d'erreur : son texte, ou celui qu'elle donne au lecteur d'écran (un lien de la carte, en SVG). */
const nomDe = async (cible: Locator) =>
  (await cible.getAttribute('aria-label')) ?? (await cible.textContent()) ?? '';

// La mise en page selon la largeur de l'écran. Ce fichier tourne à trois largeurs
// (les projets de playwright.config.ts) : 360 px (téléphone), 768 px (tablette) et
// 1 280 px (ordinateur). L'administration est pensée pour l'ordinateur : au téléphone
// elle reste utilisable, mais ses tableaux défilent dans leur cadre et ce n'est pas
// un objectif. Le site public, lui, ne change pas sous 768 px (48 rem) : une colonne
// de 36 rem, comme sur un téléphone ; au-delà, il prend le cadre de 75 rem de la planche
// « Accueil sur ordinateur ».

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

// --- Le site public -------------------------------------------------------------------------

const pagesPubliques = [
  ['accueil', '/'],
  ['liste d’un arrondissement', '/ecoles/tie-tie/'],
  ['fiche d’une école', '/ecoles/tie-tie/complexe-scolaire-exemple/'],
  ['« Pour les écoles »', '/pour-les-ecoles/'],
  ['« À propos »', '/a-propos/'],
  ['page introuvable', '/cette-page-n-existe-pas/'],
] as const;

/** 48 rem : à partir de là, le site prend le cadre de la planche ordinateur. */
const TABLETTE = 768;
/** 64 rem : à partir de là, les pages passent sur deux colonnes. */
const ORDINATEUR = 1024;
/** Une ligne de texte ne dépasse jamais 36 rem (576 px). */
const LARGEUR_TEXTE = 576;
const LARGEUR_PAGE = 1200;

/** La boîte d'un titre de la page. */
async function position(page: Page, nom: string | RegExp) {
  const boite = await page.getByRole('heading', { name: nom }).boundingBox();
  if (!boite) throw new Error(`le titre ${String(nom)} est introuvable`);
  return boite;
}

test.describe('site public', () => {
  for (const [nom, adresse] of pagesPubliques) {
    test(`${nom} : ne défile pas de côté, cibles de 44 px, textes lisibles`, async ({ page }) => {
      await page.goto(adresse);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await aucunDefilementDeCote(page, nom);
      for (const cible of await page.locator('a, button').all()) {
        if (!(await cible.isVisible())) continue;
        const boite = await cible.boundingBox();
        expect(
          boite?.height,
          `${nom} : « ${await nomDe(cible)} » est trop basse`,
        ).toBeGreaterThanOrEqual(44);
      }
      expect(await textesPeuLisibles(page, 'body'), nom).toEqual([]);
    });

    test(`${nom} : prend la largeur de l’écran, sans étirer ses lignes de texte`, async ({
      page,
    }) => {
      await page.goto(adresse);
      const largeur = largeurDe(page);
      const cadre = page.locator('main .cadre').first();
      await expect(cadre).toBeVisible();
      const boite = await cadre.boundingBox();
      // Sous 768 px, une colonne de 576 px au plus ; au-delà, le cadre de 1 200 px au plus.
      const attendu = Math.min(largeur, largeur < TABLETTE ? LARGEUR_TEXTE : LARGEUR_PAGE);
      expect(
        Math.abs((boite?.width ?? 0) - attendu),
        `${nom} : largeur du cadre`,
      ).toBeLessThanOrEqual(1);
      for (const p of await page.locator('main p').all()) {
        if (!(await p.isVisible())) continue;
        const ligne = await p.boundingBox();
        expect(
          ligne?.width ?? 0,
          `${nom} : « ${(await p.innerText()).slice(0, 40)} » est trop large pour la lecture`,
        ).toBeLessThanOrEqual(LARGEUR_TEXTE + 1);
      }
    });
  }

  test('accueil : navigation du haut, quartiers côte à côte, étapes : seulement à partir de la tablette', async ({
    page,
  }) => {
    await page.goto('/');
    const largeur = largeurDe(page);
    const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
    const etapes = page.getByRole('heading', { name: 'Comment les fiches sont tenues' });
    const [premier, second] = await page.locator('a.quartier').all();
    const [a, b] = await Promise.all([premier?.boundingBox(), second?.boundingBox()]);
    if (largeur >= TABLETTE) {
      await expect(navigation.getByRole('link', { name: 'Quartiers' })).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Pour les écoles' })).toBeVisible();
      await expect(etapes).toBeVisible();
      expect(a?.y, 'les deux quartiers sont sur la même ligne').toBe(b?.y);
    } else {
      await expect(navigation).toBeHidden();
      await expect(etapes).toBeHidden();
      expect(b?.y ?? 0, 'au téléphone, les quartiers se suivent').toBeGreaterThan(
        (a?.y ?? 0) + (a?.height ?? 0) - 1,
      );
    }
    // Pas de mise à jour automatique : tant que ce n'est pas vrai, on ne le dit pas. La carte,
    // elle, existe (ticket 15) : l'accueil y mène.
    await expect(page.getByText(/mettent la fiche à jour/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Voir la carte de Pointe-Noire' })).toBeVisible();
  });

  test('accueil : l’arrondissement qui a des fiches passe avant celui où le relevé est en cours', async ({
    page,
  }) => {
    // Les deux planches mettent Tié-Tié (une école) avant Ngoyo (relevé en cours) ; l'ordre
    // alphabétique mettait « relevé en cours » en tête.
    await page.goto('/');
    await expect(page.locator('a.quartier').first()).toContainText('Tié-Tié');
    await expect(page.locator('a.quartier').nth(1)).toContainText('Ngoyo');
  });

  test('liste : les écoles se rangent en grille, une fiche ne s’étire pas sur toute la page', async ({
    page,
  }) => {
    await page.goto('/ecoles/tie-tie/');
    const largeur = largeurDe(page);
    const ecole = await page.locator('a.ecole').first().boundingBox();
    if (largeur >= TABLETTE) {
      expect(ecole?.width ?? 0).toBeLessThanOrEqual(480);
    } else {
      expect(ecole?.width ?? 0).toBeGreaterThan(largeur - 40);
    }
  });

  test('fiche : à partir de 1 024 px, l’appel aux directions passe à droite', async ({ page }) => {
    await page.goto('/ecoles/tie-tie/complexe-scolaire-exemple/');
    const proprietes = await page.locator('dl.proprietes').boundingBox();
    const appel = await page.getByRole('complementary').boundingBox();
    if (largeurDe(page) >= ORDINATEUR) {
      expect(appel?.x ?? 0).toBeGreaterThanOrEqual((proprietes?.x ?? 0) + (proprietes?.width ?? 0));
    } else {
      expect(appel?.y ?? 0).toBeGreaterThan((proprietes?.y ?? 0) + (proprietes?.height ?? 0));
    }
  });

  test('« Pour les écoles » : à partir de 1 024 px, le formulaire et les explications sont côte à côte', async ({
    page,
  }) => {
    await page.goto('/pour-les-ecoles/');
    const formulaire = await position(page, /fiche de liaison/);
    const gains = await position(page, 'Ce que votre école y gagne');
    if (largeurDe(page) >= ORDINATEUR) {
      expect(gains.x).toBeGreaterThan(formulaire.x + formulaire.width / 2);
    } else {
      expect(gains.y).toBeGreaterThan(formulaire.y);
    }
  });

  test('« À propos » : à partir de la tablette, ce qui est publié et ce qui est gardé sont côte à côte', async ({
    page,
  }) => {
    await page.goto('/a-propos/');
    const publie = await position(page, 'Ce que nous publions');
    const garde = await position(page, 'Ce que nous gardons pour nous');
    if (largeurDe(page) >= TABLETTE) {
      expect(garde.y).toBe(publie.y);
      expect(garde.x).toBeGreaterThan(publie.x);
    } else {
      expect(garde.y).toBeGreaterThan(publie.y);
    }
  });
});
