import { expect, test, type Locator, type Page } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
});

/** Le nom d'une cible pour le message d'erreur : son texte, ou celui qu'elle donne au lecteur d'écran (un lien de la carte, en SVG). */
const nomDe = async (cible: Locator) =>
  (await cible.getAttribute('aria-label')) ?? (await cible.textContent()) ?? '';

// Le site public, construit avec le catalogue fictif : Pointe-Noire (quatre écoles à Tié-Tié, une école à deux
// campus à Loandjili et à Mongo-Mpoukou, un institut supérieur), Brazzaville et Dolisie.
// Chaque page : en français, sans JavaScript (sauf « Rechercher » et « Autour de moi », qui filtrent dans le
// navigateur), sans ressource extérieure, lisible dans 360 px, avec des cibles d'au moins 44 px.

const TIE_TIE = '/ecoles/pointe-noire/tie-tie/';

const pagesSansJavaScript = [
  '/',
  '/ecoles/pointe-noire/',
  TIE_TIE,
  '/ecoles/pointe-noire/ngoyo/',
  '/ecoles/pointe-noire/loandjili/quartier-exemple/',
  '/ecoles/brazzaville/',
  '/ecoles/dolisie/',
  '/ecoles/complexe-scolaire-exemple-482913/',
  '/ecoles/centre-de-formation-exemple-315702/',
  '/ecoles/ecole-sans-detail-exemple-270846/',
  '/ecoles/ecole-ajoutee-exemple-639158/',
  '/ecoles/groupe-scolaire-exemple-158427/',
  '/ecoles/groupe-scolaire-exemple-904316/',
  '/ecoles/institut-superieur-exemple-527064/',
  '/ecoles/ecole-de-brazzaville-exemple-731590/',
  '/pour-les-ecoles/',
  '/a-propos/',
  // Ticket 149 : les pages qu'une administration lit.
  '/methode/',
  '/donnees/',
  '/confidentialite/',
  '/mentions-legales/',
];

// Ticket 146 : « Écoles » a repris « Rechercher » et « Autour de moi » ; c'est la seule page publique qui filtre.
const pagesAvecJavaScript = ['/ecoles/'];

