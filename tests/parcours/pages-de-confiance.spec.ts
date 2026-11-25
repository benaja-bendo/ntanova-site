import { expect, test, type Page } from '@playwright/test';

// Ticket 149 (décision du fondateur du 08/11/2026) : Méthode, Données, Confidentialité, Mentions légales. Ce qu'une
// administration, une direction ou une famille lit pour savoir à qui elle a affaire. Les pages sont construites avec le site
// (catalogue fictif) : aucune ne dépend d'un chiffre écrit à la main.
// Lot 4 de la refonte (24/11/2026) : Fiabilité des informations et Données de l'annuaire suivent les planches « Points de
// repère » ; les tests de Méthode et de Données sont réécrits sur elles (la planche gagne sur un test, règle du 16/11).
const PAGES = [
  ['/methode/', 'Des informations datées, avec leur origine.'],
  ['/donnees/', 'Ce que NTanova a publié'],
  ['/confidentialite/', 'Vos données personnelles'],
  ['/mentions-legales/', 'Mentions légales'],
] as const;
const COMPLEXE = '/ecoles/complexe-scolaire-exemple-482913/';

// L'ordre de lecture des mentions (`ORDRE_DES_MENTIONS`) : d'où vient la fiche, puis la confirmation. Pas un ordre de valeur.
const MENTIONS = [
  'Vue sur place',
  'Déclarée par l’école',
  'Ajoutée par NTanova',
  'Confirmée par la direction',
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
      // Refonte publique, lot 1 : « Fiabilité des informations » et « Données de l'annuaire » sous « Comprendre nos
      // informations », la confidentialité et les mentions légales sous « NTanova ». Les adresses ne changent pas.
      const pied = page.locator('footer');
      for (const [nom, href] of [
        ['Fiabilité des informations', '/methode/'],
        ['Données de l’annuaire', '/donnees/'],
        ['Confidentialité', '/confidentialite/'],
        ['Mentions légales', '/mentions-legales/'],
      ] as const)
        await expect(pied.getByRole('link', { name: nom, exact: true })).toHaveAttribute(
          'href',
          href,
        );
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
    for (const [adresse] of [
      ...PAGES,
      ['/a-propos/'],
      ['/pour-les-ecoles/'],
      ['/pour-les-ecoles/outils/'],
    ] as const) {
      const html = await (await request.get(adresse)).text();
      const principal = /<main[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
      expect(principal, adresse).not.toMatch(/[\p{L}\d,;.:)]<(?:a|strong|span|b)\b/u);
      expect(principal, adresse).not.toMatch(/<\/(?:a|strong|span|b)>[\p{L}\d(]/u);
    }
  });

  test('« Comment nous vérifions une fiche » mène de la fiche à l’explication des mentions', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await page.getByRole('link', { name: 'Comment nous vérifions une fiche' }).click();
    await expect(page).toHaveURL('/methode/#m-mentions');
    await expect(
      page.getByRole('heading', { name: 'Ce que disent les mentions' }),
    ).toBeInViewport();
  });
});

