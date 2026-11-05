import { expect, test, type Page } from '@playwright/test';
import { servirLesTuiles } from './aides-carte';

// La carte interactive (ticket 103, étape C), sur le catalogue fictif et une mini-archive de tuiles : jamais Internet.
// Le catalogue : à Tié-Tié et Ngoyo le relevé est en cours, à Loandjili et Mongo-Mpoukou il est programmé ; cinq écoles sont
// sur la carte (quatre proches les unes des autres, dont une confirmée par sa direction, et une seule à Mongo-Mpoukou).
// Ces parcours demandent un navigateur qui sait créer un contexte WebGL2 : le premier test le dit en clair s'il ne le sait pas.

test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
});

/** Ce que la carte sait d'elle-même : posé par l'îlot sur `window.ntanovaCarte` (comme `window.carte` de /dev/carte/). */
const carte = <T>(page: Page, fonction: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(
    ([f, a]) => {
      const m = (
        window as unknown as { ntanovaCarte: Record<string, (...x: unknown[]) => unknown> }
      ).ntanovaCarte;
      const cible = m[f as string];
      if (!cible) throw new Error(`La carte n’a pas ${String(f)}`);
      return cible.apply(m, a as unknown[]);
    },
    [fonction, args] as const,
  ) as Promise<T>;

async function ouvrirLaCarte(page: Page) {
  await page.goto('/carte/');
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete', { timeout: 30_000 });
  // La carte commence sous le titre : on la fait défiler dans l'écran du téléphone avant de la toucher.
  await page.locator('#carte').scrollIntoViewIfNeeded();
}

/** Les features rendues d'une couche, avec leur place à l'écran (pixels de la page). */
async function rendues(page: Page, couche: string) {
  return page.evaluate((c) => {
    const m = (
      window as unknown as {
        ntanovaCarte: {
          queryRenderedFeatures: (o: { layers: string[] }) => {
            properties: Record<string, unknown>;
            geometry: { coordinates: [number, number] };
          }[];
          project: (p: [number, number]) => { x: number; y: number };
          getCanvas: () => HTMLCanvasElement;
        };
      }
    ).ntanovaCarte;
    const boite = m.getCanvas().getBoundingClientRect();
    return m.queryRenderedFeatures({ layers: [c] }).map((f) => {
      const p = m.project(f.geometry.coordinates);
      return {
        proprietes: f.properties,
        coordonnees: f.geometry.coordinates,
        x: boite.x + p.x,
        y: boite.y + p.y,
      };
    });
  }, couche);
}

test('le navigateur des parcours sait créer un contexte WebGL2', async ({ page }) => {
  await page.goto('/carte/');
  const version = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    return g ? String(g.getParameter(g.VERSION)) : null;
  });
  expect(
    version,
    'Sans WebGL2, les parcours de la carte ne testent que le repli : il faut un Chromium qui le sait (SwiftShader).',
  ).toContain('WebGL 2');
});

test('s’active d’office sur /carte/ : le fond, les zones et les écoles, l’attribution, et la liste reste', async ({
  page,
  context,
}) => {
  const tuiles = await servirLesTuiles(context);
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await ouvrirLaCarte(page);

  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  // L'attribution d'OpenStreetMap est écrite sous la carte, jamais repliée (licence ODbL).
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText(
    '© les contributeurs d’OpenStreetMap',
  );
  // Le fond est lu par morceaux (requêtes partielles), du serveur de tuiles et d'aucun autre.
  expect(tuiles.requetes.some((r) => r.range?.startsWith('bytes='))).toBe(true);
  // Le dessin de repli s'efface quand la carte est prête ; la liste, elle, reste.
  await expect(page.locator('.carte-repli')).toBeHidden();
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await expect(page.locator('[data-compte]')).toContainText('5 écoles dans cette vue');
  await expect(
    page.locator('[data-resultats]').getByRole('button', { name: /\[Complexe scolaire Exemple\]/ }),
  ).toBeVisible();
  // Le style, les zones et les écoles sont ceux du site construit.
  expect(
    await carte<string>(page, 'getStyle').then((s) => (s as unknown as { name: string }).name),
  ).toBe('NTanova · carte');
  expect(erreurs).toEqual([]);
});

