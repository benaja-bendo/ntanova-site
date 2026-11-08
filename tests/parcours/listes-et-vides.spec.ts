import { expect, test, type Page } from '@playwright/test';

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
      .replace(/>\s+</g, '><')
      .replace(/\s+/g, ' ')
      .trim(),
  );

test.describe('la ligne d’une école est la même à la construction et dans le navigateur', () => {
  const cas = [
    ['vue sur place, avec repère', TIE_TIE, '[Complexe scolaire Exemple]', ''],
    ['sans niveau noté', TIE_TIE, '[École sans détail Exemple]', ''],
    ['ajoutée par NTanova', TIE_TIE, '[École ajoutée Exemple]', ''],
    [
      'confirmée par la direction, avec implantation',
      '/ecoles/pointe-noire/loandjili/quartier-exemple/',
      '[Groupe scolaire Exemple]',
      'Campus du quartier',
    ],
  ] as const;
  for (const [nom, zone, ecole, precision] of cas) {
    test(`balisage identique : ${nom}`, async ({ page }) => {
      await page.goto(zone);
      const choisie = (zone: Page) =>
        zone
          .locator('ul.liste-lignes li')
          .filter({ hasText: ecole })
          .filter({ hasText: precision || ecole })
          .first();
      const construite = choisie(page);
      const attendu = await balisage(construite);
      await page.goto(`/ecoles/?q=${encodeURIComponent(ecole.replace(/[[\]]/g, ''))}`);
      const dansLeNavigateur = choisie(page);
      await expect(dansLeNavigateur).toBeVisible();
      expect(await balisage(dansLeNavigateur)).toBe(attendu);
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
      'Ajoutée par NTanova, pas encore vue sur place',
    );
    // Arbitrage du 08/11/2026 : jamais « Repère pas encore relevé » avec « Ajoutée par NTanova ».
    await expect(sans.locator('.ligne-repere-vide')).toHaveCount(0);
  });
});

