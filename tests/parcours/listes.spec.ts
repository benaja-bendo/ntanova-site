import { ouvrirGestion } from './aides';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ajouterUneEcole, ouvrirLaFiche, seConnecter } from './aides';

// Toutes les écoles (ticket 12) : des listes qui ne bloquent jamais le relais, de la crèche
// au supérieur, une ligne de programme, et une administration qui lit tout cela. Construit
// avec le faux serveur, qui vit dans le navigateur.

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

const niveaux = (page: Page) => page.getByRole('group', { name: "Niveaux écrits sur l'enseigne" });
const types = (page: Page) => page.getByRole('group', { name: "Type d'école" });

/** Le relais est connecté et arrive à l'étape 2/3 d'une nouvelle fiche. */
async function allerALEtape2(page: Page, context: BrowserContext) {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await page.locator('input[type=file]').first().setInputFiles(photo);
  await expect(page.getByText('Position prise')).toBeVisible();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { name: 'Ce qui se voit de la rue' })).toBeVisible();
}

/** De l'étape 2/3 à l'envoi : direction absente (pas de contact), puis la fiche part. */
async function finirEtEnvoyer(page: Page) {
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Absente' }).click();
  await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
}

/** Les relevés que le faux serveur a reçus. */
function relevesRecus(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves?: Record<string, Record<string, unknown>>;
    };
    return Object.values(etat.releves ?? {});
  });
}

/** Retire le champ « programme » des fiches du téléphone : comme une fiche faite avant le ticket 12. */
function oublierLeProgramme(page: Page) {
  return page.evaluate(
    () =>
      new Promise<void>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const transaction = ouverture.result.transaction('fiches', 'readwrite');
          const magasin = transaction.objectStore('fiches');
          const lecture = magasin.getAll();
          lecture.onsuccess = () => {
            for (const fiche of lecture.result as Record<string, unknown>[]) {
              delete fiche['programme'];
              magasin.put(fiche);
            }
          };
          transaction.oncomplete = () => resoudre();
          transaction.onerror = () => rejeter(transaction.error);
        };
      }),
  );
}

