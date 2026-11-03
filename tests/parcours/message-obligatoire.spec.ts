import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';

// Une décision qui renvoie ou refuse une fiche dit toujours quoi faire (ticket #80), construit avec le faux serveur :
// avec le motif « autre », dont la phrase de repli ne dit rien, le message est obligatoire. Les autres motifs gardent
// leur phrase automatique.

test.use({ permissions: ['geolocation'] });

const PHRASE = 'Avec le motif « autre », écris un message : le relais doit savoir quoi faire.';

test.describe('message obligatoire avec « autre »', () => {
  test('une correction « autre » sans message ne part pas ; avec un message, elle part', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await page.getByLabel('Motif').selectOption('autre');
    // Le champ dit qu'il est obligatoire, au lieu de « facultatif ».
    await expect(page.getByText(/Obligatoire avec « Autre »/)).toBeVisible();

    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('alert')).toHaveText(PHRASE);
    // Rien n'est parti : la fiche attend toujours, à valider.
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toBeVisible();

    // Des espaces ne sont pas un message.
    await page.getByLabel(/Message au relais/).fill('    ');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('alert')).toHaveText(PHRASE);

    await page.getByLabel(/Message au relais/).fill('Le nom écrit sur le portail est différent.');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toHaveText(/La demande de correction part au relais/);
  });

  test('un refus « autre » dit pourquoi : « Refuser » propose « autre » par défaut', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: 'Refuser', exact: true }).click();
    await expect(page.getByLabel('Motif')).toHaveValue('autre');
    await page.getByRole('button', { name: 'Refuser la fiche' }).click();
    await expect(page.getByRole('alert')).toHaveText(PHRASE);

    await page.getByLabel(/Message au relais/).fill('Hors du périmètre : ce n’est pas une école.');
    await page.getByRole('button', { name: 'Refuser la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/La fiche est refusée/);
  });

  test('un autre motif garde son message facultatif', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await page.getByLabel('Motif').selectOption('photo_floue');
    await expect(page.getByText(/Obligatoire avec « Autre »/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toHaveText(/La demande de correction part au relais/);
  });
});
