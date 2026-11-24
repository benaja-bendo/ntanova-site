import { expect, test, type Page } from '@playwright/test';

// Refonte publique, lot 1 (24/11/2026 ; canevas « Points de repère », lancement du fondateur qui accepte les cinq choix du
// lot) : l'accueil illustré, la recherche « Quoi ? / Où ? » jusqu'à la liste, le menu du téléphone, la fiche de démonstration.
// Remplace les parcours de l'accueil du lot 3 (15/11 : titre, « Pour mon enfant », « Vues sur place récemment », trois piliers
// sans Menu). Catalogue fictif : neuf écoles, sept à Pointe-Noire (dont quatre à Tié-Tié et deux à Loandjili), une à
// Brazzaville, une à Dolisie. La Liste ↔ Carte avec un lieu est dans les-ecoles-carte.spec.ts.

const quoi = (page: Page) => page.getByRole('searchbox', { name: 'Quoi ?' });
const ou = (page: Page) => page.getByRole('searchbox', { name: 'Où ?' });
const chercher = (page: Page) =>
  page
    .getByRole('search', { name: 'Chercher une école' })
    .getByRole('button', { name: 'Chercher' });
const sousTitre = (page: Page) => page.locator('[data-sous-titre]');
const puceDuLieu = (page: Page) => page.locator('[data-puces] [data-retirer-ou]');

/**
 * Le nombre d'écoles que dit la liste (« 4 écoles · … »), une fois le fichier de recherche lu et l'adresse appliquée : le
 * script pose `data-pret` avant de lire `/recherche.json`, d'où l'attente du réseau (sous charge, le nombre construit restait).
 */
async function nombreDeLaListe(page: Page): Promise<number> {
  await expect(page.locator('[data-liste][data-pret]')).toHaveCount(1);
  await page.waitForLoadState('networkidle');
  const texte = (await sousTitre(page).innerText()).trim();
  if (texte.startsWith('Aucune')) return 0;
  return Number(/^(\d+)/.exec(texte)?.[1] ?? NaN);
}

