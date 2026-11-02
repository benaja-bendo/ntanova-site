import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { seConnecter } from './aides';

// Chantier 2 : les photos d'une fiche (l'enseigne seule suffit, trois autres au plus), les séries lues sur un
// panneau, des photos allégées à moins de 200 Ko, et un téléphone qui garde tout dans IndexedDB, hors ligne
// comme en ligne. Construit avec le faux serveur, qui vit dans le navigateur.

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

const niveaux = (page: Page) => page.getByRole('group', { name: "Niveaux écrits sur l'enseigne" });

/** Connecté, sur Ajouter 1/3, avec la photo de l'enseigne prise et la position lue. */
async function arriverALEtape1(page: Page, context: BrowserContext) {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
}

/** Ouvre le choix des autres photos, choisit ce que la photo montre, et la dépose. */
async function ajouterUneAutrePhoto(page: Page, role: RegExp) {
  const ouvrir = page.getByRole('button', { name: /Ajouter d'autres photos/ });
  if (await ouvrir.isVisible()) await ouvrir.click();
  await page.getByRole('button', { name: role }).click();
  await page.getByLabel('Galerie : autre photo').setInputFiles(photo);
}

/** Du 1/3 à l'envoi : le nom, un niveau, une direction absente (pas de contact), puis « Enregistrer ». */
async function finirLaFiche(page: Page, nom: string, niveau: string) {
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom sur l'enseigne").fill(nom);
  await niveaux(page).getByRole('button', { name: niveau, exact: true }).click();
}

async function envoyerLaFiche(page: Page) {
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Absente' }).click();
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
}

interface PhotoGardee {
  role: string;
  mime: string;
  octets: number;
  taille: number;
  type: string;
  largeur: number;
}

/** Les photos que le téléphone garde (IndexedDB) : leur poids réel, pas celui qu'elles annoncent. */
function photosDuTelephone(page: Page) {
  return page.evaluate(
    () =>
      new Promise<PhotoGardee[]>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result.transaction('fiches').objectStore('fiches').getAll();
          lecture.onsuccess = () => {
            const fiches = lecture.result as {
              photos: {
                role: string;
                mime: string;
                octets: number;
                largeur: number;
                blob: Blob | null;
              }[];
            }[];
            resoudre(
              fiches.flatMap((f) =>
                f.photos.map((p) => ({
                  role: p.role,
                  mime: p.mime,
                  octets: p.octets,
                  taille: p.blob?.size ?? 0,
                  type: p.blob?.type ?? '',
                  largeur: p.largeur,
                })),
              ),
            );
          };
        };
      }),
  );
}

/** Ce que le faux serveur a reçu. */
function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves?: Record<string, Record<string, unknown>>;
      photos?: Record<string, { role: string; octets: number; mime: string }>;
    };
    return { releves: Object.values(etat.releves ?? {}), photos: Object.values(etat.photos ?? {}) };
  });
}