test.describe('la recherche', () => {
  test('le niveau se choisit par des puces colorées, plus par un menu natif', async ({ page }) => {
    await page.goto('/ecoles/');
    const groupe = page.getByRole('group', { name: 'Niveau' });
    const puces = groupe.getByRole('button');
    await expect(puces).toHaveText([
      'Tous',
      /^M\s*Maternelle$/,
      /^P\s*Primaire$/,
      /^C\s*Collège$/,
      /^L\s*Lycée$/,
      /^T\s*Technique$/,
      /^S\s*Supérieur$/,
    ]);
    await expect(puces.first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('select[name="niveau"]')).toHaveCount(0);
    await page.getByText(/^9 écoles/).waitFor();
    // « Lycée » : les écoles qui l'enseignent ; la puce est appuyée, l'adresse garde le choix.
    await puces.filter({ hasText: 'Lycée' }).click();
    await expect(puces.filter({ hasText: 'Lycée' })).toHaveAttribute('aria-pressed', 'true');
    await expect(puces.first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
    await expect(page).toHaveURL(/niveau=L/);
    // « Tous » les rend toutes.
    await puces.first().click();
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
    await expect(page).not.toHaveURL(/niveau=/);
  });

  test('la puce choisie par l’adresse est visible dans la bande, même quand la bande défile (téléphone)', async ({
    page,
  }) => {
    // « Supérieur » est la dernière puce : sur un écran de 360 px, elle est hors de la bande tant qu'on ne la montre pas.
    await page.goto('/ecoles/?niveau=S');
    const bande = page.locator('[data-niveaux]');
    const choisie = bande.locator('[aria-pressed="true"]');
    await expect(choisie).toHaveText(/Supérieur/);
    const [boiteBande, boiteChoisie] = await Promise.all([
      bande.boundingBox(),
      choisie.boundingBox(),
    ]);
    expect(boiteChoisie!.x).toBeGreaterThanOrEqual(boiteBande!.x - 1);
    expect(boiteChoisie!.x + boiteChoisie!.width).toBeLessThanOrEqual(
      boiteBande!.x + boiteBande!.width + 1,
    );
  });

  test('une adresse d’avant (?niveau=lycee) ou la lettre (?niveau=l) choisissent la bonne puce', async ({
    page,
  }) => {
    for (const niveau of ['lycee', 'l', 'L']) {
      await page.goto(`/ecoles/?niveau=${niveau}`);
      await expect(
        page.getByRole('group', { name: 'Niveau' }).getByRole('button', { name: /Lycée/ }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
    }
  });

  test('les filtres de formation sont dans un volet replié « Plus de filtres »', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    const volet = page.locator('details.plus-de-filtres');
    await expect(volet.locator('summary')).toHaveText('Plus de filtres');
    await expect(volet).not.toHaveAttribute('open', '');
    await expect(page.getByLabel('Série du bac')).toBeHidden();
    // Avant : six menus natifs avant le premier résultat. Maintenant : le nom, le niveau, le lieu et le type.
    await expect(page.locator('form select:visible')).toHaveCount(2);
    await volet.locator('summary').click();
    for (const nom of ['Série du bac', 'Diplôme', 'Domaine', 'Rythme'])
      await expect(page.getByLabel(nom)).toBeVisible();
  });

  test('un filtre avancé demandé par l’adresse ouvre le volet', async ({ page }) => {
    await page.goto('/ecoles/?serie=c');
    await expect(page.locator('details.plus-de-filtres')).toHaveAttribute('open', '');
    await expect(page.getByLabel('Série du bac')).toHaveValue('c');
  });

  test('les résultats sont des lignes d’école, avec leur preuve, et avant les résultats : le moins de commandes possible', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
    const premier = page.locator('ul.liste-lignes li').first();
    await expect(premier.locator('.ligne-ecole')).toBeVisible();
    await expect(premier.locator('.ligne-preuve')).toBeVisible();
    // Sur téléphone, les résultats commencent plus haut qu'avec les six menus (976 px avant).
    const haut = (await premier.boundingBox())!.y;
    expect(haut).toBeLessThan(800);
  });

  test('aucun résultat : on peut tout effacer, et « Une école manque ? » mène à WhatsApp', async ({
    page,
  }) => {
    await page.goto('/ecoles/?q=zzzz');
    const vide = page.locator('.etat-vide');
    await expect(vide.locator('.etat-vide-titre')).toHaveText('Aucune école ne correspond.');
    await expect(page.locator('[data-compte]')).toHaveText('');
    const manque = vide.getByRole('link', { name: /Une école manque/ });
    const href = decodeURIComponent((await manque.getAttribute('href')) ?? '');
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(href).toContain('une école manque');
    await vide.getByRole('button', { name: 'Effacer les critères' }).click();
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
    await expect(page.getByLabel('Nom, quartier, repère ou filière')).toHaveValue('');
    await expect(page.locator('.etat-vide')).toHaveCount(0);
    await expect(page).not.toHaveURL(/q=/);
  });

  test('« Effacer les critères » remet aussi le niveau et la zone', async ({ page }) => {
    await page.goto('/ecoles/?q=zzzz&niveau=P&zone=congo/brazzaville');
    await page.getByRole('button', { name: 'Effacer les critères' }).click();
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
    await expect(
      page.getByRole('group', { name: 'Niveau' }).getByRole('button').first(),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Lieu')).toHaveValue('');
  });

  test('une coupure de réseau : le message le dit, et « Réessayer » recharge vraiment les données', async ({
    page,
  }) => {
    await page.route('**/recherche.json', (route) => route.abort());
    await page.goto('/ecoles/');
    const vide = page.locator('.etat-vide');
    await expect(vide.locator('.etat-vide-titre')).toHaveText(
      'La recherche n’a pas pu se charger.',
    );
    await expect(vide).toContainText('Vérifiez votre connexion');
    // Le réseau revient : le même bouton, pas un rechargement de la page.
    await page.unroute('**/recherche.json');
    await vide.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
    await expect(page.locator('.etat-vide')).toHaveCount(0);
  });

  test('une coupure puis une frappe : la recherche se remet en marche d’elle-même', async ({
    page,
  }) => {
    await page.route('**/recherche.json', (route) => route.abort());
    await page.goto('/ecoles/');
    await expect(page.locator('.etat-vide-titre')).toHaveText(
      'La recherche n’a pas pu se charger.',
    );
    await page.unroute('**/recherche.json');
    await page.getByLabel('Nom, quartier, repère ou filière').fill('tie');
    await expect(page.locator('[data-compte]')).toHaveText(/^4 écoles/);
  });
});

async function avecPosition(page: Page, latitude: number, longitude: number) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude, longitude, accuracy: 10 });
}