// Les fiches d'école : sans JavaScript, sauf le petit script inline du bouton « Partager » (quatrième exception de poids).
const fichesDEcole = [
  '/ecoles/complexe-scolaire-exemple-482913/',
  '/ecoles/centre-de-formation-exemple-315702/',
  '/ecoles/ecole-sans-detail-exemple-270846/',
  '/ecoles/ecole-ajoutee-exemple-639158/',
  '/ecoles/groupe-scolaire-exemple-158427/',
  '/ecoles/groupe-scolaire-exemple-904316/',
  '/ecoles/institut-superieur-exemple-527064/',
  '/ecoles/ecole-de-brazzaville-exemple-731590/',
];

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
    test(`${adresse} : HTML lisible, 360 px, cibles de 44 px`, async ({ page, baseURL }) => {
      await pageLisible(page, baseURL, adresse);
      expect(await page.locator('script:not([type="application/ld+json"])').count()).toBe(
        adresse === '/' || fichesDEcole.includes(adresse) ? 1 : 0,
      );
      // Sur une fiche, ce seul script est écrit dans la page (rien à télécharger) et sert « Partager ».
      if (fichesDEcole.includes(adresse)) {
        await expect(page.locator('script[src]')).toHaveCount(0);
        expect(
          await page.locator('script:not([type="application/ld+json"])').innerHTML(),
        ).toContain('data-partager');
      }
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
    await expect(page).toHaveURL(/\/ecoles\/pointe-noire\/$/);
    await expect(page.getByRole('heading', { name: 'Pointe-Noire', level: 1 })).toBeVisible();
    await page
      .getByRole('link', { name: /Tié-Tié.*Arrondissement 3.*4 écoles/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { name: 'Tié-Tié', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /\[Complexe scolaire Exemple\]/ }).click();

    await expect(page.getByRole('heading', { name: '[Complexe scolaire Exemple]' })).toBeVisible();
    await expect(page.getByText(/Vue sur place · 2 nov. 2026/)).toBeVisible();
    await expect(page.getByText(/Confirmée par la direction/)).toHaveCount(0);
    const puces = page.getByRole('list', { name: 'Niveaux et type d’école' });
    await expect(puces.getByRole('listitem').filter({ hasText: 'Maternelle' })).toBeVisible();
    await expect(puces.getByRole('listitem').filter({ hasText: 'Primaire' })).toBeVisible();
    await expect(page.getByRole('link', { name: '+242 06 000 00 01' })).toHaveAttribute(
      'href',
      'tel:+242060000001',
    );
    await expect(page.getByRole('link', { name: 'Y aller' })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-4.79105,11.925',
    );
    // « Confirmer cette fiche » ouvre WhatsApp avec le nom de l'école, son lieu et l'adresse de sa fiche : NTanova sait de
    // quelle fiche il s'agit sans rien redemander.
    const confirmer = page.getByRole('link', { name: 'Confirmer cette fiche' });
    const message = decodeURIComponent((await confirmer.getAttribute('href')) ?? '');
    expect(message).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(message).toContain('je dirige [Complexe scolaire Exemple]');
    expect(message).toContain('/ecoles/complexe-scolaire-exemple-482913/');
    // Le lieu s'écrit du plus fin au plus large, sans le pays : jamais « à Congo, Pointe-Noire, Tié-Tié ».
    expect(message).toContain('à [Quartier], Tié-Tié, Pointe-Noire, et je souhaite');
    expect(message).not.toContain('à Congo');
    // La description de la fiche (ce que Google et les aperçus de lien montrent) dit le même lieu.
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toContain(
      '[Complexe scolaire Exemple], à [Quartier], Tié-Tié, Pointe-Noire :',
    );
    expect(description).not.toContain('Congo');
    // Ce que NTanova demande se lit sur « Pour les écoles », un lien plus bas.
    await page.getByRole('link', { name: 'Ce que nous vous demanderons' }).click();
    await expect(page.getByRole('heading', { name: 'Vous dirigez une école ?' })).toBeVisible();
  });

  test.describe('du pays au quartier, plusieurs villes, un campus parmi d’autres', () => {
    test('le pays, la ville, l’arrondissement, le quartier : chaque niveau mène au suivant', async ({
      page,
    }) => {
      // Ticket 147 : le pays n'a plus de page, `/ecoles/` le porte (« Ville par ville »).
      await page.goto('/ecoles/');
      // Trois zones du pays ont des fiches : Pointe-Noire, Brazzaville, le Niari (Dolisie).
      await expect(page.locator('a.zone')).toHaveCount(3);
      await page.getByRole('link', { name: /Pointe-Noire.*7 écoles/ }).click();
      await page.getByRole('link', { name: /Loandjili.*Arrondissement 4.*2 écoles/ }).click();
      await expect(page).toHaveURL(/\/ecoles\/pointe-noire\/loandjili\/$/);
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
      await page.goto('/ecoles/pointe-noire/ngoyo/');
      await expect(page.getByRole('heading', { name: 'Ngoyo', level: 1 })).toBeVisible();
      // Ticket 146 : plus d'état de déploiement écrit sur une page de lieu.
      await expect(page.getByText('Aucune école publiée pour l’instant.')).toBeVisible();
    });

    test('une école à deux campus : chaque fiche a son implantation, ses formations et renvoie à l’autre', async ({
      page,
    }) => {
      await page.goto('/ecoles/groupe-scolaire-exemple-158427/');
      await expect(
        page.getByRole('heading', { name: '[Groupe scolaire Exemple]', level: 1 }),
      ).toBeVisible();
      await expect(page.getByText('Campus du quartier', { exact: true })).toBeVisible();
      await expect(page.getByText(/Confirmée par la direction · 4 nov. 2026/)).toBeVisible();
      // Le lieu, du plus fin au plus large, sans répéter Pointe-Noire (ville et département).
      await expect(page.locator('.fiche-lieu')).toHaveText(
        '[Quartier Exemple] · Loandjili · Pointe-Noire',
      );
      // Les deux preuves, l'une après l'autre, jamais fusionnées.
      await expect(page.getByText(/Vue sur place · 2 nov. 2026/)).toBeVisible();
      // Les formations du lycée, avec leurs liens vers les pages par série. Un seul cycle : le titre du bloc suffit.
      const formations = page.getByRole('region', { name: 'Formations' });
      await expect(formations.getByRole('heading', { name: 'Séries' })).toBeVisible();
      await expect(formations.getByRole('link', { name: 'Série C' }).first()).toHaveAttribute(
        'href',
        '/ecoles/?serie=c',
      );
      // L'autre implantation de la même école.
      await page.locator('.sites-ecole summary').click();
      const autres = page.getByRole('region', { name: 'Autres implantations' });
      await autres.getByRole('link', { name: /Campus de Mongo-Mpoukou/ }).click();
      await expect(page).toHaveURL(/\/ecoles\/groupe-scolaire-exemple-904316\/$/);
      await expect(
        page.getByText('Campus de Mongo-Mpoukou', { exact: true }).first(),
      ).toBeVisible();
      await page.locator('.sites-ecole summary').click();
      await expect(
        page
          .getByRole('region', { name: 'Autres implantations' })
          .getByRole('link', { name: /Campus du quartier/ }),
      ).toBeVisible();
    });

    test('un campus dans une ville sans arrondissement : la commune porte la fiche', async ({
      page,
    }) => {
      await page.goto('/ecoles/dolisie/');
      await page.getByRole('link', { name: /Collège de Dolisie Exemple/ }).click();
      await expect(page).toHaveURL(/\/ecoles\/college-de-dolisie-exemple-846271\/$/);
      await expect(
        page
          .getByRole('navigation', { name: 'Fil d’Ariane' })
          .getByRole('link', { name: 'Dolisie', exact: true }),
      ).toBeVisible();
    });

    test('les anciennes pages par formation mènent à la page « Écoles », filtrée de même (ticket 146)', async ({
      page,
    }) => {
      await page.goto('/formations/serie/c/');
      await expect(page).toHaveURL(/\/ecoles\/\?serie=c$/);
      await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
      await expect(
        page.locator('ul.liste-lignes').getByRole('link', { name: /\[Groupe scolaire Exemple\]/ }),
      ).toBeVisible();
      for (const ancienne of ['/formations/diplome/bts/', '/formations/rythme/weekend/']) {
        await page.goto(ancienne);
        await expect(page).toHaveURL(/\/ecoles\/\?(diplome=bts|rythme=weekend)$/);
        await expect(
          page
            .locator('ul.liste-lignes')
            .getByRole('link', { name: /\[Institut supérieur Exemple\]/ }),
        ).toBeVisible();
      }
    });
  });

  test.describe('rechercher une école', () => {
    test('par nom, puis par série du bac : les critères se combinent', async ({ page }) => {
      await page.goto('/ecoles/');
      const resultats = page.locator('ul.liste-lignes');
      await expect(page.locator('[data-compte]')).toHaveText(/^9 écoles/);
      // Le nom, sans accent ni tiret : « tie tie » trouve Tié-Tié.
      await page.getByLabel('Nom, quartier, repère ou filière').fill('tie tie');
      await expect(page.locator('[data-compte]')).toHaveText(/^4 écoles/);
      await page.getByLabel('Nom, quartier, repère ou filière').fill('');
      // La série C : une seule école, qui l'enseigne dans une formation du jour. Les filtres de formation sont repliés.
      await page.getByText('Plus de filtres').click();
      await page.getByLabel('Série du bac').selectOption('c');
      await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
      await expect(
        resultats.getByRole('link', { name: /\[Groupe scolaire Exemple\]/ }),
      ).toBeVisible();
      // Série C et cours du soir : c'est la même formation qui doit être des deux, pas deux formations différentes.
      await page.getByLabel('Rythme').selectOption('soir');
      await expect(page.getByText('Aucune école ne correspond.')).toBeVisible();
      // Série G (toutes les variantes) et cours du soir : la formation « Série G2 » est du jour et du soir.
      await page.getByLabel('Série du bac').selectOption('g');
      await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
    });

    test('par diplôme et par domaine, et la recherche se garde dans l’adresse', async ({
      page,
    }) => {
      await page.goto('/ecoles/?diplome=bts&domaine=informatique');
      await expect(page.getByLabel('Diplôme')).toHaveValue('bts');
      await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
      await expect(
        page
          .locator('ul.liste-lignes')
          .getByRole('link', { name: /\[Institut supérieur Exemple\]/ }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Lycée' }).click();
      await expect(page).toHaveURL(/niveau=L/);
      await expect(page.getByText('Aucune école ne correspond.')).toBeVisible();
    });

    test('dans une zone : tout ce qu’elle contient', async ({ page }) => {
      await page.goto('/ecoles/?zone=congo/pointe-noire/loandjili');
      await expect(page.locator('[data-compte]')).toHaveText(/^2 écoles/);
      await page.getByLabel('Lieu').selectOption('congo/brazzaville');
      await expect(page.locator('[data-compte]')).toHaveText(/^1 école/);
    });

    test('chaque résultat mène à la fiche de son campus', async ({ page }) => {
      await page.goto('/ecoles/?q=mongo');
      await page
        .locator('ul.liste-lignes')
        .getByRole('link', { name: /Groupe scolaire/ })
        .click();
      await expect(page).toHaveURL(/\/ecoles\/groupe-scolaire-exemple-904316\/$/);
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
      await page.goto('/ecoles/');
      await page.getByRole('button', { name: 'Autour de moi' }).click();
      const resultats = page.locator('ul.liste-lignes li');
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
      await page.goto('/ecoles/');
      await page.getByRole('button', { name: 'Autour de moi' }).click();
      await expect(
        page.getByText(/Aucune école relevée à moins de 3\skm d’ici pour l’instant/),
      ).toBeVisible();
      await page.getByRole('button', { name: '30 km' }).click();
      await expect(page.getByText(/Aucune école relevée à moins de 30\skm/)).toBeVisible();
    });

    test('une position refusée : un message, et la porte vers les villes', async ({
      page,
      context,
    }) => {
      await context.clearPermissions();
      await page.goto('/ecoles/');
      await page.getByRole('button', { name: 'Autour de moi' }).click();
      await expect(
        page.getByText(/Vous avez refusé la position|n’a pas pu être lue/),
      ).toBeVisible();
      // Les villes sont sur la même page, sous les résultats.
      await expect(page.getByRole('heading', { name: 'Ville par ville' })).toBeVisible();
    });
  });

  test.describe('toutes les écoles, de la crèche au supérieur (ticket 12)', () => {
    test('la fiche dit le type, les niveaux et le programme de l’école', async ({ page }) => {
      await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
      const proprietes = page.locator('dl.proprietes');
      // Le type et les niveaux sont des puces sous le nom (audit du 05/11, chantier 2), plus des lignes de tableau.
      const puces = page.getByRole('list', { name: 'Niveaux et type d’école' });
      await expect(puces.getByRole('listitem').filter({ hasText: 'Privée' })).toBeVisible();
      await expect(puces.getByRole('listitem').filter({ hasText: 'Maternelle' })).toBeVisible();
      await expect(puces.getByRole('listitem').filter({ hasText: 'Primaire' })).toBeVisible();
      await expect(proprietes.getByText('Programme et langues', { exact: true })).toBeVisible();
      await expect(proprietes.getByText('Programme français-congolais, bilingue')).toBeVisible();
      // Tout est renseigné : rien à ranger parmi ce qui manque.
      const manque = page.locator('.fiche-cote');
      await expect(manque).not.toContainText("Type d'école");
      await expect(manque).not.toContainText('Niveaux');
    });

    test('un type inconnu et des niveaux absents ne créent pas de contenu vide', async ({
      page,
    }) => {
      await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
      const proprietes = page.locator('dl.proprietes');
      await expect(proprietes).not.toContainText('Pas indiqué');
      await expect(proprietes).not.toContainText('Non indiqués');
      await expect(proprietes.getByText('Type', { exact: true })).toHaveCount(0);
      await expect(proprietes.getByText('Niveaux', { exact: true })).toHaveCount(0);
      await expect(proprietes.getByText('Programme et langues')).toHaveCount(0);
      const manque = page.locator('.fiche-cote');
      await expect(manque).not.toContainText("Type d'école");
      await expect(manque).not.toContainText('Niveaux');
    });

    test('un type « Autre » ne s’écrit pas non plus, et « Autre formation » est un niveau comme un autre', async ({
      page,
    }) => {
      await page.goto('/ecoles/centre-de-formation-exemple-315702/');
      const puces = page.getByRole('list', { name: 'Niveaux et type d’école' });
      // La puce porte la lettre du cycle (aria-hidden) puis son nom : « S Autre formation ».
      await expect(puces.getByRole('listitem')).toHaveText([/^S\s*Autre formation$/]);
      await expect(puces).not.toContainText('Autre,');
      await expect(page.locator('.fiche-cote')).not.toContainText("Type d'école");
    });

    test('un cycle à filières dit ce qui manque, ou ce qui est noté', async ({ page }) => {
      // Le centre de formation a une formation notée : rien à signaler pour lui.
      await page.goto('/ecoles/centre-de-formation-exemple-315702/');
      await expect(page.locator('.fiche-cote')).not.toContainText('Séries ou filières');
      await expect(page.getByRole('region', { name: 'Formations' })).toContainText(
        'Couture et stylisme',
      );
    });

    test('la liste écrit niveaux, type, repère et preuve, sans jamais écrire « Pas indiqué »', async ({
      page,
    }) => {
      await page.goto(TIE_TIE);
      const liste = page.locator('ul.liste-lignes');
      await expect(liste.getByRole('link', { name: /Complexe scolaire Exemple/ })).toContainText(
        'Maternelle et primaire · Privée',
      );
      // Le nom, le niveau (le type « Autre » ne s'écrit pas), le lieu, puis la preuve datée : rien d'autre. Sans repère,
      // la ligne ne dit rien (décision du fondateur du 08/11/2026 : plus d'état vide négatif).
      await expect(liste.getByRole('link', { name: /Centre de formation Exemple/ })).toHaveText(
        /^S\s*\[Centre de formation Exemple\]\s*S\s*Autre formation\s*Tié-Tié · Pointe-Noire\s*Vue sur place le \d+ \S+ 2026$/,
      );
      await expect(liste).not.toContainText('Repère pas encore relevé');
      // Ajoutée par NTanova : une seule mention, la preuve.
      await expect(liste.getByRole('link', { name: /École sans détail/ })).toHaveText(
        /^–\s*\[École sans détail Exemple\]\s*Tié-Tié · Pointe-Noire\s*Ajoutée par NTanova, pas encore vue sur place$/,
      );
      await expect(liste).not.toContainText('Pas indiqué');
    });

    test('la fiche donne la date du relevé, pas celle de la dernière modification', async ({
      page,
    }) => {
      // Vue le 2 novembre, modifiée depuis le 20 : elle dit toujours « vue sur place le 2 novembre ».
      await page.goto('/ecoles/centre-de-formation-exemple-315702/');
      await expect(page.getByText(/Vue sur place · 2 nov. 2026/)).toBeVisible();
      // La modification ne se lit qu'en pied de fiche, dite comme telle (canevas du 08/11/2026), jamais dans une preuve.
      await expect(page.locator('.preuves')).not.toContainText(/20 nov/);
      await expect(page.locator('.identifiant')).toContainText(
        'Fiche mise à jour le 20 novembre 2026',
      );
    });

    test('sans date de relevé, la fiche ne se dit jamais vue sur place (ticket #99)', async ({
      page,
    }) => {
      await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
      await expect(page.getByText(/Ajoutée par NTanova/)).toBeVisible();
      await expect(page.getByText(/Vue sur place ·/)).toHaveCount(0);
      await expect(page.locator('.preuves')).not.toContainText(/5 nov/);
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
    // Replié : un seul bouton plein sur la page, celui qui écrit sur WhatsApp ; le code s'ouvre d'un toucher.
    const liaison = page.locator('details.liaison');
    await expect(liaison).not.toHaveAttribute('open', '');
    await expect(page.getByLabel('Le code à 4 chiffres écrit dessus')).toBeHidden();
    await liaison.getByText('Vous avez reçu une fiche de liaison ?').click();
    await expect(page.getByLabel('Le code à 4 chiffres écrit dessus')).toBeVisible();
    const formulaire = page.locator('form');
    await expect(formulaire).toHaveAttribute('action', /^https:\/\/wa\.me\/\d+$/);
    await expect(formulaire).toHaveAttribute('method', 'get');
    await expect(page.getByLabel('Le code à 4 chiffres écrit dessus')).toHaveAttribute(
      'name',
      'text',
    );
  });

  test('« À propos » dit ce qui est publié et renvoie la loi et les droits vers « Confidentialité »', async ({
    page,
  }) => {
    await page.goto('/a-propos/');
    await expect(page.getByRole('heading', { name: 'Ce que nous publions' })).toBeVisible();
    await expect(page.getByText(/loi congolaise/)).toHaveCount(0);
    await page.goto('/confidentialite/');
    await expect(
      page.getByRole('heading', { name: 'Ce que nous publions et ce que nous gardons' }),
    ).toBeVisible();
    await expect(page.getByText(/loi congolaise n°\s29-2019 du 10\soctobre 2019/)).toBeVisible();
  });

  test('« Confidentialité » donne un délai pour corriger, retirer ou effacer, et dit ce que ce délai couvre', async ({
    page,
  }) => {
    await page.goto('/confidentialite/');
    const droits = page.locator('#droits');
    await expect(droits.getByRole('heading', { name: 'Vos droits' })).toBeVisible();
    // La phrase entière, pour qu'un espace perdu autour du délai (« faisonssous 7 jours ») se voie.
    await expect(droits).toContainText(/dans notre base\s+sous\s7\sjours\./);
    // Le délai vaut pour la base ; le site est mis à jour par étapes, et les copies des moteurs de recherche restent.
    await expect(droits).toContainText('ntanova.com qu’à la mise en ligne suivante');
    await expect(droits).toContainText('Les moteurs de recherche et les aperçus de lien');
  });

  // Ticket 147 : chaque adresse d'avant mène en un seul saut à celle d'aujourd'hui, sans JavaScript.
  test('les adresses d’avant, le lien court, un doublon fusionné et un ancien nom renvoient vers la fiche', async ({
    request,
  }) => {
    const FICHE = '/ecoles/complexe-scolaire-exemple-482913/';
    for (const [ancienne, nouvelle] of [
      // Le lien court, la seule forme courte.
      ['/ecoles/482913/', FICHE],
      // L'adresse d'avant le ticket 147, avec le pays et le département.
      ['/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/', FICHE],
      // Les lieux d'avant ; le pays mène à la liste.
      ['/ecoles/congo/pointe-noire/tie-tie/', TIE_TIE],
      ['/ecoles/congo/niari/dolisie/', '/ecoles/dolisie/'],
      ['/ecoles/congo/', '/ecoles/'],
      // Un ancien nom de la fiche, des deux formes.
      ['/ecoles/complexe-exemple-482913/', FICHE],
      ['/ecoles/congo/pointe-noire/tie-tie/complexe-exemple/', FICHE],
      // Un doublon fusionné : son adresse d'avant, son adresse et son lien court.
      ['/ecoles/congo/pointe-noire/tie-tie/ancienne-fiche-exemple/', FICHE],
      ['/ecoles/ancienne-fiche-exemple-362850/', FICHE],
      ['/ecoles/362850/', FICHE],
      // Les adresses d'avant les villes.
      ['/ecoles/tie-tie/', TIE_TIE],
      ['/ecoles/tie-tie/complexe-scolaire-exemple/', FICHE],
      // Ticket 146 : l'ancien plan dessiné mène à la seule carte, cadrée sur l'arrondissement (le « coin » d'abord à lui).
      ['/ecoles/tie-tie/carte/', '/carte/#'],
      ['/ecoles/tie-tie/carte/coin-1/', '/carte/#'],
    ] as const) {
      const reponse = await request.get(ancienne);
      expect(reponse.status(), ancienne).toBe(200);
      const html = await reponse.text();
      expect(html, ancienne).toContain(`<meta http-equiv="refresh" content="0; url=${nouvelle}`);
      expect(html, ancienne).toContain('<meta name="robots" content="noindex"');
      expect(html, ancienne).not.toMatch(/<script(?![^>]*application\/ld\+json)/);
    }
  });

  test('la fiche donne son identifiant et son lien court en pied de page (ticket 147)', async ({
    page,
  }) => {
    await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
    const pied = page.locator('.identifiant');
    await expect(pied).toContainText('Identifiant NTanova : 482913');
    await expect(pied.getByRole('link')).toHaveAttribute('href', '/ecoles/482913/');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      /\/ecoles\/complexe-scolaire-exemple-482913\/$/,
    );
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
    await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
    expect(await meta(page, 'og:image')).toBe(
      'https://ntanova.com/partage/ecoles/complexe-scolaire-exemple-482913.png',
    );
    expect(await meta(page, 'og:description')).toContain('Vue sur place · 2 nov. 2026');
    expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toBe(
      'https://ntanova.com/ecoles/complexe-scolaire-exemple-482913/',
    );
    const brut = await page.locator('script[type="application/ld+json"]').textContent();
    const donnees = JSON.parse(brut ?? '{}') as Record<string, unknown>;
    // Ticket 149 : un type précis par cycle enseigné (le Complexe d'exemple enseigne la maternelle et le primaire).
    expect(donnees['@type']).toEqual(['Preschool', 'ElementarySchool']);
    expect(donnees.identifier).toEqual({
      '@type': 'PropertyValue',
      propertyID: 'NTanova',
      value: '482913',
    });
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
      // Ticket 113 : de quoi trier, filtrer par cycle et composer l'aperçu sans table de correspondance dans l'îlot.
      rang: 2,
      lettres: 'MP',
      type: 'Privée',
      repere: '[face au marché]',
      preuve: 'terrain',
    });
    expect(brut).not.toMatch(/0600000|whatsapp|contact/i);
  });

  test('les zones : leur réglage, leurs compteurs, jamais d’état écrit ni « complet » (ticket 146)', async ({
    request,
  }) => {
    const reponse = await request.get('/carte/zones.geojson');
    expect(reponse.status()).toBe(200);
    const zones = (await reponse.json()) as {
      features: {
        geometry: { type: string };
        properties: { nom: string; genre: string; etat: string; vues: number };
      }[];
    };
    const tieTie = zones.features.find((f) => f.properties.nom === 'Tié-Tié');
    expect(tieTie?.geometry.type).toBe('MultiPolygon');
    expect(tieTie?.properties).toMatchObject({ etat: 'actif' });
    expect(tieTie?.properties).not.toHaveProperty('libelle');
    const brazzaville = zones.features.find(
      (f) => f.properties.nom === 'Brazzaville' && f.properties.genre === 'ville',
    );
    expect(brazzaville?.geometry.type).toBe('Point');
    expect(brazzaville?.properties).toMatchObject({ etat: 'programme' });
    expect(JSON.stringify(zones)).not.toMatch(/complet|Relevé en cours|Déploiement programmé/i);
  });
});