test.describe('Fiabilité des informations', () => {
  test('dit ce que veut dire chaque mention, avec les mots de la fiche, sans hiérarchie ni note', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const mentions = page.locator('#m-mentions');
    for (const mention of MENTIONS) await expect(mentions).toContainText(mention);
    await expect(mentions).toContainText('Ce n’est ni une note, ni un classement');
    await expect(mentions).toContainText('Elles peuvent coexister');
    const texte = await textePrincipal(page);
    expect(texte).not.toMatch(/plus (forte|faible)|preuve la plus/i);
    // Ces mots sont ceux que la fiche affiche : la page ne peut pas dire autre chose.
    await page.goto(COMPLEXE);
    await expect(page.locator('.preuves')).toContainText('Vue sur place');
  });

  test('a ses six ancres, et garde les anciennes sur leur titre ou leur ligne', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const sommaire = page.getByRole('navigation', { name: 'Sur cette page' });
    await expect(sommaire.getByRole('link')).toHaveCount(6);
    for (const lien of await sommaire.getByRole('link').all()) {
      const ancre = (await lien.getAttribute('href'))!;
      await expect(page.locator(ancre)).toHaveCount(1);
    }
    for (const ancienne of [
      'mentions',
      'informations',
      'position',
      'references',
      'jamais-achete',
      'dater-corriger',
      'limites',
    ])
      await expect(page.locator(`#${ancienne}`), ancienne).toHaveCount(1);
  });

  test('dit qu’une référence d’agrément cite un document et ne garantit rien, et qu’une absence ne dit pas « non agréée »', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const references = page.locator('#references');
    await expect(references).toContainText('C’est une citation, pas une garantie de NTanova');
    await expect(references).toContainText('n’accorde aucun agrément');
    await expect(references).toContainText(
      'Une fiche sans référence ne dit pas que l’école n’en a pas',
    );
    await expect(references).toContainText(
      'Le jour où l’équipe a vu le document n’est pas affiché',
    );
    // Les intitulés viennent de la liste de la fiche.
    await expect(references).toContainText('agrément, autorisation d’ouverture, reconnaissance');
    await expect(page.locator('#m-champs')).toContainText('document pas encore vu');
  });

  test('dit ce qui ne s’achète pas, et ne promet ni gratuité ni couverture complète', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const jamais = page.locator('#jamais-achete');
    await expect(jamais).toContainText('Une mention, dont « Confirmée par la direction »');
    await expect(jamais).toContainText('elle ne change pas contre paiement');
    // Une prestation de communication n'existe pas encore : elle le dit, sans bouton.
    await expect(jamais.locator('.etiquette-prepare')).toHaveText('En préparation');
    await expect(jamais.getByRole('link')).toHaveCount(0);
    const texte = await textePrincipal(page);
    expect(texte).not.toMatch(/gratuit/i);
    await expect(page.locator('#limites')).toContainText(
      'Le nombre total d’écoles du Congo-Brazzaville est inconnu',
    );
  });

  test('dit que la position est mesurée ou posée par l’équipe, jamais inventée, et ce que montre la carte', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const position = page.locator('#position');
    await expect(position).toContainText('Le téléphone du relais');
    await expect(position).toContainText('sinon l’équipe');
    await expect(position).toContainText('Jamais inventée');
    await expect(position).toContainText('en tirets tant qu’aucun relais n’est passé');
  });

  test('ne promet sur les photos que ce que le code garde : contrôle, douze au plus, jamais une photo de travail', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const photos = page.locator('#m-photos');
    await expect(photos).toContainText('douze au plus');
    // Les mots du contrôle que la base exige de chaque image (`child_free_checked_at`), rien de plus.
    await expect(photos).toContainText(
      'Aucune image n’est publique avant d’être contrôlée : sans enfant ni personne reconnaissable.',
    );
    await expect(photos).not.toContainText(/nette|donnée personnelle/i);
    // La base ne garde pas la source d'une fiche ajoutée par l'équipe : la page n'en promet pas.
    await expect(page.locator('#m-entrees')).not.toContainText(/document|source/i);
    await expect(photos).toContainText(
      'les prospectus, les panneaux des formations et les photos de travail',
    );
    // La base ne garde pas d'accord daté de l'école pour la couverture et la galerie : la page ne le promet pas.
    await expect(photos).not.toContainText('accord daté');
  });

  test('distingue le numéro de l’enseigne et le contact autorisé, et soumet les frais au OUI daté', async ({
    page,
  }) => {
    await page.goto('/methode/');
    const champs = page.locator('#m-champs');
    await expect(champs.getByRole('rowheader', { name: 'Numéro de l’enseigne' })).toBeVisible();
    await expect(champs.getByRole('rowheader', { name: 'Contact de l’école' })).toBeVisible();
    await expect(champs).toContainText('Son accord daté pour publier ce numéro');
    await expect(page.locator('#m-frais')).toContainText('avec son OUI daté');
  });

  test('compte les mentions de l’annuaire telles qu’elles coexistent, et mène à Données', async ({
    page,
  }) => {
    await page.goto('/methode/');
    // Le faux catalogue a une fiche vue sur place et confirmée : elle compte dans les deux.
    await expect(page.locator('#m-mentions')).toContainText(
      'confirmée par sa direction, qui est aussi vue sur place',
    );
    await page.locator('#m-mentions').getByRole('link', { name: 'Données de l’annuaire' }).click();
    await expect(page).toHaveURL('/donnees/#mentions');
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
    await expect(page.locator('main')).toContainText('Chiffres arrêtés au');
    // Les quatre mentions sont toujours là, même à zéro, dans l'ordre de Fiabilité ; une fiche compte dans chacune des siennes.
    const mentions = page.locator('#mentions tbody th');
    await expect(mentions).toHaveText(MENTIONS);
    const nombres = (await page.locator('#mentions tbody td').allInnerTexts()).map(Number);
    expect(nombres.reduce((a, b) => a + b, 0)).toBeGreaterThan(recherche.length);
    await expect(page.locator('#mentions')).toContainText(
      'Sur 1 fiche confirmée par sa direction, 1 est aussi vue sur place',
    );
    await expect(page.locator('#mentions')).not.toContainText(/plus forte|classement des/);
    // Un lieu de la liste est un lien vers sa page.
    await expect(page.locator('#fiches tbody a').first()).toHaveAttribute(
      'href',
      /^\/ecoles\/[a-z-]+\/$/,
    );
  });

  test('distingue la construction, les dates des mentions et la dernière modification', async ({
    page,
  }) => {
    await page.goto('/donnees/');
    const dates = page.locator('#fraicheur');
    for (const terme of [
      'Construction du site',
      'Dernière modification d’une fiche',
      'Dates des mentions',
    ])
      await expect(dates.getByRole('term').filter({ hasText: terme })).toBeVisible();
    // « Ajoutée par NTanova » n'a pas de date : elle n'a pas de ligne dans les dates des mentions.
    await expect(dates.locator('table').first().locator('tbody th')).toHaveText([
      'Vue sur place',
      'Déclarée par l’école',
      'Confirmée par la direction',
    ]);
    await expect(dates).toContainText('« Ajoutée par NTanova » ne porte pas de date sur la fiche');
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
    // Les durées acceptées par le fondateur le 25/11/2026 : plus aucun crochet, une durée par donnée.
    await expect(page.locator('main .a-completer')).toHaveCount(0);
    expect(await textePrincipal(page)).not.toMatch(/\[[^\]]*\]/);
    const duree = (nom: RegExp) =>
      registre
        .filter({ has: page.locator('strong', { hasText: nom }) })
        .locator('dd')
        .last();
    for (const [nom, dit] of [
      [/^La fiche publique/, 'Après un retrait, gardée 12 mois, puis effacée'],
      [/^Les photos publiées/, 'Après un retrait, gardée 12 mois, puis effacée'],
      [/^Le contact privé/, 'Tant que la fiche existe ; effacé à votre demande sous 7 jours.'],
      [/^Les photos non publiées/, '12 mois après leur envoi.'],
      [/^Les relais/, '12 mois après la dernière fiche envoyée'],
      [/^Les relais/, 'Paie : 10 ans'],
      [/^Le journal technique/, '3 mois.'],
      [/^Les demandes de vérification/, '12 mois.'],
      [/par e-mail|^Vos messages à NTanova/, '12 mois après le dernier échange'],
    ] as const)
      await expect(duree(nom), dit).toContainText(dit);
    // Rien n'efface tout seul ces données : la page dit le ménage à la main, et sa conséquence.
    await expect(page.locator('#ce-que-nous-gardons')).toContainText(
      'NTanova efface à la main, deux fois par an, ce qui est arrivé à son terme',
    );
  });

  test('dit où sont les données, le transfert hors du Congo, et ne dit rien d’une déclaration à la commission', async ({
    page,
  }) => {
    await page.goto('/confidentialite/');
    await expect(
      page.getByRole('heading', { name: 'Ce que nous publions et ce que nous gardons' }),
    ).toBeVisible();
    await expect(page.getByText(/loi congolaise n°\s29-2019 du 10\soctobre 2019/)).toBeVisible();
    const lieux = page.locator('#ou-sont-les-donnees');
    await expect(lieux).toContainText('Supabase, région Paris');
    await expect(lieux).toContainText('Cloudflare');
    await expect(lieux).toContainText('article 23');
    await expect(lieux).toContainText('Cette démarche n’est pas encore faite.');
    const texte = await textePrincipal(page);
    expect(texte).not.toMatch(/déclaré(e)? (auprès|à) la commission|récépissé/i);
  });

  test('dit que le site ne dépose aucun cookie et ne garde pas la position', async ({ page }) => {
    await page.goto('/confidentialite/');
    await expect(page.locator('#visiteurs')).toContainText('Pas de compte, pas de cookie');
    await expect(page.locator('#visiteurs')).toContainText(
      'NTanova ne conserve pas vos coordonnées GPS',
    );
    // Le nombre que « Demander la vérification » garde dans le navigateur est dit (recette, 25/11).
    await expect(page.locator('#visiteurs')).toContainText('un nombre tiré au hasard');
    // Un site sans cookie n'en dépose aucun.
    expect(await page.context().cookies()).toEqual([]);
  });
});

