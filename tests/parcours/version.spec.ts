import { expect, test, type Page } from '@playwright/test';
import { seConnecter } from './aides';

// Une version qui arrive proprement (ticket #62, M2). Construit avec le faux serveur :
//   - une nouvelle version de l'application se détecte par le changement de service worker, et le relais décide du
//     moment de recharger (jamais de rechargement tout seul : une saisie ne se coupe pas) ;
//   - quand le téléphone ne peut pas lire le compte et n'en garde aucun, l'écran ne reste jamais blanc ;
//   - `ntanova-faux-panne-lecture` = « 1 » : la base refuse de lire le compte ;
//   - `ntanova-faux-latence` : le temps de réponse du faux serveur, en ms.

const reglage = (page: Page, cle: string, valeur: string | null) =>
  page.evaluate(
    ([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v)),
    [cle, valeur] as const,
  );

/** L'instant où la page s'est chargée : il ne change que si la page est rechargée. */
const chargeeA = (page: Page) => page.evaluate(() => performance.timeOrigin);

const bandeauVersion = (page: Page) =>
  page.getByRole('status').filter({ hasText: 'Nouvelle version prête' });

test.describe('une nouvelle version de l’application', () => {
  test('n’est pas annoncée au premier lancement, quand le service worker prend la main pour la première fois', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.waitForTimeout(500);
    await expect(bandeauVersion(page)).toHaveCount(0);
  });

  test('est annoncée sans recharger la page, la saisie reste, et « Recharger » la recharge', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

    // Le relais est au milieu d'une saisie.
    await page.goto('/relais/#ajouter/2');
    await page.getByLabel("Nom sur l'enseigne").fill('[École en cours de saisie]');
    await page.getByLabel(/Qu.y a-t-il juste à côté/).fill('Face au marché');
    const avant = await chargeeA(page);

    // Une nouvelle version arrive : un autre service worker prend la main, comme après une mise en ligne.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/relais/sw.js?v=2', { scope: '/relais/' });
    });
    await expect(bandeauVersion(page)).toBeVisible();
    await expect(bandeauVersion(page)).toContainText('Vos fiches restent sur le téléphone');

    // La page n'a pas été rechargée et la saisie est intacte, même après un moment.
    await page.waitForTimeout(1_500);
    expect(await chargeeA(page), 'la page a été rechargée toute seule').toBe(avant);
    await expect(page.getByLabel("Nom sur l'enseigne")).toHaveValue('[École en cours de saisie]');

    // Le relais recharge quand il le décide ; la saisie est retrouvée (elle est gardée dans le téléphone).
    await bandeauVersion(page).getByRole('button', { name: 'Recharger' }).click();
    await page.waitForFunction((t) => performance.timeOrigin !== t, avant);
    await expect(page.getByLabel("Nom sur l'enseigne")).toHaveValue('[École en cours de saisie]');
    // (Pas de contrôle de la disparition du bandeau après le rechargement : ici la « nouvelle version » est une autre
    // adresse du service worker, que la page remplace aussitôt par la sienne ; en ligne, l'adresse ne change pas.)
  });
});

test.describe('quand le téléphone n’a pas encore de compte lu', () => {
  test('l’écran dit qu’il ouvre l’espace, au lieu de rester blanc', async ({ page }) => {
    await page.goto('/relais/');
    await reglage(page, 'ntanova-faux-latence', '3000');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    await expect(page.getByText('Ouverture de votre espace')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible({ timeout: 15_000 });
  });

  test('si la lecture est refusée, un écran le dit et « Réessayer » rouvre l’espace dès que la panne passe', async ({
    page,
  }) => {
    await page.goto('/relais/');
    await reglage(page, 'ntanova-faux-panne-lecture', '1');
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();

    await expect(page.getByRole('heading', { name: 'Votre espace ne s’ouvre pas' })).toBeVisible();
    await expect(page.getByText(/Vos fiches restent sur le téléphone/)).toBeVisible();
    const reessayer = page.getByRole('button', { name: 'Réessayer' });
    await expect(reessayer).toBeVisible();
    expect((await reessayer.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Tant que la panne dure, « Réessayer » ramène le même écran, sans rien casser.
    await reessayer.click();
    await expect(page.getByRole('heading', { name: 'Votre espace ne s’ouvre pas' })).toBeVisible();

    // La panne passe : un geste suffit.
    await reglage(page, 'ntanova-faux-panne-lecture', null);
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  });
});
