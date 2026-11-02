import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ajouterUneEcole, prendrePhotoEtPosition, seConnecter } from './aides';

// La file d'envoi de l'espace relais (ticket #55, PR 2), construite avec le faux serveur. Deux réglages du
// faux serveur, dans `localStorage` du navigateur, rejouent ce que la vraie base répond :
//   - `ntanova-faux-rejet` = « code|message » : la base REFUSE le relevé (et compte ses refus dans
//     `ntanova-faux-refus`) ;
//   - `ntanova-faux-panne` = « 1 » : une panne dont on ne sait rien (erreur serveur).

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

function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves?: Record<string, { nomEnseigne: string }>;
    };
    return {
      noms: Object.values(etat.releves ?? {}).map((r) => r.nomEnseigne),
      refus: Number(localStorage.getItem('ntanova-faux-refus') ?? 0),
    };
  });
}

function fichesDuTelephone(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const lecture = ouverture.result.transaction('fiches').objectStore('fiches').count();
          lecture.onsuccess = () => resoudre(lecture.result);
        };
      }),
  );
}

/** Le lot est gardé dans le téléphone avant que la position soit jugée. */
async function ouvrirLEspace(page: Page, context: BrowserContext) {
  await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('region', { name: 'Mon lot' }).getByText(/Tié-Tié/)).toBeVisible();
}

const carte = (page: Page, nom: string) => page.getByRole('article').filter({ hasText: nom });

test.describe('une fiche que la base refuse', () => {
  test('sort de la file avec sa raison, n’est pas rejouée, et part après « Réessayer »', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-rejet', '42501|Compte relais inactif.');
    await ajouterUneEcole(page, 1);

    // Sur « Mon lot » : plus de fiche qui « attend », mais une fiche à regarder.
    await expect(page.getByText(/1 fiche n'a pas pu être envoyée/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/attend d'être envoyée/)).toHaveCount(0);

    await page.getByRole('link', { name: 'Mes fiches' }).click();
    const fiche = carte(page, '[École 1]');
    await expect(fiche.getByText('Refusée', { exact: true })).toBeVisible();
    await expect(fiche.getByText(/Compte relais inactif\./)).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(fiche.getByRole('button', { name: 'Retirer du téléphone' })).toBeVisible();

    // La base a refusé une fois ; rouvrir l'application ne rejoue pas ce qu'elle refuse.
    expect((await serveur(page)).refus).toBe(1);
    await page.reload();
    await expect(carte(page, '[École 1]').getByText('Refusée', { exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await serveur(page)).refus).toBe(1);

    // Le relais a écrit à NTanova, le compte est actif : « Réessayer » remet la fiche en file.
    await regler(page, 'ntanova-faux-rejet', null);
    await carte(page, '[École 1]').getByRole('button', { name: 'Réessayer' }).click();
    await expect(carte(page, '[École 1]').getByText('À valider par NTanova')).toBeVisible({
      timeout: 15_000,
    });
    expect((await serveur(page)).noms).toEqual(['[École 1]']);
  });

  test('se retire du téléphone, après confirmation', async ({ page, context }) => {
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-rejet', '23514|Une règle de la base n’est pas respectée.');
    await ajouterUneEcole(page, 1);
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    const fiche = carte(page, '[École 1]');
    await expect(fiche.getByText('Refusée', { exact: true })).toBeVisible({ timeout: 15_000 });

    page.once('dialog', (dialogue) => void dialogue.accept());
    await fiche.getByRole('button', { name: 'Retirer du téléphone' }).click();
    await expect(page.getByText('Aucune fiche pour le moment.')).toBeVisible();
    expect(await fichesDuTelephone(page)).toBe(0);
    expect((await serveur(page)).noms).toEqual([]);
  });
});

