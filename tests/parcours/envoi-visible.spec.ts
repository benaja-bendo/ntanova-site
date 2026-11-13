import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ajouterUneEcole, seConnecter } from './aides';

// La file d'envoi dit ce qu'elle fait (ticket #74). Construit avec le faux serveur. Deux réglages du faux serveur, dans
// `localStorage` du navigateur :
//   - `ntanova-faux-reseau-photo` = « 1 » : le navigateur échoue à envoyer la photo (« Load failed ») alors que le téléphone
//     se dit en ligne, comme sur un iPhone ; la base n'a rien répondu ;
//   - `ntanova-faux-latence` = « ms » : chaque réponse traîne.
// Avant, la première erreur de ce genre arrêtait toute la file sans un mot : « Envoyer maintenant » ne montrait rien et les
// fiches suivantes n'étaient jamais essayées.

test.use({ permissions: ['geolocation'] });

function regler(page: Page, cle: string, valeur: string | null) {
  return page.evaluate(
    ({ cle, valeur }) => {
      if (valeur === null) localStorage.removeItem(cle);
      else localStorage.setItem(cle, valeur);
    },
    { cle, valeur },
  );
}

/** Ce que le faux serveur a reçu : les noms des relevés, le nombre de photos, et le journal des erreurs. */
function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves?: Record<string, { nomEnseigne: string }>;
      photos?: Record<string, unknown>;
      erreurs?: { code: string; detail: string | null }[];
    };
    return {
      noms: Object.values(etat.releves ?? {}).map((r) => r.nomEnseigne),
      photos: Object.keys(etat.photos ?? {}).length,
      erreurs: etat.erreurs ?? [],
    };
  });
}

async function ouvrirLEspace(page: Page, context: BrowserContext) {
  await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(
    page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
  ).toBeVisible();
}

const carte = (page: Page, nom: string) => page.getByRole('article').filter({ hasText: nom });

test.describe('une erreur de connexion sur une fiche', () => {
  test('ne bloque pas les fiches suivantes, et chacune dit ce qui n’est pas parti', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-reseau-photo', '1');
    await ajouterUneEcole(page, 1);
    // Une autre école, plus loin : pas de question de doublon à moins de 40 m.
    await context.setGeolocation({ latitude: -4.7982 + 0.0018, longitude: 11.9, accuracy: 8 });
    await ajouterUneEcole(page, 2);

    // Les deux relevés sont arrivés : la photo de la première ne retient pas la seconde.
    await expect
      .poll(async () => (await serveur(page)).noms.sort())
      .toEqual(['[École 1]', '[École 2]']);
    expect((await serveur(page)).photos).toBe(0);

    // « Mes fiches » dit, fiche par fiche, ce qui n'est pas parti.
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    for (const nom of ['[École 1]', '[École 2]']) {
      await expect(
        carte(page, nom).getByText(/La photo n’est pas partie : la connexion a échoué/),
      ).toBeVisible({
        timeout: 15_000,
      });
    }

    // Le réseau revient : « Envoyer maintenant » finit le travail, pour les deux.
    await regler(page, 'ntanova-faux-reseau-photo', null);
    await page.getByRole('button', { name: 'Envoyer maintenant' }).click();
    await expect.poll(async () => (await serveur(page)).photos).toBe(2);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
  });

  test('est gardée dans le journal, avec l’étape et ce que le navigateur a dit', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-reseau-photo', '1');
    await ajouterUneEcole(page, 1);
    await expect.poll(async () => (await serveur(page)).noms).toEqual(['[École 1]']);

    // Le journal part malgré l'échec (avant, la fin de l'envoi était sautée).
    await expect
      .poll(
        async () => (await serveur(page)).erreurs.filter((e) => e.code === 'reseau_photo').length,
        {
          timeout: 20_000,
        },
      )
      .toBeGreaterThan(0);
    const [ligne] = (await serveur(page)).erreurs.filter((e) => e.code === 'reseau_photo');
    expect(ligne?.detail).toMatch(/Load failed/);
    expect(ligne?.detail).toMatch(/en ligne/);
  });
});

test.describe('« Envoyer maintenant »', () => {
  test('montre qu’il travaille, puis dit ce qui n’a pas pu partir', async ({ page, context }) => {
    test.setTimeout(90_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-reseau-photo', '1');
    await ajouterUneEcole(page, 1);
    await expect.poll(async () => (await serveur(page)).noms).toEqual(['[École 1]']);

    // Une 3G qui traîne : l'essai dure assez pour qu'on le voie.
    await regler(page, 'ntanova-faux-latence', '1200');
    const bouton = page.getByRole('button', { name: /Envoyer maintenant|Envoi/ });
    await expect(bouton).toBeVisible();
    await bouton.click();
    await expect(page.getByRole('status').filter({ hasText: 'Envoi en cours' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Envoi/ })).toBeDisabled();

    // Puis le résultat, avec l'heure et la fiche.
    await expect(
      page.getByText(
        /Un envoi a échoué \(\d+\sh\s\d{2}\) : la photo de « \[École 1\] » n’est pas partie/,
      ),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Envoyer maintenant' })).toBeEnabled();

    // Le réseau revient : le résultat le dit aussi.
    await regler(page, 'ntanova-faux-latence', '50');
    await regler(page, 'ntanova-faux-reseau-photo', null);
    await page.getByRole('button', { name: 'Envoyer maintenant' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 20_000 });
    expect((await serveur(page)).photos).toBe(1);
  });
});

test.describe('une photo qui ne se relit plus', () => {
  test('est dite : la fiche ne part pas, avec sa raison, et se reprend', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await ouvrirLEspace(page, context);
    // Le serveur est en panne : la fiche attend dans la file, avec sa photo.
    await regler(page, 'ntanova-faux-panne', '1');
    await ajouterUneEcole(page, 1);
    await expect(page.getByText(/attend d'être envoyée|pas pu être envoyée/)).toBeVisible({
      timeout: 15_000,
    });

    // Le fichier de la photo est vide dans la base du téléphone : il ne se relit plus.
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
              const fiche = curseur.value as { photos: { blob: Blob | null; mime: string }[] };
              fiche.photos = fiche.photos.map((p) => ({
                ...p,
                blob: new Blob([], { type: p.mime }),
              }));
              curseur.update(fiche);
              curseur.continue();
            };
            transaction.oncomplete = () => resoudre();
            transaction.onerror = () => rejeter(transaction.error);
          };
        }),
    );

    await page.reload();
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    const fiche = carte(page, '[École 1]');
    await expect(fiche.getByText('Refusée', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(fiche.getByText(/n’est plus lisible sur ce téléphone/)).toBeVisible();
    await expect(fiche.getByText(/la fiche n’est pas partie/)).toBeVisible();
    expect((await serveur(page)).noms).toEqual([]);

    await fiche.getByRole('button', { name: 'Modifier' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
  });
});
