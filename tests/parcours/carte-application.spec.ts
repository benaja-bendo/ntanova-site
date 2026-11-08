import { expect, test } from '@playwright/test';
import { servirLesTuiles } from './aides-carte';
test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
});
test.beforeEach(async ({ context }) => {
  await servirLesTuiles(context);
});
async function ouvrir(page: import('@playwright/test').Page) {
  await page.goto('/carte/');
  await expect(page.locator('.explorateur')).toHaveAttribute('data-active', 'oui');
}
test('depuis l’accueil : accès direct visible, sans charger MapLibre avant le clic', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    }),
  );
  const demandes: string[] = [];
  page.on('request', (r) => demandes.push(r.url()));
  await page.goto('/');
  const bouton = page.getByRole('link', { name: 'Explorer la carte', exact: true });
  await expect(bouton).toBeInViewport();
  expect(demandes.some((u) => /\/_astro\/(esm|ilot|maplibre)/.test(u))).toBe(false);
  await bouton.click();
  await expect(page).toHaveURL(/\/carte\//);
  await expect(page.locator('.explorateur')).toHaveAttribute('data-active', 'oui');
  const b = await page.locator('#carte').boundingBox();
  expect(b!.y + b!.height).toBeLessThanOrEqual(641);
  const toile = await page.locator('.maplibregl-canvas').boundingBox();
  expect(toile!.height).toBeGreaterThan(500);
  expect(Math.abs(toile!.height - b!.height)).toBeLessThan(3);
});
test('liste accessible, recherche hors de la vue, école sans épingle et filtre', async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await expect(page.locator('[data-resultats]')).toContainText('Exemple');
  await page.getByRole('searchbox').fill('École ajoutée');
  await page.getByRole('button', { name: 'Chercher', exact: true }).click();
  await expect(page.locator('[data-resultats]')).toContainText('École ajoutée Exemple');
  // Une école du catalogue qui n'est pas sur la carte le dit, et ouvre sa fiche : elle n'a rien à montrer sur la carte.
  await expect(page.locator('[data-resultats]')).toContainText('Pas encore sur la carte');
  await expect(
    page.locator('[data-resultats]').getByRole('link', { name: /École ajoutée Exemple/ }),
  ).toBeVisible();
  await expect(
    page.locator('[data-resultats]').getByRole('button', { name: /École ajoutée Exemple/ }),
  ).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  // Le filtre de niveau est une rangée de puces : celle qu'on touche est « appuyée », les autres non.
  const maternelle = page.getByRole('button', { name: 'Maternelle', exact: true });
  await maternelle.click();
  await expect(maternelle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Tous', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('[data-resultats]')).not.toContainText('Centre de formation Exemple');
  // La toucher de nouveau revient à « Tous ».
  await maternelle.click();
  await expect(page.getByRole('button', { name: 'Tous', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('une école absente de la carte : une phrase et un bouton WhatsApp, jamais une impasse', async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  const manque = page.locator('.ecole-manque');
  await expect(manque).toBeVisible();
  await expect(manque).toContainText('Une école manque ?');
  // Les familles aussi osent écrire : la phrase s'adresse à qui connaît l'école, pas seulement à sa direction.
  await expect(manque).toContainText('Signalez-nous un établissement à ajouter.');
  // Le numéro vient de la configuration : le parcours ne l'attend jamais en dur.
  const whatsapp = manque.getByRole('link', { name: 'Écrire sur WhatsApp' });
  await expect(whatsapp).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);
  await expect(whatsapp).toHaveAttribute('href', /une%20%C3%A9cole%20manque/);
  await expect(manque.getByRole('link', { name: 'Chercher dans toutes les écoles' })).toBeVisible();
});
test('sélection, deux preuves datées, partage puis retour sans quitter la carte', async ({
  page,
}) => {
  await ouvrir(page);
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await page.getByRole('searchbox').fill('Groupe scolaire quartier');
  await page.getByRole('button', { name: 'Chercher', exact: true }).click();
  await page.locator('[data-resultats]').getByRole('button').first().click();
  const apercu = page.locator('.carte-apercu');
  await expect(apercu).toContainText('Vue sur place ·');
  await expect(apercu).toContainText('Confirmée par la direction ·');
  // La fiche dit le niveau comme l'épingle : un disque à la lettre du cycle, puis le mot.
  await expect(apercu.locator('.etiquette-niveau .disque').first()).toHaveText(/^[MPCLTS]$/);
  await expect(apercu.locator('.apercu-tete .disque')).toHaveText(/^[MPCLTS]$/);
  // Deux preuves, deux blocs : jamais fusionnées.
  await expect(apercu.locator('.preuve')).toHaveCount(2);
  await expect(apercu.locator('.preuve-direction')).toContainText('Confirmée par la direction ·');
  // Une action principale (la fiche), puis deux secondaires, toutes de vraies cibles de doigt.
  await expect(apercu.getByRole('link', { name: 'Voir la fiche' })).toHaveClass(/bouton-large/);
  for (const nom of ['Voir la fiche', 'Y aller', 'Partager sur WhatsApp'])
    expect(
      (await apercu.getByRole('link', { name: nom }).boundingBox())?.height,
    ).toBeGreaterThanOrEqual(44);
  await expect(page).toHaveURL(/ecole=/);
  await expect(apercu.getByRole('link', { name: 'Partager sur WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa.me\/\?text=/,
  );
  const url = page.url();
  await page.goBack();
  await expect(apercu).toHaveCount(0);
  await expect(page).toHaveURL(/\/carte\//);
  await page.goto(url);
  await expect(apercu).toContainText('Groupe scolaire');
});
test('GPS refusé : recherche disponible, aucune demande avant le geste', async ({ page }) => {
  await page.addInitScript(() => {
    let appels = 0;
    Object.defineProperty(window, 'appelsGPS', { get: () => appels });
    navigator.geolocation.getCurrentPosition = ((
      _ok: PositionCallback,
      erreur?: PositionErrorCallback | null,
    ) => {
      appels++;
      erreur?.({
        code: 1,
        message: 'refus',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    }) as typeof navigator.geolocation.getCurrentPosition;
  });
  await ouvrir(page);
  expect(await page.evaluate(() => (window as unknown as { appelsGPS: number }).appelsGPS)).toBe(0);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  // Refusée : le message dit que la localisation est bloquée pour ce site, et ce qui reste possible.
  await expect(page.locator('#carte-note')).toContainText(
    'La localisation est bloquée pour ce site',
  );
  await expect(page.locator('#carte-note')).toContainText('cherchez une école');
  await expect(page.getByRole('button', { name: 'Ma position', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { appelsGPS: number }).appelsGPS)).toBe(1);
});

/** Le centre de la carte, pour vérifier qu'elle ne bouge pas (ou qu'elle bouge). */
const centreDeLaCarte = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const c = (
      window as unknown as { ntanovaCarte: { getCenter(): { lng: number; lat: number } } }
    ).ntanovaCarte.getCenter();
    return [c.lng, c.lat];
  });
/** Remplace la position du navigateur : une réponse (`ok`) ou une erreur de code `code`. */
async function simulerLaPosition(
  page: import('@playwright/test').Page,
  reponse: { latitude: number; longitude: number } | { code: number },
) {
  await page.addInitScript((r) => {
    navigator.geolocation.getCurrentPosition = ((
      ok: PositionCallback,
      erreur?: PositionErrorCallback | null,
    ) => {
      if ('code' in r)
        erreur?.({
          code: r.code,
          message: 'simulée',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      else
        ok({
          coords: { ...r, accuracy: 20 } as GeolocationCoordinates,
          timestamp: Date.now(),
        } as GeolocationPosition);
    }) as typeof navigator.geolocation.getCurrentPosition;
  }, reponse);
}
test('position depuis la France : la carte ne bouge pas et le dit clairement', async ({ page }) => {
  await simulerLaPosition(page, { latitude: 48.8566, longitude: 2.3522 });
  await ouvrir(page);
  const avant = await centreDeLaCarte(page);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toHaveText(
    'Vous êtes actuellement hors du Congo-Brazzaville. La carte reste centrée sur le pays.',
  );
  await page.waitForTimeout(700);
  expect(await centreDeLaCarte(page)).toEqual(avant);
  await expect(page.getByRole('button', { name: 'Ma position', exact: true })).toBeEnabled();
  // Le message est discret : il s'efface seul, la carte n'est pas encombrée.
  await expect(page.locator('#carte-note')).toBeEmpty({ timeout: 15_000 });
});
test('position introuvable ou trop longue : un message, et la carte reste utilisable', async ({
  page,
}) => {
  await simulerLaPosition(page, { code: 2 });
  await ouvrir(page);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toContainText('n’a pas pu être obtenue');
  await expect(page.getByRole('searchbox')).toBeVisible();
});
test('position sur une connexion non sécurisée (http) : dite, sans demander au navigateur', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    let appels = 0;
    Object.defineProperty(window, 'appelsGPS', { get: () => appels });
    navigator.geolocation.getCurrentPosition = (() =>
      appels++) as unknown as typeof navigator.geolocation.getCurrentPosition;
  });
  await ouvrir(page);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toContainText('connexion sécurisée');
  await expect(page.locator('#carte-note')).toContainText('Cherchez une école');
  expect(await page.evaluate(() => (window as unknown as { appelsGPS: number }).appelsGPS)).toBe(0);
  await expect(page.getByRole('button', { name: 'Ma position', exact: true })).toBeEnabled();
});
test('position dans le pays : la carte s’y rend', async ({ page }) => {
  await simulerLaPosition(page, { latitude: -4.78, longitude: 11.88 });
  await ouvrir(page);
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toContainText('Vous êtes situé sur la carte');
  await expect
    .poll(async () => {
      const [x, y] = await centreDeLaCarte(page);
      return Math.abs(x! - 11.88) < 0.02 && Math.abs(y! + 4.78) < 0.02;
    })
    .toBe(true);
});
test('GPS obtenu : aucune coordonnée personnelle dans URL, stockage ou partage', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = ((ok: PositionCallback) =>
      ok({
        coords: {
          latitude: -4.81234567,
          longitude: 11.91234567,
          accuracy: 20,
          toJSON: () => ({}),
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
        toJSON: () => ({}),
      })) as typeof navigator.geolocation.getCurrentPosition;
  });
  await ouvrir(page);
  const demandes: string[] = [];
  page.on('request', (r) => demandes.push(r.url() + (r.postData() ?? '')));
  await page.getByRole('button', { name: 'Ma position', exact: true }).click();
  await expect(page.locator('#carte-note')).toContainText('ne conserve pas votre position');
  await page.waitForTimeout(500);
  expect(page.url()).not.toContain('812345');
  expect(demandes.join(' ')).not.toMatch(/812345|912345/);
  expect(
    await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage)),
  ).not.toMatch(/812345|912345/);
});

test('plein écran : aucun flash du dessin pendant le chargement du moteur', async ({ page }) => {
  let liberer!: () => void;
  const attente = new Promise<void>((resolve) => (liberer = resolve));
  await page.route('**/_astro/*.js', async (route) => {
    await attente;
    await route.continue();
  });
  try {
    // Le HTML peut être peint alors que son premier module n’est pas encore reçu.
    await page.goto('/carte/#12/-4.8/11.93', { waitUntil: 'commit' });
    await expect(page.locator('#carte')).toBeVisible();
    await expect(page.locator('.carte-repli')).toBeHidden();
    await expect(page.locator('.carte-attente')).toBeVisible();
    await expect(page.locator('.listes-repli')).toBeVisible();
  } finally {
    liberer();
  }
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  await expect(page.locator('.carte-attente')).toBeHidden();
});

test('le signe d’attente : les trois barres du logo, puis après 10 s une sortie vers la liste (ticket 146)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  let liberer!: () => void;
  const attente = new Promise<void>((resolve) => (liberer = resolve));
  await page.route('**/_astro/*.js', async (route) => {
    await attente;
    await route.continue();
  });
  try {
    await page.goto('/carte/', { waitUntil: 'commit' });
    const signe = page.locator('.carte-attente');
    // La feuille de style est arrivée : le signe attend ses 0,4 s (sans elle, la page n'est pas encore dessinée).
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('.carte-attente')!).animationName ===
        'attente-montrer',
    );
    await expect(signe).toBeVisible();
    await expect(signe.locator('.marque path')).toHaveCount(3);
    await expect(signe.locator('.attente-chargement')).toBeVisible();
    await expect(signe.locator('.attente-chargement')).toHaveText('Chargement de la carte…');
    await expect(signe.locator('.attente-lente')).toBeHidden();
    // Après 10 s : la connexion est lente, et la liste est à un lien.
    await expect(signe.locator('.attente-lente')).toBeVisible({ timeout: 15_000 });
    await expect(signe.locator('.attente-lente')).toHaveText('La connexion est lente.');
    await expect(signe.locator('.attente-chargement')).toBeHidden();
    await expect(signe.getByRole('link', { name: 'voir la liste des écoles' })).toHaveAttribute(
      'href',
      '/ecoles/',
    );
  } finally {
    liberer();
  }
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete');
  await expect(page.locator('.carte-attente')).toBeHidden();
});

