import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { adresseDeTuile, grilleDeTuiles, ZOOM_DE_POSITION } from '../../src/modele/tuiles';
import {
  ajouterUneEcole,
  ouvrirLaFiche,
  prendrePhotoEtPosition,
  seConnecter,
  uneFicheEnvoyee,
  envoyerSansBonus,
} from './aides';

// Corriger une fiche : le relais revoit ce que NTanova a reçu, ses photos et sa position sur une carte, et une photo
// manquante ne passe plus inaperçue (ticket #72). Construit avec le faux serveur : l'utilisateur est administrateur et
// relais à la fois. Les tuiles d'OpenStreetMap sont interceptées : aucun parcours ne sort sur Internet.

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

/** Une image d'un pixel, pour les tuiles. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Les tuiles que le navigateur demande à OpenStreetMap ; `reseau: false` simule un téléphone sans réseau. */
async function surveillerLesTuiles(
  context: BrowserContext,
  options: { reseau: boolean } = { reseau: true },
) {
  const demandees: string[] = [];
  await context.route('https://tile.openstreetmap.org/**', (route) => {
    demandees.push(route.request().url());
    return options.reseau ? route.fulfill({ contentType: 'image/png', body: PNG }) : route.abort();
  });
  return demandees;
}

/** Ce que le faux serveur a reçu. */
function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      Record<string, { type?: string }> | undefined
    >;
    return {
      releves: Object.values(etat['releves'] ?? {}).map((r) => r.type),
      photos: Object.keys(etat['photos'] ?? {}).length,
    };
  });
}

/** Le faux serveur « perd » les photos : une fiche arrivée sans aucune photo, comme le test réel du 02/11. */
function perdreLesPhotos(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      unknown
    >;
    etat['photos'] = {};
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  });
}

/** L'administration renvoie la fiche « [École 1] » au relais, pour ce motif. */
async function renvoyer(page: Page, motif: string, message: string) {
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Demander une correction' }).click();
  await page.getByLabel('Motif').selectOption(motif);
  await page.getByLabel(/Message au relais/).fill(message);
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('status')).toHaveText(/correction part au relais/);
}

const encart = (page: Page) => page.getByRole('region', { name: 'À faire sur cette école' });
const photosRecues = (page: Page) => page.getByLabel('Photos reçues par NTanova');

test.describe('corriger une fiche : ce que NTanova a déjà reçu', () => {
  test('« autre » : le relais revoit ses photos et sa position sur une carte', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const demandees = await surveillerLesTuiles(context);
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'autre', 'Vérifiez le nom sur l’enseigne.');

    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(page.locator('.entete-etape-titre')).toHaveText('Corriger une fiche');
    await expect(encart(page)).toContainText('Vérifiez le nom sur l’enseigne.');

    // La photo reçue est là, avec son rôle, et la consigne dit qu'il n'y a rien à refaire.
    await expect(photosRecues(page).getByText('Enseigne ou entrée')).toBeVisible();
    const image = photosRecues(page).getByAltText('Photo reçue : Enseigne ou entrée');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
    await expect(photosRecues(page)).toContainText(
      "NTanova a déjà la photo de l'enseigne. Reprenez-la seulement si elle est fausse.",
    );

    // La position envoyée est sur une carte, avec ses coordonnées, son lien et l'attribution d'OpenStreetMap.
    const carte = page.getByRole('img', { name: /Carte de la position -4\.80000, 11\.90000/ });
    await expect(carte).toBeVisible();
    await expect(page.getByText('Position envoyée le', { exact: false })).toBeVisible();
    await expect(page.getByText(/-4\.80000, 11\.90000 · précision 8\s*m/)).toBeVisible();
    await expect(page.getByText('© les contributeurs d’OpenStreetMap')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ouvrir dans l’application de cartes' }),
    ).toHaveAttribute('href', /google\.com\/maps.*-4\.800000,11\.900000/);

    // La position est connue : le bouton propose de la reprendre, pas de la prendre.
    await expect(page.getByRole('button', { name: 'Reprendre la position' })).toBeVisible();

    // Les tuiles demandées sont exactement celles qui couvrent la position : peu, au bon zoom, au bon endroit.
    const attendues = grilleDeTuiles(
      { latitude: -4.8, longitude: 11.9 },
      { largeur: 360, hauteur: 220, zoom: ZOOM_DE_POSITION },
    ).tuiles.map(adresseDeTuile);
    await expect.poll(() => [...new Set(demandees)].sort()).toEqual([...attendues].sort());
    expect(attendues.length).toBeLessThanOrEqual(6);
  });

  test('sans réseau : la carte le dit, la position reste notée', async ({ page, context }) => {
    test.setTimeout(90_000);
    const demandees = await surveillerLesTuiles(context, { reseau: false });
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'autre', 'Vérifiez le nom.');

    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(page.getByText('La carte demande du réseau.', { exact: false })).toBeVisible();
    await expect(page.getByText(/-4\.80000, 11\.90000 · précision 8\s*m/)).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Ouvrir dans l’application de cartes' }),
    ).toBeVisible();
    expect(demandees.length).toBeGreaterThan(0);
  });

  // Le bug du test réel du 02/11 : une fiche arrivée sans photo, renvoyée pour « autre » (« il manque les images »).
  // L'ancienne règle disait « NTanova a déjà la photo » et ne la demandait pas : le relais ne pouvait pas la remettre.
  test('« autre » sur une fiche arrivée sans photo : la photo est demandée, et part', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await surveillerLesTuiles(context);
    await uneFicheEnvoyee(page, context);
    await perdreLesPhotos(page);
    await renvoyer(page, 'autre', 'Il manque les images, tu peux les remettre ?');

    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(encart(page)).toContainText('Il manque les images, tu peux les remettre ?');
    await expect(encart(page).getByText('À prendre')).toBeVisible();
    await expect(photosRecues(page)).toContainText(
      "NTanova n'a reçu aucune photo avec cette fiche. Prenez la photo de l'enseigne maintenant.",
    );
    await expect(page.getByText("NTanova a déjà la photo de l'enseigne")).toHaveCount(0);

    // Sans photo, « Suivant » refuse : la photo est exigée.
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText("Ajoutez la photo de l'enseigne.")).toBeVisible();

    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await envoyerSansBonus(page);
    await page.getByRole('link', { name: 'Mon secteur' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    // La photo est arrivée chez NTanova.
    await expect.poll(async () => (await serveur(page)).photos).toBe(1);
  });
});

