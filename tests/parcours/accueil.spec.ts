import { expect, test } from '@playwright/test';

// Lot 3 du site à trois piliers (planches « Accueil » et « S'orienter, départ » de la version 44, validées le 15/11/2026) :
// l'accueil, sans carte ni JavaScript, et ses portes ; « S'orienter » de passage, avant les questions du lot 5. Catalogue
// fictif : voir public.spec.ts (sept écoles à Pointe-Noire, une à Brazzaville, une à Dolisie). La recherche, les villes et la
// carte sont dans fiche-famille.spec.ts ; la mise en page aux trois largeurs, dans mise-en-page.spec.ts.

test.describe('l’accueil', () => {
  test('« Trouver une école » est le pilier courant ; le titre et la recherche ouvrent la page', async ({
    page,
  }) => {
    await page.goto('/');
    const piliers = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(piliers.getByRole('link', { name: 'Trouver une école' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Trouvez une école au Congo-Brazzaville.',
    );
    await expect(page.getByRole('searchbox', { name: 'Chercher une école' })).toBeInViewport();
  });

  test('« Pour mon enfant » : une puce par niveau publié, qui ouvre la liste filtrée', async ({
    page,
  }) => {
    await page.goto('/');
    const niveaux = page.getByRole('navigation', { name: 'Chercher par niveau' });
    await expect(niveaux.getByRole('link')).toHaveCount(4);
    for (const [mot, lettre] of [
      ['Maternelle', 'M'],
      ['Primaire', 'P'],
      ['Collège', 'C'],
      ['Lycée', 'L'],
    ] as const)
      await expect(niveaux.getByRole('link', { name: mot, exact: true })).toHaveAttribute(
        'href',
        `/ecoles/?niveau=${lettre}`,
      );
    await niveaux.getByRole('link', { name: 'Lycée', exact: true }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?niveau=L$/);
    // Lot 4 bis : le choix fait se lit dans la barre de « Les écoles », comme une puce qu'on retire.
    await expect(page.locator('[data-puces] .puce-choisie[data-valeur="L"]')).toBeVisible();
    await expect(page.locator('[data-cartes]')).toContainText('[Groupe scolaire Exemple]');
  });

  test('« Après le BEPC ou le bac » : « S’orienter », et le nombre d’établissements du supérieur', async ({
    page,
  }) => {
    await page.goto('/');
    const porte = page.locator('section.porte', {
      has: page.getByRole('heading', { name: 'Lycée, BTS, licence, formation pro' }),
    });
    // L'institut supérieur et le centre de formation : la lettre S, comme le filtre de la liste.
    await expect(
      porte.getByRole('link', { name: /^Voir les 2 établissements du supérieur/ }),
    ).toHaveAttribute('href', '/ecoles/?niveau=S');
    await porte.getByRole('link', { name: 'S’orienter' }).click();
    await expect(page).toHaveURL(/\/orienter\/$/);
  });

  test('« Autour de moi » ouvre « Écoles » sur le rayon de 3 km, sans demander la position avant l’appui', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Autour de moi' }).click();
    // Lot 4 bis : l'adresse devient `?rayon=3000` ; la position attend toujours l'appui sur « Autour de moi ».
    await expect(page).toHaveURL(/\/ecoles\/\?rayon=3000$/);
    await expect(page.locator('[data-message]')).toContainText('Touchez « Autour de moi »');
    await expect(page.locator('[data-puces] .puce-choisie[data-rayon="3000"]')).toBeVisible();
  });

  test('« Vues sur place récemment » : quatre cartes, chacune un seul lien vers sa fiche, avec sa preuve datée', async ({
    page,
  }) => {
    await page.goto('/');
    const cartes = page.locator('ul.cartes-recentes > li');
    await expect(cartes).toHaveCount(4);
    for (const carte of await cartes.all()) {
      await expect(carte.getByRole('link')).toHaveCount(1);
      await expect(carte.getByRole('link')).toHaveAttribute(
        'href',
        /^\/ecoles\/[a-z0-9-]+-\d{6}\/$/,
      );
      // La date ne se coupe jamais (espaces insécables) : une preuve longue passe à la ligne avant elle.
      await expect(carte).toContainText(
        /(Vue sur place|Confirmée par la direction) · \d{1,2}\u00a0\S+\u00a0\d{4}/,
      );
    }
    // Le passage le plus récent d'abord.
    await expect(cartes.first()).toContainText('[Institut supérieur Exemple]');
    // La couverture choisie, sinon la photo d'enseigne (fondateur, 16/11 ; avant : « jamais la photo d'enseigne ») : sa
    // vignette, chargée à la demande. Sans photo, la vignette de la version 44 : le fond pierre et le rond de l'école (sigle
    // sur le vert foncé, sinon la lettre de son niveau), jamais les anciennes vignettes bleues à grande lettre.
    const photos = page.locator('.cartes-recentes img.vignette-ecole');
    await expect(photos).toHaveCount(2);
    for (const photo of await photos.all()) {
      await expect(photo).toHaveAttribute('loading', 'lazy');
      await expect(photo).toHaveAttribute(
        'src',
        /(-vignette|\/photos\/vignettes\/.+-large)\.webp$/,
      );
    }
    const vides = page.locator('.cartes-recentes .vignette-vide');
    await expect(vides).toHaveCount(2);
    for (const vide of await vides.all())
      await expect(vide.locator('.vignette-rond')).toHaveCount(1);
    await expect(page.locator('.cartes-recentes .recente-dessinee')).toHaveCount(0);
  });

  test('« Une école manque ? » : « La signaler » écrit à NTanova sur WhatsApp, le message déjà commencé', async ({
    page,
  }) => {
    await page.goto('/');
    const lien = page.getByRole('contentinfo').getByRole('link', { name: 'La signaler' });
    const adresse = (await lien.getAttribute('href')) ?? '';
    // Le numéro vient de la configuration, jamais d'un test : seulement la forme de l'adresse.
    expect(adresse).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(adresse)).toContain('Bonjour NTanova, une école manque : ');
  });

  test('dans 320 px, sans JavaScript : rien ne déborde, les trois piliers sur une ligne, deux villes côte à côte', async ({
    browser,
    baseURL,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 320, height: 640 },
      baseURL: baseURL ?? '',
    });
    const page = await contexte.newPage();
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
    const piliers = page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link');
    const boites = await Promise.all((await piliers.all()).map((l) => l.boundingBox()));
    for (const b of boites) expect(b!.y, 'les piliers sur une ligne').toBe(boites[0]!.y);
    const [premiere, seconde] = await page.locator('section.ville-carte').all();
    const a = (await premiere!.boundingBox())!;
    const b = (await seconde!.boundingBox())!;
    expect(a.y).toBe(b.y);
    // Le nom de chaque ville tient dans sa carte.
    for (const ville of await page.locator('section.ville-carte .ville-lien b').all()) {
      const debord = await ville.evaluate((e) => e.scrollWidth - e.clientWidth);
      expect(debord, await ville.innerText()).toBeLessThanOrEqual(0);
    }
    await contexte.close();
  });
});

