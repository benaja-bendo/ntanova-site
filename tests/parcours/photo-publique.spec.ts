import { expect, test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee, seConnecter } from './aides';
test.use({ permissions: ['geolocation'] });
test('photo publique : sélection explicite, relecture et retrait sans badge', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche', exact: true }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await ligne.getByRole('button', { name: 'Photo publique', exact: true }).click();
  const d = page.getByRole('dialog', { name: 'Photo publique de [École 1]' });
  await d.getByRole('button', { name: 'Choisir cette enseigne' }).click();
  await expect(d.getByRole('checkbox')).not.toBeChecked();
  await d.getByRole('button', { name: 'Confirmer la photo publique' }).click();
  await expect(d.getByRole('alert')).toContainText('Confirme le contrôle');
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirmer la photo publique' }).click();
  await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  await expect(d).toContainText('Sélectionnée pour la publication.');
  await expect(ligne).toContainText('Prête');
  await expect(ligne).not.toContainText('vérifiée par la direction');
  expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(ligne.getByRole('button', { name: 'Photo publique', exact: true })).toBeFocused();
  await page.reload();
  await ligne.getByRole('button', { name: 'Photo publique', exact: true }).click();
  await d.getByRole('button', { name: 'Retirer la photo publique' }).click();
  await expect(d).not.toContainText('Sélectionnée pour la publication.');
  await expect(d.getByRole('button', { name: 'Choisir cette enseigne' })).toBeVisible();
});
test('sans enseigne acceptée : aucun choix inventé', async ({ page }) => {
  await seConnecter(page, '/admin/#ecoles');
  await page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('button', { name: 'Photo publique', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText(
    'Aucune photo d’enseigne issue d’un relevé accepté.',
  );
});
test('fiche publique : image locale légère, provenance et partage sans URL privée', async ({
  page,
  request,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/');
  const image = page.getByRole('img', {
    name: 'Enseigne de [Complexe scolaire Exemple]',
    exact: true,
  });
  await expect(image).toBeVisible();
  const src = await image.getAttribute('src');
  expect(src).toMatch(/^\/photos\/[a-f0-9-]+\.webp$/);
  const r = await request.get(src!);
  expect(r.ok()).toBe(true);
  expect((await r.body()).length).toBeLessThanOrEqual(32768);
  await expect(page.getByText(/Photo d’enseigne prise sur place le 3 novembre 2026/)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('/storage/v1/');
  const og = await request.get(
    new URL((await page.locator('meta[property="og:image"]').getAttribute('content'))!).pathname,
  );
  expect(og.ok()).toBe(true);
  expect(og.headers()['content-type']).toContain('image/png');
});
