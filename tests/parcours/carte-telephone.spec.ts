import { expect, test, type Page } from '@playwright/test';
import { servirLesTuiles } from './aides-carte';

// La page /carte/ sur un vrai téléphone (le projet « android-360 », écran tactile). Les défauts vus sur un iPhone le
// 05/11/2026 : en-tête et puces coupés par une page qui défile, puces impossibles à faire défiler au doigt, attribution
// d'OpenStreetMap posée sur le tiroir, légende qui cache la carte, tiroir qui saute avec le clavier, « Ma position » muet.
test.use({
  launchOptions: {
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  },
});
test.beforeEach(async ({ context }) => {
  await servirLesTuiles(context);
});

type Boite = { x: number; y: number; width: number; height: number };
async function ouvrir(page: Page) {
  await page.goto('/carte/');
  await expect(page.locator('.explorateur')).toHaveAttribute('data-active', 'oui');
}
const boite = async (page: Page, selecteur: string): Promise<Boite> => {
  const b = await page.locator(selecteur).boundingBox();
  if (!b) throw new Error(`${selecteur} : introuvable ou invisible`);
  return b;
};
const centre = (page: Page) =>
  page.evaluate(() => {
    const c = (
      window as unknown as { ntanovaCarte: { getCenter(): { lng: number; lat: number } } }
    ).ntanovaCarte.getCenter();
    return [c.lng, c.lat];
  });

/** Un geste du doigt, comme sur un téléphone : appui, glissement par petits pas, relâchement. */
async function glisser(page: Page, de: { x: number; y: number }, vers: { x: number; y: number }) {
  const cdp = await page.context().newCDPSession(page);
  const pas = 10;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: de.x, y: de.y }],
  });
  for (let i = 1; i <= pas; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { x: de.x + ((vers.x - de.x) * i) / pas, y: de.y + ((vers.y - de.y) * i) / pas },
      ],
    });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('la page tient dans l’écran : rien ne défile, l’en-tête, les puces et le tiroir sont à leur place', async ({
  page,
}) => {
  await ouvrir(page);
  const fenetre = page.viewportSize()!;
  // Sur iPhone, `100vh` (sans les barres du navigateur) et `100dvh` (ce qu'on voit) diffèrent : le corps de la page prenait
  // l'une, la carte l'autre, et la page défilait. Le corps prend la hauteur vue et ne défile pas.
  const corps = await page.evaluate(() => {
    const css = getComputedStyle(document.body);
    return {
      minHauteur: css.minHeight,
      hauteur: parseFloat(css.height),
      debordement: css.overflowY,
      html: getComputedStyle(document.documentElement).overflowY,
      defilable: document.documentElement.scrollHeight - innerHeight,
    };
  });
  expect(corps.minHauteur).toBe('0px');
  expect(corps.hauteur).toBeCloseTo(fenetre.height, 0);
  expect(corps.debordement).toBe('hidden');
  expect(corps.html).toBe('hidden');
  expect(corps.defilable).toBeLessThanOrEqual(0);
  // Un geste vertical sur la page ne la fait pas défiler : l'en-tête reste, les puces restent sous lui.
  await page.mouse.wheel(0, 600);
  await glisser(page, { x: 180, y: 300 }, { x: 180, y: 200 });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const entete = await boite(page, '.entete');
  const puces = await boite(page, '.rangee-puces');
  const tiroir = await boite(page, '.panneau-carte');
  expect(entete.y).toBe(0);
  expect(puces.y).toBeGreaterThanOrEqual(entete.y + entete.height - 1);
  // Le tiroir est collé au bas de l'écran : pas de vide blanc dessous.
  expect(tiroir.y + tiroir.height).toBeCloseTo(fenetre.height, 0);
  expect(tiroir.y).toBeGreaterThan(puces.y + puces.height);
});

