import { expect, test, type Page } from '@playwright/test';

// Ticket 149 (décision du fondateur du 08/11/2026) : Méthode, Données, Confidentialité, Mentions légales. Ce qu'une
// administration, une direction ou une famille lit pour savoir à qui elle a affaire. Les pages sont construites avec le site
// (catalogue fictif) : aucune ne dépend d'un chiffre écrit à la main.
const PAGES = [
  ['/methode/', 'Comment nous tenons les fiches'],
  ['/donnees/', 'Ce que NTanova a publié'],
  ['/confidentialite/', 'Vos données personnelles'],
  ['/mentions-legales/', 'Mentions légales'],
] as const;
const COMPLEXE = '/ecoles/complexe-scolaire-exemple-482913/';

const MENTIONS = [
  'Confirmée par la direction',
  'Vue sur place',
  'Déclarée par l’école',
  'Ajoutée par NTanova',
];

async function textePrincipal(page: Page) {
  return (await page.locator('main').innerText()).replace(/\s+/g, ' ');
}

test.describe('les pages de transparence', () => {
  for (const [adresse, titre] of PAGES) {
    test(`${adresse} : existe, a son titre, est indexée et listée dans le plan du site`, async ({
      page,
      request,
    }) => {
      const reponse = await page.goto(adresse);
      expect(reponse?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(titre);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `https://ntanova.com${adresse}`,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      const plan = await (await request.get('/sitemap.xml')).text();
      expect(plan).toContain(`<loc>https://ntanova.com${adresse}</loc>`);
    });
  }

  test('le pied de page de chaque page publique les propose, et chaque lien mène à une page', async ({
    page,
  }) => {
    for (const adresse of ['/', '/ecoles/', '/carte/', '/a-propos/', COMPLEXE]) {
      await page.goto(adresse);
      const liens = page
        .locator('footer')
        .getByRole('list', { name: 'Transparence' })
        .getByRole('link');
      await expect(liens).toHaveText(['Méthode', 'Données', 'Confidentialité', 'Mentions légales']);
      await expect(liens).toHaveCount(4);
    }
    for (const [adresse] of PAGES) {
      await page.goto('/');
      await page.locator('footer').locator(`a[href="${adresse}"]`).click();
      await expect(page).toHaveURL(adresse);
    }
  });

  // Astro retire l'espace entre un mot et l'élément qui le suit quand elle tient à un retour à la ligne : « voirConfidentialité ».
  test('aucun lien, mot en gras ou crédit n’est collé au mot qui le précède ou qui le suit', async ({
    request,
  }) => {
    for (const [adresse] of [...PAGES, ['/a-propos/']] as const) {
      const html = await (await request.get(adresse)).text();
      const principal = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
      expect(principal, adresse).not.toMatch(/[\p{L}\d,;.:)]<(?:a|strong|span|b)\b/u);
      expect(principal, adresse).not.toMatch(/<\/(?:a|strong|span|b)>[\p{L}\d(]/u);
    }
  });

  test('« Comment nous vérifions une fiche » mène de la fiche à la Méthode', async ({ page }) => {
    await page.goto(COMPLEXE);
    await page.getByRole('link', { name: 'Comment nous vérifions une fiche' }).click();
    await expect(page).toHaveURL('/methode/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Comment nous tenons les fiches',
    );
  });
});

test.describe('Méthode', () => {
  test('dit ce que veut dire chaque mention de la fiche, avec les mots de la fiche', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const mentions = page.locator('#mentions');
    for (const mention of MENTIONS) await expect(mentions).toContainText(mention);
    // Ces mots sont ceux que la fiche affiche : la page ne peut pas dire autre chose.
    await page.goto(COMPLEXE);
    await expect(page.locator('.preuves')).toContainText('Vue sur place');
  });

  test('dit qu’une référence d’agrément cite un document et ne garantit rien, et qu’une absence ne dit pas « non agréée »', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const references = page.locator('#references');
    await expect(references).toContainText(
      'C’est une citation de document, pas une garantie de NTanova',
    );
    await expect(references).toContainText('n’accorde aucun agrément');
    await expect(references).toContainText(
      'Une fiche sans référence ne dit pas que l’école n’en a pas',
    );
    await expect(references).toContainText('Le jour où NTanova a vu le document n’est pas affiché');
    // Les intitulés viennent de la liste de la fiche.
    await expect(references).toContainText('agrément, autorisation d’ouverture, reconnaissance');
  });

  test('dit ce qui ne s’achète jamais, et ne promet ni gratuité ni couverture complète', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const jamais = page.locator('#jamais-achete');
    await expect(jamais).toContainText('La mention « Confirmée par la direction »');
    await expect(jamais).toContainText('on ne la modifie pas contre paiement');
    const texte = await textePrincipal(page);
    expect(texte).not.toMatch(/gratuit/i);
    await expect(page.locator('#limites')).toContainText(
      'Le nombre total d’écoles du Congo-Brazzaville est inconnu',
    );
  });

  test('dit que la position est mesurée ou posée par l’administration, jamais inventée', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const position = page.locator('#position');
    await expect(position).toContainText('mesurée par le relais');
    await expect(position).toContainText('l’administration de NTanova la pose');
    await expect(position).toContainText('jamais inventée');
  });
});

