import { expect, test, type Page } from '@playwright/test';

// Audit du 05/11/2026, Vague 2 : la fiche d'école parle comme l'aperçu de la carte (disque et puces de niveau, preuves en blocs,
// barre « Y aller · Appeler · Partager »), n'affiche plus un plan vide (D21) ni « non communiqué » à une école pas encore
// confirmée (D3), et le menu du téléphone ouvre les cinq portes du site sans JavaScript (D13).
const TIE_TIE = '/ecoles/congo/pointe-noire/tie-tie/';
const COMPLEXE = `${TIE_TIE}complexe-scolaire-exemple/`;
const SANS_DETAIL = `${TIE_TIE}ecole-sans-detail-exemple/`;
const AJOUTEE = `${TIE_TIE}ecole-ajoutee-exemple/`;
const CONFIRMEE = '/ecoles/congo/pointe-noire/loandjili/quartier-exemple/groupe-scolaire-exemple/';
const INSTITUT = '/ecoles/congo/pointe-noire/loandjili/institut-superieur-exemple/';
const BRAZZAVILLE = '/ecoles/congo/brazzaville/moungali/ecole-de-brazzaville-exemple/';

test.describe('la fiche d’une école', () => {
  test('le disque est celui du cycle le plus élevé, et chaque niveau a sa puce colorée', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.locator('.apercu-tete .disque-xl')).toHaveText('P');
    await expect(page.locator('.apercu-tete .disque-xl')).toHaveClass(/c-P/);
    const puces = page.getByRole('list', { name: 'Niveaux et type d’école' }).getByRole('listitem');
    await expect(puces).toHaveText([/^M\s*Maternelle$/, /^P\s*Primaire$/, 'Privée']);
    await expect(puces.nth(0).locator('.disque')).toHaveClass(/c-M/);
    await expect(puces.nth(1).locator('.disque')).toHaveClass(/c-P/);
    // La couleur vient du jeton du cycle, la même que l'épingle de la carte.
    const [maternelle, primaire] = await Promise.all([
      puces
        .nth(0)
        .locator('.disque')
        .evaluate((d) => getComputedStyle(d).backgroundColor),
      puces
        .nth(1)
        .locator('.disque')
        .evaluate((d) => getComputedStyle(d).backgroundColor),
    ]);
    expect(maternelle).not.toBe(primaire);
  });

  test('une fiche déjà confirmée invite à une mise à jour, avec le bon message', async ({
    page,
  }) => {
    await page.goto(CONFIRMEE);
    const action = page.getByRole('link', { name: 'Mettre à jour cette fiche', exact: true });
    await expect(action).toBeVisible();
    expect(decodeURIComponent((await action.getAttribute('href'))!)).toContain(
      'je souhaite mettre à jour sa fiche',
    );
    await expect(
      page.getByRole('link', { name: 'Confirmer cette fiche', exact: true }),
    ).toHaveCount(0);
  });

  test('une école sans niveau noté a un disque gris, sans lettre ni puce', async ({ page }) => {
    await page.goto(SANS_DETAIL);
    await expect(page.locator('.apercu-tete .disque-xl')).toHaveText('');
    await expect(page.locator('.apercu-tete .disque-xl')).not.toHaveClass(/c-/);
    await expect(page.getByRole('list', { name: 'Niveaux et type d’école' })).toHaveCount(0);
  });

  test('les preuves sont des blocs sous l’identité, jamais fusionnés', async ({ page }) => {
    await page.goto(CONFIRMEE);
    const tete = await page.locator('.apercu-tete').boundingBox();
    const preuves = page.locator('.preuves .preuve');
    await expect(preuves).toHaveCount(2);
    const premiere = await preuves.first().boundingBox();
    expect(premiere!.y, 'les preuves viennent après le nom').toBeGreaterThan(
      tete!.y + tete!.height,
    );
    await expect(page.locator('.preuve-direction')).toContainText(
      'Confirmée par l’école · 4 nov. 2026',
    );
    await expect(page.locator('.preuve:not(.preuve-direction)')).toContainText(
      'Relevé terrain · 2 nov. 2026',
    );
  });

  test('sans accord de la direction, pas de bloc « Confirmée » ; sans passage, un bloc en pointillés', async ({
    page,
  }) => {
    await page.goto(AJOUTEE);
    await expect(page.locator('.preuve-direction')).toHaveCount(0);
    const vide = page.locator('.preuve-vide');
    await expect(vide).toHaveCount(1);
    await expect(vide).toContainText('Ajoutée par NTanova · 3 nov. 2026');
    await expect(vide).not.toContainText('Relevé terrain');
  });

  test('une école déclarée par l’école : sa déclaration en pointillés, sans « Confirmée »', async ({
    page,
  }) => {
    await page.goto(BRAZZAVILLE);
    await expect(page.locator('.preuve-direction')).toHaveCount(0);
    await expect(page.locator('.preuves .preuve').first()).toContainText(
      'Déclarée par l’école · 1 nov. 2026',
    );
  });
});

