import { ouvrirContacts, envoyerSansBonus } from './aides';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ouvrirLaFiche, prendrePhotoEtPosition, seConnecter } from './aides';

// Plusieurs personnes à contacter, côté relais (ticket #96, étape 2), construit avec le faux serveur : la direction, puis
// une ou deux autres personnes, chacune avec son accord. Trois au plus par fiche.

test.use({ permissions: ['geolocation'] });

/** Remplit Ajouter 1/3 et 2/3, répond « Oui » à la direction et la remplit : on est à l'étape 3/3. */
async function jusquALaDirection(page: Page, context: BrowserContext) {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(
    page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
  ).toBeVisible();
  await prendrePhotoEtPosition(page);
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByLabel("Nom de l'établissement").fill('[École 1]');
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await page.getByLabel('Sa fonction').selectOption('promoteur');
  await page.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await page.getByLabel(/Son WhatsApp/).fill('06 111 11 11');
}

const autre = (page: Page, rang: number) =>
  page.getByRole('group', { name: `Autre personne ${rang}` });

function contactsDuServeur(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      contacts?: Record<string, unknown>;
    };
    return Object.keys(etat.contacts ?? {}).length;
  });
}

test.describe('le relais note plusieurs personnes', () => {
  test('la direction, un enseignant et un secrétariat : tout arrive, trois au plus', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    await jusquALaDirection(page, context);

    await page.getByRole('button', { name: 'Ajouter une autre personne' }).click();
    const premiere = autre(page, 1);
    await premiere.getByLabel('Sa fonction').selectOption('autre');
    await premiere.getByLabel(/Quelle fonction/).fill('enseignant');
    await premiere.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
    await premiere.getByLabel(/Son WhatsApp/).fill('06 222 22 22');

    await page.getByRole('button', { name: 'Ajouter une autre personne' }).click();
    await autre(page, 2).getByLabel('Sa fonction').selectOption('secretariat');

    // Trois personnes, la direction comprise : plus d'ajout.
    await expect(page.getByRole('button', { name: 'Ajouter une autre personne' })).toHaveCount(0);
    await expect(page.getByText('Trois personnes au plus par fiche.')).toBeVisible();

    await envoyerSansBonus(page);
    await page.getByRole('link', { name: 'Mon secteur' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => contactsDuServeur(page)).toBe(3);

    // L'administration lit les trois personnes.
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
    const privee = page.getByRole('region', { name: 'Partie privée' });
    await expect(privee.getByRole('listitem')).toHaveCount(3);
    await expect(privee.getByText('+242 06 111 11 11')).toBeVisible();
    await expect(privee.getByText('+242 06 222 22 22')).toBeVisible();
    await expect(privee.getByRole('heading', { name: 'Autre : enseignant' })).toBeVisible();
    await expect(privee.getByRole('heading', { name: 'Secrétariat' })).toBeVisible();
  });

  test('une personne en plus doit avoir sa fonction, et son numéro seulement avec son accord', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await jusquALaDirection(page, context);
    await page.getByRole('button', { name: 'Ajouter une autre personne' }).click();
    // Les erreurs se disent avant la fenêtre « Envoyer sans le bonus ? » : elle ne s'ouvre pas.
    await page.getByRole('button', { name: 'Envoyer maintenant' }).click();
    await expect(autre(page, 1).getByText('Choisissez sa fonction.')).toBeVisible();
    // La fiche n'est pas enregistrée : on reste à l'étape 3/3.
    await expect(page.getByRole('button', { name: 'Envoyer maintenant' })).toBeVisible();

    await autre(page, 1).getByLabel('Sa fonction').selectOption('directeur');
    await autre(page, 1).getByRole('button', { name: 'Retirer cette personne' }).click();
    await expect(autre(page, 1)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajouter une autre personne' })).toBeVisible();
  });

  test('sans personne en plus, la fiche part comme avant, avec un seul contact', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await jusquALaDirection(page, context);
    await envoyerSansBonus(page);
    await page.getByRole('link', { name: 'Mon secteur' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => contactsDuServeur(page)).toBe(1);
  });
});
