import { expect, test, type Locator, type Page } from '@playwright/test';

// Audit du 05/11/2026, Vague 1 ; « Pour les écoles » et « Outils en préparation » (refonte publique, lot 5), « Comment les fiches sont tenues » (D4), la page introuvable (D22),
// et les détails de l'accueil, du pied de page et d'« Autour de moi » (D16, D17, D20).
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
});

/** Tout le texte de la page, réponses repliées comprises. */
const textePrincipal = async (page: Page) =>
  ((await page.locator('main').textContent()) ?? '').replace(/\s+/g, ' ');
const messageDe = async (lien: Locator) => {
  const href = (await lien.getAttribute('href')) ?? '';
  // Le numéro vient de la configuration : seulement la forme de l'adresse.
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
  return decodeURIComponent(href);
};

// Lot 5 de la refonte (25/11/2026) : la planche « Pour les écoles » remplace la page du 05/11 ; les deux tests qui protégeaient son
// seul bouton plein et son message unique sont réécrits (la planche gagne sur un test, règle du 16/11).
test('« Pour les écoles » : retrouver sa fiche ouvre l’annuaire publié, de plusieurs fiches à aucune', async ({
  page,
}) => {
  await page.goto('/pour-les-ecoles/');
  const recherche = page.getByRole('search', { name: 'Retrouver la fiche de mon école' });
  const champ = recherche.getByRole('searchbox', { name: 'Retrouver la fiche de mon école' });
  const chercher = recherche.getByRole('button', { name: 'Chercher' });
  // Vide ou des espaces : le navigateur refuse l'envoi, la page ne bouge pas.
  for (const vide of ['', '   ']) {
    await champ.fill(vide);
    await chercher.click();
    await expect(page).toHaveURL('/pour-les-ecoles/');
    expect(await champ.evaluate((e: HTMLInputElement) => e.validity.valid)).toBe(false);
  }
  const nombre = async (texte: string) => {
    await page.goto('/pour-les-ecoles/');
    await champ.fill(texte);
    await champ.press('Enter');
    await expect(page).toHaveURL(
      (u) => u.pathname === '/ecoles/' && u.searchParams.get('q') === texte,
    );
    await expect(page.locator('[data-liste][data-pret]')).toHaveCount(1);
    await page.waitForLoadState('networkidle');
    const dit = (await page.locator('[data-sous-titre]').innerText()).trim();
    return dit.startsWith('Aucune') ? 0 : Number(/^(\d+)/.exec(dit)?.[1] ?? NaN);
  };
  expect(await nombre('Groupe scolaire Exemple')).toBeGreaterThan(1);
  expect(await nombre('Collège de Dolisie')).toBe(1);
  await page
    .locator('[data-cartes]')
    .getByRole('link', { name: /Collège de Dolisie/ })
    .click();
  await expect(page).toHaveURL('/ecoles/college-de-dolisie-exemple-846271/');
  expect(await nombre('École Introuvable Zzz')).toBe(0);
  await expect(page.locator('[data-vide]')).toBeVisible();
  // Le nom cherché n'est recopié dans aucun lien de contact ou de formulaire de la page.
  const sorties = await page
    .locator('a[href*="wa.me"], a[href^="/contact"], a[href^="/contribuer"]')
    .evaluateAll((l) => l.map((x) => decodeURIComponent(x.getAttribute('href') ?? '')));
  expect(sorties.length).toBeGreaterThan(0);
  for (const s of sorties) expect(s).not.toMatch(/introuvable|zzz/i);
});