test.describe('les informations utiles au premier écran', () => {
  test('les autres sites se choisissent près de l’identité, sans JavaScript', async ({
    browser,
    baseURL,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: baseURL ?? '',
      viewport: { width: 360, height: 800 },
    });
    const page = await contexte.newPage();
    await page.goto(CONFIRMEE);
    const choix = page.locator('details.sites-ecole');
    await expect(choix.locator('summary')).toHaveText('Changer de site');
    const nom = await page.locator('h1').boundingBox();
    const position = await choix.boundingBox();
    const actions = await page.locator('.fiche-actions').boundingBox();
    expect(position!.y).toBeGreaterThan(nom!.y);
    expect(position!.y).toBeLessThan(actions!.y);
    await choix.locator('summary').click();
    await expect(choix).toContainText('Sites publiés dans l’annuaire');
    await choix.getByRole('link', { name: /Campus de Mongo-Mpoukou/ }).click();
    await expect(page.locator('.etiquette-campus')).toHaveText('Campus de Mongo-Mpoukou');
    await contexte.close();
  });

  test('sans autre site connu, aucun sélecteur ; une série ne se répète pas dans sa formation', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.locator('.sites-ecole')).toHaveCount(0);
    await page.goto(CONFIRMEE);
    const formations = page.getByRole('region', { name: 'Formations', exact: true });
    const serie = formations.getByRole('listitem').filter({ hasText: 'Série A' });
    await expect(serie.getByText('Série A', { exact: true })).toHaveCount(1);
    await expect(serie.getByRole('link', { name: 'Série A', exact: true })).toHaveAttribute(
      'href',
      '/ecoles/?serie=a',
    );
    await expect(serie).toContainText('Baccalauréat');
    await expect(serie).toContainText('Cours du jour');
  });
});