test.describe('l’accueil', () => {
  test('la promesse et « Quoi ? / Où ? » au premier écran ; « Trouver une école » est l’entrée courante', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(quoi(page)).toBeInViewport();
    await expect(ou(page)).toBeInViewport();
    await expect(chercher(page)).toBeInViewport();
    // Au téléphone, les entrées sont derrière « Menu » ; ailleurs, dans l'en-tête.
    const menu = page.locator('summary.menu-bouton');
    if (await menu.isVisible()) await menu.click();
    const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(navigation.getByRole('link')).toHaveText([
      'Trouver une école',
      'S’orienter',
      'Pour les écoles',
    ]);
    await expect(navigation.getByRole('link', { name: 'Trouver une école' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(navigation.getByRole('link', { name: 'Pour les écoles' })).toHaveAttribute(
      'href',
      '/pour-les-ecoles/',
    );
  });

  test('« Quoi ? » seul : la liste cherche le mot, et le parent arrive sur la fiche', async ({
    page,
  }) => {
    await page.goto('/');
    await quoi(page).fill('mongo');
    await chercher(page).click();
    await expect(page).toHaveURL(/\/ecoles\/\?q=mongo$/);
    await expect(page.getByRole('searchbox', { name: 'Chercher une école' })).toHaveValue('mongo');
    await page
      .locator('[data-cartes]')
      .getByRole('link', { name: /Groupe scolaire.*Mongo-Mpoukou/ })
      .click();
    await expect(page).toHaveURL(/\/ecoles\/groupe-scolaire-exemple-904316\/$/);
  });

  test('« Où ? » seul : la liste se limite au lieu écrit, sans accents ni majuscules, et le lieu se relit', async ({
    page,
  }) => {
    await page.goto('/');
    await ou(page).fill('TIE TIE');
    await chercher(page).click();
    await expect(page).toHaveURL(/\/ecoles\/\?ou=TIE\+TIE$/);
    await expect(puceDuLieu(page)).toContainText('TIE TIE');
    // Le même nombre que la page de l'arrondissement : quatre écoles à Tié-Tié.
    expect(await nombreDeLaListe(page)).toBe(4);
    await expect(page.locator('[data-cartes] > li')).toHaveCount(4);
  });

  test('« Quoi ? » et « Où ? » se croisent : aucun des deux ne se perd', async ({ page }) => {
    await page.goto('/ecoles/?q=groupe');
    const seul = await nombreDeLaListe(page);
    await page.goto('/');
    await quoi(page).fill('groupe');
    await ou(page).fill('mongo');
    await chercher(page).click();
    await expect(page).toHaveURL(/\/ecoles\/\?q=groupe&ou=mongo$/);
    const croise = await nombreDeLaListe(page);
    expect(croise).toBe(1);
    expect(seul).toBeGreaterThan(croise);
    await expect(page.locator('[data-cartes]')).toContainText('Mongo-Mpoukou');
  });

  test('les deux champs vides : toutes les écoles de l’annuaire, le nombre que dit l’accueil', async ({
    page,
  }) => {
    await page.goto('/');
    const lien = page.getByRole('link', { name: /^Voir les \d+ écoles$/ });
    const annonce = Number(/\d+/.exec(await lien.innerText())?.[0]);
    await chercher(page).click();
    // Le formulaire envoie deux champs vides ; la liste n'en garde rien dans son adresse.
    await expect(page).toHaveURL(/\/ecoles\/$/);
    expect(await nombreDeLaListe(page)).toBe(annonce);
    await expect(puceDuLieu(page)).toHaveCount(0);
  });

  test('le lieu se retire d’un geste sans perdre le niveau choisi', async ({ page }) => {
    await page.goto('/ecoles/?ou=loandjili&niveau=P');
    await expect(puceDuLieu(page)).toBeVisible();
    await expect(page.locator('[data-puces] .puce-choisie[data-valeur="P"]')).toBeVisible();
    await puceDuLieu(page).click();
    await expect(page).toHaveURL(/\/ecoles\/\?niveau=P$/);
    await expect(puceDuLieu(page)).toHaveCount(0);
    await expect(page.locator('[data-puces] .puce-choisie[data-valeur="P"]')).toBeVisible();
  });

  test('un lieu inconnu : aucune école, jamais un lieu supposé ; il se corrige ou se retire', async ({
    page,
  }) => {
    await page.goto('/ecoles/?ou=Ouesso&niveau=P');
    expect(await nombreDeLaListe(page)).toBe(0);
    await expect(page.locator('[data-cartes] > li')).toHaveCount(0);
    const vide = page.locator('[data-vide]');
    await expect(vide).toBeVisible();
    const lieu = vide.getByRole('searchbox', { name: 'Modifier le lieu' });
    await expect(lieu).toHaveValue('Ouesso');
    await expect(vide.getByRole('button', { name: /^Retirer le lieu « Ouesso »/ })).toBeVisible();
    await lieu.fill('loandjili');
    await vide.getByRole('button', { name: 'Chercher' }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?ou=loandjili&niveau=P$/);
    expect(await nombreDeLaListe(page)).toBeGreaterThan(0);
    await expect(vide).toBeHidden();
  });

  test('le retour du navigateur rend la liste avec son lieu', async ({ page }) => {
    await page.goto('/');
    await ou(page).fill('loandjili');
    await chercher(page).click();
    await expect(page).toHaveURL(/\?ou=loandjili$/);
    expect(await nombreDeLaListe(page)).toBe(2);
    await page.locator('[data-cartes] a').first().click();
    await expect(page).toHaveURL(/\/ecoles\/[a-z0-9-]+-\d{6}\/$/);
    await page.goBack();
    await expect(page).toHaveURL(/\?ou=loandjili$/);
    expect(await nombreDeLaListe(page)).toBe(2);
    await expect(puceDuLieu(page)).toBeVisible();
  });

  test('« Par niveau » : un lien par cycle publié, vers la liste filtrée', async ({ page }) => {
    await page.goto('/');
    const niveaux = page.getByRole('navigation', { name: 'Chercher par niveau' });
    // Le catalogue fictif n'a pas d'école technique : pas de lien « Technique ».
    await expect(niveaux.getByRole('link')).toHaveText([
      'Maternelle',
      'Primaire',
      'Collège',
      'Lycée',
      'Supérieur',
    ]);
    await niveaux.getByRole('link', { name: 'Lycée', exact: true }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?niveau=L$/);
    await expect(page.locator('[data-puces] .puce-choisie[data-valeur="L"]')).toBeVisible();
  });

  test('« Autour de moi » ouvre la liste sur le rayon de 3 km, sans demander la position avant l’appui', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Autour de moi' }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?rayon=3000$/);
    await expect(page.locator('[data-message]')).toContainText('Touchez « Autour de moi »');
    await expect(page.locator('[data-puces] .puce-choisie[data-rayon="3000"]')).toBeVisible();
  });

  test('cinq repères : deux services ouvrent une page, trois en préparation n’ont ni lien ni bouton', async ({
    page,
  }) => {
    await page.goto('/');
    const disponibles = page.getByRole('region', { name: 'Disponible' });
    await expect(disponibles.getByRole('heading', { level: 4 })).toHaveCount(2);
    await expect(disponibles.getByRole('link', { name: /^Voir les \d+ écoles$/ })).toHaveAttribute(
      'href',
      '/ecoles/',
    );
    await expect(disponibles.getByRole('link', { name: 'Fiche de démonstration' })).toHaveAttribute(
      'href',
      '/demo/fiche-ecole/',
    );
    const prepares = page.getByRole('region', { name: 'En préparation' });
    await expect(prepares.getByRole('heading', { level: 4 })).toHaveCount(3);
    await expect(prepares.getByRole('link')).toHaveCount(0);
    await expect(prepares.getByRole('button')).toHaveCount(0);
  });

  test('S’orienter : chaque situation ouvre la liste qui lui répond, au nombre annoncé', async ({
    page,
  }) => {
    await page.goto('/');
    const orienter = page.getByRole('region', { name: 'S’orienter, à chaque étape' });
    const situation = orienter.getByRole('link', { name: /^Après le CM2/ });
    await expect(situation).toHaveAttribute('href', '/ecoles/?niveau=C');
    const annonce = Number(/(\d+) écoles?/.exec(await situation.innerText())?.[1]);
    // Lot 2 : la page S'orienter et ses six activités, maintenant utilisables, chacune par son lien.
    await expect(
      orienter.getByRole('link', { name: /^Le parcours scolaire, les activités, les domaines/ }),
    ).toHaveAttribute('href', '/orienter/');
    await expect(orienter.getByRole('link', { name: /^Pas d’idée de métier/ })).toHaveAttribute(
      'href',
      '/orienter/#o-activites',
    );
    await situation.click();
    expect(await nombreDeLaListe(page)).toBe(annonce);
  });

  test('Par ville et le dessin : chaque ville publiée mène à sa page, avec le nombre de sa page', async ({
    page,
  }) => {
    await page.goto('/');
    const villes = page.getByRole('region', { name: 'Par ville' });
    // Trois villes, et « Voir toutes les villes » (lot 4 de la refonte, 24/11).
    await expect(villes.locator('a.ville')).toHaveCount(3);
    await expect(villes.getByRole('link', { name: 'Voir toutes les villes' })).toHaveAttribute(
      'href',
      '/villes/',
    );
    for (const [nom, lien, nombre] of [
      ['Brazzaville', '/ecoles/brazzaville/', '1 école'],
      ['Dolisie', '/ecoles/dolisie/', '1 école'],
      ['Pointe-Noire', '/ecoles/pointe-noire/', '7 écoles'],
    ] as const) {
      const carte = villes.getByRole('link', { name: new RegExp(`^${nom}`) });
      await expect(carte).toHaveAttribute('href', lien);
      await expect(carte).toContainText(nombre);
    }
    // Le dessin : un SVG décoratif, des étiquettes qui sont de vrais liens vers des pages publiées ; aucune carte interactive.
    await expect(page.locator('main canvas, main .maplibregl-map')).toHaveCount(0);
    await expect(page.locator('.dessin-carte')).toHaveAttribute('aria-hidden', 'true');
    const etiquettes = page.locator('.dessin-ville');
    expect(await etiquettes.count()).toBeGreaterThan(0);
    for (const e of await etiquettes.all())
      await expect(e).toHaveAttribute('href', /^\/ecoles\/[a-z-]+\/$/);
    await page.locator('.dessin-ville', { hasText: 'Pointe-Noire' }).click();
    await expect(page).toHaveURL(/\/ecoles\/pointe-noire\/$/);
  });

  test('Pour les écoles : « Présenter mon école », un outil en préparation sans lien, « Signaler une école » sur WhatsApp', async ({
    page,
  }) => {
    await page.goto('/');
    const directions = page.getByRole('region', { name: /Vous dirigez une école/ });
    await expect(directions.getByRole('link', { name: 'Présenter mon école' })).toHaveAttribute(
      'href',
      '/pour-les-ecoles/',
    );
    await expect(directions.getByRole('link')).toHaveCount(2);
    const signaler = directions.getByRole('link', { name: 'Signaler une école' });
    const adresse = (await signaler.getAttribute('href')) ?? '';
    // Le numéro vient de la configuration, jamais d'un test : seulement la forme de l'adresse.
    expect(adresse).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(adresse)).toContain('une école manque');
    // Aucun lien vers une page qui n'existe pas encore (formulaires du lot 3).
    await expect(page.locator('a[href^="/contact"], a[href^="/contribuer"]')).toHaveCount(0);
  });

  test('sans JavaScript, à 320 px : rien ne déborde, le menu s’ouvre et se ferme, la recherche part', async ({
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
    // Aucun script sur l'accueil, hors données structurées.
    await expect(page.locator('script:not([type="application/ld+json"])')).toHaveCount(0);
    const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(navigation).toHaveCount(0);
    const menu = page.locator('summary.menu-bouton');
    await expect(menu).toHaveAccessibleName('Menu');
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await menu.click();
    await expect(navigation.getByRole('link')).toHaveCount(3);
    for (const lien of await navigation.getByRole('link').all())
      expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(menu).toHaveAccessibleName('Fermer');
    await menu.click();
    await expect(navigation).toHaveCount(0);
    await quoi(page).fill('lycee');
    await ou(page).fill('pointe-noire');
    await chercher(page).click();
    await expect(page).toHaveURL(/\/ecoles\/\?q=lycee&ou=pointe-noire$/);
    await contexte.close();
  });

  test('au clavier : le menu s’ouvre avec Entrée et ses entrées suivent à la tabulation', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 768, 'le menu est celui du téléphone');
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator('header a.lien-marque')).toBeFocused();
    await page.keyboard.press('Tab');
    const menu = page.locator('summary.menu-bouton');
    await expect(menu).toBeFocused();
    await page.keyboard.press('Enter');
    const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(navigation).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(navigation.getByRole('link', { name: 'Trouver une école' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(navigation.getByRole('link', { name: 'S’orienter' })).toBeFocused();
  });
});

test.describe('la fiche de démonstration', () => {
  test('se dit fictive, n’est ni indexée ni dans l’annuaire, n’a ni numéro ni formulaire', async ({
    page,
    request,
  }) => {
    const reponse = await page.goto('/demo/fiche-ecole/');
    expect(reponse?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    // L'étiquette « Exemple » est sur la ligne du nom (règle du 17/11).
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Exemple');
    await expect(page.getByRole('note')).toContainText('n’existe pas');
    const principal = page.getByRole('main');
    await expect(principal.locator('a[href^="tel:"], a[href*="wa.me"]')).toHaveCount(0);
    await expect(principal.locator('form, button, input')).toHaveCount(0);
    await expect(page.locator('script:not([type="application/ld+json"])')).toHaveCount(0);
    // Ni dans le plan du site, ni dans la recherche, ni dans le fichier pour les assistants.
    for (const fichier of ['/sitemap.xml', '/recherche.json', '/llms.txt']) {
      const texte = await (await request.get(fichier)).text();
      expect(texte, fichier).not.toContain('/demo/');
      expect(texte, fichier).not.toContain('Manguiers');
    }
    await page.goto('/ecoles/?q=manguiers');
    expect(await nombreDeLaListe(page)).toBe(0);
  });
});