test('« Pour les écoles » : chaque service dit son état réel ; un service en préparation n’a ni bouton ni lien, aucun n’est à l’essai', async ({
  page,
}) => {
  await page.goto('/pour-les-ecoles/');
  const besoins = page.getByRole('region', { name: 'Trois besoins, et où nous en sommes' });
  const etat = (service: string) =>
    besoins.locator('.services li').filter({ hasText: service }).locator('[class^="etiquette-"]');
  for (const s of ['Relire, corriger', 'Confirmer sa fiche', 'Confirmer ses frais', 'Partager'])
    await expect(etat(s), s).toHaveText('Disponible');
  for (const s of ['Des visuels et des contenus', 'Inscriptions', 'Frais et reçus'])
    await expect(etat(s), s).toHaveText('En préparation');
  await expect(besoins.locator('.services a, .services button')).toHaveCount(0);
  // « À l'essai » s'explique dans la légende, et nulle part ailleurs.
  await expect(page.locator('main .etiquette-essai')).toHaveCount(1);
  await expect(besoins).toContainText('Aucun service n’est à l’essai');
  // Chaque « En savoir plus » mène à sa section.
  for (const lien of await besoins.getByRole('link').all())
    await expect(page.locator((await lien.getAttribute('href'))!)).toHaveCount(1);
  // Les pistes ouvrent une présentation.
  await page.getByRole('link', { name: 'Voir les deux pistes' }).click();
  await expect(page).toHaveURL('/pour-les-ecoles/outils/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('deux pistes');
});

test('« Pour les écoles » : chaque démarche est un message à envoyer soi-même ; agir, confirmer la fiche et publier les frais restent distincts', async ({
  page,
}) => {
  await page.goto('/pour-les-ecoles/');
  const main = page.getByRole('main');
  const message = (nom: string) => messageDe(main.getByRole('link', { name: nom }));
  const fiche = await message('Confirmer ma fiche');
  const frais = await message('Confirmer mes frais');
  expect(fiche).toContain('confirmer sa fiche');
  expect(fiche).not.toContain('frais');
  expect(frais).toContain('confirmer les frais');
  expect(frais).not.toContain('fiche');
  expect(await message('Corriger ma fiche')).toContain('corriger la fiche');
  expect(await message('Faire retirer une information')).toContain('retirer une information');
  expect(await message('Envoyer mes photos')).toContain('photos');
  expect(await message('Remettre notre mot')).toContain('mot de la direction');
  expect(await message('Écrire à NTanova')).toContain('une question');
  // Aucun geste de la page n'enregistre un accord : deux formulaires, vers la liste et vers WhatsApp, rien d'autre.
  const actions = await main
    .locator('form')
    .evaluateAll((l) => l.map((f) => [f.getAttribute('method'), f.getAttribute('action')]));
  expect(actions).toHaveLength(2);
  expect(actions[0]).toEqual(['get', '/ecoles/']);
  expect(actions[1]![0]).toBe('get');
  expect(actions[1]![1]).toMatch(/^https:\/\/wa\.me\/\d+$/);
  await expect(main.locator('input[type="checkbox"], input[type="file"]')).toHaveCount(0);
  const texte = await textePrincipal(page);
  expect(texte).toContain('n’enregistre aucun accord et ne prouve pas qui écrit');
  // Des phrases de l'ancienne page devenues fausses, et celles que la base ne tient pas.
  expect(texte).not.toMatch(/rien n.est ajouté/i);
  expect(texte).not.toMatch(/photos ne sont pas encore publiées/i);
  expect(texte).not.toMatch(/photos[^.]*avec votre accord/i);
  expect(texte).not.toMatch(/gratuit|référenc/i);
  await expect(main).toContainText(
    'Un numéro qui n’est pas sur l’enseigne ne paraît qu’avec votre accord daté',
  );
  // L'aperçu de fiche se dit « Exemple » et mène à la démonstration.
  await expect(page.getByRole('group', { name: 'Exemple de fiche, école inventée' })).toContainText(
    /Manguiers\s*Exemple/,
  );
  await expect(main.getByRole('link', { name: 'Voir la fiche de démonstration' })).toHaveAttribute(
    'href',
    '/demo/fiche-ecole/',
  );
});

test('« Outils en préparation » : une présentation ; l’exemple se dit tel, n’a rien à remplir et n’entre pas dans l’annuaire', async ({
  page,
  request,
}) => {
  await page.goto('/pour-les-ecoles/');
  await page.locator('footer').getByRole('link', { name: 'Outils en préparation' }).click();
  await expect(page).toHaveURL('/pour-les-ecoles/outils/');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  const main = page.getByRole('main');
  await expect(main).toContainText('Rien n’est ouvert');
  await expect(main.locator('form, input, button, select, textarea, dialog')).toHaveCount(0);
  await expect(main.locator('.etiquette-essai')).toHaveCount(0);
  // Les liens de la page : la présentation des écoles, l'exemple, et deux fois « raconter », rien d'autre.
  const liens = await main
    .getByRole('link')
    .evaluateAll((l) => l.map((x) => x.getAttribute('href') ?? ''));
  expect(liens.filter((h) => !h.startsWith('https://wa.me/'))).toEqual([
    '/pour-les-ecoles/',
    '#ou-exemple',
  ]);
  expect(liens).toHaveLength(4);
  for (const lien of [
    main.getByRole('link', { name: 'Raconter votre dernière rentrée' }),
    main.getByRole('link', { name: 'Nous le raconter' }),
  ])
    expect(await messageDe(lien)).not.toMatch(/élève|inscri|essay/i);
  await expect(main).toContainText('N’écrivez ni nom ni document d’élève');
  // Chaque récit de l'exemple porte son étiquette.
  for (const exemple of [
    page.getByRole('heading', { name: /École Les Manguiers/ }),
    page.getByRole('heading', { name: /Le dossier 016/ }),
    page.locator('.recu'),
    page.getByRole('group', { name: 'Exemple d’espace famille, inventé' }),
  ])
    await expect(exemple).toContainText('Exemple');
  const texte = await textePrincipal(page);
  expect(texte).not.toMatch(/gratuit/i);
  // Les futurs outils ne sont dits ni construits, ni synchronisés.
  expect(texte).toContain('Rien n’en est construit');
  expect(texte).toContain('ne paraîtrait en ligne qu’après sa transmission');
  // La page est listée ; l'exemple n'est dans aucune sortie de l'annuaire.
  for (const index of ['/sitemap.xml', '/llms.txt'])
    expect(await (await request.get(index)).text()).toContain(
      'https://ntanova.com/pour-les-ecoles/outils/',
    );
  for (const sortie of ['/recherche.json', '/carte/ecoles.geojson', '/sitemap.xml', '/llms.txt'])
    expect(await (await request.get(sortie)).text(), sortie).not.toMatch(/Manguiers|0042/);
});

test('« Outils en préparation » : le dossier 016 dit les mêmes faits dans le tableau, la chronologie, le reçu et chez la famille', async ({
  page,
}) => {
  await page.goto('/pour-les-ecoles/outils/');
  const lu = async (l: Locator) => (await l.innerText()).replace(/\s+/g, ' ');
  const ligne = await lu(page.getByRole('row', { name: /^016/ }));
  const note = await lu(page.getByRole('region', { name: 'Ce que l’école note' }));
  const recu = await lu(page.getByRole('region', { name: 'Le reçu' }));
  const famille = await lu(page.getByRole('region', { name: 'Ce que la famille verrait' }));
  for (const dit of ['20 000 sur 30 000 FCFA', 'Admis le 14 juin', 'Confirmée le 28 juin'])
    expect(ligne).toContain(dit);
  for (const dit of ['20 000 FCFA reçus', 'Reçu n° 0042', '28 juin', '15 000 FCFA'])
    expect(note).toContain(dit);
  for (const dit of [
    'Reçu n° 0042',
    '28 juin 2027',
    '20 000 FCFA',
    '15 000 · soldée',
    '5 000 sur 15 000',
    '10 000 FCFA',
    '30 000 FCFA',
    'Dossier 016',
  ])
    expect(recu).toContain(dit);
  for (const dit of [
    'Dossier 016',
    'Inscription confirmée le 28 juin',
    'Reçu n° 0042',
    '20 000 FCFA',
    '10 000 FCFA',
    '2e échéance · octobre',
  ])
    expect(famille).toContain(dit);
  // Confirmée sur dérogation sans être soldée : le 018.
  await expect(page.getByRole('row', { name: /^018/ })).toContainText('sur dérogation');
});

test('les pages de zone et l’accueil parlent de « Ajouter mon école » et de « Confirmer », jamais de « Référencez »', async ({
  page,
}) => {
  await page.goto('/ecoles/pointe-noire/tie-tie/');
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Ajouter mon école' }),
  ).toHaveAttribute('href', '/pour-les-ecoles/#referencer');
  await expect(page.locator('main')).not.toContainText('Référencez');
  await page.goto('/');
  // Refonte publique, lot 1 : la porte des directions est « Présenter mon école », sous « Pour les écoles ».
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Présenter mon école' }),
  ).toHaveAttribute('href', '/pour-les-ecoles/');
  await expect(page.locator('main')).not.toContainText(/référenc/i);
});