test.describe('« Autour de moi », filtre de la page « Écoles » (ticket 146)', () => {
  test('l’ancienne adresse y mène, rayon de 3 km choisi, sans demander la position', async ({
    page,
  }) => {
    await page.goto('/autour-de-moi/');
    await expect(page).toHaveURL(/\/ecoles\/\?autour=3$/);
    const groupe = page.getByRole('group', { name: 'Jusqu’à' });
    await expect(groupe.getByRole('button')).toHaveText(['1 km', '3 km', '10 km', '30 km']);
    await expect(groupe.getByRole('button', { name: '3 km' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // La position n'est demandée qu'à l'appui du bouton : la liste complète reste là.
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
  });

  test('les résultats sont des cartes d’école avec leur distance et leur preuve ; changer de rayon les met à jour', async ({
    page,
  }) => {
    await avecPosition(page, -4.7912, 11.9252);
    await page.goto('/ecoles/');
    await page.getByRole('button', { name: 'Autour de moi' }).click();
    const lignes = page.locator('ul.liste-lignes li');
    await expect(lignes.first()).toContainText('[Complexe scolaire Exemple]');
    await expect(lignes.first().locator('.ligne-distance')).toHaveText(/^À \d+\s?m$/);
    await expect(lignes.first().locator('.ligne-preuve')).toHaveText(/^Vue sur place le /);
    await expect(lignes.first().locator('.disque-l')).toHaveText('P');
    await expect(page.locator('[data-compte]')).toHaveText(/^4 écoles/);
    await expect(page).toHaveURL(/autour=3/);
    // 10 km : deux écoles de plus (la campus de Mongo-Mpoukou, l'école ajoutée à plus de 3 km) ; la puce suit.
    await page.getByRole('button', { name: '10 km' }).click();
    await expect(page.locator('[data-compte]')).toHaveText(/^6 écoles/);
    await expect(page.getByRole('button', { name: '10 km' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: '3 km' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('aucune école dans le rayon : on efface les critères, et « Une école manque ? »', async ({
    page,
  }) => {
    await avecPosition(page, -3.0, 14.0);
    await page.goto('/ecoles/');
    await page.getByRole('button', { name: 'Autour de moi' }).click();
    const vide = page.locator('.etat-vide');
    await expect(vide.locator('.etat-vide-titre')).toHaveText(
      /Aucune école relevée à moins de 3\skm d’ici pour l’instant\./,
    );
    const manque = vide.getByRole('link', { name: /Une école manque/ });
    expect(decodeURIComponent((await manque.getAttribute('href')) ?? '')).toContain(
      'une école manque',
    );
    await vide.getByRole('button', { name: 'Effacer les critères' }).click();
    await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
  });
});

test.describe('les pages de zone', () => {
  test('les écoles et le découpage viennent avant la sollicitation des directions', async ({
    page,
  }) => {
    await page.goto(TIE_TIE);
    const liste = (await page.locator('ul.liste-lignes').boundingBox())!;
    const ajouter = (await page.getByRole('link', { name: 'Ajouter mon école' }).boundingBox())!;
    expect(liste.y + liste.height, 'la liste est avant « Ajouter mon école »').toBeLessThanOrEqual(
      ajouter.y,
    );
    await page.goto('/ecoles/pointe-noire/');
    const zones = (await page.locator('ul.zones').boundingBox())!;
    const ajouterVille = (await page
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
    await expect(page.locator('a.zone', { hasText: 'Ngoyo' })).toContainText(
      'pas encore d’école publiée',
    );
    // La bascule mène à la seule carte du site, cadrée sur la ville.
    await expect(
      page.getByRole('navigation', { name: 'Affichage' }).getByRole('link', { name: 'Carte' }),
    ).toHaveAttribute('href', /^\/carte\/#\d/);
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
  test('les villes n’ont plus d’état, et les anciennes formations y renvoient filtrées', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    const ville = page.locator('a.zone', { hasText: 'Pointe-Noire' });
    await expect(ville).toContainText(/\d+ écoles?/);
    await expect(page.locator('#par-ville')).not.toContainText(
      /Relevé en cours|Déploiement programmé/,
    );
    await page.goto('/formations/serie/c/');
    await expect(page).toHaveURL(/\/ecoles\/\?serie=c$/);
    await expect(page.getByLabel('Série du bac')).toHaveValue('c');
    await page.goto('/formations/');
    await expect(page).toHaveURL(/\/ecoles\/$/);
  });

  test('l’ancienne recherche y mène, paramètres compris', async ({ page }) => {
    await page.goto('/recherche/?q=tie');
    await expect(page).toHaveURL(/\/ecoles\/\?q=tie$/);
    await expect(page.getByLabel('Nom, quartier, repère ou filière')).toHaveValue('tie');
    await expect(page.locator('[data-compte]')).toHaveText(/^4 écoles/);
  });
});

test.describe('l’accueil en économiseur de données', () => {
  test('le cadre dit que la carte attend l’appui, sans l’ancien dessin ni grand vide (ticket 146)', async ({
    page,
  }) => {
    await page.goto('/');
    const cadre = page.locator('#carte');
    await expect(cadre).toHaveAttribute('data-attente', 'appui');
    await expect(cadre.locator('.carte-repli')).toBeHidden();
    await expect(cadre.locator('.attente-appui')).toHaveText(
      'La carte se charge à la demande, pour ménager vos données.',
    );
    await expect(page.getByRole('button', { name: 'Explorer la carte interactive' })).toBeVisible();
    expect((await cadre.boundingBox())!.height).toBeLessThan(22 * 16);
  });
});
