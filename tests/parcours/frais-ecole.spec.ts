import { ouvrirGestion, retourAuxEcoles, ouvrirLesEcoles } from './aides';
import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';
test.use({ permissions: ['geolocation'] });
test('frais déclarés : ajout, relecture, modification et retrait, sans badge ni publication', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await ouvrirLesEcoles(page);
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await ouvrirGestion(ligne, 'Frais déclarés');
  // Planche « Frais par classe » : une page, le prospectus à gauche, le tableau des lignes à droite.
  const frais = page.getByRole('region', { name: 'Frais déclarés de [École 1]' });
  // Le tableau défile dans sa carte : la page, elle, garde la largeur de l'écran (sinon le téléphone la dézoome).
  await expect(frais).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const enregistrer = frais.getByRole('button', { name: /^Enregistrer \d+ lignes? publiables?$/ });
  const premiere = frais.getByRole('row', { name: /Primaire|cette ligne/ }).first();
  if ((await frais.getByLabel('Cycle', { exact: true }).count()) === 0)
    await frais.getByRole('button', { name: '+ Ajouter une ligne' }).click();
  await frais
    .getByLabel('Déclarés par l’école le')
    .fill(new Date(Date.now() - 86400000).toISOString().slice(0, 10));
  await premiere.getByLabel('Cycle', { exact: true }).selectOption('primaire');
  await premiere.getByLabel('Montant (FCFA)').fill('25 000 - 30 000');
  await premiere.getByLabel('Période', { exact: true }).selectOption('mois');
  await enregistrer.click();
  await expect(page.getByRole('status').first()).toContainText(
    'Visible à la prochaine mise à jour du site',
  );
  // De retour sur la fiche : la carte « Frais » le dit ; la fiche reste prête, sans badge.
  const fiche = page.getByRole('article', { name: 'Fiche de [École 1]' });
  await expect(fiche.getByRole('button', { name: 'Frais : ouvrir' })).toContainText('1 ligne');
  await expect(fiche).toContainText('Prête');
  await expect(fiche).not.toContainText('vérifiée par la direction');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await retourAuxEcoles(page);
  await page.reload();
  await ouvrirGestion(ligne, 'Frais déclarés');
  // Sur téléphone (planche), une ligne enregistrée se lit repliée : son résumé, puis un toucher l'ouvre.
  const resume = premiere.locator('button[aria-expanded]');
  if (await resume.isVisible()) {
    await expect(resume).toContainText(/25\s*000/);
    await expect(resume).toHaveAttribute('aria-expanded', 'false');
    await resume.click();
  }
  await expect(premiere.getByLabel('Montant (FCFA)')).toHaveValue(/25\s*000/);
  await premiere.getByRole('button', { name: /^Retirer la ligne / }).click();
  await frais.getByRole('button', { name: /^Enregistrer 0 ligne publiable$/ }).click();
  await expect(fiche.getByRole('button', { name: 'Frais : ouvrir' })).not.toContainText('1 ligne');
});
test('fiche publique : fourchette, période, date et inconnues, sans total annuel inventé', async ({
  page,
}) => {
  await page.goto('/ecoles/complexe-scolaire-exemple-482913/');
  const bloc = page.getByRole('region', { name: 'Frais déclarés par l’école' });
  await expect(bloc).toContainText(/25\s*000 à 30\s*000 FCFA/);
  // v2 (13/11) : une ligne par cycle ou par classe ; rien n'est écrit de ce que l'école n'a pas dit (ni année, ni inscription).
  await expect(bloc.getByRole('listitem')).toHaveText([
    /^Primaire\s*25\s*000 à 30\s*000 FCFA \/ mois$/,
  ]);
  await expect(bloc).not.toContainText('Inscription');
  await expect(bloc).not.toContainText('année');
  await expect(bloc).toContainText('Tenue non comprise.');
  await expect(bloc).toContainText('Dits par l’école le 3 novembre 2026. À confirmer avec elle.');
  await expect(bloc).not.toContainText(/300\s*000|360\s*000|Confirmée par la direction/);
});
test('sans déclaration de frais : état vide honnête', async ({ page }) => {
  await page.goto('/ecoles/centre-de-formation-exemple-315702/');
  await expect(page.getByRole('region', { name: 'Frais déclarés par l’école' })).toHaveCount(0);
  // Depuis la refonte de la fiche, une donnée absente n'a plus de libellé « à compléter » (comme le contact et les
  // équipements) : la page ne dit rien des frais, et n'en invente aucun (ni montant, ni « gratuit »).
  await expect(page.getByText('Frais', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/gratuit|FCFA/i)).toHaveCount(0);
});
