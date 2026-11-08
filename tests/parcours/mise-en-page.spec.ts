import { servirLesTuiles } from './aides-carte';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  seConnecter,
  textesPeuLisibles,
  ouvrirGestion,
  uneFicheEnvoyee,
  ouvrirLaFiche,
  ouvrirContacts,
  prendrePhotoEtPosition,
} from './aides';
test.beforeEach(async ({ page, context }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
  await servirLesTuiles(context);
});

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

type Rectangle = { x: number; y: number; width: number; height: number };

/** Deux rectangles de l'écran se recouvrent-ils, même d'un pixel ? */
const seRecouvrent = (a: Rectangle, b: Rectangle) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

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
    // ligne (155 px), et les cinq onglets passent eux-mêmes sur deux lignes dès qu'ils ne tiennent
    // plus sur une (203 px : à 360 px ils la remplissent au pixel près, une police un peu plus
    // large suffit). Avant, la barre s'étirait à 224–280 px au téléphone et à plus de 500 px
    // sur une tablette.
    const plafond = fenetre.width >= 768 ? 130 : 215;
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
    await expect(page.getByRole('heading', { name: 'Vue d’ensemble' })).toBeVisible();
    await verifierLaBarre(page, 'À valider (vide)');
  });

  test('quand les cinq onglets ne tiennent plus sur une ligne (340 px), ils passent sur une deuxième sans étirer la barre', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'android-360', 'une seule fois, au téléphone');
    await seConnecter(page, '/admin/');
    await page.setViewportSize({ width: 340, height: 640 });
    await expect(page.locator('main h1')).toBeVisible();
    await verifierLaBarre(page, 'à 340 px');
  });

  for (const ecran of ['accueil', 'valider', 'ecoles', 'zones', 'relais', 'sante', 'paie']) {
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
    for (const ecran of ['accueil', 'ecoles', 'zones', 'relais', 'sante', 'paie']) {
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
      for (const ecran of ['accueil', 'ecoles', 'zones', 'relais', 'sante', 'paie']) {
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
  ['liste d’un arrondissement', '/ecoles/pointe-noire/tie-tie/'],
  ['fiche d’une école', '/ecoles/complexe-scolaire-exemple-482913/'],
  ['une ville et ses arrondissements', '/ecoles/pointe-noire/'],
  ['la page « Écoles » (recherche et autour de moi)', '/ecoles/'],
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

  test('accueil : navigation du haut à partir de la tablette (le menu avant), villes côte à côte, étapes visibles partout', async ({
    page,
  }) => {
    await page.goto('/');
    const largeur = largeurDe(page);
    const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
    const etapes = page.getByRole('heading', { name: 'Comment les fiches sont tenues' });
    const [premier, second] = await page.locator('a.quartier').all();
    const [a, b] = await Promise.all([premier?.boundingBox(), second?.boundingBox()]);
    if (largeur >= TABLETTE) {
      // Ticket 146 : quatre entrées, Rechercher et Autour de moi vivent dans `/ecoles/`.
      await expect(navigation.getByRole('link')).toHaveText([
        'Écoles',
        'Carte',
        'Pour les écoles',
        'À propos',
      ]);
      await expect(etapes).toBeVisible();
      expect(a?.y, 'les deux villes sont sur la même ligne').toBe(b?.y);
    } else {
      await expect(navigation).toBeHidden();
      // D14 : la preuve de la page, « Comment les fiches sont tenues », se lit aussi sur téléphone.
      await expect(etapes).toBeVisible();
      expect(b?.y ?? 0, 'au téléphone, les villes se suivent').toBeGreaterThan(
        (a?.y ?? 0) + (a?.height ?? 0) - 1,
      );
    }
    // Pas de mise à jour automatique : tant que ce n'est pas vrai, on ne le dit pas. La carte,
    // elle, existe (ticket 15) : l'accueil y mène.
    await expect(page.getByText(/mettent la fiche à jour/)).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Les arrondissements de Pointe-Noire' }),
    ).toBeVisible();
  });

  test('accueil : la ville qui a le plus de fiches passe avant les autres', async ({ page }) => {
    // Pointe-Noire (sept écoles) avant Brazzaville et Dolisie (une chacune, par ordre alphabétique). Ticket 147 : les villes,
    // jamais leur département (Dolisie, et non le Niari).
    await page.goto('/');
    await expect(page.locator('a.quartier').first()).toContainText('Pointe-Noire');
    await expect(page.locator('a.quartier').nth(1)).toContainText('Brazzaville');
    await expect(page.locator('a.quartier').nth(2)).toContainText('Dolisie');
  });

  test('accueil : l’aperçu de la carte est à droite de l’ouverture dès 1 024 px, dessous avant', async ({
    page,
  }) => {
    await page.goto('/');
    const titre = await position(page, 'Trouvez une école au Congo-Brazzaville.');
    const apercu = await page.locator('.explorateur').boundingBox();
    if (largeurDe(page) >= ORDINATEUR) {
      expect(apercu?.x ?? 0, 'à droite du titre').toBeGreaterThanOrEqual(titre.x + titre.width);
    } else {
      expect(apercu?.y ?? 0, 'sous le titre').toBeGreaterThan(titre.y + titre.height);
    }
  });

  test('accueil sans WebGL2 : le cartouche et la légende du dessin, posés sur lui dès 1 024 px, ne cachent aucune école', async ({
    page,
  }) => {
    // Ticket 146 : le dessin ne paraît plus qu'en repli (sans WebGL2, sans JavaScript, ou après un échec).
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', { value: {}, configurable: true });
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type, ...reste) {
        return type === 'webgl2' ? null : getContext.call(this, type, ...reste);
      } as typeof getContext;
    });
    await page.goto('/');
    await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'repli-sans-webgl2');
    const apercu = page.getByRole('region', { name: 'La carte de Tié-Tié' });
    const dessin = await apercu.locator('svg.plateau:visible').boundingBox();
    const cartouche = await apercu.locator('.apercu-cartouche').boundingBox();
    const legende = apercu.locator('.apercu-legende');
    if (!dessin || !cartouche) throw new Error('l’aperçu de la carte est introuvable');
    if (largeurDe(page) >= ORDINATEUR) {
      const maisons = await apercu.locator('svg.plateau:visible g.marque').all();
      expect(maisons.length, 'des écoles sur l’aperçu').toBeGreaterThan(0);
      const boiteLegende = await legende.boundingBox();
      if (!boiteLegende) throw new Error('la légende est introuvable');
      // La légende explique un dessin que le lecteur d'écran ne voit pas : elle est cachée comme lui.
      await expect(
        apercu.getByRole('list', { name: 'Légende de la carte' }),
        'la légende est lue par le lecteur d’écran',
      ).toHaveCount(0);
      for (const maison of maisons) {
        const boite = await maison.boundingBox();
        if (!boite) throw new Error('une école de l’aperçu est introuvable');
        expect(seRecouvrent(boite, cartouche), 'le cartouche cache une école').toBe(false);
        expect(seRecouvrent(boite, boiteLegende), 'la légende cache une école').toBe(false);
      }
    } else {
      // Avant 1 024 px, le cartouche suit la carte, et la légende n'y est pas.
      expect(cartouche.y, 'le cartouche suit la carte').toBeGreaterThanOrEqual(
        dessin.y + dessin.height - 1,
      );
      await expect(legende).toBeHidden();
    }
  });

  test('liste : les écoles se rangent en grille, une fiche ne s’étire pas sur toute la page', async ({
    page,
  }) => {
    await page.goto('/ecoles/pointe-noire/tie-tie/');
    const largeur = largeurDe(page);
    const ecole = await page.locator('a.ligne-ecole').first().boundingBox();
    if (largeur >= TABLETTE) {
      expect(ecole?.width ?? 0).toBeLessThanOrEqual(480);
    } else {
      expect(ecole?.width ?? 0).toBeGreaterThan(largeur - 40);
    }
  });

  test('fiche : à partir de 1 024 px, l’appel aux directions passe à droite', async ({ page }) => {
    await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
    const proprietes = await page.locator('dl.proprietes').boundingBox();
    const appel = await page.getByRole('complementary').boundingBox();
    if (largeurDe(page) >= ORDINATEUR) {
      expect(appel?.x ?? 0).toBeGreaterThanOrEqual((proprietes?.x ?? 0) + (proprietes?.width ?? 0));
    } else {
      expect(appel?.y ?? 0).toBeGreaterThan((proprietes?.y ?? 0) + (proprietes?.height ?? 0));
    }
  });

  test('fiche : les panneaux suivent le cadre et les paragraphes restent lisibles', async ({
    page,
  }) => {
    const largeurInitiale = largeurDe(page);
    const largeurs = largeurInitiale >= ORDINATEUR ? [1024, 1280, 1920] : [largeurInitiale];
    for (const largeur of largeurs) {
      await page.setViewportSize({ width: largeur, height: 900 });
      await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
      const mesures = await page.locator('article.fiche').evaluate((el) => {
        const cadre = el.getBoundingClientRect(),
          style = getComputedStyle(el);
        const principale = el.querySelector('.fiche-principale')!.getBoundingClientRect();
        const cote = el.querySelector('.fiche-cote')!.getBoundingClientRect();
        return {
          gauche: cadre.left + parseFloat(style.paddingLeft),
          droite: cadre.right - parseFloat(style.paddingRight),
          principale: { gauche: principale.left, droite: principale.right },
          cote: { gauche: cote.left, droite: cote.right },
          paragraphes: [...el.querySelectorAll('p, .photo-ecole figcaption')].map(
            (p) => p.getBoundingClientRect().width,
          ),
          debordement: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(mesures.debordement).toBe(false);
      expect(Math.abs(mesures.principale.gauche - mesures.gauche)).toBeLessThanOrEqual(1);
      for (const largeurTexte of mesures.paragraphes) expect(largeurTexte).toBeLessThanOrEqual(576);
      if (largeur >= ORDINATEUR) {
        expect(mesures.cote.gauche).toBeGreaterThan(mesures.principale.droite);
        expect(Math.abs(mesures.cote.droite - mesures.droite)).toBeLessThanOrEqual(1);
      }
    }
  });

  test('« Pour les écoles » : les gains viennent avant l’action ; à partir de 1 024 px, ce qu’on demande est à côté', async ({
    page,
  }) => {
    await page.goto('/pour-les-ecoles/');
    const gains = await position(page, 'Ce que votre école y gagne');
    const action = await position(page, 'Confirmez ou ajoutez votre école');
    const demandes = await position(page, 'Ce que nous vous demanderons');
    // Partout : ce que l'école y gagne se lit avant le bouton qui écrit sur WhatsApp.
    expect(gains.y).toBeLessThan(action.y);
    if (largeurDe(page) >= ORDINATEUR) {
      expect(demandes.x).toBeGreaterThan(action.x + action.width / 2);
    } else {
      expect(demandes.y).toBeGreaterThan(action.y);
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

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
});
test.describe('application carte', () => {
  test('carte : tiroir ou panneau, sans débordement et commandes au clavier', async ({
    page,
    context,
  }) => {
    await servirLesTuiles(context);
    await page.goto('/carte/');
    // Le rendu WebGL peut attendre le GPU partagé des trois formats ; ce n’est pas une mesure de vitesse.
    await expect(page.locator('.explorateur')).toHaveAttribute('data-active', 'oui', {
      timeout: 30_000,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const panneau = await page.locator('.panneau-carte').boundingBox();
    // Plus de légende des zones (ticket 146) : les zones n'ont plus d'état ; « Voir en liste » est dans le tiroir.
    const surOrdinateur = (page.viewportSize()?.width ?? 0) >= 1024;
    await expect(page.locator('.legende-carte, .legende-tiroir')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Voir en liste' })).toHaveAttribute(
      'href',
      '/ecoles/',
    );
    if (surOrdinateur) expect(panneau?.width).toBeCloseTo(400, 0);
    else {
      const bouton = page.getByRole('button', { name: 'Voir les écoles', exact: true });
      await bouton.focus();
      await page.keyboard.press('Enter');
      await expect(bouton).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(bouton).toHaveAttribute('aria-expanded', 'false');
    }
    await page.getByRole('searchbox').fill('Groupe scolaire quartier');
    await page.getByRole('searchbox').press('Enter');
    const choix = page.locator('[data-resultats]').getByRole('button').first();
    await choix.focus();
    await choix.press('Enter');
    await expect(page.locator('.carte-apercu')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('.carte-apercu')).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});

test('administration : accueil et écoles tiennent dans l’écran, gestion et focus au clavier', async ({
  page,
}) => {
  await seConnecter(page, '/admin/');
  await expect(page.getByRole('heading', { name: 'Relevés reçus par jour' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  const gerer = ligne.getByRole('button', { name: 'Gérer la fiche', exact: true });
  await expect(gerer).toBeVisible();
  expect(
    await page.locator('.ecoles-tableau').evaluate((e) => e.scrollWidth <= e.clientWidth),
  ).toBe(true);
  await gerer.focus();
  await page.keyboard.press('Enter');
  const panneau = page.getByRole('dialog', { name: 'Gérer [École à situer]' });
  await expect(panneau).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const boite = await panneau.boundingBox();
  expect(boite!.x).toBeGreaterThanOrEqual(0);
  expect(boite!.x + boite!.width).toBeLessThanOrEqual(largeurDe(page));
  expect(await panneau.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await expect(panneau.getByRole('button', { name: 'Fermer', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await panneau.evaluate((e) => e.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(panneau.getByRole('button', { name: 'Fermer', exact: true })).toBeFocused();
  await panneau.getByRole('button', { name: 'Contact public', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await panneau.locator('.dialogue-corps').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(
    panneau.getByRole('heading', { name: '[École à situer]', exact: true }),
  ).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(panneau).toHaveCount(0);
  await expect(gerer).toBeFocused();
  const menu = ligne.locator('summary');
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(
    ligne.getByRole('button', { name: 'Confier à un relais', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    ligne.getByRole('button', { name: 'Confier à un relais', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(ligne.locator('details')).not.toHaveAttribute('open');
});

test('administration : un enregistrement lent annonce son travail, une panne garde les valeurs et permet le réessai', async ({
  page,
  context,
}) => {
  await seConnecter(page, '/admin/#ecoles');
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ouvrirGestion(ligne, 'Informations');
  const panneau = page.getByRole('dialog');
  await panneau.getByLabel('Nom', { exact: true }).fill('[Nom corrigé]');
  await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '1200'));
  await context.setOffline(true);
  await panneau.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(
    panneau.getByRole('button', { name: 'Enregistrement…', exact: true }),
  ).toBeDisabled();
  await expect(panneau.getByRole('button', { name: 'Fermer', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(panneau).toBeVisible();
  await expect(panneau.getByRole('alert')).toBeVisible();
  await expect(panneau.getByLabel('Nom', { exact: true })).toHaveValue('[Nom corrigé]');
  await expect(panneau.getByRole('button', { name: 'Enregistrer', exact: true })).toBeEnabled();
  await context.setOffline(false);
  await panneau.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(panneau).toHaveCount(0);
  await expect(page.getByRole('row', { name: /\[Nom corrigé\]/ })).toBeVisible();
});

test('administration : rechercher sans accent, filtrer une zone et confirmer une fusion sans perdre le focus', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche', exact: true }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const recherche = page.getByLabel('Rechercher une école');
  await recherche.fill('ecole a situer');
  await expect(page.getByRole('row', { name: /\[École à situer\]/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /\[École 1\]/ })).toHaveCount(0);
  await recherche.fill('');
  await page.getByLabel('Zone', { exact: true }).selectOption('d-pn-ngoyo');
  await expect(page.getByText('Aucune école ici.')).toBeVisible();
  await page.getByLabel('Zone', { exact: true }).selectOption('');
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await ouvrirGestion(ligne, 'fusionner');
  const confirmation = page.getByRole('alertdialog', { name: 'Fusionner [École 1]' });
  await expect(confirmation).toBeVisible();
  await expect(
    confirmation.getByRole('button', { name: 'Fusionner (cette fiche est retirée)', exact: true }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(ligne.locator('summary')).toBeFocused();
  await expect(ligne.getByText('Prête', { exact: true })).toBeVisible();
  await ouvrirGestion(ligne, 'fusionner');
  await confirmation
    .getByLabel("C'est la même école que…")
    .selectOption({ label: '[École à situer]' });
  await confirmation
    .getByRole('button', { name: 'Fusionner (cette fiche est retirée)', exact: true })
    .click();
  await expect(confirmation).toHaveCount(0);
  await expect(ligne.getByText('Retirée', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('est fusionnée');
});

test('à valider : décider après les preuves, contact replié et saisie conservée au clavier', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  const contact = page.locator('details.section-repliable');
  const titre = contact.locator('summary');
  await expect(titre).toContainText('Contact et échanges avec la direction');
  await expect(titre).toContainText('1 personne enregistrée · 1 accord de contact');
  await expect(contact).not.toHaveAttribute('open');
  await expect(page.getByRole('button', { name: 'Accepter la fiche', exact: true })).toBeVisible();
  expect(
    await page.locator('.admin-decision').evaluate((e) => {
      const prive = document.querySelector('details.section-repliable');
      const preuves = document.querySelector('[aria-label="Partie publique"]');
      return (
        !!prive &&
        !!preuves &&
        e.getBoundingClientRect().top >= preuves.getBoundingClientRect().bottom &&
        e.getBoundingClientRect().bottom <= prive.getBoundingClientRect().top
      );
    }),
  ).toBe(true);
  await expect(page.getByRole('region', { name: 'Partie privée' })).toHaveCount(0);
  await titre.focus();
  await page.keyboard.press('Enter');
  await expect(contact).toHaveAttribute('open');
  await expect(
    page.getByRole('region', { name: 'Partie privée' }).getByText('+242 06 123 45 61'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une personne', exact: true }).click();
  const note = page
    .getByRole('form', { name: 'Nouvelle personne' })
    .getByRole('textbox', { name: /^Note/ });
  await note.fill('À rappeler demain');
  await titre.focus();
  await page.keyboard.press('Space');
  await expect(contact).not.toHaveAttribute('open');
  await page.keyboard.press('Tab');
  expect(await contact.evaluate((e) => e.contains(document.activeElement))).toBe(false);
  await titre.focus();
  await page.keyboard.press('Space');
  await expect(note).toBeVisible();
  await expect(note).toHaveValue('À rappeler demain');
  const formulaire = page.getByRole('form', { name: 'Nouvelle personne' });
  await formulaire.getByLabel('Fonction', { exact: true }).selectOption('directeur');
  await context.setOffline(true);
  await formulaire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(contact.getByRole('alert')).toBeVisible();
  await expect(note).toHaveValue('À rappeler demain');
  await titre.click();
  await expect(titre).toContainText('Action à réessayer');
  await titre.click();
  await context.setOffline(false);
  await formulaire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(formulaire).toHaveCount(0);
  await expect(contact.getByRole('alert')).toHaveCount(0);
  await expect(titre).toContainText('2 personnes enregistrées · 1 accord de contact');

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('relais : confirmation accessible, annulation sans perte et suppression réessayable hors ligne', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await prendrePhotoEtPosition(page);
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  const nom = page.getByLabel("Nom sur l'enseigne");
  await nom.fill('[Fiche conservée]');
  await context.setOffline(true);
  const ouvrir = page.getByRole('button', { name: 'Abandonner cette fiche', exact: true });
  await ouvrir.click();
  const confirmation = page.getByRole('alertdialog', { name: 'Abandonner cette fiche ?' });
  await expect(confirmation).toContainText('Ce qui a été saisi sera effacé du téléphone');
  const annuler = confirmation.getByRole('button', { name: 'Annuler', exact: true });
  const supprimer = confirmation.getByRole('button', {
    name: 'Oui, abandonner la fiche',
    exact: true,
  });
  await expect(annuler).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(supprimer).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(annuler).toBeFocused();
  expect(await confirmation.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  const boite = await confirmation.boundingBox();
  expect(boite!.x).toBeGreaterThanOrEqual(0);
  expect(boite!.x + boite!.width).toBeLessThanOrEqual(largeurDe(page));
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(ouvrir).toBeFocused();
  await expect(nom).toHaveValue('[Fiche conservée]');
  await ouvrir.click();
  await annuler.click();
  await expect(nom).toHaveValue('[Fiche conservée]');
  // Une panne de la base locale doit se voir et laisser la fiche intacte.
  await page.evaluate(() => {
    const retirer = IDBObjectStore.prototype.delete;
    let premiere = true;
    IDBObjectStore.prototype.delete = function (cle) {
      if (premiere && this.name === 'fiches') {
        premiere = false;
        throw new DOMException('Échec simulé', 'UnknownError');
      }
      return retirer.call(this, cle);
    };
  });
  await ouvrir.click();
  await supprimer.click();
  await expect(confirmation.getByRole('alert')).toHaveText('L’action n’a pas abouti. Réessayez.');
  await expect(supprimer).toBeEnabled();
  await annuler.click();
  await expect(nom).toHaveValue('[Fiche conservée]');
  await ouvrir.click();
  await supprimer.click();
  await expect(confirmation).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeFocused();
});

test('en-tête public : polices retardées et texte agrandi sans débordement', async ({
  page,
}, info) => {
  let liberer!: () => void;
  const attente = new Promise<void>((fin) => {
    liberer = fin;
  });
  await page.route('**/polices/*.woff2', async (route) => {
    await attente;
    await route.continue();
  });
  try {
    await page.goto('/ecoles/pointe-noire/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Pointe-Noire', exact: true })).toBeVisible();
    await aucunDefilementDeCote(page, 'page ville avant les polices');
  } finally {
    liberer();
  }
  await page.evaluate(() => document.fonts.ready);
  // Un texte de navigation plus grand reproduit aussi les métriques d'une police de repli large.
  await page.addStyleTag({ content: '.entete { font-size: 18px; }' });
  const largeurs =
    info.project.name === 'tablette-768' ? [767, 768, 769, 820, 1023, 1024] : [largeurDe(page)];
  for (const largeur of largeurs) {
    await page.setViewportSize({ width: largeur, height: 1024 });
    await aucunDefilementDeCote(page, `en-tête avec texte agrandi à ${largeur} px`);
    if (largeur >= 768) {
      const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
      await expect(navigation).toBeVisible();
      for (const lien of await navigation.getByRole('link').all()) {
        const boite = await lien.boundingBox();
        expect(boite!.x).toBeGreaterThanOrEqual(0);
        expect(boite!.x + boite!.width).toBeLessThanOrEqual(largeur);
        expect(boite!.height).toBeGreaterThanOrEqual(44);
        await lien.focus();
        await expect(lien).toBeFocused();
      }
    }
  }
});

test('divisions : noms longs et chemin complet restent lisibles dans le cadre', async ({
  page,
}) => {
  await page.goto('/ecoles/pointe-noire/');
  await page.evaluate(() => document.fonts.ready);
  const nom = `Ville${'Exemple'.repeat(18)}`;
  await page.getByRole('heading', { level: 1 }).evaluate((e, nom) => {
    e.textContent = nom;
  }, nom);
  await page
    .locator('.zone-nom')
    .first()
    .evaluate((e) => {
      e.textContent = `Quartier${'Exemple'.repeat(18)}`;
    });
  await page.locator('.titre-vue .texte-doux span').evaluate((e) => {
    e.textContent = `Département${'Exemple'.repeat(18)} › Congo-Brazzaville`;
  });
  await aucunDefilementDeCote(page, 'noms longs des divisions');
  await expect(page.getByRole('heading', { name: nom, exact: true })).toBeVisible();
  for (const cible of await page.locator('main .titre-vue, main .zone').all()) {
    expect(await cible.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  }
});

test('décision : attente explicite, choix protégés et message conservé après une coupure', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Demander une correction', exact: true }).click();
  await page.getByLabel('Motif', { exact: true }).selectOption('autre');
  const message = page.getByLabel('Message au relais', { exact: false });
  await message.fill('Reprenez la photo de face, sans enfant.');
  await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '1000'));
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Envoyer la demande', exact: true }).click();
  const attente = page.getByRole('button', { name: 'Envoi de la demande…', exact: true });
  await expect(attente).toBeDisabled();
  await expect(attente).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('button', { name: 'Accepter la fiche', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Refuser', exact: true })).toBeDisabled();
  await expect(message).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(message).toHaveValue('Reprenez la photo de face, sans enfant.');
  await expect(message).toBeEnabled();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Envoyer la demande', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('correction part au relais');
});

test('contacts : enregistrement et confirmation de fonction montrent leur attente sans perdre la saisie', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await ouvrirContacts(page);
  await page.getByRole('button', { name: 'Ajouter une personne', exact: true }).click();
  const formulaire = page.getByRole('form', { name: 'Nouvelle personne' });
  await formulaire.getByLabel('Fonction', { exact: true }).selectOption('directeur');
  const note = formulaire.getByRole('textbox', { name: /^Note/ });
  await note.fill('À rappeler demain.');
  await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '1000'));
  await context.setOffline(true);
  await formulaire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(
    formulaire.getByRole('button', { name: 'Enregistrement…', exact: true }),
  ).toBeDisabled();
  await expect(formulaire.getByRole('button', { name: 'Annuler', exact: true })).toBeDisabled();
  await expect(note).toBeDisabled();
  await expect(page.locator('details.section-repliable').getByRole('alert')).toBeVisible();
  await expect(note).toHaveValue('À rappeler demain.');
  await context.setOffline(false);
  await formulaire.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(formulaire).toHaveCount(0);
  const pont = page.getByRole('region', { name: 'Écrire à la direction' });
  await context.setOffline(true);
  await pont.getByRole('button', { name: 'Confirmer sa fonction', exact: true }).click();
  await expect(pont.getByRole('button', { name: 'Confirmation…', exact: true })).toBeDisabled();
  await expect(pont.getByLabel('Fonction de la personne qui a répondu')).toBeDisabled();
  await expect(pont.getByRole('alert')).toBeVisible();
  await context.setOffline(false);
  await pont.getByRole('button', { name: 'Confirmer sa fonction', exact: true }).click();
  await expect(pont.getByText('Fonction confirmée', { exact: true })).toBeVisible();
});

test('nouvelle école : corriger avant d’accepter, conserver l’original et reprendre après une coupure', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Corriger avant d’accepter', exact: true }).click();
  const edition = page.getByRole('form', { name: 'Corriger avant d’accepter' });
  await expect(edition.getByLabel('Nom', { exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const accepter = page.getByRole('button', { name: 'Accepter la fiche', exact: true });
  await expect(accepter).toBeDisabled();
  await edition.getByLabel('Nom', { exact: true }).fill('');
  await edition.getByRole('button', { name: 'Utiliser ces valeurs' }).click();
  await expect(edition.getByText('Écris le nom de l’école.')).toBeVisible();
  await edition.getByLabel('Nom', { exact: true }).fill('[École corrigée]');
  await edition.getByLabel("Type d'école").selectOption('publique');
  const niveaux = edition.getByRole('group', { name: 'Niveaux', exact: true });
  await niveaux.getByRole('button', { name: 'Primaire', exact: true }).click();
  await niveaux.getByRole('button', { name: 'Collège', exact: true }).click();
  await edition.getByLabel('Repère', { exact: false }).fill('En face du marché');
  await edition.getByLabel("Numéro sur l'enseigne").fill('06 123 45 67');
  await edition.getByRole('button', { name: 'Utiliser ces valeurs' }).click();
  const retenues = page.getByRole('region', { name: 'Valeurs retenues par NTanova' });
  await expect(retenues).toContainText('[École corrigée]');
  await expect(retenues).toContainText('Collège');
  await expect(page.getByRole('region', { name: 'Partie publique' })).toContainText('[École 1]');
  await context.setOffline(true);
  await accepter.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(retenues).toContainText('[École corrigée]');
  await context.setOffline(false);
  await accepter.click();
  await expect(page.getByRole('status')).toContainText('prête');
  await page.getByRole('button', { name: 'Décidées', exact: true }).click();
  await page.getByRole('link', { name: /\[École 1\]/ }).click();
  await expect(page.getByRole('region', { name: 'Partie publique' })).toContainText('[École 1]');
  await expect(page.getByRole('region', { name: 'Valeurs retenues par NTanova' })).toContainText(
    '[École corrigée]',
  );
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Écoles', exact: true })).toBeVisible();
  await expect(page.getByText('[École corrigée]', { exact: true }).first()).toBeVisible();
  const catalogue = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus: Record<string, { nom: string }>;
    };
    return Object.values(e.campus).find((c) => c.nom === '[École corrigée]');
  });
  expect(catalogue).toMatchObject({
    publication: 'prete',
    niveaux: ['college'],
    typeEcole: 'publique',
    numeroEnseigne: '242061234567',
    repere: 'En face du marché',
  });
});

test('nouvelle école : annuler une saisie ou reprendre le relevé ne conserve aucune correction', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  const ouvrir = page.getByRole('button', { name: 'Corriger avant d’accepter', exact: true });
  await ouvrir.click();
  const edition = page.getByRole('form', { name: 'Corriger avant d’accepter' });
  await edition.getByLabel('Nom', { exact: true }).fill('[Nom abandonné]');
  await edition.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Valeurs retenues par NTanova' })).toHaveCount(0);
  await ouvrir.click();
  await expect(edition.getByLabel('Nom', { exact: true })).toHaveValue('[École 1]');
  await edition.getByLabel('Nom', { exact: true }).fill('[Nom temporaire]');
  await edition.getByRole('button', { name: 'Utiliser ces valeurs' }).click();
  await page.getByRole('button', { name: 'Reprendre les valeurs du relais' }).click();
  await expect(page.getByRole('region', { name: 'Valeurs retenues par NTanova' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Accepter la fiche', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('prête');
});

for (const [cas, chemin] of [
  ['terrain partiel', '/ecoles/groupe-scolaire-exemple-904316/'],
  ['fiche complète', '/ecoles/complexe-scolaire-exemple-482913/'],
  ['plusieurs sites', '/ecoles/groupe-scolaire-exemple-158427/'],
]) {
  test(`fiche refondue : ${cas}, lecture et actions sans débordement`, async ({ page }) => {
    await page.goto(chemin!);
    await expect(page.locator('.manque, .pastilles-vides')).toHaveCount(0);
    await expect(page.locator('.preuves')).not.toContainText('jeune');
    await expect(page.locator('.ecoles-appel')).toContainText('Vous dirigez cet établissement');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    for (const a of await page.locator('.fiche-actions a').all()) {
      const b = await a.boundingBox();
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(await a.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    }
    await page.screenshot({
      path: `captures/fiches/${cas}-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    const cote = await page.locator('.fiche-cote').boundingBox();
    const principal = await page.locator('.fiche-principale').boundingBox();
    const b2b = await page.locator('.ecoles-appel').boundingBox();
    if (page.viewportSize()!.width < 1024)
      expect(b2b!.y).toBeGreaterThan(principal!.y + principal!.height);
    else expect(cote!.x).toBeGreaterThan(principal!.x + principal!.width);
    if (cas === 'terrain partiel') {
      await expect(page.locator('.proprietes dt')).toContainText(['Langue d’enseignement']);
      await expect(page.locator('.proprietes dd')).toContainText(['Français']);
      await expect(page.locator('.photo-ecole img')).toBeVisible();
      await expect(page.locator('.preuve-direction')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Frais déclarés par l’école' })).toHaveCount(0);
    }
    if (cas === 'plusieurs sites') {
      await page.locator('.sites-ecole summary').click();
      const autres = page.getByRole('region', { name: 'Autres implantations' });
      await expect(autres.getByRole('link')).toContainText('Campus de Mongo-Mpoukou');
      await autres.getByRole('link').click();
      await expect(page.locator('.etiquette-campus')).toHaveText('Campus de Mongo-Mpoukou');
    }
    if (cas === 'fiche complète') {
      await expect(page.locator('.photo-ecole img')).toBeVisible();
      const image = await page.locator('.photo-ecole').boundingBox();
      const actions = await page.locator('.fiche-actions').boundingBox();
      expect(image!.y).toBeLessThan(actions!.y);
      await expect(page.getByRole('region', { name: 'Frais déclarés par l’école' })).toBeVisible();
    }
  });
}
