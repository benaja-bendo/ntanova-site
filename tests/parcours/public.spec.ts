import { expect, test, type Locator, type Page } from '@playwright/test';

/** Le nom d'une cible pour le message d'erreur : son texte, ou celui qu'elle donne au lecteur d'écran (un lien de la carte, en SVG). */
const nomDe = async (cible: Locator) =>
  (await cible.getAttribute('aria-label')) ?? (await cible.textContent()) ?? '';

// Le site public, construit avec le catalogue fictif : Pointe-Noire (quatre écoles à Tié-Tié, une école à deux
// campus à Loandjili et à Mongo-Mpoukou, un institut supérieur), Brazzaville et Dolisie.
// Chaque page : en français, sans JavaScript (sauf « Rechercher » et « Autour de moi », qui filtrent dans le
// navigateur), sans ressource extérieure, lisible dans 360 px, avec des cibles d'au moins 44 px.

const TIE_TIE = '/ecoles/congo/pointe-noire/tie-tie/';

const pagesSansJavaScript = [
  '/',
  '/ecoles/',
  '/ecoles/congo/',
  '/ecoles/congo/pointe-noire/',
  TIE_TIE,
  '/ecoles/congo/pointe-noire/ngoyo/',
  '/ecoles/congo/pointe-noire/loandjili/quartier-exemple/',
  '/ecoles/congo/brazzaville/',
  '/ecoles/congo/niari/dolisie/',
  '/cartes/congo/pointe-noire/tie-tie/',
  '/cartes/congo/pointe-noire/tie-tie/coin_1/',
  '/cartes/congo/pointe-noire/ngoyo/',
  `${TIE_TIE}complexe-scolaire-exemple/`,
  `${TIE_TIE}centre-de-formation-exemple/`,
  `${TIE_TIE}ecole-sans-detail-exemple/`,
  `${TIE_TIE}ecole-ajoutee-exemple/`,
  '/ecoles/congo/pointe-noire/loandjili/quartier-exemple/groupe-scolaire-exemple/',
  '/ecoles/congo/pointe-noire/mongo-mpoukou/groupe-scolaire-exemple/',
  '/ecoles/congo/pointe-noire/loandjili/institut-superieur-exemple/',
  '/ecoles/congo/brazzaville/moungali/ecole-de-brazzaville-exemple/',
  '/formations/',
  '/formations/serie/c/',
  '/formations/diplome/bts/',
  '/formations/domaine/informatique/',
  '/formations/rythme/soir/',
  '/formations/niveau/lycee/',
  '/pour-les-ecoles/',
  '/a-propos/',
];

const pagesAvecJavaScript = ['/recherche/', '/autour-de-moi/'];

