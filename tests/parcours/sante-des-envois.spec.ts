import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, seConnecter, uneFicheEnvoyee, ouvrirEcranAdmin } from './aides';

// « Santé des envois » (ticket #77), construit avec le faux serveur : le journal des téléphones, lisible, regroupé,
// avec une période qui écarte le bruit d'une vieille nuit. L'utilisateur du faux serveur est relais et administrateur.

const CHROME_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';

const ilYAJours = (jours: number) => new Date(Date.now() - jours * 86_400_000).toISOString();

/** Les signaux que des téléphones ont envoyés, posés dans le faux serveur. */
async function poserLeJournal(page: Page) {
  const lignes = [
    // Trois fois la même chose, sur un iPhone : une seule ligne à l'écran.
    ...[3, 2, 1].map((h) => ({
      id: crypto.randomUUID(),
      survenueLe: new Date(Date.now() - h * 3_600_000).toISOString(),
      ecran: 'ajouter-1',
      code: 'position_refusee',
      detail: 'autorisation : denied',
      versionApp: 'abc1234',
      appareil: CHROME_IPHONE,
    })),
    {
      id: crypto.randomUUID(),
      survenueLe: new Date(Date.now() - 1_800_000).toISOString(),
      ecran: 'envoi',
      code: 'reseau_photo',
      detail: 'TypeError : Load failed | en ligne : oui | essai 1',
      versionApp: 'abc1234',
      appareil: CHROME_IPHONE,
    },
    // Une vieille nuit de bascule : hors de la vue par défaut.
    {
      id: crypto.randomUUID(),
      survenueLe: ilYAJours(20),
      ecran: 'synchro',
      code: 'lecture_refusee',
      detail: "Error : PGRST205 : Could not find the table 'public.releves' in the schema cache",
      versionApp: 'b44fe09',
      appareil: CHROME_IPHONE,
    },
    // Un signal que l'écran ne connaît pas encore : il s'affiche tel quel.
    {
      id: crypto.randomUUID(),
      survenueLe: new Date(Date.now() - 600_000).toISOString(),
      ecran: 'envoi',
      code: 'une_nouveaute_du_telephone',
      detail: null,
      versionApp: 'abc1234',
      appareil: CHROME_IPHONE,
    },
  ];
  await page.evaluate((lignes) => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      erreurs?: unknown[];
    };
    etat.erreurs = lignes;
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  }, lignes);
}

test.describe('Santé des envois', () => {
  test('le journal se lit en français, regroupé, sans le bruit d’une vieille nuit', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/');
    await expect(
      page.getByRole('heading', { name: 'Aujourd’hui', level: 1 }).locator('visible=true'),
    ).toBeVisible();
    await poserLeJournal(page);

    await ouvrirEcranAdmin(page, 'Santé des envois');
    await expect(page.getByRole('heading', { name: 'Santé des envois', level: 1 })).toBeVisible();

    // Trois lignes identiques : une seule ligne, avec son nombre et l'appareil en clair.
    const position = page.getByRole('row', { name: /La position est refusée/ });
    await expect(position).toHaveCount(1);
    await expect(position).toContainText('Chrome sur iPhone');
    await expect(position.getByRole('cell', { name: '3', exact: true })).toBeVisible();
    await expect(position).toContainText('Réglages');

    // Une photo qui ne part pas : l'étape est dite, aucun mot du navigateur dans la phrase.
    await expect(
      page.getByRole('row', { name: /connexion a échoué pendant l’envoi d’une photo/ }),
    ).toBeVisible();
    // Le signal inconnu s'affiche tel quel : jamais d'erreur.
    await expect(page.getByText('Signal inconnu : une_nouveaute_du_telephone')).toBeVisible();

    // La vieille nuit de bascule (il y a 20 jours) n'est pas dans les 7 jours.
    await expect(page.getByText(/Ancienne version de l'application/)).toHaveCount(0);

    // Le détail technique reste là pour qui veut creuser.
    await position.getByText('Détail technique').click();
    await expect(position).toContainText('position_refusee');
    await expect(position).toContainText('abc1234');
  });

  test('« tout » rend la vieille nuit, expliquée comme une ancienne version', async ({ page }) => {
    await seConnecter(page, '/admin/');
    await expect(
      page.getByRole('heading', { name: 'Aujourd’hui', level: 1 }).locator('visible=true'),
    ).toBeVisible();
    await poserLeJournal(page);
    await ouvrirEcranAdmin(page, 'Santé des envois');
    await expect(page.getByText(/La position est refusée/)).toBeVisible();

    await page.getByLabel('Période').selectOption('tout');
    await expect(page.getByText(/Ancienne version de l'application/)).toBeVisible();
    // Et « 24 heures » garde le plus récent seulement.
    await page.getByLabel('Période').selectOption('1');
    await expect(page.getByText(/Ancienne version de l'application/)).toHaveCount(0);
    await expect(page.getByText(/La position est refusée/)).toBeVisible();
  });

  test('un journal vide le dit', async ({ page }) => {
    await seConnecter(page, '/admin/');
    await expect(
      page.getByRole('heading', { name: 'Aujourd’hui', level: 1 }).locator('visible=true'),
    ).toBeVisible();
    await ouvrirEcranAdmin(page, 'Santé des envois');
    await expect(page.getByText('Aucun signal sur cette période.')).toBeVisible();
  });
});

test.describe('dans le détail d’une fiche à valider', () => {
  test.use({ permissions: ['geolocation'] });

  test('l’administration voit ce que le téléphone du relais a signalé', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await poserLeJournal(page);
    await ouvrirLaFiche(page);

    const bloc = page.getByRole('region', { name: /Ce que le téléphone de .* a signalé/ });
    await expect(bloc).toContainText('La position est refusée');
    await expect(bloc).toContainText('3 fois');
    // Le bruit d'une vieille nuit n'y est pas : 7 jours seulement.
    await expect(bloc).not.toContainText('Ancienne version');

    await bloc.getByRole('link', { name: 'Voir tout le journal' }).click();
    await expect(page.getByRole('heading', { name: 'Santé des envois', level: 1 })).toBeVisible();
  });

  test('un relais qui n’a rien signalé : rien n’est affiché', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await page.evaluate(() => {
      const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
        erreurs?: unknown[];
      };
      etat.erreurs = [];
      localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
    });
    await ouvrirLaFiche(page);
    await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
    await expect(page.getByText(/a signalé ces 7 derniers jours/)).toHaveCount(0);
  });
});