test.describe('la carte d’une position qu’on vient de prendre', () => {
  test('ne se charge qu’à la demande, et se cache', async ({ page, context }) => {
    const demandees = await surveillerLesTuiles(context);
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();
    await prendrePhotoEtPosition(page);

    // Rien n'est demandé à OpenStreetMap tant que le relais n'ouvre pas la carte : le réseau mobile se paie.
    expect(demandees).toEqual([]);
    await page.getByRole('button', { name: 'Voir sur la carte' }).click();
    await expect(
      page.getByRole('img', { name: /Carte de la position -4\.79820, 11\.90000/ }),
    ).toBeVisible();
    await expect.poll(() => demandees.length).toBeGreaterThan(0);
    await expect(page.getByText('Position prise maintenant')).toBeVisible();

    await page.getByRole('button', { name: 'Cacher la carte' }).click();
    await expect(page.getByRole('img', { name: /Carte de la position/ })).toHaveCount(0);
  });
});

test.describe('une photo exigée qui n’est plus dans le téléphone', () => {
  // Avant : l'étape « photo » se terminait sans rien envoyer, la fiche partait sans photo et passait à « Envoyée »,
  // sans que personne le voie.
  test('la fiche ne part pas sans elle : elle est refusée avec sa raison, et se reprend', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();

    // Le faux serveur est en panne : la fiche attend dans la file, avec sa photo.
    await page.evaluate(() => localStorage.setItem('ntanova-faux-panne', '1'));
    await ajouterUneEcole(page, 1);
    await expect(page.getByText(/attend d'être envoyée|pas pu être envoyée/)).toBeVisible({
      timeout: 15_000,
    });

    // Le fichier de la photo disparaît de la base du téléphone (ce que l'on soupçonne sur l'iPhone du relais).
    await page.evaluate(
      () =>
        new Promise<void>((resoudre, rejeter) => {
          const ouverture = indexedDB.open('ntanova-relais');
          ouverture.onerror = () => rejeter(ouverture.error);
          ouverture.onsuccess = () => {
            const transaction = ouverture.result.transaction('fiches', 'readwrite');
            const magasin = transaction.objectStore('fiches');
            magasin.openCursor().onsuccess = (e) => {
              const curseur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
              if (!curseur) return;
              const fiche = curseur.value as { photos: { blob: Blob | null }[] };
              fiche.photos = fiche.photos.map((p) => ({ ...p, blob: null }));
              curseur.update(fiche);
              curseur.continue();
            };
            transaction.oncomplete = () => resoudre();
            transaction.onerror = () => rejeter(transaction.error);
          };
        }),
    );

    // L'application s'ouvre de nouveau (la panne dure encore : aucun envoi n'aboutirait) : la fiche est refusée AVANT
    // d'être envoyée, sans même tenter le serveur.
    await page.reload();
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    const fiche = page.getByRole('article').filter({ hasText: '[École 1]' });
    await expect(fiche.getByText('Refusée', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(
      fiche.getByText(/La photo de l'enseigne n'est plus dans le téléphone/),
    ).toBeVisible();
    await expect(fiche.getByText(/la fiche n'est pas partie/)).toBeVisible();

    // Le serveur revient : une fiche refusée n'est pas rejouée, rien n'est parti.
    await page.evaluate(() => localStorage.removeItem('ntanova-faux-panne'));
    await page.waitForTimeout(1500);
    expect((await serveur(page)).releves).toEqual([]);

    // « Modifier » ramène à la photo, qui est exigée de nouveau.
    await fiche.getByRole('button', { name: 'Modifier' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText("Ajoutez la photo de l'enseigne.")).toBeVisible();
  });
});
