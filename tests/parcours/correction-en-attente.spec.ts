import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';

// Accepter la correction d'une fiche (ticket #89), construit avec le faux serveur. Un relais SANS SECTEUR (le cas de la
// plupart) reprend sa photo après un « à corriger » : sa correction n'a ni position ni secteur. Avant, « Accepter » restait
// grisé sans un mot, et le panneau où choisir la division était caché pour une correction.

test.use({ permissions: ['geolocation'] });

const BRAZZAVILLE = { latitude: -4.27, longitude: 15.28 };

/**
 * Le relais « sans secteur » corrige sa photo : la fiche d'origine et sa correction n'ont plus de lot, la correction n'a
 * pas de position (« corriger pour la photo » ne la redemande pas) et porte sa nouvelle photo d'enseigne.
 * `position` : où la fiche d'origine a été relevée, pour la sortir de tout contour connu.
 */
async function lePrixDUneCorrection(page: Page, options: { position?: typeof BRAZZAVILLE } = {}) {
  await page.evaluate((options) => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves: Record<string, Record<string, unknown> & { id: string }>;
      photos: Record<string, unknown>;
    };
    const [origine] = Object.values(etat.releves);
    if (!origine) throw new Error('aucune fiche dans le faux serveur');
    origine['lotId'] = null;
    if (options.position) origine['position'] = options.position;
    const id = crypto.randomUUID();
    etat.releves[id] = {
      ...origine,
      id,
      type: 'correction',
      corrigeReleveId: origine.id,
      position: null,
      precisionM: null,
      lotId: null,
      prisLe: new Date().toISOString(),
    };
    const photo = crypto.randomUUID();
    etat.photos[photo] = {
      id: photo,
      releveId: id,
      role: 'signboard',
      mime: 'image/jpeg',
      octets: 1000,
      publiable: false,
    };
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  }, options);
}

/** L'administration renvoie « [École 1] » pour la photo. */
async function renvoyerPourLaPhoto(page: Page) {
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Demander une correction' }).click();
  await page.getByLabel('Motif').selectOption('photo_floue');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('status')).toHaveText(/correction part au relais/);
}

/** La correction (la fiche « Correction · … » de la liste) est ouverte. */
async function ouvrirLaCorrection(page: Page) {
  await page.goto('/admin/#valider');
  // Une navigation par le dièse ne recharge rien : la liste lue avant l'ajout de la correction serait périmée (un parcours
  // qui passait ou non selon la charge de la machine).
  await page.reload();
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Correction/ }).click();
  await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
}

test.describe('la correction d’une fiche pas encore acceptée', () => {
  test('s’accepte : l’école est créée avec la position de la fiche d’origine', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await renvoyerPourLaPhoto(page);
    await lePrixDUneCorrection(page);
    await ouvrirLaCorrection(page);

    // L'écran dit ce qu'est cette correction, et d'où vient la position.
    await expect(page.getByText(/remplace la fiche que tu as renvoyée/)).toBeVisible();
    await expect(page.getByText(/reprend la position de la fiche d’origine/)).toBeVisible();
    // Les mêmes choix qu'une nouvelle fiche.
    await expect(page.getByRole('group', { name: 'Que faire de cette fiche ?' })).toBeVisible();

    const accepter = page.getByRole('button', { name: 'Accepter la fiche corrigée' });
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    // L'école existe, avec la position de la fiche d'origine (celle que la correction n'avait pas).
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByText('Prête', { exact: true })).toBeVisible();
    await expect(ligne).toContainText('-4.80000, 11.90000');

    // Le relais voit sa fiche acceptée.
    await page.goto('/relais/#fiches');
    await expect(page.getByText('Acceptée').first()).toBeVisible({ timeout: 15_000 });
  });

  test('sans contour connu pour la position : l’écran dit ce qui manque, la division se choisit', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await renvoyerPourLaPhoto(page);
    await lePrixDUneCorrection(page, { position: BRAZZAVILLE });
    await ouvrirLaCorrection(page);

    // Le bouton est grisé, MAIS l'écran le dit, et le choix est là.
    const accepter = page.getByRole('button', { name: 'Accepter la fiche corrigée' });
    await expect(accepter).toBeDisabled();
    await expect(page.getByText(/Choisis la division de l’école/)).toBeVisible();

    await page.getByLabel('Division de l’école').selectOption({ index: 1 });
    await expect(accepter).toBeEnabled();
    await expect(page.getByText(/Choisis la division de l’école/)).toHaveCount(0);
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  });
});

test.describe('la correction d’une école déjà créée, par un relais sans secteur', () => {
  test('s’accepte : elle met l’école à jour, sans demander de division', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    // L'école est créée (la fiche d'origine est acceptée), puis le relais envoie sa correction.
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await lePrixDUneCorrection(page);
    // L'origine est acceptée : la correction met l'école à jour.
    await ouvrirLaCorrection(page);

    const accepter = page.getByRole('button', { name: 'Accepter la correction' });
    await expect(accepter).toBeEnabled();
    await expect(page.getByText(/remplace la fiche que tu as renvoyée/)).toHaveCount(0);
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/Acceptée/);
  });
});