test.describe('une panne dont on ne sait rien', () => {
  test('laisse la fiche dans la file, compte les essais, et prévient après plusieurs', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-panne', '1');
    await ajouterUneEcole(page, 1);

    // Ce n'est pas un refus : la fiche attend, et « Envoyer maintenant » la rejoue.
    await expect(page.getByText(/1 fiche attend d'être envoyée/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Un envoi a échoué/)).toBeVisible();
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    await expect(carte(page, '[École 1]').getByText('Refusée', { exact: true })).toHaveCount(0);

    const envoyer = page.getByRole('button', { name: 'Envoyer maintenant' });
    for (let i = 0; i < 4; i++) {
      await expect(envoyer).toBeEnabled({ timeout: 10_000 });
      await envoyer.click();
    }
    await expect(carte(page, '[École 1]').getByText(/a échoué 5 fois de suite/)).toBeVisible({
      timeout: 15_000,
    });

    // La panne passe : la fiche part.
    await regler(page, 'ntanova-faux-panne', null);
    await expect(envoyer).toBeEnabled({ timeout: 10_000 });
    await envoyer.click();
    await expect(carte(page, '[École 1]').getByText('À valider par NTanova')).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('modifier une fiche enregistrée', () => {
  test('est possible tant que NTanova ne l’a pas reçue, et la fiche modifiée part à sa place', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-panne', '1');
    await ajouterUneEcole(page, 1);
    await page.getByRole('link', { name: 'Mes fiches' }).click();

    const fiche = carte(page, '[École 1]');
    await expect(fiche.getByText('Sur le téléphone', { exact: true }).first()).toBeVisible();
    await fiche.getByRole('button', { name: 'Modifier' }).click();

    // Les trois étapes sont rouvertes avec ce qui avait été saisi, la photo comprise.
    await expect(page.locator('.entete-etape-titre')).toHaveText('Ajouter une école');
    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByLabel("Nom sur l'enseigne")).toHaveValue('[École 1]');
    await page.getByLabel("Nom sur l'enseigne").fill('[École 1, nom corrigé]');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
    await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
    // L'envoi lancé par l'enregistrement a bien rencontré la panne : on attend de le voir avant de la lever.
    await expect(page.getByText(/Un envoi a échoué/)).toBeVisible({ timeout: 10_000 });

    // La panne passe : c'est la fiche modifiée qui part, une seule fois.
    await regler(page, 'ntanova-faux-panne', null);
    const envoyer = page.getByRole('button', { name: 'Envoyer maintenant' });
    await expect(envoyer).toBeEnabled({ timeout: 10_000 });
    await envoyer.click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    expect((await serveur(page)).noms).toEqual(['[École 1, nom corrigé]']);
    expect(await fichesDuTelephone(page)).toBe(1);
  });

  test('n’est plus proposée quand NTanova a reçu la fiche', async ({ page, context }) => {
    await ouvrirLEspace(page, context);
    await ajouterUneEcole(page, 1);
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    await expect(carte(page, '[École 1]').getByText('À valider par NTanova')).toBeVisible({
      timeout: 15_000,
    });
    await expect(carte(page, '[École 1]').getByRole('button', { name: 'Modifier' })).toHaveCount(0);
    await expect(
      carte(page, '[École 1]').getByRole('button', { name: 'Retirer du téléphone' }),
    ).toHaveCount(0);
  });
});

test.describe('abandonner une fiche en cours', () => {
  for (const etape of [2, 3]) {
    test(`est possible à l’étape ${etape}/3, et efface la fiche du téléphone`, async ({
      page,
      context,
    }) => {
      await ouvrirLEspace(page, context);
      await prendrePhotoEtPosition(page);
      await page.getByRole('button', { name: 'Suivant' }).click();
      if (etape === 3) {
        await page.getByLabel("Nom sur l'enseigne").fill('[École 1]');
        await page.getByRole('button', { name: 'Suivant' }).click();
      }
      await expect(page.locator('.entete-etape-compte')).toHaveText(`${etape}/3`);

      page.once('dialog', (dialogue) => void dialogue.accept());
      await page.getByRole('button', { name: 'Abandonner cette fiche' }).click();
      await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ajouter une école' })).toBeVisible();
      expect(await fichesDuTelephone(page)).toBe(0);
    });
  }
});
