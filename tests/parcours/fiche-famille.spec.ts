import { expect, test, type Page } from '@playwright/test';

// Audit du 05/11/2026, Vague 2 : la fiche d'école parle comme l'aperçu de la carte (disque et puces de niveau, preuves en blocs,
// barre « Y aller · Appeler · Partager »), n'affiche plus un plan vide (D21) ni « non communiqué » à une école pas encore
// confirmée (D3), et le menu du téléphone ouvre les cinq portes du site sans JavaScript (D13).
const COMPLEXE = '/ecoles/complexe-scolaire-exemple-482913/';
const SANS_DETAIL = '/ecoles/ecole-sans-detail-exemple-270846/';
const AJOUTEE = '/ecoles/ecole-ajoutee-exemple-639158/';
const CONFIRMEE = '/ecoles/groupe-scolaire-exemple-158427/';
const INSTITUT = '/ecoles/institut-superieur-exemple-527064/';
const BRAZZAVILLE = '/ecoles/ecole-de-brazzaville-exemple-731590/';

test.describe('la fiche d’une école', () => {
  test('le disque est celui du cycle le plus élevé, et chaque niveau a sa puce colorée', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.locator('.fiche-identite .disque-fiche')).toHaveText('P');
    await expect(page.locator('.fiche-identite .disque-fiche')).toHaveClass(/c-P/);
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
    await expect(page.locator('.fiche-identite .disque-fiche')).toHaveText('');
    await expect(page.locator('.fiche-identite .disque-fiche')).not.toHaveClass(/c-/);
    await expect(page.getByRole('list', { name: 'Niveaux et type d’école' })).toHaveCount(0);
  });

  test('les preuves sont des pastilles sous l’identité, jamais fusionnées', async ({ page }) => {
    await page.goto(CONFIRMEE);
    const tete = await page.locator('.fiche-identite h1').boundingBox();
    const preuves = page.locator('.preuves .preuve');
    await expect(preuves).toHaveCount(2);
    const premiere = await preuves.first().boundingBox();
    expect(premiere!.y, 'les preuves viennent après le nom').toBeGreaterThan(
      tete!.y + tete!.height,
    );
    await expect(page.locator('.preuve-direction')).toContainText(
      'Confirmée par la direction · 4 nov. 2026',
    );
    await expect(page.locator('.preuve:not(.preuve-direction)')).toContainText(
      'Vue sur place · 2 nov. 2026',
    );
  });

  test('sans accord de la direction, pas de pastille « Confirmée » ; sans passage, une pastille en pointillés', async ({
    page,
  }) => {
    await page.goto(AJOUTEE);
    await expect(page.locator('.preuve-direction')).toHaveCount(0);
    const vide = page.locator('.preuve-vide');
    await expect(vide).toHaveCount(1);
    await expect(vide).toContainText('Ajoutée par NTanova · pas encore vue sur place');
    await expect(vide).not.toContainText('Vue sur place');
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

test.describe('le canevas du 08/11/2026 (ticket 148)', () => {
  // Lot 4 (fondateur, 16/11) : la couverture est la couverture choisie, sinon la photo d'enseigne ; sans photo, aucun bandeau.
  // Remplace « la couverture est dessinée » (08/11).
  test('la couverture : la photo d’enseigne, sinon rien, jamais un bandeau vide', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    const couverture = page.locator('.fiche-couverture img');
    await expect(couverture).toHaveAttribute('src', /^\/photos\/[a-f0-9-]+\.webp$/);
    await expect(page.locator('.photo-ecole')).toHaveCount(0);
    await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
    await expect(page.locator('.fiche-couverture')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText('Pas encore de photo');
    await expect(page.locator('.disque-fiche, .rond-ecole')).toHaveCount(1);
  });

  test('le fil d’Ariane remonte les lieux qui ont une page', async ({ page }) => {
    await page.goto(COMPLEXE);
    const ariane = page.getByRole('navigation', { name: 'Fil d’Ariane' });
    await expect(ariane.getByRole('link').first()).toHaveAttribute('href', '/ecoles/');
    await expect(ariane.getByRole('link', { name: 'Pointe-Noire', exact: true })).toHaveAttribute(
      'href',
      '/ecoles/pointe-noire/',
    );
  });

  test('une école vue sur place dit qu’elle n’est pas encore confirmée, et comment on vérifie', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.locator('.preuves')).toContainText('Pas encore confirmée par la direction');
    await expect(
      page.getByRole('link', { name: 'Comment nous vérifions une fiche' }),
    ).toHaveAttribute('href', '/methode/');
    await expect(page.locator('.identifiant')).toContainText('Fiche mise à jour le');
  });

  test('le bouton WhatsApp n’existe que sur une fiche confirmée qui a un contact public', async ({
    page,
  }) => {
    await page.goto(CONFIRMEE);
    const whatsapp = page.locator('.fiche-actions').getByRole('link', { name: 'WhatsApp' });
    expect(decodeURIComponent((await whatsapp.getAttribute('href'))!)).toContain(
      'je vous contacte depuis NTanova',
    );
    const filiere = page.getByRole('link', {
      name: 'Écrire à l’établissement sur WhatsApp au sujet de la filière Série C',
    });
    expect(decodeURIComponent((await filiere.getAttribute('href'))!)).toContain(
      'au sujet de la filière Série C',
    );
    // Une fiche non confirmée, même avec un contact public : ni l'un ni l'autre.
    await page.goto(COMPLEXE);
    await expect(
      page.locator('.fiche-actions').getByRole('link', { name: 'WhatsApp' }),
    ).toHaveCount(0);
    await expect(page.locator('.filiere-contact')).toHaveCount(0);
  });

  test('les filières se filtrent sans JavaScript', async ({ browser, baseURL }) => {
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      baseURL: baseURL ?? '',
      viewport: { width: 360, height: 800 },
    });
    const page = await contexte.newPage();
    await page.goto(INSTITUT);
    // Planche « supérieur » (version 44) : une carte par formation, des pastilles par diplôme ; trois cartes, puis « voir tout ».
    const lignes = page.locator('.carte-formation');
    await expect(lignes).toHaveCount(4);
    await page
      .locator('.formations-sup label')
      .filter({ hasText: /^BTS · \d/ })
      .click();
    await expect(lignes.filter({ visible: true })).toHaveCount(1);
    await expect(lignes.filter({ visible: true })).toContainText('BTS Informatique de gestion');
    await page
      .locator('.formations-sup label')
      .filter({ hasText: /^Toutes · 4/ })
      .click();
    await expect(lignes.filter({ visible: true })).toHaveCount(3);
    await contexte.close();
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
    // v2 (13/11, canevas) : « Les 2 sites de l'école », des cartes juste après les actions, celle où l'on est d'abord.
    const sites = page.getByRole('region', { name: 'Les sites de l’école' });
    await expect(sites.getByRole('heading')).toHaveText('Les 2 sites de l’école');
    const actions = await page.locator('.fiche-actions').boundingBox();
    const position = await sites.boundingBox();
    expect(position!.y).toBeGreaterThan(actions!.y);
    await expect(sites.getByRole('link').first()).toContainText('Vous êtes ici');
    await expect(sites.getByRole('link').nth(1)).toContainText('4,2 km');
    await sites.getByRole('link', { name: /Campus de Mongo-Mpoukou/ }).click();
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
    // Planche « Fiche mince » (version 44, fondateur 16/11) : deux colonnes ; Y aller seul sur la première ligne, Appeler et
    // Partager côte à côte dessous. Remplace « les trois sur une ligne » (08/11).
    const [y, a, p] = await Promise.all([0, 1, 2].map((i) => actions(page).nth(i).boundingBox()));
    expect(y!.width).toBeGreaterThan(a!.width);
    expect(a!.y).toBeGreaterThan(y!.y + y!.height - 2);
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
      // Ticket 147 : l'école se désigne par son identifiant ; depuis le lot 4 bis, sur la vue Carte de « Les écoles ».
      '/ecoles/?vue=carte&ecole=527064',
    );
  });

  // Décision du fondateur du 17/11/2026 (option B) : toute école située a son épingle ; plus de « Voir le quartier ».
  test('une école située mais pas encore vue sur place : « Voir sur la carte » l’ouvre choisie, en épingle en tirets', async ({
    page,
  }) => {
    await page.goto(BRAZZAVILLE);
    await expect(page.getByRole('group', { name: /sur la carte de/ })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Voir sur la carte', exact: true }),
    ).toHaveAttribute('href', /^\/ecoles\/\?vue=carte&ecole=\d{6}$/);
    await expect(page.getByRole('link', { name: 'Voir le quartier sur la carte' })).toHaveCount(0);
  });

  test('même avec des rues dessinées (Tié-Tié), plus de petit plan : « Voir sur la carte » mène à la seule carte (ticket 146)', async ({
    page,
  }) => {
    await page.goto(COMPLEXE);
    await expect(page.getByRole('group', { name: /sur la carte de/ })).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Voir sur la carte', exact: true }),
    ).toHaveAttribute('href', /^\/ecoles\/\?vue=carte&ecole=\d{6}$/);
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
    // « À savoir » (planche « Fiche mince ») : une ligne par propriété, le libellé à gauche, la valeur à droite.
    const lignes = page.locator('.proprietes');
    const termes = lignes.locator('.libelle');
    const valeurs = lignes.locator('li > :last-child');
    await expect(termes).toHaveText(['Téléphone', 'Programme et langues']);
    const xTermes = await termes.evaluateAll((l) => l.map((e) => e.getBoundingClientRect().x));
    const xValeurs = await valeurs.evaluateAll((l) => l.map((e) => e.getBoundingClientRect().x));
    expect(new Set(xTermes.map(Math.round)).size, 'les termes partent du même bord').toBe(1);
    // Les valeurs s'alignent à droite : leur bord droit est commun.
    const dValeurs = await valeurs.evaluateAll((l) =>
      l.map((e) => e.getBoundingClientRect().right),
    );
    expect(new Set(dValeurs.map(Math.round)).size, 'les valeurs finissent au même bord').toBe(1);
    expect(xValeurs.length).toBe(2);
    // Même corps et même couleur pour tous les termes, même graisse pour toutes les valeurs.
    const styles = await termes.evaluateAll((l) =>
      l.map((e) => `${getComputedStyle(e).fontSize} ${getComputedStyle(e).color}`),
    );
    expect(new Set(styles).size).toBe(1);
  });

  test('les trois piliers sont en haut, et aucun bouton « Menu »', async ({ page }) => {
    await page.goto(COMPLEXE);
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link'),
    ).toHaveText(['Trouver une école', 'S’orienter', 'Espace écoles']);
    await expect(page.locator('summary.menu-bouton')).toHaveCount(0);
    await expect(page.locator('header .ville')).toBeVisible();
  });
});

