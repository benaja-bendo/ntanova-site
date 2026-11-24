import { expect, test } from '@playwright/test';

// Audit du 05/11/2026, Vague 3 : une seule ligne d'école et un seul état vide pour toutes les listes (zone, recherche,
// « Autour de moi »), les puces de niveau et de rayon, les pages de zone qui montrent les écoles avant la sollicitation.
const TIE_TIE = '/ecoles/pointe-noire/tie-tie/';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
});

/** Le balisage d'une ligne, sans ce qui dépend de l'outil qui l'écrit (les attributs d'Astro, les blancs entre balises). */
const balisage = (ligne: import('@playwright/test').Locator) =>
  ligne.evaluate((li) =>
    li.outerHTML
      .replace(/\sdata-astro-cid-[a-z0-9]+(="")?/g, '')
      // Les deux premières cartes d'une liste chargent leur image tout de suite : ce n'est pas le balisage de la carte.
      .replace(/\sloading="lazy"/g, '')
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim(),
  );

test.describe('la ligne d’une école est la même à la construction et dans le navigateur', () => {
  // Lot 4 bis : la carte d'école de « Les écoles » s'écrit une seule fois (`modele/carte-ecole.ts`) ; la page construite et le
  // navigateur doivent poser exactement le même HTML. Avant : la ligne des pages de lieu comparée à celle de la recherche.
  for (const ecole of [
    '[Complexe scolaire Exemple]',
    '[École sans détail Exemple]',
    '[École ajoutée Exemple]',
  ]) {
    test(`balisage identique : ${ecole}`, async ({ page }) => {
      await page.goto('/ecoles/');
      const choisie = () => page.locator('[data-cartes] > li').filter({ hasText: ecole }).first();
      const attendu = await balisage(choisie());
      await page
        .getByRole('searchbox', { name: 'Chercher une école' })
        .fill(ecole.replace(/[[\]]/g, ''));
      await expect(page.locator('[data-cartes] > li')).not.toHaveCount(9);
      await expect(choisie()).toBeVisible();
      expect(await balisage(choisie())).toBe(attendu);
    });
  }

  test('le disque porte la lettre et la couleur du cycle, et la preuve son icône', async ({
    page,
  }) => {
    await page.goto(TIE_TIE);
    const complexe = page.locator('ul.liste-lignes li').filter({ hasText: 'Complexe scolaire' });
    await expect(complexe.locator('.disque-l')).toHaveText('P');
    await expect(complexe.locator('.disque-l')).toHaveClass(/c-P/);
    // Une puce par cycle, puis les niveaux en mots (canevas du 08/11/2026).
    await expect(complexe.locator('.ligne-puces .disque-s')).toHaveText(['M', 'P']);
    await expect(complexe.locator('.ligne-preuve')).toHaveText(/^Vue sur place le \d+ /);
    await expect(complexe.locator('.ligne-preuve svg')).toHaveCount(1);
    const sans = page.locator('ul.liste-lignes li').filter({ hasText: 'École sans détail' });
    await expect(sans.locator('.disque-l')).toHaveClass(/disque-vide/);
    await expect(sans.locator('.ligne-preuve')).toHaveText(
      'Ajoutée par NTanova · pas encore vue sur place',
    );
    // Décision du fondateur du 08/11/2026 : plus jamais « Repère pas encore relevé », avec ou sans « Ajoutée par NTanova ».
    await expect(sans).not.toContainText('Repère pas encore relevé');
  });

  test('une fiche sans repère ni filières ne dit rien de ce qui manque : la ligne et le bloc disparaissent', async ({
    page,
  }) => {
    // Un établissement vu sur place, sans repère, qui enseigne une « autre formation » sans qu'aucune filière soit notée.
    await page.goto('/ecoles/centre-de-formation-exemple-315702/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Centre de formation Exemple',
    );
    const corps = page.locator('main');
    await expect(corps).not.toContainText('Repère pas encore relevé');
    await expect(corps).not.toContainText('Pas encore renseignées');
    await expect(corps).not.toContainText('pas encore relevé');
    // La porte reste : ce n'est pas un état vide, c'est l'invitation faite à la direction.
    await expect(corps).toContainText('Vous dirigez cet établissement');
  });
});

// Lot 4 bis : la recherche, les filtres et « Autour de moi » de « Les écoles » sont dans `les-ecoles.spec.ts` (version 46) ; les
// parcours de l'ancienne recherche (puces `data-cycle`, volet « Plus de filtres », lignes `liste-lignes`) sont retirés.

