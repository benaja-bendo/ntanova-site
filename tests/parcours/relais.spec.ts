import { expect, test, type Page } from '@playwright/test';
import { ajouterUneEcole } from './aides';

// L'espace relais, construit avec le faux serveur (PUBLIC_ADAPTATEUR=faux) : le
// faux serveur vit dans le navigateur et refuse tout quand le téléphone est hors ligne.

/** Ce que le téléphone garde encore : fiches, photos et contacts. */
function telephone(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ fiches: number; photos: number; contacts: number }>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result.transaction('fiches').objectStore('fiches').getAll();
          lecture.onsuccess = () => {
            const fiches = lecture.result as { photo: unknown; contact: unknown }[];
            resoudre({
              fiches: fiches.length,
              photos: fiches.filter((f) => f.photo).length,
              contacts: fiches.filter((f) => f.contact).length,
            });
          };
        };
      }),
  );
}

function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      Record<string, unknown>
    >;
    return {
      releves: Object.keys(etat.releves ?? {}).length,
      photos: Object.keys(etat.photos ?? {}).length,
      contacts: Object.values(etat.contacts ?? {}) as { whatsapp: string | null }[],
    };
  });
}

test.describe('espace relais', () => {
  test.use({ permissions: ['geolocation'] });

  test('trois fiches faites hors ligne partent quand le réseau revient, et le contact disparaît du téléphone', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/relais/');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    // Le lot est gardé dans le téléphone, pour servir hors ligne : on attend qu'il y soit avant
    // de couper le réseau (sinon, sur une machine chargée, « dans votre lot » ne vient jamais).
    await expect(page.getByRole('region', { name: 'Mon lot' }).getByText(/Tié-Tié/)).toBeVisible();

    // L'application est gardée dans le téléphone : elle s'ouvre sans réseau.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();

    for (const n of [1, 2, 3]) {
      // Une école tous les 200 m : aucune n'est un doublon de l'autre.
      await context.setGeolocation({ latitude: -4.8 + n * 0.0018, longitude: 11.9, accuracy: 8 });
      await ajouterUneEcole(page, n);
    }

    await expect(page.getByText('3 fiches attendent le réseau.')).toBeVisible();

    // En rouvrant l'application, « Tout est envoyé » ne doit jamais s'afficher,
    // même un instant, tant que des fiches attendent (le relais fermerait l'application).
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.body?.innerText.includes('Tout est envoyé')) {
          (window as unknown as { toutEnvoyeVu: boolean }).toutEnvoyeVu = true;
        }
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });
    await page.reload();
    await expect(page.getByText('3 fiches attendent le réseau.')).toBeVisible();
    expect(
      await page.evaluate(() => (window as unknown as { toutEnvoyeVu?: boolean }).toutEnvoyeVu),
    ).toBeUndefined();
    expect(await telephone(page)).toEqual({ fiches: 3, photos: 3, contacts: 3 });
    expect((await serveur(page)).releves).toBe(0);

    await context.setOffline(false);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 20_000 });

    const recu = await serveur(page);
    expect(recu.releves).toBe(3);
    expect(recu.photos).toBe(3);
    expect(recu.contacts.map((c) => c.whatsapp).sort()).toEqual([
      '242061234561',
      '242061234562',
      '242061234563',
    ]);
    expect(await telephone(page)).toEqual({ fiches: 3, photos: 0, contacts: 0 });

    await page.getByRole('link', { name: 'Mes fiches' }).click();
    await expect(page.getByText('À valider par NTanova')).toHaveCount(3);
    await expect(page.getByText('06 123')).toHaveCount(0);
  });

  test('sans accord, le numéro ne peut pas être noté', async ({ page }) => {
    await page.goto('/relais/');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    await page.goto('/relais/#ajouter/3');
    await page.getByRole('button', { name: 'Oui', exact: true }).click();
    await expect(page.getByLabel(/Son WhatsApp/)).toBeDisabled();
  });

  test('sur ordinateur, garde la largeur d’un téléphone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/relais/');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    const navigation = page.getByRole('navigation', { name: 'Espace relais' });
    await expect(navigation).toBeVisible();
    expect((await navigation.boundingBox())?.width).toBeLessThanOrEqual(640);
  });

  test('tient dans 360 px sans défilement horizontal', async ({ page, context }) => {
    await context.setGeolocation({ latitude: -4.79, longitude: 11.93, accuracy: 12 });
    await page.goto('/relais/');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    for (const ecran of ['#lot', '#fiches', '#ajouter/1', '#ajouter/2', '#ajouter/3']) {
      await page.goto(`/relais/${ecran}`);
      await page.waitForTimeout(300);
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largeur, ecran).toBeLessThanOrEqual(360);
    }
  });
});