test.describe('l’en-tête du téléphone', () => {
  test('les trois piliers sont visibles sans JavaScript, sur une ligne, 44 px chacun, et la page courante est marquée (lot 3)', async ({
    browser,
    baseURL,
  }) => {
    // Décision 1A du 15/11/2026 et planche « Accueil · téléphone » de la version 44 : plus de bouton « Menu ». Carte, Méthode,
    // Données et À propos passent au pied de page.
    const contexte = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: 360, height: 640 },
      baseURL: baseURL ?? '',
    });
    const page = await contexte.newPage();
    await page.goto('/ecoles/pointe-noire/');
    const piliers = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(piliers.getByRole('link')).toHaveText([
      'Trouver une école',
      'S’orienter',
      'Espace écoles',
    ]);
    await expect(page.getByRole('navigation', { name: 'Menu principal' })).toHaveCount(0);
    const boites = await Promise.all(
      (await piliers.getByRole('link').all()).map((l) => l.boundingBox()),
    );
    for (const b of boites) {
      expect(b!.height).toBeGreaterThanOrEqual(44);
      expect(b!.y, 'les trois sur la même ligne').toBe(boites[0]!.y);
    }
    // Une liste, une page de lieu ou une fiche : c'est « Trouver une école ».
    await expect(piliers.getByRole('link', { name: 'Trouver une école' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await piliers.getByRole('link', { name: 'S’orienter' }).click();
    await expect(page).toHaveURL(/\/orienter\/$/);
    await expect(piliers.getByRole('link', { name: 'S’orienter' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(piliers.getByRole('link', { name: 'Trouver une école' })).not.toHaveAttribute(
      'aria-current',
    );
    // Lot 4 bis : la carte est la vue Carte de « Les écoles » ; le pied de page n'a plus de lien « Carte ».
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'Carte', exact: true }),
    ).toHaveCount(0);
    await contexte.close();
  });

  test('la bulle du pays passe au-dessus de la page, juste sous l’en-tête', async ({ page }) => {
    await page.goto(COMPLEXE);
    await page.locator('header details.pays > summary').click();
    const bulle = await page.locator('.pays-bulle').boundingBox();
    const entete = await page.locator('header.entete').boundingBox();
    expect(Math.abs(bulle!.y - (entete!.y + entete!.height))).toBeLessThan(2);
    expect(bulle!.x + bulle!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    // Elle recouvre bien le contenu : le point en son milieu pointe vers elle.
    const pointe = await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('.pays-bulle'),
      [bulle!.x + bulle!.width / 2, bulle!.y + bulle!.height / 2],
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
  test('la recherche ouvre « Écoles » avec le mot cherché, et le parent arrive sur la fiche', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Chercher une école' }).fill('mongo');
    await page.getByRole('button', { name: 'Chercher' }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?q=mongo$/);
    await page
      .locator('[data-cartes]')
      .getByRole('link', { name: /Groupe scolaire.*Mongo-Mpoukou/ })
      .click();
    await expect(page).toHaveURL(/\/ecoles\/groupe-scolaire-exemple-904316\/$/);
  });

  test('la carte n’est plus à l’accueil, mais à un geste : « Voir la carte »', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('main canvas, main .carte, main [data-carte]')).toHaveCount(0);
    await page.getByRole('main').getByRole('link', { name: 'Voir la carte' }).click();
    await expect(page).toHaveURL(/\/ecoles\/\?vue=carte$/);
  });

  test('la carte d’une ville mène à sa page, chaque puce à son arrondissement', async ({
    page,
  }) => {
    await page.goto('/');
    const ville = page.locator('section.ville-carte', { hasText: 'Pointe-Noire' });
    await expect(
      ville.getByRole('link', { name: /^Pointe-Noire 7 écoles sur NTanova$/ }),
    ).toHaveAttribute('href', '/ecoles/pointe-noire/');
    await ville.getByRole('link', { name: /^Loandjili/ }).click();
    await expect(page).toHaveURL(/\/ecoles\/pointe-noire\/loandjili\/$/);
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
    const appel = await page.locator('.appel-ecoles').boundingBox();
    expect(appel!.y).toBeGreaterThan(boites[2]!.y);
    const villes = await page.locator('section.ville-carte').last().boundingBox();
    expect(boites[0]!.y).toBeGreaterThan(villes!.y);
  });
});
