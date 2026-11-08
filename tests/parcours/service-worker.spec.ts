import { expect, test, type Page } from '@playwright/test';
import { seConnecter } from './aides';

// Le service worker du relais sur le site construit (ticket #62, M5) : il garde ce que `/relais/` charge, et seulement
// cela. Avant, il gardait tout `_astro/` : l'îlot de l'administration et les scripts du site public compris. Garder
// trop change la version à chaque mise en ligne (le bandeau « Nouvelle version prête » s'affiche pour rien) ; garder
// trop peu casse le hors ligne : le second parcours le garde.

/** Les fichiers que le service worker met en cache, lus dans son code. */
async function listeDuServiceWorker(page: Page): Promise<string[]> {
  const code = await (await page.request.get('/relais/sw.js')).text();
  const liste = /const FICHIERS = (\[[\s\S]*?\]);/.exec(code)?.[1];
  if (!liste) throw new Error('La liste du service worker est introuvable.');
  return JSON.parse(liste) as string[];
}

/** Les fichiers de `_astro/` qu'une page nomme, dans son HTML (îlot, renderer, scripts, styles). */
async function fichiersNommesPar(page: Page, adresse: string): Promise<string[]> {
  const html = await (await page.request.get(adresse)).text();
  return [...new Set(html.match(/\/_astro\/[\w.-]+\.(?:js|css)/g) ?? [])];
}

test('le service worker ne garde ni l’administration ni les scripts du site public', async ({
  page,
}) => {
  const liste = await listeDuServiceWorker(page);
  const relais = await fichiersNommesPar(page, '/relais/');
  expect(relais.length, 'la page du relais nomme ses fichiers').toBeGreaterThan(2);
  for (const fichier of relais) expect(liste, `le relais perd « ${fichier} »`).toContain(fichier);
  expect(liste).toContain('/relais/');

  const prives = [
    ...(await fichiersNommesPar(page, '/admin/')),
    ...(await fichiersNommesPar(page, '/ecoles/')),
    ...(await fichiersNommesPar(page, '/carte/')),
  ].filter((fichier) => !relais.includes(fichier));
  expect(
    prives.length,
    'l’administration et le site public ont leurs propres fichiers',
  ).toBeGreaterThan(2);
  for (const fichier of prives) {
    expect(liste, `le relais garde « ${fichier} », qu’il n’ouvre jamais`).not.toContain(fichier);
  }
});

test('tout ce que l’espace relais charge en parcourant ses écrans est dans la liste du service worker', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  const demandes = new Set<string>();
  page.on('request', (requete) => {
    const { pathname } = new URL(requete.url());
    if (/^\/(?:_astro|polices)\//.test(pathname)) demandes.add(pathname);
  });

  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  for (const ecran of ['fiches', 'paie', 'ajouter/1', 'ajouter/2', 'ajouter/3', 'lot']) {
    await page.goto(`/relais/#${ecran}`);
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  expect(demandes.size, 'le relais charge des fichiers').toBeGreaterThan(3);
  const liste = await listeDuServiceWorker(page);
  for (const demande of demandes) {
    expect(liste, `« ${demande} » est chargé par le relais mais absent hors ligne`).toContain(
      demande,
    );
  }
});