test.describe('les photos d’une fiche', () => {
  test('l’enseigne seule suffit ; trois autres photos au plus, chacune avec ce qu’elle montre, et on peut les retirer', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);

    // Facultatif : rien n'est demandé, mais l'option est proposée en clair.
    await expect(page.getByRole('region', { name: /Autres photos/ })).toBeVisible();
    await expect(page.getByText(/0\/3 en plus de l.enseigne/)).toBeVisible();
    await expect(page.getByText(/panneau ou une affiche qui liste les filières/)).toBeVisible();

    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await expect(page.getByText(/1\/3 en plus de l.enseigne/)).toBeVisible();
    await ajouterUneAutrePhoto(page, /Prospectus remis par l.école/);
    await ajouterUneAutrePhoto(page, /Autre vue du bâtiment \(sans enfant\)/);
    await expect(page.getByText(/3\/3 en plus de l.enseigne/)).toBeVisible();

    // Trois photos en plus : plus rien à ajouter.
    await expect(page.getByRole('button', { name: /Ajouter d'autres photos/ })).toHaveCount(0);
    await expect(page.getByLabel('Galerie : autre photo')).toHaveCount(0);

    // Chacune garde son rôle, dans l'ordre où elle a été prise.
    const liste = page.locator('ul.liste-photos li');
    await expect(liste).toHaveCount(3);
    await expect(liste.nth(0)).toContainText('Panneau ou affiche des formations');
    await expect(liste.nth(1)).toContainText('Prospectus');
    await expect(liste.nth(2)).toContainText('Autre vue du bâtiment');

    // En retirer une rend la place.
    await page
      .getByRole('button', { name: "Retirer la photo : Prospectus remis par l'école" })
      .click();
    await expect(page.getByText(/2\/3 en plus de l.enseigne/)).toBeVisible();
    await expect(page.getByLabel('Galerie : autre photo')).toHaveCount(1);

    const gardees = await photosDuTelephone(page);
    expect(gardees.map((p) => p.role).sort()).toEqual(['building', 'programs_board', 'signboard']);
  });

  test('les photos partent avec la fiche, chacune sous le poids de 200 Ko', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);
    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await expect(page.getByText(/1\/3 en plus de l.enseigne/)).toBeVisible();
    await finirLaFiche(page, '[École 1]', 'Primaire');
    await envoyerLaFiche(page);

    const recu = await serveur(page);
    expect(recu.releves).toHaveLength(1);
    expect(recu.photos.map((p) => p.role).sort()).toEqual(['programs_board', 'signboard']);
    for (const p of recu.photos) {
      expect(p.octets, p.role).toBeLessThan(200_000);
      expect(['image/webp', 'image/jpeg']).toContain(p.mime);
    }
  });

  test('une photo de plusieurs mégaoctets est allégée à moins de 200 Ko avant d’être gardée', async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();

    // Une photo de 3 000 × 2 000 px faite de bruit : le pire cas pour un encodeur.
    const origine = await page.evaluate(async () => {
      const toile = document.createElement('canvas');
      toile.width = 3000;
      toile.height = 2000;
      const dessin = toile.getContext('2d');
      if (!dessin) throw new Error('canvas');
      const image = dessin.createImageData(toile.width, toile.height);
      for (let i = 0; i < image.data.length; i += 65_536) {
        crypto.getRandomValues(image.data.subarray(i, Math.min(i + 65_536, image.data.length)));
      }
      for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255;
      dessin.putImageData(image, 0, 0);
      const blob = await new Promise<Blob | null>((fin) => toile.toBlob(fin, 'image/jpeg', 0.95));
      if (!blob) throw new Error('jpeg');
      const fichier = new File([blob], 'grosse-photo.jpg', { type: 'image/jpeg' });
      const transfert = new DataTransfer();
      transfert.items.add(fichier);
      const champ = document.querySelector<HTMLInputElement>('input[type=file]');
      if (!champ) throw new Error('champ');
      champ.files = transfert.files;
      champ.dispatchEvent(new Event('change', { bubbles: true }));
      return fichier.size;
    });
    expect(origine).toBeGreaterThan(1_000_000);

    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible({ timeout: 30_000 });
    const [gardee] = await photosDuTelephone(page);
    expect(gardee?.taille).toBeLessThan(200_000);
    expect(gardee?.octets).toBe(gardee?.taille);
    expect(['image/webp', 'image/jpeg']).toContain(gardee?.type);
    expect(gardee?.largeur).toBeLessThanOrEqual(1280);
  });

  test('Suivant attend la fin de l’allègement : la fiche ne part jamais sans sa photo', async ({
    page,
    context,
  }) => {
    // L'encodeur du navigateur est ralenti : l'allègement dure assez pour qu'on le voie.
    await page.addInitScript(() => {
      const encoder = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (...args: Parameters<typeof encoder>) {
        setTimeout(() => encoder.apply(this, args), 1500);
      };
    });
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();

    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByText('Allègement de la photo…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled();

    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Allègement de la photo…')).toHaveCount(0);
    await expect(page.getByText('Position prise')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeEnabled();
  });
});