test('montre Pointe-Noire d’abord, sans jamais s’approcher plus que le zoom 13', async ({
  page,
  context,
}) => {
  await servirLesTuiles(context);
  await ouvrirLaCarte(page);
  const zoom = await carte<number>(page, 'getZoom');
  expect(zoom).toBeGreaterThan(9);
  expect(zoom).toBeLessThanOrEqual(13.01);
  const centre = await carte<{ lng: number; lat: number }>(page, 'getCenter');
  expect(centre.lng).toBeGreaterThan(11.8);
  expect(centre.lng).toBeLessThan(12);
  expect(centre.lat).toBeGreaterThan(-4.95);
  expect(centre.lat).toBeLessThan(-4.7);
});

test('un groupe se défait au toucher, une épingle ouvre son aperçu avec le lien de la fiche', async ({
  page,
  context,
}) => {
  await servirLesTuiles(context);
  await ouvrirLaCarte(page);

  // À l'arrivée sur Pointe-Noire, les cinq écoles de la carte forment UN groupe, avec son nombre. L'une d'elles est confirmée
  // par sa direction : le groupe porte un écusson.
  const groupes = await rendues(page, 'ecoles-groupes');
  expect(groupes).toHaveLength(1);
  expect(groupes[0]?.proprietes.point_count).toBe(5);
  expect(groupes[0]?.proprietes.confirmees).toBe(1);
  expect(await rendues(page, 'ecoles-epingles')).toHaveLength(0);

  // Toucher un groupe le défait : la carte s'approche, jusqu'à ce que chaque école ait son épingle (au doigt, comme sur un
  // téléphone : le toucher couvre 22 px autour du doigt).
  for (let i = 0; i < 8; i++) {
    const restants = await rendues(page, 'ecoles-groupes');
    const groupe = restants[0];
    if (!groupe) break;
    const avant = await carte<number>(page, 'getZoom');
    await page.touchscreen.tap(groupe.x, groupe.y);
    await expect
      .poll(async () => (await carte<number>(page, 'getZoom')) > avant + 0.05, { timeout: 10_000 })
      .toBe(true);
    await expect.poll(() => carte<boolean>(page, 'isMoving'), { timeout: 10_000 }).toBe(false);
  }
  expect(await rendues(page, 'ecoles-groupes')).toHaveLength(0);
  const epingles = await rendues(page, 'ecoles-epingles');
  expect(epingles.length).toBeGreaterThanOrEqual(2);

  // L'école confirmée par sa direction : son aperçu dit la preuve, sans la confondre avec « vue sur place ».
  const confirmee = epingles.find((e) => e.proprietes.preuve === 'direction');
  expect(confirmee, 'l’épingle de l’école confirmée est sur la carte').toBeDefined();
  await carte(page, 'jumpTo', { center: confirmee!.coordonnees });
  const cibleConfirmee = (await rendues(page, 'ecoles-epingles')).find(
    (e) => e.proprietes.preuve === 'direction',
  )!;
  await page.touchscreen.tap(cibleConfirmee.x, cibleConfirmee.y);
  const apercu = page.locator('.carte-apercu');
  await expect(apercu).toBeVisible();
  await expect(apercu).toContainText(String(confirmee!.proprietes.nom));
  await expect(apercu).toContainText('Confirmée par la direction le');
  const lien = apercu.getByRole('link', { name: 'Voir la fiche' });
  await expect(lien).toHaveAttribute('href', String(confirmee!.proprietes.lien));
  // Le lien est une vraie cible de doigt : 44 px au moins.
  expect((await lien.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  // La croix de fermeture est une vraie cible de doigt, elle aussi ; une fois l'aperçu fermé, l'épingle voisine se touche.
  const croix = page.locator('.maplibregl-popup-close-button');
  const taille = await croix.boundingBox();
  expect(taille?.width).toBeGreaterThanOrEqual(44);
  expect(taille?.height).toBeGreaterThanOrEqual(44);
  await croix.tap();
  await expect(page.locator('.carte-apercu')).toHaveCount(0);

  // Une école « vue sur place » dit sa propre preuve, sans emprunter celle d'une autre. La poignée referme la liste, pour
  // que la carte reprenne la place.
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Voir les écoles', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  const vue = (await rendues(page, 'ecoles-epingles')).find(
    (e) => e.proprietes.preuve === 'terrain',
  );
  expect(vue, 'une épingle « vue sur place » est sur la carte').toBeDefined();
  await carte(page, 'jumpTo', { center: vue!.coordonnees });
  const cibleVue = (await rendues(page, 'ecoles-epingles')).find(
    (e) => e.proprietes.id === vue!.proprietes.id,
  )!;
  await page.touchscreen.tap(cibleVue.x, cibleVue.y);
  await expect(page.locator('.carte-apercu')).toContainText(String(vue!.proprietes.nom));
  await expect(page.locator('.carte-apercu')).toContainText('Vue sur place le');
  await expect(page.locator('.carte-apercu')).not.toContainText('Confirmée par la direction');
});

test('hors de Pointe-Noire et de Brazzaville, le zoom s’arrête à 10 : le fichier n’a pas de tuile plus fine', async ({
  page,
  context,
}) => {
  await servirLesTuiles(context);
  await ouvrirLaCarte(page);

  // Dolisie, zoom 12 demandé : la carte revient au zoom 10 (sinon elle serait blanche).
  await carte(page, 'jumpTo', { center: [12.67, -4.2], zoom: 12 });
  await expect
    .poll(() => carte<number>(page, 'getZoom'), { timeout: 10_000 })
    .toBeLessThanOrEqual(10.05);
  await expect.poll(() => carte<number>(page, 'getMaxZoom')).toBe(10);

  // Dans Brazzaville, le zoom redevient libre jusqu'à la rue : on y glisse d'abord (le plafond se relève à l'arrêt), puis on
  // s'approche, comme le ferait une personne.
  await carte(page, 'jumpTo', { center: [15.27, -4.27], zoom: 10 });
  await expect
    .poll(() => carte<number>(page, 'getMaxZoom'), { timeout: 10_000 })
    .toBeGreaterThan(15);
  await carte(page, 'jumpTo', { zoom: 15 });
  expect(await carte<number>(page, 'getZoom')).toBeCloseTo(15, 0);
});

test('sans WebGL2, rien de la carte n’est téléchargé : le dessin et la liste restent, sans message d’erreur', async ({
  page,
  context,
}) => {
  const tuiles = await servirLesTuiles(context);
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // Un navigateur qui ne sait pas créer de contexte WebGL2 répond `null`, comme celui d'un vieux téléphone.
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...suite: unknown[]
    ) {
      if (type === 'webgl2') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...suite) as never;
    } as typeof original;
  });
  const demandes: string[] = [];
  page.on('request', (r) => demandes.push(r.url()));
  const erreurs: string[] = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') erreurs.push(m.text());
  });

  await page.goto('/carte/');
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'repli-sans-webgl2');
  await expect(page.locator('#carte-note')).toContainText('n’est pas disponible sur cet appareil');
  await expect(page.locator('#carte-note')).toContainText(
    'La liste ci-dessous donne les mêmes écoles',
  );
  await expect(page.locator('.carte-repli')).toBeVisible();
  await expect(page.getByRole('link', { name: '[Complexe scolaire Exemple]' })).toBeVisible();

  // Ni l'îlot (MapLibre, son worker), ni le style, ni les GeoJSON, ni les tuiles : 0 octet de carte pour ce téléphone.
  await page.waitForTimeout(500);
  expect(demandes.filter((u) => /\/_astro\/(esm|ilot|maplibre)/.test(u))).toEqual([]);
  expect(
    demandes.filter((u) => /\/carte\/(style\.json|zones\.geojson|ecoles\.geojson)/.test(u)),
  ).toEqual([]);
  expect(tuiles.requetes).toEqual([]);
  expect(erreurs).toEqual([]);
});