test.describe('les pages de zone', () => {
  test('les écoles et le découpage viennent avant la sollicitation des directions', async ({
    page,
  }) => {
    await page.goto(TIE_TIE);
    const liste = (await page.locator('ul.liste-lignes').boundingBox())!;
    // Le pied a aussi « Ajouter mon école » (refonte, lot 1) : celui de la page est dans `main`.
    const ajouter = (await page
      .getByRole('main')
      .getByRole('link', { name: 'Ajouter mon école' })
      .boundingBox())!;
    expect(liste.y + liste.height, 'la liste est avant « Ajouter mon école »').toBeLessThanOrEqual(
      ajouter.y,
    );
    await page.goto('/ecoles/pointe-noire/');
    const zones = (await page.locator('ul.zones').boundingBox())!;
    const ajouterVille = (await page
      .getByRole('main')
      .getByRole('link', { name: 'Ajouter mon école' })
      .boundingBox())!;
    expect(zones.y + zones.height).toBeLessThanOrEqual(ajouterVille.y);
  });

  test('la page de la ville n’a plus de schéma ni d’état, et jamais « 0 école » (ticket 146)', async ({
    page,
  }) => {
    await page.goto('/ecoles/pointe-noire/');
    await expect(page.locator('main')).not.toContainText(/\b0 écoles?\b/);
    await expect(page.locator('main svg.plan, main .plan-carte')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(/Relevé en cours|Déploiement programmé/);
    // Fondateur, 16/11/2026 : un lieu sans fiche n'a plus de lien (sa page reste, en `noindex`).
    await expect(page.locator('a.zone', { hasText: 'Ngoyo' })).toHaveCount(0);
    // La bascule mène à la vue Carte de « Les écoles », limitée à la ville (lot 4 bis).
    await expect(
      page.getByRole('navigation', { name: 'Affichage' }).getByRole('link', { name: 'Carte' }),
    ).toHaveAttribute('href', /^\/ecoles\/\?vue=carte&cadre=/);
  });

  test('une zone sans école : un seul état vide (l’état, de quoi continuer, WhatsApp)', async ({
    page,
  }) => {
    await page.goto('/ecoles/pointe-noire/ngoyo/');
    await expect(page.locator('.etat-vide')).toHaveCount(1);
    await expect(page.locator('.etat-vide-titre')).toContainText('Aucune école publiée');
    await expect(page.locator('main a[href*="wa.me"]')).toHaveCount(1);
  });
});

test.describe('la page « Écoles » (ticket 146)', () => {
  // Lot 4 bis : plus de bloc « Ville par ville » (planches de la version 46) ; les villes sont des filtres, avec leur nombre.
  test('les villes se choisissent par des puces comptées, et les anciennes formations y renvoient filtrées', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    await expect(
      page.locator('[data-puces] [data-groupe="ville"][data-valeur="pointe-noire"]'),
    ).toContainText(/Pointe-Noire \(\d+\)/);
    await expect(page.locator('main')).not.toContainText(/Relevé en cours|Déploiement programmé/);
    await page.goto('/formations/serie/c/');
    await expect(page).toHaveURL(/\/ecoles\/\?serie=c$/);
    await page.locator('[data-ouvrir-filtres]').click();
    await expect(
      page.locator('[data-filtres-corps] [data-groupe="serie"][data-valeur="c"]'),
    ).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/formations/');
    await expect(page).toHaveURL(/\/ecoles\/$/);
  });

  test('l’ancienne recherche y mène, paramètres compris', async ({ page }) => {
    await page.goto('/recherche/?q=tie');
    await expect(page).toHaveURL(/\/ecoles\/\?q=tie$/);
    await expect(page.getByRole('searchbox', { name: 'Chercher une école' })).toHaveValue('tie');
    await expect(page.locator('[data-sous-titre]')).toHaveText(/^4 écoles/);
  });
});

test.describe('l’accueil en économiseur de données', () => {
  test('rien à attendre : ni carte ni script, la recherche tout de suite (lot 3, puis refonte, lot 1)', async ({
    page,
  }) => {
    // Ticket 146 : l'accueil d'un téléphone qui économise ses données attendait l'appui pour charger la carte. Depuis le lot 3
    // (décision du 15/11/2026), l'accueil n'a plus de carte : il n'a plus rien à charger.
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
        configurable: true,
      }),
    );
    const demandes: string[] = [];
    page.on('request', (r) => demandes.push(r.url()));
    await page.goto('/');
    await expect(page.locator('#carte')).toHaveCount(0);
    await expect(page.locator('script[src]')).toHaveCount(0);
    expect(demandes.filter((u) => /\/_astro\/.*\.js|tuiles|\.pmtiles|geojson/.test(u))).toEqual([]);
    // Refonte publique, lot 1 : la recherche « Quoi ? / Où ? » ; le dessin est écrit dans la page, sans rien à charger.
    await expect(page.getByRole('searchbox', { name: 'Quoi ?' })).toBeInViewport();
    await expect(page.getByRole('searchbox', { name: 'Où ?' })).toBeInViewport();
  });
});
