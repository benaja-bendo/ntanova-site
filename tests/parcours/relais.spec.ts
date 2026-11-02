import { expect, test, type Page } from '@playwright/test';
import { ajouterUneEcole, prendrePhotoEtPosition, seConnecter } from './aides';

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
            const fiches = lecture.result as {
              photos: { blob: unknown }[];
              contact: unknown;
            }[];
            resoudre({
              fiches: fiches.length,
              // Les photos qui attendent encore d'être envoyées : le fichier part du téléphone dès qu'il est reçu.
              photos: fiches.flatMap((f) => f.photos.filter((p) => p.blob)).length,
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
    // Le secteur et les écoles connues sont gardés dans le téléphone, pour servir hors ligne : on attend qu'ils y
    // soient avant de couper le réseau.
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();

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

  // Le secteur est un conseil, jamais une barrière (ticket n° 67) : le téléphone ne dit rien de la distance au
  // secteur, et la fiche continue. Le secteur du faux serveur est un carré dont le bord est à 11,95° de longitude :
  // à cette latitude, 0,00027° font 30 m et 0,00072° font 80 m (l'ancien seuil de 50 m est tombé avec le message).
  for (const [distance, longitude] of [
    ['30 m', 11.95027],
    ['80 m', 11.95072],
    ['3 km', 11.98],
  ] as const) {
    test(`une école à ${distance} du bord du secteur se relève sans aucun message sur le secteur`, async ({
      page,
      context,
    }) => {
      await context.setGeolocation({ latitude: -4.79, longitude, accuracy: 8 });
      await seConnecter(page, '/relais/');
      await expect(
        page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
      ).toBeVisible();
      await prendrePhotoEtPosition(page);
      await expect(page.getByText(/hors de votre/)).toHaveCount(0);
      await expect(page.getByText(/dans votre/)).toHaveCount(0);
      // Et la fiche continue.
      await page.getByRole('button', { name: 'Suivant' }).click();
      await expect(page.getByLabel("Nom sur l'enseigne")).toBeVisible();
    });
  }

  test('un relais sans secteur voit les zones ouvertes, relève une école et reçoit l’alerte à 40 m sans réseau', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    // L'école publiée du faux serveur est en (-4,79105 ; 11,925) : on se tient à une vingtaine de mètres.
    await context.setGeolocation({ latitude: -4.79123, longitude: 11.925, accuracy: 8 });
    await page.addInitScript(() => localStorage.setItem('ntanova-faux-sans-secteur', '1'));
    await seConnecter(page, '/relais/');
    const secteur = page.getByRole('region', { name: 'Mon secteur' });
    await expect(secteur).toContainText('Pas de secteur conseillé');
    // À défaut de secteur, l'écran dit où NTanova relève : les zones ouvertes.
    await expect(secteur).toContainText('Zones ouvertes : Ngoyo, Tié-Tié');
    await expect(secteur).not.toContainText('Aucun lot');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
    await expect(secteur).toContainText('Zones ouvertes : Ngoyo, Tié-Tié');

    await prendrePhotoEtPosition(page);
    const doublon = page.getByRole('region', { name: 'Doublon possible' });
    await expect(doublon).toContainText('[École exemple publiée]');
    await expect(doublon).toContainText('40');
  });

  test('la phrase d’ouverture ne nomme ni ville ni lot, et le titre dit « Ajouter une école »', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    const phrase = page.getByRole('region', { name: 'À dire en entrant' });
    // Le lot du faux serveur s'appelle « Tié-Tié » : la phrase ne le reprend plus. Un lot fin portera un nom
    // de lot, et un relais sans lot ne doit pas se voir répondre « Pointe-Noire ».
    await expect(phrase).toContainText(
      'Bonjour. Nous relevons les écoles du quartier pour un annuaire en ligne destiné aux familles. ' +
        'Nous venons de relever votre école, avec ce qui se voit de la rue. ' +
        "Pour que sa fiche soit juste et que l'établissement puisse la corriger si besoin, " +
        'nous voulons la faire valider par la direction : à qui pouvons-nous nous adresser ?',
    );
    await expect(phrase).not.toContainText('Pointe-Noire');
    await expect(phrase).not.toContainText('Tié-Tié');
    // La ligne « Jamais » ne change pas.
    await expect(phrase).toContainText(
      'Jamais : se dire parent, dire que le site est déjà connu, promettre quelque chose, photographier un enfant.',
    );

    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await expect(page.locator('.entete-etape-titre')).toHaveText('Ajouter une école');
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

  test('la barre du bas tient sur une ligne à 360 px : quatre onglets de 44 px au moins, sans texte coupé', async ({
    page,
  }) => {
    await page.goto('/relais/');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    const navigation = page.getByRole('navigation', { name: 'Espace relais' });
    for (const [ecran, onglet] of [
      ['lot', 'Mon secteur'],
      ['fiches', 'Mes fiches'],
      ['paie', 'Ma paie'],
      ['compte', 'Compte'],
    ] as const) {
      await page.goto(`/relais/#${ecran}`);
      await expect(navigation).toBeVisible();
      await expect(navigation.getByRole('link', { name: onglet })).toHaveAttribute(
        'aria-current',
        'page',
      );
      const barre = await navigation.boundingBox();
      const boites = await Promise.all(
        (await navigation.getByRole('link').all()).map((lien) => lien.boundingBox()),
      );
      expect(boites, `${ecran} : quatre onglets`).toHaveLength(4);
      // Quatre onglets côte à côte : le même haut, et chacun un quart de la barre.
      for (const boite of boites) {
        expect(boite?.y, `${ecran} : les onglets sont sur la même ligne`).toBe(boites[0]?.y);
        expect(boite?.height ?? 0, `${ecran} : un onglet est trop bas`).toBeGreaterThanOrEqual(44);
        expect(
          Math.abs((boite?.width ?? 0) - (barre?.width ?? 0) / 4),
          `${ecran} : un onglet n'a pas le quart de la barre`,
        ).toBeLessThanOrEqual(1);
      }
      // Une barre de 64 px (deux lignes, avant : 84 px et plus) ; rien n'est coupé dans un onglet.
      expect(barre?.height ?? 0, `${ecran} : la barre est trop haute`).toBeLessThanOrEqual(72);
      for (const lien of await navigation.getByRole('link').all()) {
        const [contenu, visible] = await lien.evaluate(
          (e) => [e.scrollWidth, e.clientWidth] as const,
        );
        expect(contenu, `${ecran} : le texte d'un onglet est coupé`).toBeLessThanOrEqual(visible);
      }
    }
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
