import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ajouterUneEcole, seConnecter } from './aides';

// L'onglet « Compte » et les fiches d'un téléphone partagé (ticket #55, PR 6), construits avec le faux serveur.
//   - le relais se déconnecte sans perdre une fiche, et l'avertissement dit ce qui reste sur le téléphone ;
//   - les fiches non envoyées d'un AUTRE compte ne sont ni vues ni envoyées sous celui-ci ;
//   - l'aide : un lien vers NTanova sur WhatsApp, dont le numéro vient de la configuration (jamais du code).
// Deux réglages du faux serveur (`localStorage`) : `ntanova-faux-panne` = une panne dont on ne sait rien.

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

function releves(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves?: Record<string, unknown>;
    };
    return Object.keys(etat.releves ?? {}).length;
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

/** Dépose dans le téléphone la fiche d'un autre compte, comme si un autre relais s'en était servi avant. */
function deposerLaFicheDUnAutre(page: Page, etat: 'a_envoyer' | 'brouillon') {
  return page.evaluate(
    (etat) =>
      new Promise<void>((resoudre, rejeter) => {
        const ouverture = indexedDB.open('ntanova-relais');
        ouverture.onerror = () => rejeter(ouverture.error);
        ouverture.onsuccess = () => {
          const ecriture = ouverture.result.transaction('fiches', 'readwrite');
          ecriture.objectStore('fiches').put({
            id: 'fiche-d-un-autre-compte',
            creeeLe: new Date().toISOString(),
            type: 'releve',
            corrigeReleveId: null,
            lotId: null,
            photos: [],
            position: null,
            precisionM: null,
            prisLe: null,
            horsLot: null,
            doublonPropose: null,
            reponseDoublon: null,
            nomEnseigne: '[École d’un autre relais]',
            niveaux: [],
            typeEcole: 'non_indique',
            programme: '',
            programmesVus: '',
            programmesEnPhoto: false,
            repere: '',
            numeroEnseigne: '',
            direction: 'absente',
            contact: null,
            repasser: '',
            etat,
            envoyes: { releve: false, photo: true, contact: true },
            dernierEssai: null,
            compteId: 'un-autre-relais',
          });
          ecriture.oncomplete = () => resoudre();
          ecriture.onerror = () => rejeter(ecriture.error);
        };
      }),
    etat,
  );
}

async function ouvrirLEspace(page: Page, context: BrowserContext) {
  await context.setGeolocation({ latitude: -4.7982, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(
    page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
  ).toBeVisible();
}

const navigation = (page: Page) => page.getByRole('navigation', { name: 'Espace relais' });

test.describe('l’onglet « Compte »', () => {
  test('dit qui est connecté, et donne le moyen d’écrire à NTanova sur WhatsApp', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await navigation(page).getByRole('link', { name: 'Compte' }).click();
    await expect(page.getByRole('heading', { name: 'Compte' })).toBeVisible();
    await expect(page.getByText('relais@exemple.test')).toBeVisible();
    // Le numéro vient de la configuration de la construction, jamais du code.
    const ecrire = page.getByRole('link', { name: /Écrire à NTanova sur WhatsApp/ });
    await expect(ecrire).toHaveAttribute('href', /^https:\/\/wa\.me\/242000000000\?text=/);
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  });

  test('tient dans 360 px sans défilement horizontal', async ({ page }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.goto('/relais/#compte');
    await expect(page.getByRole('heading', { name: 'Compte' })).toBeVisible();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
  });
});

test.describe('se déconnecter', () => {
  test('prévient de ce qui reste sur le téléphone, ne perd aucune fiche, et la retrouve à la reconnexion', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await ouvrirLEspace(page, context);
    await regler(page, 'ntanova-faux-panne', '1');
    await ajouterUneEcole(page, 1);
    await expect(page.getByText(/1 fiche attend d'être envoyée/)).toBeVisible({ timeout: 15_000 });

    await navigation(page).getByRole('link', { name: 'Compte' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    const avertissement = page.getByRole('alertdialog', { name: 'Se déconnecter ?' });
    await expect(avertissement).toContainText(
      '1 fiche n’est pas encore reçue par NTanova (1 à envoyer)',
    );
    await expect(avertissement).toContainText('restent sur ce téléphone');
    await expect(avertissement).toContainText('prochaine connexion avec ce compte');

    // « Annuler » ne déconnecte pas.
    await avertissement.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();

    // « Me déconnecter quand même » : l'écran de connexion, qui dit que des fiches attendent.
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.getByRole('button', { name: 'Me déconnecter quand même' }).click();
    await expect(
      page.getByRole('button', { name: 'Continuer avec mon compte Google' }),
    ).toBeVisible();
    await expect(page.getByText(/fiches? de ce téléphone attend/)).toBeVisible();
    expect(await fichesDuTelephone(page)).toBe(1);
    expect(await releves(page)).toBe(0);

    // Le même compte se reconnecte : la fiche est là, et part quand la panne passe.
    await regler(page, 'ntanova-faux-panne', null);
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 20_000 });
    expect(await releves(page)).toBe(1);
  });

  test('hors ligne, prévient qu’on ne pourra pas se reconnecter sans réseau', async ({
    page,
    context,
  }) => {
    await ouvrirLEspace(page, context);
    await navigation(page).getByRole('link', { name: 'Compte' }).click();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    const avertissement = page.getByRole('alertdialog', { name: 'Se déconnecter ?' });
    await expect(avertissement).toContainText('hors ligne');
    await expect(avertissement).toContainText('réseau');
    await avertissement.getByRole('button', { name: 'Annuler' }).click();
    await context.setOffline(false);
  });

  test('sans rien à perdre, le dit', async ({ page, context }) => {
    await ouvrirLEspace(page, context);
    await navigation(page).getByRole('link', { name: 'Compte' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByRole('alertdialog', { name: 'Se déconnecter ?' })).toContainText(
      'Toutes vos fiches sont reçues par NTanova.',
    );
  });
});

test.describe('un téléphone qui a servi à un autre relais', () => {
  test('ses fiches non envoyées ne sont ni vues ni envoyées sous ce compte, et restent sur le téléphone', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await ouvrirLEspace(page, context);
    await deposerLaFicheDUnAutre(page, 'a_envoyer');
    await page.reload();

    // Ce compte n'a rien à envoyer : ni la fiche de l'autre ne l'attend, ni elle ne part sous son nom.
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('link', { name: 'Mes fiches' }).click();
    await expect(page.getByText('Aucune fiche pour le moment.')).toBeVisible();
    await expect(page.getByText('[École d’un autre relais]')).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(await releves(page)).toBe(0);
    // Elle n'est pas perdue pour autant : elle attend son relais.
    expect(await fichesDuTelephone(page)).toBe(1);
  });

  test('son brouillon n’est pas repris par ce compte', async ({ page, context }) => {
    await ouvrirLEspace(page, context);
    await deposerLaFicheDUnAutre(page, 'brouillon');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Ajouter une école' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reprendre la fiche en cours' })).toHaveCount(0);
    expect(await fichesDuTelephone(page)).toBe(1);
  });
});

test('l’écran de connexion ne nomme aucun quartier : l’espace relais vaut pour tout le pays', async ({
  page,
}) => {
  await page.goto('/relais/');
  await expect(
    page.getByRole('button', { name: 'Continuer avec mon compte Google' }),
  ).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Tié-Tié');
  await expect(page.locator('body')).not.toContainText('Ngoyo');
});
