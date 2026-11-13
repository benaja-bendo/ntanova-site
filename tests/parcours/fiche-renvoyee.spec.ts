import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, seConnecter, uneFicheEnvoyee } from './aides';

// Une fiche renvoyée « à corriger » (ticket #92), construit avec le faux serveur : l'administration la retrouve et sait
// depuis quand elle attend son relais ; le relais ne lit plus un refus gardé dans son téléphone quand NTanova a déjà
// décidé. Avant, la fiche « disparaissait » de la file, et le relais lisait « prévenez NTanova » alors que NTanova l'avait
// renvoyée, avec un bouton « Réessayer » qui ne pouvait rien.

test.use({ permissions: ['geolocation'] });

/** L'administration renvoie « [École 1] » au relais. */
async function renvoyer(page: Page, message: string) {
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Demander une correction' }).click();
  await page.getByLabel('Motif').selectOption('autre');
  await page.getByLabel(/Message au relais/).fill(message);
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('status')).toHaveText(/correction part au relais/);
}

/**
 * Le téléphone du relais garde le refus d'une photo perdue (la fiche est arrivée chez NTanova sans elle), comme sur la
 * capture du fondateur : la fiche est « refusée » dans le téléphone, avec sa raison.
 */
function garderLeRefusDeLaPhoto(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const transaction = ouverture.result.transaction('fiches', 'readwrite');
          transaction.objectStore('fiches').openCursor().onsuccess = (e) => {
            const curseur = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
            if (!curseur) return;
            curseur.update({
              ...(curseur.value as object),
              etat: 'refusee',
              rejet: {
                etape: 'photo',
                code: 'photo_absente',
                message:
                  'La photo de l’enseigne n’est plus lisible sur ce téléphone : la fiche est arrivée chez NTanova sans elle.',
              },
            });
            curseur.continue();
          };
          transaction.oncomplete = () => resoudre();
          transaction.onerror = () => rejeter(transaction.error);
        };
      }),
  );
}

test.describe('l’administration retrouve une fiche renvoyée', () => {
  test('« À valider » est vide, mais « Renvoyées » la montre, avec depuis quand elle attend son relais', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'Vérifiez le nom sur l’enseigne.');

    await page.goto('/admin/#valider');
    // La file ne montre que ce qui attend l'administration : la fiche attend son relais.
    await expect(page.getByText('Rien à valider pour le moment.')).toBeVisible();

    await page.getByRole('button', { name: 'Renvoyées' }).click();
    const liste = page.getByRole('list', { name: 'Décisions récentes' });
    await expect(liste.getByRole('listitem')).toHaveCount(1);
    await expect(liste).toContainText('[École 1]');
    await expect(liste).toContainText(/Renvoyée depuis/);
    await liste.getByRole('link', { name: /\[École 1\]/ }).click();
    await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
  });

  test('l’accueil dit combien de fiches attendent leur relais', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'Vérifiez le nom sur l’enseigne.');

    await page.goto('/admin/');
    // Admin v2 : « Aujourd'hui », la carte des fiches renvoyées.
    const carte = page.getByRole('link', { name: /fiche renvoyée aux relais/ });
    await expect(carte).toContainText('1');
    await expect(carte).toContainText(/la plus ancienne attend son relais depuis/);
  });

  test('rien n’a été renvoyé : l’accueil le dit', async ({ page }) => {
    await seConnecter(page, '/admin/');
    const carte = page
      .getByRole('region', { name: 'Ce qui t’attend' })
      .getByRole('listitem')
      .filter({ hasText: 'fiche renvoyée aux relais' });
    await expect(carte).toContainText('0');
    await expect(carte).toContainText('aucune n’attend son relais');
  });
});

test.describe('le relais, quand NTanova a déjà renvoyé sa fiche', () => {
  test('lit un seul message : celui de NTanova, et le bon geste', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'Reprenez la photo de l’enseigne.');
    await garderLeRefusDeLaPhoto(page);

    await page.goto('/relais/#fiches');
    const fiche = page.getByRole('article').filter({ hasText: '[École 1]' });
    await expect(fiche.getByText('Reprenez la photo de l’enseigne.')).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Corriger la fiche' })).toBeVisible();
    // NTanova est déjà prévenue : plus de « prévenez NTanova », et « Réessayer » ne peut pas redonner une photo perdue.
    await expect(fiche.getByText(/n’a pas pu être reçue|Prévenez NTanova/)).toHaveCount(0);
    await expect(fiche.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
  });

  test('tant que NTanova n’a pas décidé, le refus reste : la fiche est arrivée sans sa photo', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await garderLeRefusDeLaPhoto(page);

    await page.goto('/relais/#fiches');
    const fiche = page.getByRole('article').filter({ hasText: '[École 1]' });
    await expect(fiche.getByText(/n’est plus lisible sur ce téléphone/)).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Réessayer' })).toBeVisible();
  });
});