test.describe('la barre « Y aller · Appeler · Partager »', () => {
  const actions = (page: Page) => page.locator('.fiche-actions').getByRole('link');

  test('trois gestes : Y aller plein, Appeler (le contact communiqué), Partager (WhatsApp, avec l’adresse de la fiche)', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(actions(page)).toHaveText(['Y aller', 'Appeler', 'Partager']);
    await expect(actions(page).nth(0)).toHaveAttribute(
      'href',
      'https://www.google.com/maps/dir/?api=1&destination=-4.79105,11.925',
    );
    await expect(actions(page).nth(1)).toHaveAttribute('href', 'tel:+242060000009');
    const partage = decodeURIComponent((await actions(page).nth(2).getAttribute('href')) ?? '');
    expect(partage).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(partage).toContain('[Complexe scolaire Exemple] · https://ntanova.com' + COMPLEXE);
    // Y aller est le bouton plein, sur toute la largeur ; les deux autres se partagent la ligne dessous.
    const [y, a, p] = await Promise.all([0, 1, 2].map((i) => actions(page).nth(i).boundingBox()));
    expect(Math.abs(y!.width - a!.width)).toBeLessThan(2);
    expect(Math.abs(a!.y - y!.y)).toBeLessThan(2);
    expect(Math.abs(a!.y - p!.y)).toBeLessThan(2);
    for (const b of [y, a, p]) expect(b!.height).toBeGreaterThanOrEqual(44);
  });

  test('sans position : pas de « Y aller », « Appeler » devient le bouton plein (numéro de l’enseigne si rien d’autre)', async ({
    page,
  }) => {
    await page.goto(SANS_DETAIL);
    await expect(actions(page)).toHaveText(['Appeler', 'Partager']);
    await expect(actions(page).nth(0)).toHaveAttribute('href', 'tel:+242060000002');
    const [a, p] = await Promise.all([0, 1].map((i) => actions(page).nth(i).boundingBox()));
    // Deux gestes seulement : le second prend toute la largeur, comme le premier.
    expect(Math.abs(a!.width - p!.width)).toBeLessThan(2);
  });

  test('sans numéro : « Y aller » et « Partager », jamais de lien « Appeler » vide', async ({
    page,
  }) => {
    await page.goto(BRAZZAVILLE);
    await expect(actions(page)).toHaveText(['Y aller', 'Partager']);
    await expect(page.locator('a[href="tel:+null"], a[href="tel:+"]')).toHaveCount(0);
  });

  test('« Partager » ouvre le partage du téléphone quand il existe, sans quitter la fiche', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        value: async (donnees: object) => {
          (window as unknown as { __partage: object }).__partage = donnees;
        },
        configurable: true,
      });
    });
    await page.goto(COMPLEXE);
    await page.getByRole('link', { name: 'Partager' }).click();
    const donnees = await page.evaluate(
      () => (window as unknown as { __partage: object }).__partage,
    );
    expect(donnees).toEqual({
      title: '[Complexe scolaire Exemple]',
      url: 'https://ntanova.com' + COMPLEXE,
    });
    await expect(page).toHaveURL(new RegExp(`${COMPLEXE}$`));
  });

  test('sans partage du téléphone, « Partager » copie le lien et le dit', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async (texte: string) => {
            (window as unknown as { __copie: string }).__copie = texte;
          },
        },
        configurable: true,
      });
    });
    await page.goto(COMPLEXE);
    // Son nom change (« Lien copié ») : on le retrouve par son attribut, pas par son nom.
    const bouton = page.locator('[data-partager]');
    await bouton.click();
    await expect(bouton).toHaveText('Lien copié');
    await expect(page.getByRole('status').filter({ hasText: 'copié' })).toHaveText(
      'Lien de la fiche copié.',
    );
    expect(await page.evaluate(() => (window as unknown as { __copie: string }).__copie)).toBe(
      'https://ntanova.com' + COMPLEXE,
    );
    // Le retour visuel ne reste pas : le bouton redit « Partager ».
    await expect(bouton).toHaveText('Partager', { timeout: 5000 });
    await expect(page).toHaveURL(new RegExp(`${COMPLEXE}$`));
  });

  test('sans JavaScript, « Partager » reste un lien WhatsApp', async ({ browser, baseURL }) => {
    const contexte = await browser.newContext({ javaScriptEnabled: false, baseURL: baseURL ?? '' });
    const page = await contexte.newPage();
    await page.goto(COMPLEXE);
    await expect(page.getByRole('link', { name: 'Partager' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/\?text=/,
    );
    await contexte.close();
  });
});