test('les puces défilent au doigt jusqu’à « Supérieur », sans bouger la carte ni la page', async ({
  page,
}) => {
  await ouvrir(page);
  const rangee = page.locator('.rangee-puces');
  const style = await rangee.evaluate((e) => {
    const css = getComputedStyle(e);
    return { touch: css.touchAction, evenements: css.pointerEvents, defil: css.overflowX };
  });
  // Un conteneur qui défile ne doit jamais perdre ses événements (sur iPhone, « pointer-events: none » le bloque).
  expect(style).toEqual({ touch: 'pan-x', evenements: 'auto', defil: 'auto' });
  const dernier = page.getByRole('button', { name: 'Supérieur', exact: true });
  const largeur = page.viewportSize()!.width;
  expect((await dernier.boundingBox())!.x).toBeGreaterThanOrEqual(largeur);
  const avant = await centre(page);
  const b = await boite(page, '.rangee-puces');
  for (let i = 0; i < 3; i++)
    await glisser(page, { x: largeur - 30, y: b.y + 40 }, { x: 30, y: b.y + 40 });
  await expect.poll(async () => (await dernier.boundingBox())!.x + 1).toBeLessThan(largeur);
  const fin = (await dernier.boundingBox())!;
  expect(fin.x + fin.width).toBeLessThanOrEqual(largeur);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await centre(page)).toEqual(avant);
  // Et la puce atteinte se touche : la carte se filtre.
  await dernier.tap();
  await expect(dernier).toHaveAttribute('aria-pressed', 'true');
});

test('l’attribution d’OpenStreetMap reste écrite et ne recouvre jamais le tiroir, à ses trois hauteurs', async ({
  page,
}) => {
  await ouvrir(page);
  // Une seule attribution (celle de MapLibre), écrite, jamais repliée derrière un bouton : licence ODbL.
  await expect(page.locator('.attribution-carte')).toHaveCount(0);
  const attribution = page.locator('.maplibregl-ctrl-attrib');
  await expect(attribution).toHaveCount(1);
  await expect(attribution).toContainText('© les contributeurs d’OpenStreetMap');
  await expect(attribution).not.toHaveClass(/maplibregl-compact/);
  const poignee = page.getByRole('button', { name: 'Voir les écoles', exact: true });
  const verifier = async (etape: string) => {
    await expect(page.locator('.explorateur')).toHaveAttribute('data-hauteur', etape);
    // Le tiroir mesure sa hauteur, l'attribution la suit : au-dessus de lui, jamais dessous.
    await expect
      .poll(
        async () => {
          const a = await boite(page, '.maplibregl-ctrl-attrib');
          const t = await boite(page, '.panneau-carte');
          return a.y + a.height <= t.y + 1;
        },
        { message: `attribution au-dessus du tiroir (${etape})` },
      )
      .toBe(true);
  };
  await verifier('petit');
  await poignee.click();
  await verifier('moyen');
  await page.getByRole('searchbox').tap();
  await verifier('grand');
  await poignee.click();
  await verifier('petit');
});

test('la légende des zones tient sur une ligne dans le tiroir, et la carte reste libre', async ({
  page,
}) => {
  await ouvrir(page);
  await expect(page.locator('.legende-carte')).toBeHidden();
  const legende = page.locator('.legende-tiroir');
  await expect(legende).toBeVisible();
  await expect(legende).toContainText('Déploiement programmé');
  await expect(legende).toContainText('Relevé en cours');
  const tiroir = await boite(page, '.panneau-carte');
  const l = await boite(page, '.legende-tiroir');
  expect(l.y).toBeGreaterThanOrEqual(tiroir.y);
  expect(l.y + l.height).toBeLessThanOrEqual(tiroir.y + tiroir.height);
  // Une ligne : sur 360 px, les deux repères se suivent sans passer à la ligne.
  expect(l.height).toBeLessThan(30);
  // Une école choisie : la fiche remplace le texte d'aide et la légende.
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await page.locator('[data-resultats]').getByRole('button').first().click();
  await expect(page.locator('.carte-apercu')).toBeVisible();
  await expect(legende).toBeHidden();
});

