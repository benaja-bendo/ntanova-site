import { expect, test, type Page } from '@playwright/test';

// L'espace relais, construit avec le faux serveur (PUBLIC_ADAPTATEUR=faux) : le
// faux serveur vit dans le navigateur et refuse tout quand le téléphone est hors ligne.

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

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

async function ajouterUneEcole(page: Page, n: number) {
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  await expect(page.getByText('dans votre lot')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByLabel("Nom sur l'enseigne").fill(`[École ${n}]`);
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();

  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page.getByLabel('Sa fonction').selectOption('promoteur');
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await page.getByLabel(/Son WhatsApp/).fill(`06 123 45 6${n}`);
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await page.getByRole('link', { name: 'Mon lot' }).click();
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