test.describe('« Où est l’école »', () => {
  test('sans rues dessinées : pas de grand plan vide, le repère en mots et un lien vers la carte, centré sur l’école', async ({
    page,
  }) => {
    await page.goto(INSTITUT);
    await expect(page.getByRole('group', { name: /sur la carte de/ })).toHaveCount(0);
    await expect(page.locator('.ou svg:not(.ico)')).toHaveCount(0);
    await expect(page.locator('.ou')).toContainText('[boulevard]');
    // Une seule fois « Y aller » : celui de la barre d'actions.
    await expect(page.getByRole('link', { name: 'Y aller' })).toHaveCount(1);
    const lien = page.getByRole('link', { name: 'Voir sur la carte', exact: true });
    await expect(lien).toHaveAttribute(
      'href',
      '/carte/?ecole=%2Fecoles%2Fcongo%2Fpointe-noire%2Floandjili%2Finstitut-superieur-exemple%2F#15/-4.798/11.931',
    );
  });

  test('une école située mais pas encore vue sur place : la carte s’ouvre sur son quartier, sans promettre d’épingle', async ({
    page,
  }) => {
    await page.goto(BRAZZAVILLE);
    await expect(page.getByRole('group', { name: /sur la carte de/ })).toHaveCount(0);
    const lien = page.getByRole('link', { name: 'Voir le quartier sur la carte' });
    await expect(lien).toHaveAttribute('href', '/carte/#15/-4.2634/15.2429');
    await expect(page.getByRole('link', { name: 'Voir sur la carte', exact: true })).toHaveCount(0);
  });

  test('même avec des rues dessinées (Tié-Tié), plus de petit plan : « Voir sur la carte » mène à la seule carte (ticket 146)', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.getByRole('group', { name: /sur la carte de/ })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Voir sur la carte', exact: true }),
    ).toHaveAttribute('href', /^\/carte\/\?ecole=.+#15\/-4\.79105\/11\.925$/);
  });

  test('sans position ni repère : aucun bloc de localisation vide', async ({ page }) => {
    await page.goto(SANS_DETAIL);
    await expect(page.locator('.ou')).toHaveCount(0);
    await expect(page.locator('.ou a')).toHaveCount(0);
  });
});

test.describe('les informations absentes', () => {
  test('aucune colonne ne met en scène le vide', async ({ page }) => {
    await page.goto(INSTITUT);
    await expect(page.locator('.manque, .pastilles-vides')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Formations' })).toContainText(
      'BTS Informatique de gestion',
    );
  });
});

test.describe('sur ordinateur', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  test('les trois lignes de la fiche (programme, contact, numéro sur l’enseigne) sont alignées comme les autres propriétés', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    const lignes = page.locator('dl.proprietes');
    const termes = lignes.locator('dt');
    const valeurs = lignes.locator('dd');
    await expect(termes).toHaveText([
      'Programme et langues',
      'Contact communiqué par l’école',
      'Téléphone',
    ]);
    const xTermes = await termes.evaluateAll((l) => l.map((e) => e.getBoundingClientRect().x));
    const xValeurs = await valeurs.evaluateAll((l) => l.map((e) => e.getBoundingClientRect().x));
    expect(new Set(xTermes.map(Math.round)).size, 'les termes partent du même bord').toBe(1);
    expect(new Set(xValeurs.map(Math.round)).size, 'les valeurs partent du même bord').toBe(1);
    // Même corps et même couleur pour tous les termes, même graisse pour toutes les valeurs.
    const styles = await termes.evaluateAll((l) =>
      l.map((e) => `${getComputedStyle(e).fontSize} ${getComputedStyle(e).color}`),
    );
    expect(new Set(styles).size).toBe(1);
    const marges = await valeurs.evaluateAll((l) => l.map((e) => getComputedStyle(e).marginLeft));
    expect(new Set(marges)).toEqual(new Set(['0px']));
  });

  test('la navigation du haut est là, le bouton « Menu » du téléphone n’y est pas', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
    await expect(page.locator('summary.menu-bouton')).toBeHidden();
    await expect(page.locator('.ville')).toBeVisible();
  });
});

