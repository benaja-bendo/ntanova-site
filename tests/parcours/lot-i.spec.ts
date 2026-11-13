// Lot I (13/11/2026) : « Au nom de » (titulaire Mobile Money), « Confiée par NTanova le … », « On y voit » et les six
// repères de l'étape 1 avec leur aide, « Même inscription sur toutes les lignes » dans les frais.
import { expect, test } from '@playwright/test';
import {
  carteDeMission,
  ficheAdmin,
  ouvrirGestion,
  ouvrirLaFiche,
  seConnecter,
  uneFicheEnvoyee,
} from './aides';

test.use({ permissions: ['geolocation'] });

test('« Compte » : « Au nom de » est demandé, puis se relit', async ({ page }) => {
  await seConnecter(page, '/relais/');
  await page.goto('/relais/#compte');
  const paie = page.getByRole('region', { name: 'Pour recevoir la paie' });
  await paie.getByRole('button', { name: 'Ajouter' }).click();
  await paie.getByRole('button', { name: 'MTN' }).click();
  await paie.getByLabel('Numéro').fill('06 123 45 67');
  await paie.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(paie.getByRole('alert')).toContainText('nom du titulaire');
  await paie.getByLabel('Au nom de').fill('  [Titulaire   Exemple] ');
  await paie.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(paie.getByRole('status')).toContainText('Numéro enregistré');
  await page.reload();
  await expect(paie).toContainText('Au nom de');
  await expect(paie).toContainText('[Titulaire Exemple]');
});

test('« Une mission » : « Confiée par NTanova le » et la date', async ({ page, context }) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/admin/#valider');
  await page.getByRole('link', { name: 'Écoles' }).click();
  await ouvrirGestion(page.getByRole('row', { name: /\[École à situer\]/ }), 'Mission');
  await page
    .locator('article.fiche-admin')
    .getByRole('button', { name: 'Confier', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);
  await page.evaluate(() =>
    localStorage.setItem(
      'ntanova-faux-mission',
      JSON.stringify({ confieeLe: '2026-11-10T09:00:00Z' }),
    ),
  );
  await page.goto('/relais/');
  await expect(carteDeMission(page).first()).toBeVisible({ timeout: 15_000 });
  await carteDeMission(page).first().click();
  await expect(page.getByText('Confiée par NTanova le 10 novembre')).toBeVisible();
});

test('Ajouter 1 sur 3 : « On y voit » sous la photo, les six repères et leur aide', async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await page.getByRole('button', { name: 'Ajouter une école' }).click();
  await expect(page.getByRole('group', { name: 'On y voit' })).toHaveCount(0);
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'enseigne.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64',
      ),
    });
  const voit = page.getByRole('group', { name: 'On y voit' });
  await expect(voit.getByRole('button')).toHaveText(['L’enseigne', 'Le portail', 'Le bâtiment']);
  await expect(voit.getByRole('button', { name: 'L’enseigne' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await voit.getByRole('button', { name: 'Le portail' }).click();
  await expect(voit.getByRole('button', { name: 'Le portail' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await expect(page.getByRole('group', { name: 'Repères rapides' }).getByRole('button')).toHaveText(
    ['Marché', 'Église', 'Pharmacie', 'Station', 'Carrefour', 'École'],
  );
  await page
    .getByRole('group', { name: 'Repères rapides' })
    .getByRole('button', { name: 'Station' })
    .click();
  await expect(page.getByLabel('Comment la trouver ?')).toHaveValue('Près de la station-service');
  const aide = page.getByRole('button', { name: 'Aide : le repère' });
  await expect(aide).toHaveAttribute('aria-expanded', 'false');
  await aide.click();
  await expect(aide).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Un lieu que tout le monde connaît')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('À valider : l’administration lit « On y voit » sous la photo de l’enseigne', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await expect(page.getByText('Le relais y voit : l’enseigne')).toBeVisible();
});

test('Frais : « Même inscription sur toutes les lignes » en un geste', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  await ouvrirGestion(page.getByRole('row', { name: /\[École 1\]/ }), 'Frais déclarés');
  const dialog = ficheAdmin(page, '[École 1]');
  const f = dialog.getByRole('form', { name: /Frais déclarés de/ });
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const [classe, montant, inscription] of [
    ['CP1', '20 000', '5 000'],
    ['CM2', '25 000', ''],
  ] as const) {
    await f.getByRole('combobox', { name: 'Cycle', exact: true }).selectOption('primaire');
    await f.getByLabel('Classe (facultatif)').fill(classe);
    await f.getByLabel('Montant minimum ou unique (FCFA)', { exact: true }).fill(montant);
    await f.getByRole('combobox', { name: 'Période', exact: true }).selectOption('mois');
    await f.getByLabel('Frais d’inscription (facultatif, FCFA)').fill(inscription);
    await f.getByLabel('Date de déclaration').fill(hier);
    await f.getByLabel('Ces frais ont été communiqués par l’école pour être affichés.').check();
    await f.getByRole('button', { name: 'Enregistrer les frais' }).click();
    await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  }
  await dialog.getByRole('button', { name: 'Même inscription sur toutes les lignes' }).click();
  const meme = dialog.getByRole('form', { name: 'Même inscription sur toutes les lignes' });
  await expect(meme.getByLabel(/Inscription pour les 2 lignes/)).toHaveValue('5000');
  await meme.getByRole('button', { name: 'Appliquer à toutes les lignes' }).click();
  await expect(page.getByRole('status')).toContainText('sur 1 ligne');
  await dialog
    .getByRole('button', { name: /Modifier les frais de Primaire/ })
    .last()
    .click();
  await expect(f.getByLabel('Frais d’inscription (facultatif, FCFA)')).toHaveValue('5000');
});