test.describe('les séries et filières vues', () => {
  test('un lycée ou une formation demande ce qui est écrit ; une école primaire non', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByLabel("Nom sur l'enseigne").fill('[Lycée 1]');

    const bloc = page.getByRole('region', { name: 'Séries et formations' });
    await expect(bloc).toHaveCount(0);
    await niveaux(page).getByRole('button', { name: 'Primaire', exact: true }).click();
    await expect(bloc).toHaveCount(0);

    for (const niveau of ['Lycée', 'Technique ou professionnel', 'Supérieur', 'Autre formation']) {
      await niveaux(page).getByRole('button', { name: niveau, exact: true }).click();
      await expect(bloc, niveau).toBeVisible();
      await niveaux(page).getByRole('button', { name: niveau, exact: true }).click();
      await expect(bloc, `${niveau} décoché`).toHaveCount(0);
    }
  });

  test('les séries notées et « prises en photo » arrivent jusqu’à l’administration', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);
    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await expect(page.getByText(/1\/3 en plus de l.enseigne/)).toBeVisible();
    await finirLaFiche(page, '[Lycée 1]', 'Lycée');

    const bloc = page.getByRole('region', { name: 'Séries et formations' });
    await bloc.getByLabel(/Séries, filières ou formations visibles/).fill('Séries C et D');
    await bloc.getByLabel(/Je les ai prises en photo/).check();
    // Une photo de panneau est bien dans la fiche : pas de rappel.
    await expect(page.getByText(/Ajoutez cette photo à l.étape 1\/3/)).toHaveCount(0);
    await envoyerLaFiche(page);

    const [releve] = (await serveur(page)).releves;
    expect(releve).toMatchObject({
      nomEnseigne: '[Lycée 1]',
      niveaux: ['lycee'],
      programmesVus: 'Séries C et D',
      programmesEnPhoto: true,
    });
  });

  test('« prises en photo » sans photo de panneau : un rappel, sans bloquer', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);
    await finirLaFiche(page, '[Lycée 2]', 'Lycée');
    const bloc = page.getByRole('region', { name: 'Séries et formations' });
    await bloc.getByLabel(/Je les ai prises en photo/).check();
    await expect(page.getByText(/Ajoutez cette photo à l.étape 1\/3/)).toBeVisible();
    // Le rappel mène à l'étape 1/3, où l'on ajoute la photo.
    await bloc.getByRole('button', { name: 'Retour à la photo' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
    await ajouterUneAutrePhoto(page, /Prospectus remis par l.école/);
    await expect(page.getByText(/1\/3 en plus de l.enseigne/)).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText(/Ajoutez cette photo à l.étape 1\/3/)).toHaveCount(0);
  });
});

test.describe('hors ligne', () => {
  test('fiches et photos restent dans IndexedDB, jamais dans localStorage, jusqu’à ce que le réseau revienne', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
    await expect(page.getByText('Position prise')).toBeVisible();
    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await expect(page.getByText(/1\/3 en plus de l.enseigne/)).toBeVisible();
    await finirLaFiche(page, '[École hors ligne]', 'Lycée');
    await page
      .getByRole('region', { name: 'Séries et formations' })
      .getByLabel(/Séries, filières ou formations visibles/)
      .fill('Série C');
    await envoyerLaFicheHorsLigne(page);

    // Le téléphone garde la fiche et ses deux photos, dans IndexedDB ...
    const gardees = await photosDuTelephone(page);
    expect(gardees.map((p) => p.role).sort()).toEqual(['programs_board', 'signboard']);
    for (const p of gardees) expect(p.taille, p.role).toBeLessThan(200_000);
    // ... et nulle part dans localStorage ou sessionStorage : rien de la fiche ne s'y lit.
    const stockages = await page.evaluate(() =>
      JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }),
    );
    expect(stockages).not.toContain('[École hors ligne]');
    expect(stockages).not.toContain('programmesVus');
    expect(stockages).not.toContain('signboard');
    expect((await serveur(page)).releves).toHaveLength(0);

    await context.setOffline(false);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 20_000 });
    const recu = await serveur(page);
    expect(recu.releves).toHaveLength(1);
    expect(recu.photos).toHaveLength(2);
    // Une fois reçues, les photos quittent le téléphone.
    expect((await photosDuTelephone(page)).filter((p) => p.taille > 0)).toEqual([]);
  });

  test('une école à moins de 40 m d’une école connue est signalée sans réseau', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    // L'école publiée du faux serveur est en (-4,79105 ; 11,925) : on se tient à une vingtaine de mètres.
    await context.setGeolocation({ latitude: -4.79123, longitude: 11.925, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByText('Position prise')).toBeVisible();
    const doublon = page.getByRole('region', { name: 'Doublon possible' });
    await expect(doublon).toBeVisible();
    await expect(doublon).toContainText('[École exemple publiée]');
    await expect(doublon).toContainText('40');

    // Sans réponse, la fiche ne passe pas ; avec elle, oui.
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
    await doublon.getByRole('button', { name: 'Non, une autre' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'Ce qui se voit de la rue' })).toBeVisible();
  });
});

/** Comme `envoyerLaFiche`, mais sans attendre l'envoi : le téléphone est hors ligne. */
async function envoyerLaFicheHorsLigne(page: Page) {
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Absente' }).click();
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await expect(page.getByText('1 fiche attend le réseau.')).toBeVisible();
}