test.describe('le menu du téléphone', () => {
  test('« Menu » ouvre les quatre portes du site, sans JavaScript, et la page courante est marquée (ticket 146)', async ({
    browser,
    baseURL,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 360, height: 640 },
      baseURL: baseURL ?? '',
    });
    const page = await contexte.newPage();
    await page.goto('/ecoles/congo/pointe-noire/');
    const menu = page.getByRole('navigation', { name: 'Menu principal' });
    await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeHidden();
    await expect(menu).toBeHidden();
    await page.locator('summary.menu-bouton').click();
    await expect(menu.getByRole('link')).toHaveText([
      'Écoles',
      'Carte',
      'Pour les écoles',
      'À propos',
    ]);
    for (const lien of await menu.getByRole('link').all())
      expect((await lien.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(menu.getByRole('link', { name: 'Écoles', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await menu.getByRole('link', { name: 'Carte' }).click();
    await expect(page).toHaveURL(/\/carte\/$/);
    await contexte.close();
  });

  test('le menu ouvert passe au-dessus de la page, sur toute la largeur, sous l’en-tête', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await page.locator('summary.menu-bouton').click();
    const panneau = await page.locator('.menu-liens').boundingBox();
    const entete = await page.locator('header.entete').boundingBox();
    expect(Math.abs(panneau!.y - (entete!.y + entete!.height))).toBeLessThan(2);
    expect(panneau!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
    // Il recouvre bien le contenu : le point juste sous le menu pointe vers lui.
    const pointe = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('.menu-liens'),
      [180, panneau!.y + panneau!.height / 2],
    );
    expect(pointe).toBe(true);
  });

  test('« Congo-Brazzaville » s’ouvre sans JavaScript et dit que NTanova ne recense pour le moment que ce pays (ticket 146)', async ({
    browser,
    baseURL,
  }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 360, height: 640 },
      baseURL: baseURL ?? '',
    });
    const page = await contexte.newPage();
    await page.goto('/');
    const pays = page.locator('header details.pays');
    await expect(pays.locator('summary')).toHaveText('Congo-Brazzaville');
    const bulle = pays.locator('.pays-bulle');
    await expect(bulle).toBeHidden();
    await pays.locator('summary').click();
    await expect(bulle).toBeVisible();
    await expect(bulle).toContainText(
      'Pour le moment, NTanova recense les écoles du Congo-Brazzaville, ville après ville.',
    );
    // Rien de promis au-delà : aucun autre pays, aucun lien.
    await expect(bulle.getByRole('link')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await contexte.close();
  });
});

test.describe('l’accueil', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'connection', {
        value: { saveData: true },
        configurable: true,
      }),
    );
  });

  test('un seul bouton principal vers la carte, sous le titre : plus de doublon « plein écran » sous l’aperçu', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Explorer la carte', exact: true })).toHaveCount(1);
    await expect(page.getByText('Explorer la carte en plein écran')).toHaveCount(0);
    await expect(page.locator('.plein-ecran')).toHaveCount(0);
    // Le seul lien « plein » vers /carte/ dans le corps de la page : celui de l'ouverture.
    await expect(page.locator('main a.bouton:not(.bouton-secondaire)[href="/carte/"]')).toHaveCount(
      1,
    );
  });

  test('le lien sous les villes dit ce qu’il ouvre : « Les arrondissements de Pointe-Noire »', async ({
    page,
  }) => {
    await page.goto('/');
    const lien = page.getByRole('link', { name: 'Les arrondissements de Pointe-Noire' });
    await expect(lien).toHaveAttribute('href', '/ecoles/congo/pointe-noire/');
    await expect(page.getByRole('link', { name: 'Voir la carte de Pointe-Noire' })).toHaveCount(0);
  });

  test('sur téléphone, « Comment les fiches sont tenues » : les trois étapes, l’une sous l’autre, avant l’appel aux directions', async ({
    page,
  }) => {
    await page.goto('/');
    const titre = page.getByRole('heading', { name: 'Comment les fiches sont tenues' });
    await expect(titre).toBeVisible();
    const etapes = page.locator('.etape');
    await expect(etapes).toHaveCount(3);
    const boites = await Promise.all([0, 1, 2].map((i) => etapes.nth(i).boundingBox()));
    for (let i = 1; i < 3; i++) expect(boites[i]!.y).toBeGreaterThan(boites[i - 1]!.y);
    // Une colonne : pas plus large que l'écran, pas de défilement de côté.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    const appel = await page.locator('.ecoles-appel').boundingBox();
    expect(appel!.y).toBeGreaterThan(boites[2]!.y);
    const villes = await page.locator('a.quartier').last().boundingBox();
    expect(boites[0]!.y).toBeGreaterThan(villes!.y);
  });
});