/** Ce que toute page publique respecte : en français, aucune ressource extérieure, 360 px, des cibles de 44 px. */
async function pageLisible(page: Page, baseURL: string | undefined, adresse: string) {
  const exterieures: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith(baseURL ?? '')) exterieures.push(r.url());
  });
  const reponse = await page.goto(adresse);
  expect(reponse?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(exterieures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  for (const cible of await page.locator('a, button').all()) {
    // Un lien caché à cette largeur (la navigation du haut, réservée aux écrans larges) n'est pas une cible.
    if (!(await cible.isVisible())) continue;
    const boite = await cible.boundingBox();
    expect(boite?.height, await nomDe(cible)).toBeGreaterThanOrEqual(44);
  }
}

test.describe('site public', () => {
  for (const adresse of pagesSansJavaScript) {
    test(`${adresse} : sans JavaScript, 360 px, cibles de 44 px`, async ({ page, baseURL }) => {
      await pageLisible(page, baseURL, adresse);
      expect(await page.locator('script:not([type="application/ld+json"])').count()).toBe(0);
    });
  }

  for (const adresse of pagesAvecJavaScript) {
    test(`${adresse} : un seul script, rien d'extérieur, 360 px, cibles de 44 px`, async ({
      page,
      baseURL,
    }) => {
      await pageLisible(page, baseURL, adresse);
      // Le seul JavaScript des pages publiques : un petit script de filtrage, du site lui-même.
      const scripts = await page
        .locator('script[src]')
        .evaluateAll((s) => s.map((x) => (x as HTMLScriptElement).src));
      expect(scripts.length).toBeGreaterThanOrEqual(1);
      expect(scripts.filter((src) => !src.startsWith(baseURL ?? ''))).toEqual([]);
    });
  }

  test('de l’accueil à la fiche d’une école, puis vers « Pour les écoles »', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /^Pointe-Noire.*7 écoles/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Brazzaville.*1 école/ })).toBeVisible();
    await page.getByRole('link', { name: /^Pointe-Noire.*7 écoles/ }).click();

    // La ville : le département de même nom n'a pas de page à lui ; ses arrondissements en sont les zones.
    await expect(page).toHaveURL(/\/ecoles\/congo\/pointe-noire\/$/);
    await expect(page.getByRole('heading', { name: 'Pointe-Noire', level: 1 })).toBeVisible();
    await page
      .getByRole('link', { name: /Tié-Tié.*Arrondissement 3.*4 écoles/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Tié-Tié', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /\[Complexe scolaire Exemple\]/ }).click();

    await expect(page.getByRole('heading', { name: '[Complexe scolaire Exemple]' })).toBeVisible();
    await expect(page.getByText(/Vue sur place le 2 novembre 2026/)).toBeVisible();
    await expect(page.getByText(/Confirmée par la direction/)).toHaveCount(0);
    await expect(page.getByText('Maternelle, Primaire')).toBeVisible();
    await expect(page.getByRole('link', { name: '+242 06 000 00 01' })).toHaveAttribute(
      'href',
      'tel:+242060000001',
    );
    await expect(page.getByRole('link', { name: 'Y aller' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-4.79105,11.925',
    );
    await page.getByRole('link', { name: 'Compléter cette fiche' }).click();
    await expect(page.getByRole('heading', { name: 'Vous dirigez une école ?' })).toBeVisible();
  });

  test.describe('du pays au quartier, plusieurs villes, un campus parmi d’autres', () => {
    test('le pays, la ville, l’arrondissement, le quartier : chaque niveau mène au suivant', async ({
      page,
    }) => {
      await page.goto('/ecoles/');
      await page.getByRole('link', { name: 'Congo', exact: true }).click();
      await expect(page).toHaveURL(/\/ecoles\/congo\/$/);
      // Trois zones du pays ont des fiches : Pointe-Noire, Brazzaville, le Niari (Dolisie).
      await expect(page.locator('a.zone')).toHaveCount(3);
      await page.getByRole('link', { name: /Pointe-Noire.*7 écoles/ }).click();
      await page.getByRole('link', { name: /Loandjili.*Arrondissement 4.*2 écoles/ }).click();
      await expect(page).toHaveURL(/\/ecoles\/congo\/pointe-noire\/loandjili\/$/);
      await page.getByRole('link', { name: /\[Quartier Exemple\].*1 école/ }).click();
      await expect(page).toHaveURL(/\/loandjili\/quartier-exemple\/$/);
      await expect(
        page.getByRole('heading', { name: '[Quartier Exemple]', level: 1 }),
      ).toBeVisible();
      // Le fil d'Ariane remonte d'un cran à la fois, sans répéter « Pointe-Noire ».
      await expect(page.getByRole('link', { name: '← Loandjili' })).toBeVisible();
      await expect(page.getByText('Congo › Pointe-Noire › Loandjili')).toBeVisible();
    });

    test('une zone sans école mais ouverte au relevé a sa page, qui le dit', async ({ page }) => {
      await page.goto('/ecoles/congo/pointe-noire/ngoyo/');
      await expect(page.getByRole('heading', { name: 'Ngoyo', level: 1 })).toBeVisible();
      await expect(
        page.getByText(/Aucune école publiée pour l.instant\s:\sle relevé est en cours\./),
      ).toBeVisible();
    });

    test('une école à deux campus : chaque fiche a son implantation, ses formations et renvoie à l’autre', async ({
      page,
    }) => {
      await page.goto(
        '/ecoles/congo/pointe-noire/loandjili/quartier-exemple/groupe-scolaire-exemple/',
      );
      await expect(
        page.getByRole('heading', { name: '[Groupe scolaire Exemple]', level: 1 }),
      ).toBeVisible();
      await expect(page.getByText('Campus du quartier', { exact: true })).toBeVisible();
      await expect(page.getByText(/Confirmée par la direction le 4 novembre 2026/)).toBeVisible();
      // Le lieu, du plus fin au plus large, sans répéter Pointe-Noire (ville et département).
      await expect(
        page.getByText('[Quartier Exemple] · Loandjili · Pointe-Noire', { exact: true }),
      ).toBeVisible();
      // Les deux preuves, l'une après l'autre, jamais fusionnées.
      await expect(page.getByText(/Vue sur place le 2 novembre 2026/)).toBeVisible();
      // Les formations du lycée, rangées par cycle, avec leurs liens vers les pages par série.
      const formations = page.getByRole('region', { name: 'Formations' });
      await expect(formations.getByRole('heading', { name: 'Lycée' })).toBeVisible();
      await expect(formations.getByRole('link', { name: 'Série C' }).first()).toHaveAttribute(
        'href',
        '/formations/serie/c/',
      );
      // L'autre implantation de la même école.
      const autres = page.getByRole('region', { name: 'Autres implantations' });
      await autres.getByRole('link', { name: /Campus de Mongo-Mpoukou/ }).click();
      await expect(page).toHaveURL(/\/mongo-mpoukou\/groupe-scolaire-exemple\/$/);
      await expect(
        page.getByText('Campus de Mongo-Mpoukou', { exact: true }).first(),
      ).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: 'Autres implantations' })
          .getByRole('link', { name: /Campus du quartier/ }),
      ).toBeVisible();
    });

    test('un campus dans une ville sans arrondissement : la commune porte la fiche', async ({
      page,
    }) => {
      await page.goto('/ecoles/congo/niari/dolisie/');
      await page.getByRole('link', { name: /Collège de Dolisie Exemple/ }).click();
      await expect(page).toHaveURL(
        /\/ecoles\/congo\/niari\/dolisie\/college-de-dolisie-exemple\/$/,
      );
      await expect(page.getByRole('link', { name: '← Les écoles de Dolisie' })).toBeVisible();
    });

    test('les pages par formation : série, diplôme, domaine, rythme', async ({ page }) => {
      await page.goto('/formations/');
      await page.getByRole('link', { name: /Série C.*1 école/ }).click();
      await expect(page).toHaveURL(/\/formations\/serie\/c\/$/);
      await expect(page.getByRole('heading', { name: 'Série C', level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: /\[Groupe scolaire Exemple\]/ })).toBeVisible();
      // Une série où aucune école publiée n'enseigne n'a pas de page.
      expect((await page.request.get('/formations/serie/e/')).status()).toBe(404);

      await page.goto('/formations/diplome/bts/');
      await expect(
        page.getByRole('link', { name: /\[Institut supérieur Exemple\]/ }),
      ).toBeVisible();
      await page.goto('/formations/rythme/weekend/');
      await expect(
        page.getByRole('link', { name: /\[Institut supérieur Exemple\]/ }),
      ).toBeVisible();
    });
  });

  test.describe('rechercher une école', () => {
    test('par nom, puis par série du bac : les critères se combinent', async ({ page }) => {
      await page.goto('/recherche/');
      const resultats = page.locator('ul.ecoles');
      await expect(page.getByText(/^9 écoles/)).toBeVisible();
      // Le nom, sans accent ni tiret : « tie tie » trouve Tié-Tié.
      await page.getByLabel('Nom, quartier, repère ou formation').fill('tie tie');
      await expect(page.getByText(/^4 écoles/)).toBeVisible();
      await page.getByLabel('Nom, quartier, repère ou formation').fill('');
      // La série C : une seule école, qui l'enseigne dans une formation du jour.
      await page.getByLabel('Série du bac').selectOption('c');
      await expect(page.getByText(/^1 école/)).toBeVisible();
      await expect(
        resultats.getByRole('link', { name: /\[Groupe scolaire Exemple\]/ }),
      ).toBeVisible();
      // Série C et cours du soir : c'est la même formation qui doit être des deux, pas deux formations différentes.
      await page.getByLabel('Rythme').selectOption('soir');
      await expect(page.getByText('Aucune école ne correspond.')).toBeVisible();
      // Série G (toutes les variantes) et cours du soir : la formation « Série G2 » est du jour et du soir.
      await page.getByLabel('Série du bac').selectOption('g');
      await expect(page.getByText(/^1 école/)).toBeVisible();
    });

    test('par diplôme et par domaine, et la recherche se garde dans l’adresse', async ({
      page,
    }) => {
      await page.goto('/recherche/?diplome=bts&domaine=informatique');
      await expect(page.getByLabel('Diplôme')).toHaveValue('bts');
      await expect(page.getByText(/^1 école/)).toBeVisible();
      await expect(
        page.locator('ul.ecoles').getByRole('link', { name: /\[Institut supérieur Exemple\]/ }),
      ).toBeVisible();
      await page.getByLabel('Niveau').selectOption('lycee');
      await expect(page).toHaveURL(/niveau=lycee/);
      await expect(page.getByText('Aucune école ne correspond.')).toBeVisible();
    });

    test('dans une zone : tout ce qu’elle contient', async ({ page }) => {
      await page.goto('/recherche/?zone=congo/pointe-noire/loandjili');
      await expect(page.getByText(/^2 écoles/)).toBeVisible();
      await page.getByLabel('Zone').selectOption('congo/brazzaville');
      await expect(page.getByText(/^1 école/)).toBeVisible();
    });

    test('chaque résultat mène à la fiche de son campus', async ({ page }) => {
      await page.goto('/recherche/?q=mongo');
      await page
        .locator('ul.ecoles')
        .getByRole('link', { name: /Groupe scolaire/ })
        .click();
      await expect(page).toHaveURL(/\/mongo-mpoukou\/groupe-scolaire-exemple\/$/);
    });
  });

  test.describe('autour de moi', () => {
    test('classe les écoles par distance, sans jamais envoyer la position', async ({
      page,
      context,
    }) => {
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: -4.7912, longitude: 11.9252, accuracy: 10 });
      const sorties: string[] = [];
      page.on('request', (r) => {
        if (r.url().includes('latitude') || r.url().includes('-4.79')) sorties.push(r.url());
      });
      await page.goto('/autour-de-moi/');
      await page.getByRole('button', { name: 'Trouver les écoles près de moi' }).click();
      const resultats = page.locator('ul.ecoles li');
      await expect(resultats.first()).toContainText('[Complexe scolaire Exemple]');
      await expect(resultats.first()).toContainText(/À \d+\s?m/);
      await expect(
        page.getByText(/Votre position reste sur votre téléphone/).first(),
      ).toBeVisible();
      expect(sorties).toEqual([]);
    });

    test('loin de toute école : le dit, sans rien inventer', async ({ page, context }) => {
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: -3.0, longitude: 14.0, accuracy: 10 });
      await page.goto('/autour-de-moi/');
      await page.getByRole('button', { name: 'Trouver les écoles près de moi' }).click();
      await expect(
        page.getByText(/Aucune école relevée à moins de 3\skm d’ici pour l’instant/),
      ).toBeVisible();
      await page.getByLabel('Jusqu’à').selectOption('30000');
      await expect(page.getByText(/Aucune école relevée à moins de 30\skm/)).toBeVisible();
    });

    test('une position refusée : un message, et la porte vers les villes', async ({
      page,
      context,
    }) => {
      await context.clearPermissions();
      await page.goto('/autour-de-moi/');
      await page.getByRole('button', { name: 'Trouver les écoles près de moi' }).click();
      await expect(
        page.getByText(/Vous avez refusé la position|n’a pas pu être lue/),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ou parcourez les villes' })).toBeVisible();
    });
  });

  test.describe('toutes les écoles, de la crèche au supérieur (ticket 12)', () => {
    test('la fiche dit le type, les niveaux et le programme de l’école', async ({ page }) => {
      await page.goto(`${TIE_TIE}complexe-scolaire-exemple/`);
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes.getByText('Privée', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Maternelle, Primaire')).toBeVisible();
      await expect(proprietes.getByText('Programme et langues', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Programme français-congolais, bilingue')).toBeVisible();
      // Tout est renseigné : rien à ranger parmi ce qui manque.
      const manque = page.locator('.fiche-cote');
      await expect(manque).not.toContainText("Type d'école");
      await expect(manque).not.toContainText('Niveaux');
    });

    test('un type « Pas indiqué » ou l’absence de niveaux ne s’écrit pas : ils rejoignent « Pas encore sur la fiche »', async ({
      page,
    }) => {
      await page.goto(`${TIE_TIE}ecole-sans-detail-exemple/`);
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes).not.toContainText('Pas indiqué');
      await expect(proprietes).not.toContainText('Non indiqués');
      await expect(proprietes.getByText('Type', { exact: true })).toHaveCount(0);
      await expect(proprietes.getByText('Niveaux', { exact: true })).toHaveCount(0);
      await expect(proprietes.getByText('Programme et langues')).toHaveCount(0);
      const manque = page.locator('.fiche-cote');
      await expect(manque).toContainText("Type d'école");
      await expect(manque).toContainText('Niveaux');
    });

    test('un type « Autre » ne s’écrit pas non plus, et « Autre formation » est un niveau comme un autre', async ({
      page,
    }) => {
      await page.goto(`${TIE_TIE}centre-de-formation-exemple/`);
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes.getByText('Autre formation', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Type', { exact: true })).toHaveCount(0);
      await expect(page.locator('.fiche-cote')).toContainText("Type d'école");
    });

    test('un cycle à filières dit ce qui manque, ou ce qui est noté', async ({ page }) => {
      // Le centre de formation a une formation notée : rien à signaler pour lui.
      await page.goto(`${TIE_TIE}centre-de-formation-exemple/`);
      await expect(page.locator('.fiche-cote')).not.toContainText('Séries ou filières');
      await expect(page.getByRole('region', { name: 'Formations' })).toContainText(
        'Couture et stylisme',
      );
    });

    test('la liste écrit niveaux, type et repère, sans jamais écrire « Pas indiqué »', async ({
      page,
    }) => {
      await page.goto(TIE_TIE);
      const liste = page.locator('ul.ecoles');
      await expect(liste.getByRole('link', { name: /Complexe scolaire Exemple/ })).toContainText(
        'Maternelle · Primaire · Privée',
      );
      // Le nom, puis le niveau et les formations (le type « Autre » ne s'écrit pas), puis l'état : rien d'autre.
      await expect(liste.getByRole('link', { name: /Centre de formation Exemple/ })).toHaveText(
        /^\[Centre de formation Exemple\]\s*Autre formation · 1 formation\s*Vue sur place$/,
      );
      await expect(liste.getByRole('link', { name: /École sans détail/ })).toHaveText(
        /^\[École sans détail Exemple\]\s*Ajoutée par NTanova, pas encore vue sur place$/,
      );
      await expect(liste).not.toContainText('Pas indiqué');
    });

    test('la fiche donne la date du relevé, pas celle de la dernière modification', async ({
      page,
    }) => {
      // Vue le 2 novembre, modifiée depuis le 20 : elle dit toujours « vue sur place le 2 novembre ».
      await page.goto(`${TIE_TIE}centre-de-formation-exemple/`);
      await expect(page.getByText(/Vue sur place le 2 novembre 2026/)).toBeVisible();
      await expect(page.getByText(/20 novembre/)).toHaveCount(0);
    });

    test('sans date de relevé, la fiche ne se dit jamais vue sur place (ticket #99)', async ({
      page,
    }) => {
      await page.goto(`${TIE_TIE}ecole-sans-detail-exemple/`);
      await expect(page.getByText(/Ajoutée par NTanova/)).toBeVisible();
      await expect(page.getByText(/Vue sur place le/)).toHaveCount(0);
      await expect(page.getByText(/5 novembre/)).toHaveCount(0);
    });

    test('la description de la page d’une zone va de la crèche au supérieur', async ({ page }) => {
      await page.goto(TIE_TIE);
      await expect(page.locator('meta[name=description]')).toHaveAttribute(
        'content',
        /de la crèche au supérieur/,
      );
    });
  });

  test('le code de la fiche de liaison part sur WhatsApp, sans JavaScript', async ({ page }) => {
    await page.goto('/pour-les-ecoles/');
    const formulaire = page.locator('form');
    await expect(formulaire).toHaveAttribute('action', /^https:\/\/wa\.me\/\d+$/);
    await expect(formulaire).toHaveAttribute('method', 'get');
    await expect(page.getByLabel('Le code à 4 chiffres écrit dessus')).toHaveAttribute(
      'name',
      'text',
    );
  });

  test('« À propos » dit ce qui est publié, ce qui est gardé, et la loi', async ({ page }) => {
    await page.goto('/a-propos/');
    await expect(page.getByRole('heading', { name: 'Ce que nous publions' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ce que nous gardons pour nous' }),
    ).toBeVisible();
    await expect(page.getByText(/loi congolaise n°\s29-2019 du 10\soctobre 2019/)).toBeVisible();
  });

  test('« À propos » donne un délai pour corriger, retirer ou effacer', async ({ page }) => {
    await page.goto('/a-propos/');
    const droits = page.locator('section.droits');
    await expect(droits.getByRole('heading', { name: 'Vos droits' })).toBeVisible();
    // La phrase entière, pour qu'un espace perdu autour du délai (« faisonssous 7 jours ») se voie.
    await expect(droits.getByRole('paragraph')).toContainText(/nous le faisons sous\s7\sjours\./);
  });

  test('l’ancienne adresse d’une fiche fusionnée renvoie vers l’école gardée, sans JavaScript', async ({
    request,
  }) => {
    const reponse = await request.get(`${TIE_TIE}ancienne-fiche-exemple/`);
    expect(reponse.status()).toBe(200);
    const html = await reponse.text();
    expect(html).toContain(
      `<meta http-equiv="refresh" content="0; url=${TIE_TIE}complexe-scolaire-exemple/">`,
    );
    expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
  });

  test('les adresses d’avant les villes renvoient vers les nouvelles, sans JavaScript', async ({
    request,
  }) => {
    for (const [ancienne, nouvelle] of [
      ['/ecoles/tie-tie/', TIE_TIE],
      ['/ecoles/tie-tie/complexe-scolaire-exemple/', `${TIE_TIE}complexe-scolaire-exemple/`],
      ['/ecoles/tie-tie/carte/', '/cartes/congo/pointe-noire/tie-tie/'],
      ['/ecoles/tie-tie/carte/coin-1/', '/cartes/congo/pointe-noire/tie-tie/coin_1/'],
    ] as const) {
      const reponse = await request.get(ancienne);
      expect(reponse.status(), ancienne).toBe(200);
      const html = await reponse.text();
      expect(html, ancienne).toContain(`<meta http-equiv="refresh" content="0; url=${nouvelle}">`);
      expect(html, ancienne).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
    }
  });

  test('une adresse inconnue renvoie la page introuvable', async ({ page }) => {
    const reponse = await page.goto('/cette-page-n-existe-pas/');
    expect(reponse?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    // Une école retirée n'a plus de page : rien d'elle n'est dit, pas même son nom.
    await expect(page.getByText(/n'est plus publiée/)).toBeVisible();
  });
});

// Ticket #101 : un lien partagé sur WhatsApp montre l'école (OpenGraph, image construite avec le site, JSON-LD).
test.describe('le partage d’un lien', () => {
  const meta = (page: import('@playwright/test').Page, propriete: string) =>
    page.locator(`meta[property="${propriete}"]`).getAttribute('content');

  for (const adresse of pagesSansJavaScript) {
    test(`${adresse} : titre, description, adresse canonique et image de partage`, async ({
      page,
      request,
    }) => {
      await page.goto(adresse);
      expect(await meta(page, 'og:title')).toBeTruthy();
      expect(await meta(page, 'og:description')).toBeTruthy();
      expect(await meta(page, 'og:url')).toMatch(/^https:\/\/ntanova\.com\//);
      const image = await meta(page, 'og:image');
      expect(image).toMatch(/^https:\/\/ntanova\.com\/partage\/.+\.png$/);
      // L'image existe dans le site construit, et c'est un PNG léger.
      const reponse = await request.get(new URL(image ?? '').pathname);
      expect(reponse.status()).toBe(200);
      expect(reponse.headers()['content-type']).toContain('image/png');
      expect((await reponse.body()).length).toBeLessThan(300_000);
    });
  }

  test('une fiche a son image, sa preuve dans la description, et ses données schema.org, sans rien de privé', async ({
    page,
  }) => {
    await page.goto('/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/');
    expect(await meta(page, 'og:image')).toBe(
      'https://ntanova.com/partage/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple.png',
    );
    expect(await meta(page, 'og:description')).toContain('Vue sur place le 2 novembre 2026');
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(
      'https://ntanova.com/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/',
    );
    const brut = await page.locator('script[type="application/ld+json"]').textContent();
    const donnees = JSON.parse(brut ?? '{}') as Record<string, unknown>;
    expect(donnees['@type']).toBe('School');
    expect(donnees.name).toBe('[Complexe scolaire Exemple]');
    expect(brut).not.toMatch(/whatsapp|direction|contact/i);
  });
});

// Ticket 102 : les données de la carte, construites avec le site (le même instantané que les pages).
test.describe('les données de la carte', () => {
  test('les écoles : celles que des relais ont vues sur place, avec tous leurs cycles, et rien de privé', async ({
    request,
  }) => {
    const reponse = await request.get('/carte/ecoles.geojson');
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()['content-type']).toContain('geo+json');
    const brut = await reponse.text();
    const ecoles = JSON.parse(brut) as {
      type: string;
      features: { geometry: { coordinates: number[] }; properties: Record<string, unknown> }[];
    };
    expect(ecoles.type).toBe('FeatureCollection');
    const noms = ecoles.features.map((f) => f.properties.nom);
    expect(noms).toContain('[Complexe scolaire Exemple]');
    // Ajoutée par NTanova, ou sans position : pas sur la carte.
    expect(noms).not.toContain('[École ajoutée Exemple]');
    expect(noms).not.toContain('[École sans détail Exemple]');
    const complexe = ecoles.features.find(
      (f) => f.properties.nom === '[Complexe scolaire Exemple]',
    );
    expect(complexe?.properties).toMatchObject({
      niveaux: ['Maternelle', 'Primaire'],
      cycle: 'primaire',
      lettre: 'P',
      preuve: 'terrain',
    });
    expect(brut).not.toMatch(/0600000|whatsapp|contact/i);
  });

  test('les zones : leur état public, leurs compteurs, jamais « complet »', async ({ request }) => {
    const reponse = await request.get('/carte/zones.geojson');
    expect(reponse.status()).toBe(200);
    const zones = (await reponse.json()) as {
      features: {
        geometry: { type: string };
        properties: { nom: string; genre: string; etat: string; libelle: string; vues: number };
      }[];
    };
    const tieTie = zones.features.find((f) => f.properties.nom === 'Tié-Tié');
    expect(tieTie?.geometry.type).toBe('MultiPolygon');
    expect(tieTie?.properties).toMatchObject({ etat: 'actif', libelle: 'Relevé en cours' });
    const brazzaville = zones.features.find(
      (f) => f.properties.nom === 'Brazzaville' && f.properties.genre === 'ville',
    );
    expect(brazzaville?.geometry.type).toBe('Point');
    expect(brazzaville?.properties).toMatchObject({
      etat: 'programme',
      libelle: 'Déploiement programmé',
    });
    expect(JSON.stringify(zones)).not.toMatch(/complet/i);
  });
});
