import { expect, test, type Page } from '@playwright/test';

// Audit du 05/11/2026, Vague 3 : une seule ligne d'école et un seul état vide pour toutes les listes (zone, recherche,
// « Autour de moi »), les puces de niveau et de rayon, les pages de zone qui montrent les écoles avant la sollicitation.
const TIE_TIE = '/ecoles/congo/pointe-noire/tie-tie/';

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
      '/ecoles/congo/pointe-noire/loandjili/quartier-exemple/',
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
      await page.goto(`/recherche/?q=${encodeURIComponent(ecole.replace(/[[\]]/g, ''))}`);
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
    await expect(complexe.locator('.disque')).toHaveText('P');
    await expect(complexe.locator('.disque')).toHaveClass(/c-P/);
    await expect(complexe.locator('.ligne-preuve')).toHaveText('Vue sur place');
    await expect(complexe.locator('.ligne-preuve svg')).toHaveCount(1);
    const sans = page.locator('ul.liste-lignes li').filter({ hasText: 'École sans détail' });
    await expect(sans.locator('.disque')).toHaveClass(/disque-vide/);
    await expect(sans.locator('.ligne-preuve')).toHaveText(
      'Ajoutée par NTanova, pas encore vue sur place',
    );
  });
});

test.describe('la recherche', () => {
  test('le niveau se choisit par des puces colorées, plus par un menu natif', async ({ page }) => {
    await page.goto('/recherche/');
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
    await expect(page.getByText(/^1 école/)).toBeVisible();
    await expect(page).toHaveURL(/niveau=L/);
    // « Tous » les rend toutes.
    await puces.first().click();
    await expect(page.getByText(/^9 écoles/)).toBeVisible();
    await expect(page).not.toHaveURL(/niveau=/);
  });

  test('la puce choisie par l’adresse est visible dans la bande, même quand la bande défile (téléphone)', async ({
    page,
  }) => {
    // « Supérieur » est la dernière puce : sur un écran de 360 px, elle est hors de la bande tant qu'on ne la montre pas.
    await page.goto('/recherche/?niveau=S');
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
      await page.goto(`/recherche/?niveau=${niveau}`);
      await expect(
        page.getByRole('group', { name: 'Niveau' }).getByRole('button', { name: /Lycée/ }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByText(/^1 école/)).toBeVisible();
    }
  });

  test('les filtres de formation sont dans un volet replié « Plus de filtres »', async ({
    page,
  }) => {
    await page.goto('/recherche/');
    const volet = page.locator('details.plus-de-filtres');
    await expect(volet.locator('summary')).toHaveText('Plus de filtres');
    await expect(volet).not.toHaveAttribute('open', '');
    await expect(page.getByLabel('Série du bac')).toBeHidden();
    // Avant : six menus natifs avant le premier résultat. Maintenant : le nom, le niveau, la zone.
    const visibles = await page.locator('form select:visible').count();
    expect(visibles).toBe(1);
    await volet.locator('summary').click();
    for (const nom of ['Série du bac', 'Diplôme', 'Domaine', 'Rythme'])
      await expect(page.getByLabel(nom)).toBeVisible();
  });

  test('un filtre avancé demandé par l’adresse ouvre le volet', async ({ page }) => {
    await page.goto('/recherche/?serie=c');
    await expect(page.locator('details.plus-de-filtres')).toHaveAttribute('open', '');
    await expect(page.getByLabel('Série du bac')).toHaveValue('c');
  });

  test('les résultats sont des lignes d’école, avec leur preuve, et avant les résultats : le moins de commandes possible', async ({
    page,
  }) => {
    await page.goto('/recherche/');
    await expect(page.getByText(/^9 écoles/)).toBeVisible();
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
    await page.goto('/recherche/?q=zzzz');
    const vide = page.locator('.etat-vide');
    await expect(vide.locator('.etat-vide-titre')).toHaveText('Aucune école ne correspond.');
    await expect(page.locator('[data-compte]')).toHaveText('');
    const manque = vide.getByRole('link', { name: /Une école manque/ });
    const href = decodeURIComponent((await manque.getAttribute('href')) ?? '');
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(href).toContain('une école manque');
    await vide.getByRole('button', { name: 'Effacer les critères' }).click();
    await expect(page.getByText(/^9 écoles/)).toBeVisible();
    await expect(page.getByLabel('Nom, quartier, repère ou formation')).toHaveValue('');
    await expect(page.locator('.etat-vide')).toHaveCount(0);
    await expect(page).not.toHaveURL(/q=/);
  });

  test('« Effacer les critères » remet aussi le niveau et la zone', async ({ page }) => {
    await page.goto('/recherche/?q=zzzz&niveau=P&zone=congo/brazzaville');
    await page.getByRole('button', { name: 'Effacer les critères' }).click();
    await expect(page.getByText(/^9 écoles/)).toBeVisible();
    await expect(
      page.getByRole('group', { name: 'Niveau' }).getByRole('button').first(),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Zone')).toHaveValue('');
  });

  test('une coupure de réseau : le message le dit, et « Réessayer » recharge vraiment les données', async ({
    page,
  }) => {
    await page.route('**/recherche.json', (route) => route.abort());
    await page.goto('/recherche/');
    const vide = page.locator('.etat-vide');
    await expect(vide.locator('.etat-vide-titre')).toHaveText(
      'La recherche n’a pas pu se charger.',
    );
    await expect(vide).toContainText('Vérifiez votre connexion');
    // Le réseau revient : le même bouton, pas un rechargement de la page.
    await page.unroute('**/recherche.json');
    await vide.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByText(/^9 écoles/)).toBeVisible();
    await expect(page.locator('.etat-vide')).toHaveCount(0);
  });

  test('une coupure puis une frappe : la recherche se remet en marche d’elle-même', async ({
    page,
  }) => {
    await page.route('**/recherche.json', (route) => route.abort());
    await page.goto('/recherche/');
    await expect(page.locator('.etat-vide-titre')).toHaveText(
      'La recherche n’a pas pu se charger.',
    );
    await page.unroute('**/recherche.json');
    await page.getByLabel('Nom, quartier, repère ou formation').fill('tie');
    await expect(page.getByText(/^4 écoles/)).toBeVisible();
  });
});