test('le signe d’attente reste immobile quand le téléphone demande moins de mouvement', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/carte/');
  const animation = await page
    .locator('.carte-attente .marque path')
    .first()
    .evaluate((p) => getComputedStyle(p).animationName);
  expect(animation).toBe('none');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const enMouvement = await page
    .locator('.carte-attente .marque path')
    .first()
    .evaluate((p) => getComputedStyle(p).animationName);
  expect(enMouvement).toBe('lever-la-barre');
});

test.describe('plein écran sans JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('le dessin et les listes restent immédiatement disponibles', async ({ page }) => {
    await page.goto('/carte/');
    await expect(page.locator('.carte-repli')).toBeVisible();
    await expect(page.locator('.listes-repli')).toBeVisible();
    await expect(page.locator('.carte-attente')).toBeHidden();
  });
});

test('l’aperçu utilise la même photo publique locale que la fiche, sans justification longue', async ({
  page,
}) => {
  // Un lien d'avant le ticket 147 (l'adresse de la fiche avec le pays) se lit encore.
  await page.goto(
    '/carte/?ecole=%2Fecoles%2Fcongo%2Fpointe-noire%2Ftie-tie%2Fcomplexe-scolaire-exemple%2F#15/-4.79105/11.925',
  );
  const apercu = page.locator('.carte-apercu');
  const image = apercu.getByRole('img');
  await expect(image).toBeVisible();
  await expect(image).toHaveAttribute('src', '/photos/93000000-0000-4000-8000-000000000001.webp');
  await expect
    .poll(() => image.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth > 0))
    .toBe(true);
  await expect(apercu).toContainText('Vue sur place');
  await expect(apercu).not.toContainText('jeune');
  await expect(apercu).not.toContainText('seulement ce qui');
});

test('/carte/?ecole=<identifiant> ouvre l’aperçu de l’école, et la carte écrit l’identifiant (ticket 147)', async ({
  page,
}) => {
  await page.goto('/carte/?ecole=482913#15/-4.79105/11.925');
  const apercu = page.locator('.carte-apercu');
  await expect(apercu).toContainText('[Complexe scolaire Exemple]');
  await expect(apercu.getByRole('link', { name: 'Voir la fiche' })).toHaveAttribute(
    'href',
    '/ecoles/complexe-scolaire-exemple-482913/',
  );
  await expect(page).toHaveURL(/[?&]ecole=482913(#|&|$)/);
});