// Lot 4 de la refonte (24/11/2026) : « À propos » suit sa planche (mission, organisation, périmètre, modèle économique) ; ce
// test, qui protégeait la page courte du 08/11, est réécrit sur elle (règle du 16/11). Ce qu'il gardait reste gardé : aucun
// périmètre écrit à la main, les pages de transparence, la loi et les droits sur « Confidentialité », les anciennes ancres.
test('« À propos » dit qui est NTanova, compte depuis le catalogue, et renvoie vers les pages de transparence (ticket 149)', async ({
  page,
  request,
}) => {
  const recherche = (await (await request.get('/recherche.json')).json()) as unknown[];
  await page.goto('/a-propos/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Choisir une école en sachant, pas en devinant.',
  );
  // Le périmètre : des nombres du catalogue, datés de la construction, jamais une date écrite à la main.
  await expect(page.getByRole('heading', { name: 'Notre périmètre' })).toBeVisible();
  const perimetre = page.locator('#a-per');
  await expect(perimetre.locator('.compteurs li').first()).toContainText(
    `${recherche.length} fiches publiées`,
  );
  await expect(perimetre).toContainText('Brazzaville, Dolisie et Pointe-Noire');
  await expect(perimetre).toContainText('nous ne disons jamais quelle part nous couvrons');
  await expect(page.locator('main')).not.toContainText('Au 5 novembre 2026');
  await expect(page.locator('main')).not.toContainText(/\[À (écrire|confirmer)/);
  await expect(page.locator('main')).not.toContainText(/gratuit/i);
  // Ce qui n'existe pas encore le dit : « En préparation », sans bouton.
  await expect(page.locator('#a-mod .etiquette-prepare')).toHaveText('En préparation');
  await expect(page.locator('#a-mod').getByRole('link')).toHaveCount(0);
  // Les données personnelles ont leur page : ni leur titre ni la loi ici.
  await expect(page.getByRole('heading', { name: 'Vos droits' })).toHaveCount(0);
  await expect(page.getByText(/loi congolaise/)).toHaveCount(0);
  await expect(page.locator('#transparence').getByRole('link')).toHaveText([
    /^Fiabilité des informations/,
    /^Données de l’annuaire/,
    /^Confidentialité/,
    /^Écrire à NTanova\s*Sur WhatsApp/,
  ]);
  await expect(page.getByRole('link', { name: 'Mentions légales' }).first()).toHaveAttribute(
    'href',
    '/mentions-legales/',
  );
  // Les anciennes ancres restent ; celle que visaient les fiches d'avant mène encore à la Méthode.
  for (const ancre of ['ce-que-nous-faisons', 'ce-que-nous-publions', 'transparence'])
    await expect(page.locator(`#${ancre}`)).toHaveCount(1);
  await expect(
    page.locator('#a-per').getByRole('link', { name: 'Fiabilité des informations' }),
  ).toHaveAttribute('href', '/methode/');
});

test('page introuvable : un accès direct aux écoles et à la carte, et le WhatsApp dans le pied', async ({
  page,
}) => {
  const reponse = await page.goto('/une-page-qui-n-existe-pas/');
  expect(reponse?.status()).toBe(404);
  const principal = page.locator('main');
  await expect(principal.getByRole('link', { name: 'Chercher une école' })).toHaveAttribute(
    'href',
    '/ecoles/',
  );
  // Lot 4 bis : la carte est la vue Carte de « Les écoles ».
  await expect(principal.getByRole('link', { name: 'Voir la carte' })).toHaveAttribute(
    'href',
    '/ecoles/?vue=carte',
  );
  await expect(principal.getByRole('link', { name: /Revenir à l.accueil/ })).toBeVisible();
  await expect(
    page.locator('footer').getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' }),
  ).toHaveAttribute('href', /wa\.me/);
});

test('le pied de page : quatre groupes de liens, et la phrase « NTanova · Congo-Brazzaville » tient sur une ligne', async ({
  page,
}) => {
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  // Refonte publique, lot 1 (canevas « Points de repère ») : quatre groupes ; aucun lien vers une page qui n'existe pas encore
  // (formulaires fermés : WhatsApp). Lot 4 : « Toutes les villes » remplace la liste des villes, comme la planche.
  await expect(pied.getByRole('list', { name: 'Chercher' }).getByRole('link')).toHaveText([
    'Les écoles',
    'Toutes les villes',
    'S’orienter',
  ]);
  await expect(
    pied.getByRole('list', { name: 'Chercher' }).getByRole('link', { name: 'Toutes les villes' }),
  ).toHaveAttribute('href', '/villes/');
  const ecoles = pied.getByRole('list', { name: 'Pour les écoles' });
  await expect(ecoles.getByRole('link')).toHaveText([
    'Présenter mon école',
    'Outils en préparation',
    'Ajouter mon école',
  ]);
  await expect(ecoles.getByRole('link', { name: 'Ajouter mon école' })).toHaveAttribute(
    'href',
    '/pour-les-ecoles/#referencer',
  );
  // Ticket 149 : les pages qu'une administration lit, sur toutes les pages publiques.
  const comprendre = pied.getByRole('list', { name: 'Comprendre nos informations' });
  await expect(comprendre.getByRole('link')).toHaveText([
    'Fiabilité des informations',
    'Données de l’annuaire',
    'Signaler une erreur',
  ]);
  await expect(comprendre.getByRole('link', { name: 'Signaler une erreur' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/\d+\?text=/,
  );
  await expect(pied.getByRole('list', { name: 'NTanova' }).getByRole('link')).toHaveText([
    'À propos',
    'Écrire à NTanova sur WhatsApp',
    'Confidentialité',
    'Mentions légales',
  ]);
  // Jamais « toutes les écoles » (règle du site public).
  await expect(pied).not.toContainText(/toutes les écoles/i);
  // La phrase : une seule ligne à toutes les largeurs.
  const phrase = pied.getByText('NTanova · Congo-Brazzaville');
  const boite = await phrase.boundingBox();
  const ligne = await phrase.evaluate((e) => parseFloat(getComputedStyle(e).lineHeight));
  expect(boite!.height).toBeLessThan(ligne * 1.5);
  // Chaque lien reste une cible de 44 px.
  for (const lien of await pied.getByRole('link').all())
    expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('le pied de page de téléphone reste serré : deux groupes par ligne, des lignes de 44 px et pas plus', async ({
  page,
}) => {
  test.skip((page.viewportSize()?.width ?? 0) > 400, 'téléphone seulement');
  await page.goto('/ecoles/');
  const pied = page.locator('footer');
  const [chercher, ecoles, comprendre] = await Promise.all(
    ['Chercher', 'Pour les écoles', 'Comprendre nos informations'].map((nom) =>
      pied.getByRole('list', { name: nom }).boundingBox(),
    ),
  );
  expect(Math.abs(chercher!.y - ecoles!.y), 'deux groupes sur la même ligne').toBeLessThan(2);
  expect(ecoles!.x).toBeGreaterThan(chercher!.x + chercher!.width);
  expect(comprendre!.y).toBeGreaterThanOrEqual(chercher!.y + chercher!.height);
  for (const lien of await pied.locator('nav').getByRole('link').all()) {
    const boite = (await lien.boundingBox())!;
    expect(boite.height, await lien.innerText()).toBeLessThanOrEqual(46);
  }
});

test('l’accueil : « Autour de moi » et chaque champ de la recherche sont des cibles de 44 px ; « Chercher » tient dans la recherche', async ({
  page,
}) => {
  await page.goto('/');
  const autour = (await page.getByRole('link', { name: 'Autour de moi' }).boundingBox())!;
  expect(autour.height).toBeGreaterThanOrEqual(44);
  const recherche = page.getByRole('search', { name: 'Chercher une école' });
  const cadre = (await recherche.boundingBox())!;
  for (const nom of ['Quoi ?', 'Où ?']) {
    const champ = (await recherche.getByRole('searchbox', { name: nom }).boundingBox())!;
    expect(champ.height, nom).toBeGreaterThanOrEqual(44);
  }
  const bouton = (await recherche.getByRole('button', { name: 'Chercher' }).boundingBox())!;
  expect(bouton.height).toBeGreaterThanOrEqual(44);
  expect(bouton.x).toBeGreaterThanOrEqual(cadre.x);
  expect(bouton.x + bouton.width).toBeLessThanOrEqual(cadre.x + cadre.width);
  expect(bouton.y + bouton.height).toBeLessThanOrEqual(cadre.y + cadre.height);
});