test.describe('Mentions légales', () => {
  test('nomme l’éditeur et son statut, les hébergeurs et les crédits, sans loi applicable devinée', async ({
    page,
  }) => {
    await page.goto('/mentions-legales/');
    await expect(page.locator('#editeur')).toContainText('Responsable de la publication');
    await expect(page.locator('#editeur')).toContainText(
      'NTanova est un projet porté par une personne, sans société immatriculée à ce jour.',
    );
    await expect(page.locator('#editeur')).toContainText('Adresse : communiquée sur demande.');
    // La loi applicable est retirée tant qu'un juriste ne l'a pas écrite (fondateur, 25/11/2026). Plus aucun crochet, sauf les
    // deux réglages qu'une construction peut ne pas avoir.
    expect(await textePrincipal(page)).not.toMatch(
      /loi applicable|juridiction|\[(?!nom du responsable\]|adresse électronique\])/i,
    );
    const hebergement = page.locator('#hebergement');
    for (const nom of ['Cloudflare', 'Supabase', 'Infomaniak'])
      await expect(hebergement).toContainText(nom);
    const credits = page.locator('#creditsetlicences');
    await expect(credits).toContainText('OpenStreetMap');
    await expect(credits).toContainText('ODbL');
    await expect(credits.locator('a[href$="/donnees/#conditions"]')).toBeVisible();
  });
});
