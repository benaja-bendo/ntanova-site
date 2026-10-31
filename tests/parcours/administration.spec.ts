import { expect, test, type Page } from '@playwright/test';
import { ajouterUneEcole, seConnecter } from './aides';

// L'administration, construite avec le faux serveur : l'utilisateur du faux
// serveur est à la fois relais (lot Tié-Tié) et administrateur.

test.use({ permissions: ['geolocation'] });

async function uneFicheEnvoyee(page: Page, context: import('@playwright/test').BrowserContext) {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await ajouterUneEcole(page, 1);
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
  // Le faux serveur a bien reçu le relevé, la photo et le contact.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
          string,
          Record<string, unknown> | undefined
        >;
        return ['releves', 'photos', 'contacts'].map((t) => Object.keys(etat[t] ?? {}).length);
      }),
    )
    .toEqual([1, 1, 1]);
}

async function ouvrirLaFiche(page: Page) {
  await page.goto('/admin/');
  await expect(page.getByRole('heading', { name: 'À valider' })).toBeVisible();
  await page.getByRole('link', { name: /\[École 1\]/ }).click();
  await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
}

test.describe('administration', () => {
  test('une fiche acceptée devient prête, se publie, et le relais la voit « Acceptée »', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    // Le contact de la direction n'est lisible que par l'administration.
    await expect(page.getByText('+242 06 123 45 61')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Écrire sur WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/242061234561',
    );
    await page.getByRole('button', { name: 'Confirmer sa fonction' }).click();
    await expect(page.getByText('Fonction confirmée')).toBeVisible();

    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await expect(page.getByText('Rien à valider pour le moment.')).toBeVisible();

    // Accepter ne publie pas : l'école attend le geste « Publier ».
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByText('Prête', { exact: true })).toBeVisible();
    await ligne.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/est publiée.*cette nuit/);
    await expect(
      page.getByRole('row', { name: /\[École 1\]/ }).getByText('Publiée', { exact: true }),
    ).toBeVisible();

    await page.goto('/relais/#fiches');
    await expect(page.getByText('Acceptée')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Confirmé · promoteur')).toBeVisible();
  });

  test('une demande de correction arrive au relais avec son message', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await page.getByLabel('Motif').selectOption('photo_floue');
    await page.getByLabel(/Message au relais/).fill('La photo est floue, reprenez-la de face.');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toHaveText(/correction part au relais/);

    await page.goto('/relais/#fiches');
    await expect(page.getByText('La photo est floue, reprenez-la de face.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Corriger la fiche' })).toBeVisible();
  });

  test('une école publiée se retire avec un motif, puis se republie', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('link', { name: 'Écoles' }).click();
    await page.getByRole('button', { name: /Publier l’école prête de Tié-Tié/ }).click();
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);

    const ligne = () => page.getByRole('row', { name: /\[École 1\]/ });
    await ligne().getByRole('button', { name: 'Retirer du site' }).click();
    await ligne().getByLabel('Motif').selectOption('demande_ecole');
    await ligne()
      .getByRole('button', { name: /Retirer \[École 1\] du site/ })
      .click();
    await expect(page.getByRole('status')).toHaveText(/retirée du site.*sans son nom/);
    await expect(ligne().getByText('Retirée', { exact: true })).toBeVisible();
    await expect(ligne().getByText(/À la demande de l'école/)).toBeVisible();

    await ligne().getByRole('button', { name: 'Republier' }).click();
    await expect(ligne().getByText('Publiée', { exact: true })).toBeVisible();
  });

  test('« Décidées » relit une décision sans la changer, et efface un contact', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[École 1\]/ }).click();
    await expect(page.getByText('Acceptée', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toHaveCount(0);
    await expect(page.getByText(/un refus est définitif/)).toBeVisible();

    await page.getByRole('button', { name: /Effacer le contact/ }).click();
    await page.getByRole('button', { name: /Confirmer : effacer le contact/ }).click();
    await expect(page.getByText('Le contact de la direction est effacé.')).toBeVisible();
    await expect(page.getByText('+242 06 123 45 61')).toHaveCount(0);
  });

  test('une décision qui arrive tard ne ramène pas sur « À valider »', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    // Une 3G qui traîne : la base répond après que l'on a changé d'onglet.
    await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '600'));
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await page.getByRole('link', { name: 'Écoles' }).click();
    await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeVisible();
    // Le temps que la réponse arrive : on reste sur « Écoles ».
    await page.waitForTimeout(1200);
    await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'À valider' })).toHaveCount(0);
  });

  test('un relais en attente est activé sur un lot', async ({ page }) => {
    await seConnecter(page, '/admin/');
    await page.getByRole('link', { name: 'Relais' }).click();
    const ligne = page.getByRole('row', { name: /\[Relais en attente\]/ });
    await expect(ligne.getByText('À activer')).toBeVisible();
    await ligne.getByLabel(/Lot de/).selectOption({ label: 'Ngoyo' });
    await ligne.getByRole('button', { name: 'Activer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est actif/);
    await expect(
      page.getByRole('row', { name: /\[Relais en attente\]/ }).getByText('Actif', { exact: true }),
    ).toBeVisible();
  });

  test('un compte qui n’est pas administrateur ne voit rien', async ({ page }) => {
    await page.goto('/admin/');
    await page.evaluate(() =>
      localStorage.setItem('ntanova-faux-serveur', JSON.stringify({ admin: false })),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'À valider' })).toHaveCount(0);
  });

  test('tient dans 360 px sans défilement horizontal de la page', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    for (const ecran of ['#valider', '#relais']) {
      await page.goto(`/admin/${ecran}`);
      await page.waitForTimeout(300);
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largeur, ecran).toBeLessThanOrEqual(360);
    }
  });
});