test.describe('Données', () => {
  test('compte les fiches publiées de la construction, en nombres et en dates, jamais en pourcentage', async ({
    page,
    request,
  }) => {
    const recherche = (await (await request.get('/recherche.json')).json()) as unknown[];
    await page.goto('/donnees/');
    await expect(page.locator('#fiches strong').first()).toHaveText(String(recherche.length));
    const texte = await textePrincipal(page);
    expect(texte).not.toContain('%');
    // Aucun chiffre suivi d'un signe de pourcentage (le mot peut servir à dire qu'on n'en donne pas).
    expect(texte).not.toMatch(/\d\s*%/);
    await expect(page.locator('.tete')).toContainText('Chiffres arrêtés au');
    // Les quatre preuves sont toujours là, même à zéro : c'est le vocabulaire de la Méthode.
    const preuves = page.locator('#preuves tbody th');
    await expect(preuves).toHaveText(MENTIONS);
    // Un lieu de la liste est un lien vers sa page.
    await expect(page.locator('#fiches tbody a').first()).toHaveAttribute(
      'href',
      /^\/ecoles\/[a-z-]+\/$/,
    );
  });

  test('dit qu’il n’y a pas de téléchargement libre, que le jeu complet se demande, et pose ses conditions', async ({
    page,
  }) => {
    await page.goto('/donnees/');
    const export_ = page.locator('#export');
    await expect(export_).toContainText('NTanova ne propose pas de téléchargement libre');
    await expect(export_).toContainText('sur demande');
    await expect(export_).toContainText('ministères, aux chercheurs et aux partenaires');
    await expect(export_).toContainText('Ce que le site charge lui-même');
    const conditions = page.locator('#conditions');
    await expect(conditions.getByRole('heading', { level: 2 })).toHaveText(
      'Conditions d’utilisation',
    );
    await expect(conditions).toContainText('ODbL');
    await expect(
      conditions.locator('a[href="https://opendatacommons.org/licenses/odbl/1-0/"]'),
    ).toBeVisible();
    await expect(conditions).toContainText('Laisser croire que NTanova est un service de l’État');
    // La source à citer porte la date de la construction, séparée du mot qui la précède (« du 8 novembre », pas « du8 novembre »).
    await expect(conditions).toContainText(/données du\s\d{1,2}\s\p{L}+\s\d{4}/u);
  });

  test('le fichier des zones porte le crédit d’OpenStreetMap et la licence ODbL ; celui des écoles non', async ({
    request,
  }) => {
    const zones = (await (await request.get('/carte/zones.geojson')).json()) as Record<
      string,
      unknown
    >;
    expect(zones.type).toBe('FeatureCollection');
    expect(zones.license).toBe('ODbL-1.0');
    expect(String(zones.attribution)).toContain('OpenStreetMap');
    expect(zones.licenseUrl).toBe('https://opendatacommons.org/licenses/odbl/1-0/');
    const ecoles = (await (await request.get('/carte/ecoles.geojson')).json()) as Record<
      string,
      unknown
    >;
    expect(ecoles.license).toBeUndefined();
  });
});

test.describe('Confidentialité', () => {
  test('dit pour chaque donnée gardée pourquoi, qui la voit et combien de temps, sans rien inventer', async ({
    page,
  }) => {
    await page.goto('/confidentialite/');
    const registre = page.locator('.registre > li');
    const n = await registre.count();
    expect(n).toBeGreaterThanOrEqual(6);
    for (const rubrique of ['Quoi', 'Pourquoi', 'Qui la voit', 'Combien de temps'])
      await expect(
        page.locator('.registre dt', { hasText: new RegExp(`^${rubrique}$`) }),
      ).toHaveCount(n);
    // Ce que NTanova ne sait pas encore reste entre crochets : une durée n'est jamais devinée.
    await expect(page.locator('main')).toContainText('[À fixer.]');
  });

  test('dit où sont les données, le transfert hors du Congo, et ne dit rien d’une déclaration à la commission', async ({
    page,
  }) => {
    await page.goto('/confidentialite/');
    const lieux = page.locator('#ou-sont-les-donnees');
    await expect(lieux).toContainText('Supabase, région Paris');
    await expect(lieux).toContainText('Cloudflare');
    await expect(lieux).toContainText('article 23');
    await expect(lieux).toContainText('[Où en est cette démarche');
    const texte = await textePrincipal(page);
    expect(texte).not.toMatch(/déclaré(e)? (auprès|à) la commission|récépissé/i);
  });

  test('dit que le site ne dépose aucun cookie et ne garde pas la position', async ({ page }) => {
    await page.goto('/confidentialite/');
    await expect(page.locator('#visiteurs')).toContainText('Pas de compte, pas de cookie');
    await expect(page.locator('#visiteurs')).toContainText(
      'NTanova ne conserve pas vos coordonnées GPS',
    );
    // Un site sans cookie n'en dépose aucun.
    expect(await page.context().cookies()).toEqual([]);
  });
});

test.describe('Mentions légales', () => {
  test('nomme l’éditeur, les hébergeurs et les crédits, et laisse les informations inconnues entre crochets', async ({
    page,
  }) => {
    await page.goto('/mentions-legales/');
    await expect(page.locator('#editeur')).toContainText('Responsable de la publication');
    await expect(page.locator('#editeur')).toContainText('[Statut juridique]');
    const hebergement = page.locator('#hebergement');
    for (const nom of ['Cloudflare', 'Supabase', 'Infomaniak'])
      await expect(hebergement).toContainText(nom);
    const credits = page.locator('#creditsetlicences');
    await expect(credits).toContainText('OpenStreetMap');
    await expect(credits).toContainText('ODbL');
    await expect(credits.locator('a[href$="/donnees/#conditions"]')).toBeVisible();
  });
});
