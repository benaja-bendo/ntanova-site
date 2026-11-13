import { commencerLaMission, envoyerSansBonus, ouvrirContacts } from './aides';
import { ouvrirGestion } from './aides';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, prendrePhotoEtPosition, seConnecter, uneFicheEnvoyee } from './aides';

// Compléter une école connue et corriger une fiche renvoyée SANS tout ressaisir (ticket #55, PR 4), et ajouter le
// contact de la direction après « À repasser ». Construit avec le faux serveur : l'utilisateur est administrateur et
// relais à la fois. Le relevé « [École 1] » arrive avec sa photo et le contact de la direction.

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

/** Ce que le faux serveur a reçu : combien de relevés, de photos, de contacts, et les types des relevés. */
function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      Record<string, { type?: string }> | undefined
    >;
    return {
      releves: Object.values(etat.releves ?? {}).map((r) => r.type),
      photos: Object.keys(etat.photos ?? {}).length,
      contacts: Object.keys(etat.contacts ?? {}).length,
    };
  });
}

/** L'administration accepte « [École 1] » (et confirme d'abord la fonction de la direction si on le demande). */
async function accepter(page: Page, options: { confirmerLeContact: boolean }) {
  await ouvrirLaFiche(page);
  await ouvrirContacts(page);
  if (options.confirmerLeContact) {
    await page.getByRole('button', { name: 'Confirmer sa fonction' }).click();
    await expect(page.getByText('Fonction confirmée', { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
}

/** L'administration confie « [École 1] » au relais, avec une consigne. */
async function confier(page: Page, genre: 'verify' | 'locate' | 'complete', consigne: string) {
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await ouvrirGestion(ligne, 'Mission');
  await page
    .locator('article.fiche-admin')
    .getByLabel('Ce que le relais doit faire')
    .selectOption(genre);
  await page.locator('article.fiche-admin').getByLabel('À vérifier').fill(consigne);
  await page
    .locator('article.fiche-admin')
    .getByRole('button', { name: 'Confier', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);
}

/** L'administration renvoie la fiche « [École 1] » au relais, pour ce motif. */
async function renvoyer(page: Page, motif: string, message: string) {
  await ouvrirLaFiche(page);
  await ouvrirContacts(page);
  await page.getByRole('button', { name: 'Demander une correction' }).click();
  await page.getByLabel('Motif').selectOption(motif);
  await page.getByLabel(/Message au relais/).fill(message);
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('status')).toHaveText(/correction part au relais/);
}

const encart = (page: Page) => page.getByRole('region', { name: 'À faire sur cette école' });

test.describe('compléter une école que NTanova connaît déjà', () => {
  test('dont la direction est confirmée : ni la photo ni la direction ne sont à refaire', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await accepter(page, { confirmerLeContact: true });
    await confier(page, 'complete', 'Confirmer les séries.');

    await page.goto('/relais/');
    await commencerLaMission(page);

    // L'encart dit ce qui est demandé, avec la consigne de NTanova.
    await expect(page.locator('.entete-etape-titre')).toHaveText('Compléter une école');
    await expect(encart(page)).toContainText('Confirmer les séries.');
    await expect(encart(page).getByText('Photo de l’enseigne')).toBeVisible();
    await expect(encart(page)).toContainText('Déjà chez NTanova');
    await expect(encart(page)).toContainText('Rien à refaire');
    // « complete » : l'école a déjà une position, le GPS ne se lance pas de lui-même.
    await expect(page.getByText('Recherche de la position')).toHaveCount(0);

    // Sans nouvelle photo, on passe.
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText("Ajoutez la photo de l'enseigne.")).toHaveCount(0);
    await expect(page.getByLabel("Nom de l'établissement")).toHaveValue('[École 1]');
    await expect(page.getByRole('button', { name: 'Primaire' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Suivant' }).click();

    // La direction est déjà confirmée : rien à redire.
    await expect(page.getByText(/contact de la direction est déjà confirmé/)).toBeVisible();
    await expect(page.getByText('Avez-vous parlé à quelqu’un de l’école ?')).toHaveCount(0);
    await envoyerSansBonus(page);
    await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
    await page.getByRole('link', { name: 'Missions' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });

    // Chez NTanova : un second relevé, sans nouvelle photo ni nouveau contact.
    await expect
      .poll(async () => (await serveur(page)).releves.sort())
      .toEqual(['contre_visite', 'releve']);
    expect(await serveur(page)).toMatchObject({ photos: 1, contacts: 1 });
  });

  test('dont la direction n’est pas confirmée : la direction est redemandée, la photo non', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await accepter(page, { confirmerLeContact: false });
    await confier(page, 'complete', 'Revoir la direction.');

    await page.goto('/relais/');
    await commencerLaMission(page);
    await expect(encart(page)).toContainText('Déjà chez NTanova');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText('Avez-vous parlé à quelqu’un de l’école ?')).toBeVisible();
    await page.getByRole('button', { name: 'Personne', exact: true }).click();
    await envoyerSansBonus(page);
    await page.getByRole('link', { name: 'Missions' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    expect(await serveur(page)).toMatchObject({ photos: 1 });
  });

  test('qui n’a pas d’enseigne chez NTanova : la photo est demandée', async ({ page }) => {
    // « [École à situer] » est une école ajoutée par l'administration, sans relevé : aucune photo.
    await seConnecter(page, '/admin/#valider');
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
    await ouvrirGestion(ligne, 'Mission');
    await page
      .locator('article.fiche-admin')
      .getByLabel('Ce que le relais doit faire')
      .selectOption('complete');
    await page.locator('article.fiche-admin').getByLabel('À vérifier').fill('Tout reprendre.');
    await page
      .locator('article.fiche-admin')
      .getByRole('button', { name: 'Confier', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText(/est confiée à/);

    await page.goto('/relais/');
    await commencerLaMission(page);
    await expect(encart(page).getByText('Photo de l’enseigne')).toBeVisible();
    await expect(encart(page)).toContainText('À prendre');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText("Ajoutez la photo de l'enseigne.")).toBeVisible();
  });
});

test.describe('corriger une fiche que NTanova renvoie', () => {
  test('pour la position : la position est reprise, pas la photo, ni le reste', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'position_imprecise', 'Placez-vous devant l’entrée.');

    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(page.locator('.entete-etape-titre')).toHaveText('Corriger une fiche');
    await expect(encart(page)).toContainText('Placez-vous devant l’entrée.');
    await expect(encart(page)).toContainText('Déjà chez NTanova');

    // La position : le GPS se lance, et la fiche corrigée n'est pas prise pour un doublon d'elle-même.
    await expect(page.getByText('Position prise')).toBeVisible();
    await page.getByLabel('Comment la trouver ?').fill('Face au marché');
    await expect(page.getByText('Est-ce la même école ?')).toHaveCount(0);
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Tout ce qui était saisi revient.
    await expect(page.getByLabel("Nom de l'établissement")).toHaveValue('[École 1]');
    await expect(page.getByRole('button', { name: 'Primaire' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: 'Suivant' }).click();

    // Le contact est déjà parti avec la fiche : il ne se redemande pas, et ne repart pas.
    await expect(page.getByText(/contact de la direction est déjà parti/)).toBeVisible();
    await envoyerSansBonus(page);
    await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
    await page.getByRole('link', { name: 'Missions' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => (await serveur(page)).releves.sort())
      .toEqual(['correction', 'releve']);
    expect(await serveur(page)).toMatchObject({ photos: 1, contacts: 1 });

    // L'administration voit une correction sans nouvelle photo, et ne croit pas qu'elle n'est « pas encore reçue ».
    await page.goto('/admin/#valider');
    await expect(page.getByText('Pas de nouvelle photo')).toBeVisible();
    await expect(page.getByText('Photo pas encore reçue')).toHaveCount(0);
  });

  test('pour une photo floue : la photo est exigée, et seulement elle', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await renvoyer(page, 'photo_floue', 'La photo est floue, reprenez-la de face.');

    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(encart(page)).toContainText('La photo est floue, reprenez-la de face.');
    await expect(encart(page)).toContainText('À prendre');
    // Pas de GPS : la position n'est pas ce qu'on demande.
    await expect(page.getByText('Recherche de la position')).toHaveCount(0);

    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText("Ajoutez la photo de l'enseigne.")).toBeVisible();

    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByAltText("La photo de l'enseigne")).toBeVisible();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await envoyerSansBonus(page);
    await page.getByRole('link', { name: 'Missions' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await serveur(page)).photos).toBe(2);
  });
});

test.describe('après « À repasser »', () => {
  test('le relais ajoute le contact de la direction, sans refaire la fiche', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await prendrePhotoEtPosition(page);
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByLabel("Nom de l'établissement").fill('[École 1]');
    await page.getByRole('button', { name: 'Primaire' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Personne', exact: true }).click();
    await envoyerSansBonus(page);
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    expect(await serveur(page)).toMatchObject({ contacts: 0 });

    // « À repasser » a maintenant un geste : le relais a revu la direction.
    // v2 (13/11) : « Quand repasser ? » est retiré de l'étape 3 ; « À repasser » reste, sans note.
    await expect(page.getByText(/^À repasser/)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'J’ai revu la direction' }).click();
    await expect(page.getByRole('heading', { name: 'La direction' })).toBeVisible();
    await page.getByLabel('Sa fonction').selectOption('promoteur');
    await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
    await page.getByLabel(/Son WhatsApp/).fill('06 123 45 69');
    await page.getByRole('button', { name: 'Envoyer le contact' }).click();

    // Le contact arrive chez NTanova, disparaît du téléphone, et le geste s'efface.
    await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
    await expect.poll(async () => (await serveur(page)).contacts, { timeout: 15_000 }).toBe(1);
    await expect(page.getByText('Reçu · à confirmer')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'J’ai revu la direction' })).toHaveCount(0);
    expect(await serveur(page)).toMatchObject({ releves: ['releve'], photos: 1 });
  });

  test('une fiche qui n’est plus dans la liste le dit, et ramène à « Mes fiches »', async ({
    page,
  }) => {
    await seConnecter(page, '/relais/');
    await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
    await page.goto('/relais/#contact/inconnue');
    await expect(page.getByText(/n’est plus dans votre liste/)).toBeVisible();
    await page.getByRole('link', { name: 'Retour à mes fiches' }).click();
    await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  });
});