test.describe('étape 2/3 du relais : de la crèche au supérieur', () => {
  test('propose huit niveaux et six types, dont des cases de sortie, et ne coche rien d’avance', async ({
    page,
    context,
  }) => {
    await allerALEtape2(page, context);

    await expect(niveaux(page).getByRole('button')).toHaveText([
      'Crèche ou garderie',
      'Maternelle',
      'Primaire',
      'Collège',
      'Lycée',
      'Technique ou professionnel',
      'Supérieur',
      'Autre formation',
    ]);
    for (const niveau of await niveaux(page).getByRole('button').all()) {
      await expect(niveau).toHaveAttribute('aria-pressed', 'false');
    }

    await expect(types(page).getByRole('button')).toHaveText([
      'Privée',
      'Publique',
      'Confessionnelle',
      'Communautaire',
      'Autre',
      'Pas indiqué',
    ]);
    // Comme la base : tant que le relais n'a rien lu sur l'enseigne, c'est « Pas indiqué ».
    await expect(types(page).getByRole('button', { name: 'Pas indiqué' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(types(page).getByRole('button', { name: 'Privée' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Les deux cases de sortie s'expliquent, et la ligne de programme les attend.
    await expect(page.getByText(/Pas indiqué\s*: rien d'écrit/)).toBeVisible();
    await expect(page.getByText(/Autre\s*: c'est écrit mais ça ne rentre pas/)).toBeVisible();
    await expect(page.getByLabel(/Programme, langues ou autre mention écrite/)).toBeVisible();
    await expect(page.getByLabel(/Programme, langues ou autre mention écrite/)).toHaveValue('');
  });

  test('chaque case se touche du pouce (44 px) et la page ne déborde pas de 360 px', async ({
    page,
    context,
  }) => {
    await allerALEtape2(page, context);
    for (const case_ of await page.locator('.pastille-choix').all()) {
      const boite = await case_.boundingBox();
      expect(boite?.height, await case_.innerText()).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
  });

  test('une fiche où rien n’est choisi part avec « Pas indiqué », et l’administration la lit sans erreur', async ({
    page,
    context,
  }) => {
    await allerALEtape2(page, context);
    await page.getByLabel("Nom sur l'enseigne").fill('[École 1]');
    await finirEtEnvoyer(page);

    const [recu] = await relevesRecus(page);
    expect(recu).toMatchObject({ typeEcole: 'non_indique', niveaux: [], programme: null });

    await ouvrirLaFiche(page);
    const publique = page.getByRole('region', { name: 'Partie publique' });
    await expect(publique.getByText('Pas indiqué', { exact: true })).toBeVisible();
    await expect(publique.getByText('Programme', { exact: true })).toBeVisible();
  });

  test('les nouvelles cases et la ligne de programme vont du relais jusqu’à l’administration', async ({
    page,
    context,
  }) => {
    await allerALEtape2(page, context);
    await page.getByLabel("Nom sur l'enseigne").fill('[École 1]');
    for (const niveau of ['Crèche ou garderie', 'Technique ou professionnel', 'Autre formation']) {
      await niveaux(page).getByRole('button', { name: niveau, exact: true }).click();
    }
    await types(page).getByRole('button', { name: 'Communautaire', exact: true }).click();
    await page
      .getByLabel(/Programme, langues ou autre mention écrite/)
      .fill('  Programme français-congolais, bilingue ');
    await finirEtEnvoyer(page);

    const [recu] = await relevesRecus(page);
    expect(recu).toMatchObject({
      typeEcole: 'communautaire',
      niveaux: ['creche', 'technique', 'autre_formation'],
      programme: 'Programme français-congolais, bilingue',
    });

    await ouvrirLaFiche(page);
    const publique = page.getByRole('region', { name: 'Partie publique' });
    await expect(publique.getByText('Communautaire', { exact: true })).toBeVisible();
    await expect(
      publique.getByText('Crèche ou garderie, Technique ou professionnel, Autre formation'),
    ).toBeVisible();
    await expect(publique.getByText('Programme français-congolais, bilingue')).toBeVisible();
  });
});

test.describe('des téléphones qui ont déjà des fiches', () => {
  test('une fiche faite avant le ticket 12, sans ligne de programme, part quand même', async ({
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
    await ajouterUneEcole(page, 1);
    await expect(page.getByText('1 fiche attend le réseau.')).toBeVisible();

    // Le téléphone d'un relais qui a fait cette fiche avant la mise à jour n'a pas de « programme ».
    await oublierLeProgramme(page);
    await context.setOffline(false);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 20_000 });

    const [recu] = await relevesRecus(page);
    expect(recu).toMatchObject({ nomEnseigne: '[École 1]', programme: null });
  });

  test('un brouillon commencé avant le ticket 12 s’ouvre à l’étape 2/3 et se termine', async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ajouter une école' }).click();
    await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
    await page.locator('input[type=file]').first().setInputFiles(photo);
    // La photo est allégée puis gardée dans le téléphone avant que le brouillon ne soit relu après un rechargement.
    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
    await expect(page.getByText('Position prise')).toBeVisible();

    await oublierLeProgramme(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Photo et position' })).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();

    await expect(page.getByLabel(/Programme, langues ou autre mention écrite/)).toHaveValue('');
    await page.getByLabel("Nom sur l'enseigne").fill('[École 1]');
    await page.getByLabel(/Programme, langues ou autre mention écrite/).fill('Bilingue');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'La direction' })).toBeVisible();
  });

  test('la contre-visite d’une école dont le type ou le niveau est inconnu de ce téléphone passe l’étape 2/3', async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });

    // L'administration confie l'école à situer au relais…
    await seConnecter(page, '/admin/');
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
    await ouvrirGestion(ligne, 'Mission');
    await ligne.getByRole('button', { name: 'Confier', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/est confiée à/);

    // … et la base lui a donné, depuis, un type et un niveau que ce téléphone ne connaît pas encore.
    await page.evaluate(() => {
      const cle = 'ntanova-faux-serveur';
      const etat = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
        campus: Record<string, Record<string, unknown>>;
      };
      for (const ecole of Object.values(etat.campus)) {
        ecole['typeEcole'] = 'type_de_demain';
        ecole['niveaux'] = ['primaire', 'niveau_de_demain'];
      }
      localStorage.setItem(cle, JSON.stringify(etat));
    });

    await page.goto('/relais/');
    await expect(page.getByText('À compléter · 1')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Compléter' }).click();
    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByText('Position prise')).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Ce que la version connaît est repris ; le reste devient « Pas indiqué ».
    await expect(types(page).getByRole('button', { name: 'Pas indiqué' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(
      niveaux(page).getByRole('button', { name: 'Primaire', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');

    // Et l'étape ne se referme pas en silence.
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('heading', { name: 'La direction' })).toBeVisible();
  });
});