test('toucher la recherche ouvre le tiroir en grand ; le clavier ne fait pas sauter la page', async ({
  page,
}) => {
  await ouvrir(page);
  const champ = page.getByRole('searchbox');
  await champ.tap();
  await expect(page.locator('.explorateur')).toHaveAttribute('data-hauteur', 'grand');
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // Le clavier (simulé : un navigateur de bureau n'en a pas) mange la moitié basse de l'écran, et le navigateur fait
  // glisser l'écran vu de 40 px : la carte et le tiroir prennent exactement cette partie.
  const fenetre = page.viewportSize()!;
  await page.evaluate(
    ({ hauteur, haut }) => {
      const vue = window.visualViewport!;
      Object.defineProperty(vue, 'height', { value: hauteur, configurable: true });
      Object.defineProperty(vue, 'offsetTop', { value: haut, configurable: true });
      vue.dispatchEvent(new Event('resize'));
    },
    { hauteur: fenetre.height - 280, haut: 40 },
  );
  await expect(page.locator('.explorateur')).toHaveAttribute('data-clavier', 'oui');
  await expect
    .poll(async () => {
      const e = await boite(page, '.explorateur');
      return [Math.round(e.y), Math.round(e.height)];
    })
    .toEqual([40, fenetre.height - 280]);
  const e = await boite(page, '.explorateur');
  const t = await boite(page, '.panneau-carte');
  const f = await boite(page, '.recherche-carte');
  expect(t.y + t.height).toBeCloseTo(e.y + e.height, 0);
  // Le champ est au-dessus du bas de l'écran vu : le clavier ne le cache pas.
  expect(f.y + f.height).toBeLessThan(e.y + e.height);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  // Le clavier se ferme : tout revient.
  await page.evaluate(() => {
    const vue = window.visualViewport!;
    delete (vue as unknown as { height?: number }).height;
    delete (vue as unknown as { offsetTop?: number }).offsetTop;
    vue.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.explorateur')).not.toHaveAttribute('data-clavier', /.*/);
  const apres = await boite(page, '.panneau-carte');
  expect(apres.y + apres.height).toBeCloseTo(fenetre.height, 0);
});

test('la recherche validée referme le clavier, et la poignée replie le tiroir', async ({
  page,
}) => {
  await ouvrir(page);
  const champ = page.getByRole('searchbox');
  await champ.tap();
  await champ.fill('Exemple');
  await champ.press('Enter');
  await expect(champ).not.toBeFocused();
  await expect(page.locator('[data-compte]')).toContainText('résultat');
  await champ.tap();
  await page.getByRole('button', { name: 'Voir les écoles', exact: true }).click();
  await expect(page.locator('.explorateur')).toHaveAttribute('data-hauteur', 'petit');
  await expect(champ).not.toBeFocused();
});

test('le zoom de la carte est une cible de doigt de 44 px, sur /carte/ comme sur l’accueil', async ({
  page,
}) => {
  await ouvrir(page);
  for (const nom of ['Zoomer', 'Dézoomer']) {
    const b = await boite(page, `button[aria-label="${nom}"]`);
    expect(b.width, `${nom} : largeur`).toBeGreaterThanOrEqual(44);
    expect(b.height, `${nom} : hauteur`).toBeGreaterThanOrEqual(44);
  }
  // L'aperçu de l'accueil dessine la même carte avec les mêmes commandes.
  await page.goto('/');
  await page.locator('.explorateur').scrollIntoViewIfNeeded();
  const zoom = page.getByRole('button', { name: 'Zoomer', exact: true });
  await expect(zoom).toBeVisible({ timeout: 30_000 });
  const b = (await zoom.boundingBox())!;
  expect(b.width).toBeGreaterThanOrEqual(44);
  expect(b.height).toBeGreaterThanOrEqual(44);
});
