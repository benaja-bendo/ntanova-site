import { expect, test, type Page } from '@playwright/test';
import { seConnecter } from './aides';

// Les premiers pas (ticket #79), construits avec le faux serveur : le relais teste son téléphone AVANT sa première
// fiche (position, photo relue comme le fera l'envoi, connexion). Rien n'est envoyé ; le résultat est au journal ; rien
// n'est obligatoire. La position n'est pas autorisée au départ (le navigateur de test la refuse).

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

async function ouvrirLesPremiersPas(page: Page) {
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await page.getByRole('button', { name: 'Tester mon téléphone' }).click();
  await expect(page.getByRole('heading', { name: 'Tester mon téléphone' })).toBeVisible();
}

/** Les codes que le journal a gardés : dans la base du téléphone, ou déjà partis chez NTanova (le faux serveur). */
function codesDuJournal(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string[]>((resoudre, rejeter) => {
        const faux = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
          erreurs?: { code: string }[];
        };
        const partis = (faux.erreurs ?? []).map((e) => e.code);
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result.transaction('erreurs').objectStore('erreurs').getAll();
          lecture.onsuccess = () =>
            resoudre([...partis, ...(lecture.result as { code: string }[]).map((e) => e.code)]);
        };
      }),
  );
}

const sectionDe = (page: Page, nom: string) => page.getByRole('region', { name: nom });

test.describe('les premiers pas', () => {
  test('la carte est sur « Mon secteur », elle mène aux tests, et « Passer » la fait disparaître', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    const carte = sectionDe(page, 'Premiers pas');
    await expect(carte).toContainText('facultatif');
    await carte.getByRole('button', { name: 'Tester mon téléphone' }).click();

    // Rien d'obligatoire : « J'ai terminé » attend les trois tests, « Passer » est toujours là.
    await expect(page.getByRole('button', { name: 'J’ai terminé' })).toBeDisabled();
    await page.getByRole('button', { name: 'Passer ces tests' }).click();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await expect(sectionDe(page, 'Premiers pas')).toHaveCount(0);
    // Elle ne revient pas.
    await page.reload();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await expect(sectionDe(page, 'Premiers pas')).toHaveCount(0);
  });

  test('« Compte » permet de les refaire quand on veut', async ({ page }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.getByRole('link', { name: 'Compte' }).click();
    await sectionDe(page, 'Mon téléphone')
      .getByRole('button', { name: 'Tester mon téléphone' })
      .click();
    await expect(page.getByRole('heading', { name: 'Tester mon téléphone' })).toBeVisible();
  });

  test('la position refusée : l’aide du téléphone, le journal, puis le test se relance tout seul', async ({
    page,
    context,
  }) => {
    await ouvrirLesPremiersPas(page);
    await sectionDe(page, 'La position')
      .getByRole('button', { name: 'Tester la position' })
      .click();
    await expect(page.getByRole('alert', { name: 'La position est bloquée' })).toBeVisible();
    await expect.poll(() => codesDuJournal(page)).toContain('test_position_refusee');

    // Le relais règle son téléphone, puis revient : la mesure repart sans qu'il touche à rien.
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
    await page.waitForTimeout(1700);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(sectionDe(page, 'La position')).toContainText(
      'La position est prise, à 8 m près.',
    );
    await expect(page.getByRole('alert', { name: 'La position est bloquée' })).toHaveCount(0);
    await expect.poll(() => codesDuJournal(page)).toContain('test_position_ok');
  });

  test('la photo : allégée, rangée dans le téléphone, relue, effacée, jamais envoyée', async ({
    page,
  }) => {
    await ouvrirLesPremiersPas(page);
    await sectionDe(page, 'La photo').locator('input[type=file]').setInputFiles(photo);
    await expect(sectionDe(page, 'La photo')).toContainText(/La photo est lisible \(\d+ Ko\)/);
    await expect.poll(() => codesDuJournal(page)).toContain('test_photo_ok');

    // Rien n'est parti chez NTanova, et la photo de test n'est plus dans le téléphone.
    const [photosEnvoyees, testPhotoGardee] = await Promise.all([
      page.evaluate(() => {
        const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
          photos?: Record<string, unknown>;
        };
        return Object.keys(etat.photos ?? {}).length;
      }),
      page.evaluate(
        () =>
          new Promise<boolean>((resoudre, rejeter) => {
            const ouverture = indexedDB.open('ntanova-relais');
            ouverture.onerror = () => rejeter(ouverture.error);
            ouverture.onsuccess = () => {
              const lecture = ouverture.result
                .transaction('memoire')
                .objectStore('memoire')
                .get('testPhoto');
              lecture.onsuccess = () => resoudre(lecture.result !== undefined);
            };
          }),
      ),
    ]);
    expect(photosEnvoyees).toBe(0);
    expect(testPhotoGardee).toBe(false);
  });

  test('une photo qui ne se relit pas est dite avant la première fiche, avec un lien vers NTanova', async ({
    page,
  }) => {
    // Ce que fait certains iPhone : le fichier rangé dans la base du téléphone ne se relit plus.
    await page.addInitScript(() => {
      Blob.prototype.arrayBuffer = () => Promise.resolve(new ArrayBuffer(0));
    });
    await ouvrirLesPremiersPas(page);
    await sectionDe(page, 'La photo').locator('input[type=file]').setInputFiles(photo);
    await expect(sectionDe(page, 'La photo')).toContainText('ne se relit pas une fois rangée');
    await expect.poll(() => codesDuJournal(page)).toContain('test_photo_illisible');

    const lien = page.getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' });
    await expect(lien).toBeVisible();
    const message = decodeURIComponent((await lien.getAttribute('href')) ?? '');
    expect(message).toMatch(/photo/);
    expect(message).toMatch(/testé mon téléphone/);
  });

  test('hors ligne, ce n’est pas une panne : les fiches partiront plus tard', async ({
    page,
    context,
  }) => {
    await ouvrirLesPremiersPas(page);
    await context.setOffline(true);
    await sectionDe(page, 'La connexion')
      .getByRole('button', { name: 'Tester la connexion' })
      .click();
    await expect(sectionDe(page, 'La connexion')).toContainText('les fiches partiront plus tard');
    await context.setOffline(false);
    await sectionDe(page, 'La connexion')
      .getByRole('button', { name: 'Tester la connexion' })
      .click();
    await expect(sectionDe(page, 'La connexion')).toContainText('NTanova répond.');
  });

  test('les trois tests faits : « J’ai terminé » rend la main, la carte ne revient pas', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
    await ouvrirLesPremiersPas(page);
    await sectionDe(page, 'La position')
      .getByRole('button', { name: 'Tester la position' })
      .click();
    await expect(sectionDe(page, 'La position')).toContainText('La position est prise');
    await sectionDe(page, 'La photo').locator('input[type=file]').setInputFiles(photo);
    await expect(sectionDe(page, 'La photo')).toContainText('La photo est lisible');
    await sectionDe(page, 'La connexion')
      .getByRole('button', { name: 'Tester la connexion' })
      .click();
    await expect(sectionDe(page, 'La connexion')).toContainText('NTanova répond.');

    // Tout marche : aucun appel à l'aide.
    await expect(page.getByRole('link', { name: 'Écrire à NTanova sur WhatsApp' })).toHaveCount(0);
    await page.getByRole('button', { name: 'J’ai terminé' }).click();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await expect(sectionDe(page, 'Premiers pas')).toHaveCount(0);
  });
});