async function avecPosition(page: Page, latitude: number, longitude: number) {
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude, longitude, accuracy: 10 });
}

test.describe('« Autour de moi »', () => {
  test('le rayon se choisit en puces, avant le bouton', async ({ page }) => {
    await page.goto('/autour-de-moi/');
    const groupe = page.getByRole('group', { name: 'Jusqu’à' });
    await expect(groupe.getByRole('button')).toHaveText(['1 km', '3 km', '10 km', '30 km']);
    await expect(groupe.getByRole('button', { name: '3 km' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('select')).toHaveCount(0);
    const [puces, bouton] = await Promise.all([
      groupe.boundingBox(),
      page.getByRole('button', { name: 'Trouver les écoles près de moi' }).boundingBox(),
    ]);
    expect(puces!.y + puces!.height, 'les puces sont avant le bouton').toBeLessThanOrEqual(
      bouton!.y,
    );
  });

  test('les résultats sont des lignes d’école avec leur distance et leur preuve ; changer de rayon les met à jour', async ({
    page,
  }) => {
    await avecPosition(page, -4.7912, 11.9252);
    await page.goto('/autour-de-moi/');
    await page.getByRole('button', { name: 'Trouver les écoles près de moi' }).click();
    const lignes = page.locator('ul.liste-lignes li');
    await expect(lignes.first()).toContainText('[Complexe scolaire Exemple]');
    await expect(lignes.first().locator('.ligne-distance')).toHaveText(/^À \d+\s?m$/);
    await expect(lignes.first().locator('.ligne-preuve')).toHaveText('Vue sur place');
    await expect(lignes.first().locator('.disque')).toHaveText('P');
    await expect(page.getByText('4 écoles')).toBeVisible();
    // 10 km : deux écoles de plus (la campus de Mongo-Mpoukou, l'école ajoutée à plus de 3 km) ; la puce suit.
    await page.getByRole('button', { name: '10 km' }).click();
    await expect(page.getByText('6 écoles')).toBeVisible();
    await expect(page.getByRole('button', { name: '10 km' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: '3 km' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  test('aucune école dans le rayon : un plan B (la recherche, les villes) et « Une école manque ? »', async ({
    page,
  }) => {
    await avecPosition(page, -3.0, 14.0);
    await page.goto('/autour-de-moi/');
    await page.getByRole('button', { name: 'Trouver les écoles près de moi' }).click();
    const vide = page.locator('.etat-vide');
    await expect(vide.locator('.etat-vide-titre')).toHaveText(
      /Aucune école relevée à moins de 3\skm d’ici pour l’instant\./,
    );
    await expect(vide.getByRole('link', { name: 'Chercher par nom' })).toHaveAttribute(
      'href',
      '/recherche/',
    );
    await expect(vide.getByRole('link', { name: 'Les écoles par ville' })).toHaveAttribute(
      'href',
      '/ecoles/',
    );
    const manque = vide.getByRole('link', { name: /Une école manque/ });
    expect(decodeURIComponent((await manque.getAttribute('href')) ?? '')).toContain(
      'une école manque',
    );
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
    await page.goto('/ecoles/congo/pointe-noire/');
    const zones = (await page.locator('ul.zones').boundingBox())!;
    const ajouterVille = (await page
      .getByRole('link', { name: 'Ajouter mon école' })
      .boundingBox())!;
    expect(zones.y + zones.height).toBeLessThanOrEqual(ajouterVille.y);
  });

  test('le schéma de la ville dit l’état de la zone, jamais « 0 école »', async ({ page }) => {
    await page.goto('/ecoles/congo/pointe-noire/');
    await expect(page.locator('main')).not.toContainText(/\b0 écoles?\b/);
    const textes = await page.locator('main svg text').allTextContents();
    expect(textes).toContain('Relevé en cours');
    // Une étiquette longue s'écrit sur deux lignes dans le dessin : « Déploiement » puis « programmé ».
    expect(textes).toContain('Déploiement');
    expect(textes).toContain('programmé');
    expect(textes.join(' ')).not.toMatch(/\b0 écoles?\b/);
    // Le nom accessible d'une zone sans école dit son état, avec les mêmes mots que la carte.
    await expect(page.getByRole('link', { name: 'Ngoyo : Relevé en cours' })).toBeVisible();
  });

  test('une zone sans école : un seul état vide (l’état, de quoi continuer, WhatsApp)', async ({
    page,
  }) => {
    await page.goto('/ecoles/congo/pointe-noire/ngoyo/');
    await expect(page.locator('.etat-vide')).toHaveCount(1);
    await expect(page.locator('.etat-vide-titre')).toContainText('Aucune école publiée');
    await expect(page.locator('main a[href*="wa.me"]')).toHaveCount(1);
  });
});

test.describe('les pages « Les écoles » et « Par formation »', () => {
  test('/ecoles/ va droit aux villes, avec leur état, puis aux écoles : plus de gros boutons de menu', async ({
    page,
  }) => {
    await page.goto('/ecoles/');
    await expect(page.locator('main .bouton')).toHaveCount(0);
    const ville = page.locator('a.zone', { hasText: 'Pointe-Noire' });
    await expect(ville.locator('.etiquette-zone-actif')).toHaveText('Relevé en cours');
    await expect(
      page.locator('a.zone', { hasText: 'Brazzaville' }).locator('.etiquette-zone-programme'),
    ).toHaveText('Déploiement programmé');
    // Le contenu avant les raccourcis : les villes, les écoles, puis « Aussi : … » sur une seule ligne.
    await expect(page.locator('ul.liste-lignes li')).toHaveCount(9);
    const [villes, ecoles, aussi] = await Promise.all([
      page.locator('ul.zones').first().boundingBox(),
      page.locator('ul.liste-lignes').boundingBox(),
      page.locator('p.aussi').boundingBox(),
    ]);
    expect(villes!.y + villes!.height).toBeLessThanOrEqual(ecoles!.y);
    expect(ecoles!.y + ecoles!.height).toBeLessThanOrEqual(aussi!.y);
    await expect(page.locator('p.aussi')).toHaveText(
      /Aussi\s:\srechercher par nom, autour de moi, par formation\./,
    );
  });

  test('/formations/ : le disque et la couleur de chaque niveau, et un sous-titre qui ne promet que ce qui est là', async ({
    page,
  }) => {
    await page.goto('/formations/');
    const niveaux = page.getByRole('region', { name: 'Niveau' }).getByRole('listitem');
    await expect(niveaux.first().locator('.disque')).toHaveText('M');
    await expect(niveaux.first().locator('.disque')).toHaveClass(/c-M/);
    await expect(niveaux.filter({ hasText: 'Supérieur' }).locator('.disque')).toHaveClass(/c-S/);
    await expect(page.getByRole('region', { name: 'Série du bac' }).locator('.disque')).toHaveCount(
      0,
    );
    await expect(page.locator('main')).toContainText(
      'Les écoles publiées, rangées par niveau, série du bac, diplôme, domaine et rythme.',
    );
    await expect(page.locator('main')).not.toContainText('panneaux et leurs prospectus');
  });
});

test.describe('l’accueil en économiseur de données', () => {
  test('le cadre de la carte a la hauteur de son dessin, pas celle d’une carte absente', async ({
    page,
  }) => {
    await page.goto('/');
    const cadre = page.locator('#carte');
    await expect(cadre).toHaveAttribute('data-attente', 'appui');
    const boite = (await cadre.boundingBox())!;
    const dessin = (await page.locator('.carte-repli').boundingBox())!;
    // Plus de vide sous le dessin : le cadre se termine avec lui (il gardait 22 rem de hauteur minimale).
    expect(boite.y + boite.height - (dessin.y + dessin.height)).toBeLessThan(40);
    expect(boite.height).toBeLessThan(22 * 16);
  });
});