test('un fond de carte qui ne répond pas est dit calmement : les zones, les écoles et la liste restent', async ({
  page,
  context,
}) => {
  await servirLesTuiles(context, 'absent');
  await page.goto('/carte/');
  await expect(page.locator('#carte-note')).toContainText('Le fond de carte ne se charge pas');
  await expect(page.locator('#carte')).toHaveAttribute('data-fond', 'absent');
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete', { timeout: 30_000 });
  // Les écoles se dessinent quand même (leur GeoJSON vient du site, pas du serveur de tuiles).
  await expect
    .poll(
      async () =>
        (await rendues(page, 'ecoles-groupes')).length +
        (await rendues(page, 'ecoles-epingles')).length,
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: /\[Complexe scolaire Exemple\]/ })).toBeVisible();
});

test('ne demande jamais la position, et n’envoie rien de la personne', async ({
  page,
  context,
}) => {
  const tuiles = await servirLesTuiles(context);
  await page.addInitScript(() => {
    const appels: string[] = [];
    (window as unknown as { __position: string[] }).__position = appels;
    for (const nom of ['getCurrentPosition', 'watchPosition'] as const) {
      navigator.geolocation[nom] = (() => {
        appels.push(nom);
        return 0;
      }) as never;
    }
  });
  const sortantes: { url: string; corps: string | null }[] = [];
  page.on('request', (r) => {
    if (r.method() !== 'GET') sortantes.push({ url: r.url(), corps: r.postData() });
  });
  const reponse = await page.goto('/carte/');
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete', { timeout: 30_000 });

  // Les en-têtes de la page n'ouvrent pas la position (elle reste fermée tant qu'aucun bouton ne la demande).
  expect(reponse?.headers()['permissions-policy']).toContain('geolocation=(self)');
  expect(
    await page.evaluate(() => (window as unknown as { __position: string[] }).__position),
  ).toEqual([]);
  // Aucune requête qui écrit, et le serveur de tuiles ne reçoit que des lectures partielles.
  expect(sortantes.filter((s) => !/\/\/tuiles\.ntanova\.com\//.test(s.url))).toEqual([]);
  expect(tuiles.requetes.every((r) => ['GET', 'OPTIONS'].includes(r.methode))).toBe(true);
});

test('l’école choisie grandit, a son halo et son nom ; la fermer les efface', async ({
  page,
  context,
}) => {
  await servirLesTuiles(context);
  const ecoles = (await page.request.get('/carte/ecoles.geojson').then((r) => r.json())) as {
    features: {
      geometry: { coordinates: [number, number] };
      properties: { id: string; nom: string; lien: string };
    }[];
  };
  const ecole = ecoles.features[0]!;
  const [x, y] = ecole.geometry.coordinates;
  await page.goto(`/carte/?ecole=${encodeURIComponent(ecole.properties.lien)}#15/${y}/${x}`);
  await expect(page.locator('#carte')).toHaveAttribute('data-etat', 'prete', { timeout: 30_000 });
  await expect(page.locator('.carte-apercu')).toContainText(ecole.properties.nom);

  // Son épingle (plus grande), son halo et son nom sont ceux de l'école choisie, et d'elle seule.
  await expect
    .poll(async () => (await rendues(page, 'ecole-choisie-epingle')).length, { timeout: 15_000 })
    .toBe(1);
  expect((await rendues(page, 'ecole-choisie-epingle'))[0]?.proprietes.id).toBe(
    ecole.properties.id,
  );
  await expect
    .poll(async () => (await rendues(page, 'ecole-choisie-halo')).length, { timeout: 15_000 })
    .toBe(1);
  // Le nom du fond ne se double pas avec celui de l'école choisie.
  expect(
    (await rendues(page, 'ecoles-noms')).some((f) => f.proprietes.id === ecole.properties.id),
  ).toBe(false);

  // La fermer efface le halo et la grande épingle ; l'épingle ordinaire reste.
  await page.locator('.apercu-fermer').tap();
  await expect(page.locator('.carte-apercu')).toHaveCount(0);
  await expect
    .poll(async () => (await rendues(page, 'ecole-choisie-epingle')).length, { timeout: 15_000 })
    .toBe(0);
  expect(await rendues(page, 'ecole-choisie-halo')).toHaveLength(0);
  expect((await rendues(page, 'ecoles-epingles')).length).toBeGreaterThanOrEqual(1);
});