test.describe('« S’orienter », avant les questions du lot 5', () => {
  test('trois profils vers leur liste, et rien de promis', async ({ page }) => {
    await page.goto('/orienter/');
    const piliers = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(piliers.getByRole('link', { name: 'S’orienter' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('ul.profils a')).toHaveCount(3);
    for (const [nom, lien] of [
      [/^En 3e, ou j’ai le BEPC/, '/ecoles/?niveau=L'],
      [/^Au lycée, ou j’ai le bac/, '/ecoles/?niveau=S'],
      [/^Je travaille, je veux me former/, '/ecoles/?rythme=soir'],
    ] as const)
      await expect(page.getByRole('link', { name: nom })).toHaveAttribute('href', lien);
    // Après le BEPC, le technique a son propre lien (la liste ne filtre qu'un cycle), mais seulement avec une école technique
    // publiée : le catalogue fictif n'en a pas (le cas contraire est dans accueil-public.test.ts).
    await expect(page.getByRole('link', { name: /enseignement technique/ })).toHaveCount(0);
    // Ni questions ni dates tant qu'elles n'existent pas : sans communiqué, pas de date.
    const principal = page.locator('main');
    await expect(principal).not.toContainText(/questions|Dates à retenir/);
    await expect(principal).toContainText('pas un avis officiel d’orientation');
  });

  test('« Au lycée, ou j’ai le bac » : la liste du supérieur, son filtre appuyé', async ({
    page,
  }) => {
    await page.goto('/orienter/');
    await page.getByRole('link', { name: /^Au lycée, ou j’ai le bac/ }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?niveau=S$/);
    await expect(page.locator('[data-puces] .puce-choisie[data-valeur="S"]')).toBeVisible();
    await expect(page.locator('[data-sous-titre]')).toHaveText(/^2 écoles/);
  });

  test('« Je travaille » : la liste des cours du soir, le choix lisible dans la barre', async ({
    page,
  }) => {
    await page.goto('/orienter/');
    await page.getByRole('link', { name: /^Je travaille/ }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?rythme=soir$/);
    // Lot 4 bis : le rythme choisi se lit dans la barre ; la feuille « Filtres » montre le groupe ouvert.
    await expect(page.locator('[data-puces] .puce-choisie[data-valeur="soir"]')).toBeVisible();
    await expect(page.locator('[data-sous-titre]')).toHaveText(/^[1-9]\d* écoles?/);
  });
});
