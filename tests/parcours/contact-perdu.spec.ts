import { ouvrirContacts } from './aides';
import { expect, test, type Page } from '@playwright/test';
import { ajouterUneEcole, ouvrirLaFiche, seConnecter, uneFicheEnvoyee } from './aides';

// Le contact de la direction ne se perd plus (ticket #94), construit avec le faux serveur. La fiche d'ESTAM (03/11) est
// arrivée sans son contact : le premier envoi s'était arrêté sur la photo, qui partait avant lui, et la correction n'a
// jamais redemandé le contact (« Rien à refaire ici »).

test.use({ permissions: ['geolocation'] });

/** Le faux serveur n'a pas (ou plus) le contact de la fiche : ce qui s'est passé pour ESTAM. */
function perdreLeContact(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      unknown
    >;
    etat['contacts'] = {};
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  });
}

/** Ce que le faux serveur a reçu : le nombre de relevés, de photos et de contacts. */
function serveur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      Record<string, unknown> | undefined
    >;
    return ['releves', 'photos', 'contacts'].map((t) => Object.keys(etat[t] ?? {}).length);
  });
}

/** La correction, dans l'administration (la fiche « Correction · … » de la liste), est ouverte. */
async function ouvrirLaCorrection(page: Page) {
  await page.goto('/admin/#valider');
  // Une navigation par le dièse ne recharge rien : la liste lue avant la correction serait périmée.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Correction/ }).click();
  await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
}

test.describe('la direction a été vue, mais NTanova n’a pas reçu son contact', () => {
  test('la correction le redemande, et il arrive', async ({ page, context }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await perdreLeContact(page);

    // NTanova renvoie la fiche pour revoir les informations.
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await page.getByLabel('Motif').selectOption('autre');
    await page.getByLabel(/Message au relais/).fill('Vérifiez le nom sur l’enseigne.');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toHaveText(/correction part au relais/);

    // Le relais corrige : la direction est redemandée, avec la raison, et plus « Rien à refaire ».
    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(page.getByRole('region', { name: 'À faire sur cette école' })).toContainText(
      'Contact à redonner',
    );
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByRole('group', { name: 'Avez-vous vu la direction ?' })).toBeVisible();
    await expect(page.getByText(/n['’]est pas arrivé chez NTanova/)).toBeVisible();
    await expect(page.getByText('Rien à refaire ici.')).toHaveCount(0);

    await page.getByLabel('Sa fonction').selectOption('directeur');
    await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
    await page.getByLabel(/Son WhatsApp/).fill('06 765 43 21');
    await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
    await page.getByRole('link', { name: 'Mon secteur' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });

    // Le contact est arrivé, sur la correction : deux relevés, la photo de l'original, un contact.
    await expect.poll(() => serveur(page)).toEqual([2, 1, 1]);

    // L'administration le lit sur la correction.
    await ouvrirLaCorrection(page);
    await ouvrirContacts(page);
    await expect(page.getByText('+242 06 765 43 21')).toBeVisible();
    await expect(page.getByText('Contact pas encore reçu.')).toHaveCount(0);
  });

  test('une direction vue dont le contact est arrivé n’est pas redemandée', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await page.getByLabel('Motif').selectOption('autre');
    await page.getByLabel(/Message au relais/).fill('Vérifiez le nom sur l’enseigne.');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toHaveText(/correction part au relais/);

    await page.goto('/relais/#fiches');
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(page.getByRole('region', { name: 'À faire sur cette école' })).toContainText(
      'Rien à refaire',
    );
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(page.getByText('Rien à refaire ici.')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Avez-vous vu la direction ?' })).toHaveCount(0);
  });
});

test.describe('une photo qui ne part pas', () => {
  test('n’empêche plus le contact de partir', async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();

    // Le navigateur échoue à envoyer la photo (« Load failed » sur iPhone) : le relevé et le contact partent quand même.
    await page.evaluate(() => localStorage.setItem('ntanova-faux-reseau-photo', '1'));
    await ajouterUneEcole(page, 1);
    await expect.poll(() => serveur(page), { timeout: 15_000 }).toEqual([1, 0, 1]);
  });
});

test.describe('la correction d’une fiche dont le contact est arrivé avec l’original', () => {
  /** Une correction de la fiche envoyée, sans contact à elle (le relais ne le redonne pas : il est déjà là). */
  async function uneCorrectionSansContact(page: Page) {
    await page.evaluate(() => {
      const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
        releves: Record<string, Record<string, unknown> & { id: string }>;
      };
      const [origine] = Object.values(etat.releves);
      if (!origine) throw new Error('aucune fiche dans le faux serveur');
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
      localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
    });
  }

  test('l’administration le lit, dit de quelle fiche il vient, et l’efface là où il est', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await uneCorrectionSansContact(page);
    await ouvrirLaCorrection(page);
    await ouvrirContacts(page);

    // Le contact est là (celui de la fiche d'origine) : plus de « pas encore reçu » trompeur.
    await expect(page.getByText('+242 06 123 45 61')).toBeVisible();
    await expect(page.getByText('Contact pas encore reçu.')).toHaveCount(0);
    await expect(page.getByText(/arrivé avec la fiche d['’]origine/)).toBeVisible();

    // Le droit d'effacement s'exerce sur la fiche qui porte le contact, pas sur la correction.
    await page.getByRole('button', { name: /Effacer le contact/ }).click();
    await page.getByRole('button', { name: /Confirmer : effacer le contact/ }).click();
    await expect(page.getByText('Le contact de la direction est effacé.')).toBeVisible();
    await expect.poll(() => serveur(page)).toEqual([2, 1, 0]);
  });
});
