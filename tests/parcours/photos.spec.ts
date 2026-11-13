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
  await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
  await expect(page.getByText('Position prise')).toBeVisible();
  await page.getByLabel('Comment la trouver ?').fill('Face au marché');
}

/** v2 (13/11) : les photos en plus se prennent dans le bonus, chacune à sa place (« Photo : Cour (vide) »). */
async function ajouterUneAutrePhoto(page: Page, role: RegExp) {
  await page.getByLabel(new RegExp(`^Photo : ${role.source}`)).setInputFiles(photo);
}

/** De l'étape 2 au bonus : « Suivant », personne rencontrée, « Suivant : le bonus ». */
async function allerAuBonus(page: Page) {
  await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  await page.getByRole('button', { name: 'Personne', exact: true }).click();
  await page.getByRole('button', { name: 'Suivant : le bonus' }).click();
  await expect(page.getByRole('heading', { name: 'Le bonus' })).toBeVisible();
}

async function envoyerDepuisLeBonus(page: Page) {
  await page.getByRole('button', { name: 'Envoyer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
}

/** Du 1/3 à l'envoi : le nom, un niveau, une direction absente (pas de contact), puis « Enregistrer ». */
async function finirLaFiche(page: Page, nom: string, niveau: string) {
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom de l'établissement").fill(nom);
  await niveaux(page).getByRole('button', { name: niveau, exact: true }).click();
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
  test('l’enseigne seule suffit ; dans le bonus, cinq autres photos au plus, chacune à sa place, et on peut les retirer', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);
    await finirLaFiche(page, '[École 1]', 'Primaire');
    await allerAuBonus(page);

    // Facultatif : deux groupes, la page de l'école et le travail de NTanova (jamais publié).
    const photos = page.getByRole('region', { name: /Photos en plus/ });
    await expect(photos).toContainText('0 sur 5');
    await expect(photos).toContainText('Pour la page de l’école');
    await expect(photos).toContainText('(facultatif, non publiées)');

    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await expect(photos).toContainText('1 sur 5');
    await ajouterUneAutrePhoto(page, /Prospectus remis par l.école/);
    await ajouterUneAutrePhoto(page, /Autre vue du bâtiment \(sans enfant\)/);
    await ajouterUneAutrePhoto(page, /Cour \(vide\)/);
    await ajouterUneAutrePhoto(page, /Terrain de sport/);
    await expect(photos).toContainText('5 sur 5');
    // Cinq photos en plus : plus rien à ajouter.
    await expect(page.getByLabel(/^Photo : Portail/)).toBeDisabled();

    // En retirer une rend la place.
    await page
      .getByRole('button', { name: "Retirer la photo : Prospectus remis par l'école" })
      .click();
    await expect(photos).toContainText('4 sur 5');
    await expect(page.getByLabel(/^Photo : Portail/)).toBeEnabled();

    const gardees = await photosDuTelephone(page);
    expect(gardees.map((p) => p.role).sort()).toEqual([
      'building',
      'courtyard',
      'programs_board',
      'signboard',
      'sports_ground',
    ]);
  });

  test('les photos partent avec la fiche, chacune sous le poids de 200 Ko', async ({
    page,
    context,
  }) => {
    await arriverALEtape1(page, context);
    await finirLaFiche(page, '[École 1]', 'Primaire');
    await allerAuBonus(page);
    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await expect(page.getByRole('region', { name: /Photos en plus/ })).toContainText('1 sur 5');
    await envoyerDepuisLeBonus(page);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });

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
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();

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
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();

    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByText('Allègement de la photo…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Suivant' })).toBeDisabled();

    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Allègement de la photo…')).toHaveCount(0);
    await expect(page.getByText('Position prise')).toBeVisible();
    await page.getByLabel('Comment la trouver ?').fill('Face au marché');
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
    await page.getByLabel("Nom de l'établissement").fill('[Lycée 1]');

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
    await finirLaFiche(page, '[Lycée 1]', 'Lycée');
    const bloc = page.getByRole('region', { name: 'Séries et formations' });
    await bloc.getByLabel(/Précisions sur les séries/).fill('Séries C et D');
    await bloc.getByLabel(/Je les ai prises en photo/).check();
    // v2 (13/11) : la photo des programmes se prend dans le bonus, après la rencontre.
    await expect(bloc).toContainText('Vous ajouterez cette photo dans le bonus');
    await allerAuBonus(page);
    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await envoyerDepuisLeBonus(page);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });

    const [releve] = (await serveur(page)).releves;
    expect(releve).toMatchObject({
      nomEnseigne: '[Lycée 1]',
      niveaux: ['lycee'],
      programmesVus: 'Séries C et D',
      programmesEnPhoto: true,
    });
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
    await page.getByLabel('Comment la trouver ?').fill('Face au marché');
    await finirLaFiche(page, '[École hors ligne]', 'Lycée');
    await page
      .getByRole('region', { name: 'Séries et formations' })
      .getByLabel(/Précisions sur les séries/)
      .fill('Série C');
    await allerAuBonus(page);
    await ajouterUneAutrePhoto(page, /Panneau ou affiche des formations/);
    await page.getByRole('button', { name: 'Envoyer la fiche' }).click();
    await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
    await expect(page.getByText('1 fiche attend le réseau.')).toBeVisible();

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
    await page.getByLabel('Comment la trouver ?').fill('Face au marché');
    const doublon = page.getByRole('region', { name: 'Doublon possible' });
    await expect(doublon).toBeVisible();
    await expect(doublon).toContainText('[École exemple publiée]');
    await expect(doublon).toContainText('40');

    // Sans réponse, la fiche ne passe pas ; avec elle, oui.
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et lieu' })).toBeVisible();
    await doublon.getByRole('button', { name: 'Non, une autre' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: "L'établissement" })).toBeVisible();
  });
});

/** Comme `envoyerLaFiche`, mais sans attendre l'envoi : le téléphone est hors ligne. */
