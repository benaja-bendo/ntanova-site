import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  ouvrirGestion,
  ouvrirLaFiche,
  publierLaZoneTieTie,
  seConnecter,
  uneFicheEnvoyee,
} from './aides';
test.use({ permissions: ['geolocation'] });
test('photo publique : sélection explicite, relecture et retrait sans badge', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await expect(
    page.getByText(/Effacer l’original ne retire pas les copies déjà publiées/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Accepter la fiche', exact: true }).click();
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await ouvrirGestion(ligne, 'Photo publique');
  const d = page.getByRole('dialog', { name: 'Gérer [École 1]' });
  // Aucune enseigne contrôlée : rien à retirer, et la fiche paraîtra sans photo.
  await expect(d).toContainText('Aucune enseigne ni vue du bâtiment contrôlée');
  await expect(d.getByRole('button', { name: 'Retirer la photo publique' })).toHaveCount(0);
  await d.getByRole('button', { name: 'Choisir cette enseigne' }).click();
  await expect(d.getByRole('checkbox')).not.toBeChecked();
  await d.getByRole('button', { name: 'Confirmer la photo publique' }).click();
  await expect(d.getByRole('alert')).toContainText('Confirme le contrôle');
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirmer la photo publique' }).click();
  await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  await expect(d).toContainText('Choix prioritaire.');
  // La fiche est « prête », pas publiée : aucune photo n'est dite publique.
  await expect(d).toContainText('Aucune photo n’est publique tant que la fiche n’est pas publiée');
  await expect(ligne).toContainText('Prête');
  await expect(ligne).not.toContainText('vérifiée par la direction');
  expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await expect(ligne.getByRole('button', { name: 'Gérer la fiche', exact: true })).toBeFocused();
  await page.reload();
  await ouvrirGestion(ligne, 'Photo publique');
  await d.getByRole('button', { name: 'Retirer la photo publique' }).click();
  await expect(d).not.toContainText('Choix prioritaire.');
  await expect(d).toContainText('Retrait demandé');
  await expect(d.getByRole('button', { name: 'Choisir cette enseigne' })).toBeVisible();
});
test('sans enseigne acceptée : aucun choix inventé', async ({ page }) => {
  await seConnecter(page, '/admin/#ecoles');
  await ouvrirGestion(page.getByRole('row', { name: /\[École à situer\]/ }), 'Photo publique');
  await expect(page.getByRole('dialog')).toContainText(
    'Aucune enseigne ni vue du bâtiment issue d’un relevé accepté.',
  );
});
// Le raccord de l'administration au repli automatique (07/11/2026) ----------------------------------------------------------

const MENU = 'summary[aria-label^="Autres actions pour"]';
const ligne = (page: Page) => page.getByRole('row', { name: /\[École 1\]/ });
const dialogue = (page: Page) => page.getByRole('dialog', { name: 'Gérer [École 1]' });
const etatFaux = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
        photos: Record<string, { publiable: boolean; publique?: boolean; role: string }>;
        choixPhotos: Record<string, string | null>;
      },
  );

/**
 * Une école publiée dont l'enseigne est contrôlée depuis « À valider », avec une vue du bâtiment contrôlée en plus (un
 * relais en envoie jusqu'à trois autres photos). Sans choix : la base retient la première, l'enseigne.
 */
async function uneEcolePublieeAvecDeuxPhotos(page: Page, context: BrowserContext) {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Contrôler pour publication' }).click();
  await expect(page.getByText('Contrôlée pour publication', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Accepter la fiche', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  await page.getByRole('link', { name: 'Écoles', exact: true }).click();
  await publierLaZoneTieTie(page);
  await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();
  // La vue du bâtiment arrive d'un même relevé, déjà contrôlée ; son identifiant range après celui de l'enseigne.
  await page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      photos: Record<string, unknown>;
    };
    const premiere = Object.values(etat.photos)[0] as { releveId: string };
    etat.photos['zz-batiment'] = {
      id: 'zz-batiment',
      releveId: premiere.releveId,
      role: 'building',
      mime: 'image/webp',
      octets: 50_000,
      publiable: true,
    };
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  });
  await page.reload();
}

test('contrôler une enseigne la propose au repli automatique, sans promettre plus', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await expect(
    page.getByText(/Contrôler pour publication\. Photo nette, sans enfant ni donnée personnelle/),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Elle pourra apparaître sur la fiche publiée après la prochaine mise à jour du site/,
    ),
  ).toBeVisible();
  // L'enseigne est publiable : le bouton le dit, et rien d'autre n'est promis.
  await expect(page.getByRole('button', { name: 'Marquer publiable' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Contrôler pour publication' }).click();
  await expect(page.getByText('Contrôlée pour publication', { exact: true })).toBeVisible();
  // Contrôler ne publie rien : la photo est contrôlée, aucun choix n'est écrit, aucune photo n'est dite publique.
  const faux = await etatFaux(page);
  expect(Object.values(faux.photos).map((p) => [p.role, p.publiable, p.publique ?? false])).toEqual(
    [['signboard', true, false]],
  );
  expect(faux.choixPhotos).toEqual({});
});

test('photo automatique : retenue sur une fiche publiée, et le retrait ne laisse aucune autre photo la remplacer', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await uneEcolePublieeAvecDeuxPhotos(page, context);
  await ouvrirGestion(ligne(page), 'Photo publique');
  const d = dialogue(page);
  const figures = d.getByRole('figure');
  await expect(figures).toHaveCount(2);

  // Sans choix : une seule photo est retenue, l'autre n'est qu'une candidate, jamais présentée comme publique.
  await expect(d).toContainText('est retenue automatiquement');
  await expect(figures.first()).toContainText('Retenue automatiquement');
  await expect(figures.nth(1)).toContainText('candidate automatique : une autre photo est retenue');
  await expect(figures.nth(1)).not.toContainText('Retenue automatiquement');
  // Le retrait est offert même pour une photo choisie par le repli, et dit ce qu'il bloque.
  await expect(d.getByRole('button', { name: 'Retirer la photo publique' })).toBeVisible();
  await expect(d).toContainText('aucune autre photo, même contrôlée, ne prend sa place');

  await d.getByRole('button', { name: 'Retirer la photo publique' }).click();
  await expect(page.getByRole('status')).toContainText('aucune autre photo ne prend sa place');
  await expect(page.getByRole('status')).toContainText('Reconstruis le site');
  await expect(d).toContainText('Retrait demandé');
  await expect(d).not.toContainText('Retenue automatiquement');
  await expect(d.getByText('le retrait empêche toute photo automatique')).toHaveCount(2);
  await expect(d.getByRole('button', { name: 'Retirer la photo publique' })).toHaveCount(0);

  // Preuve : le retrait est un choix nul, pas un contrôle retiré. Les deux photos restent contrôlées.
  const faux = await etatFaux(page);
  expect(Object.values(faux.photos).map((p) => p.publiable)).toEqual([true, true]);
  expect(Object.values(faux.choixPhotos)).toEqual([null]);

  // Un nouveau choix explicite reste possible après le retrait, y compris une vue du bâtiment.
  await figures.nth(1).getByRole('button', { name: 'Choisir cette vue du bâtiment' }).click();
  await d.getByRole('checkbox').check();
  await d.getByRole('button', { name: 'Confirmer la photo publique' }).click();
  await expect(d).toContainText('Choix prioritaire, retenu');
  await expect(figures.nth(1)).toContainText('Choix prioritaire, retenu');
  await expect(figures.first()).toContainText('le choix prioritaire passe avant');
  await expect(d.getByRole('button', { name: 'Choisir cette vue du bâtiment' })).toHaveCount(0);
  // L'enseigne retenue plus tôt se choisit aussi : elle passe prioritaire, donc stable.
  await expect(
    figures.first().getByRole('button', { name: 'Choisir cette enseigne' }),
  ).toBeVisible();
});

test('corbeille puis restauration : aucune photo n’est publiée, le retrait et le choix sont gardés', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await uneEcolePublieeAvecDeuxPhotos(page, context);

  const mettreALaCorbeilleEtRestaurer = async () => {
    await ligne(page).locator(MENU).click();
    await ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' }).click();
    await ligne(page).getByLabel('Motif').selectOption('erreur');
    await ligne(page)
      .getByRole('button', { name: /Mettre \[École 1\] à la corbeille/ })
      .click();
    await expect(page.getByRole('status')).toHaveText(/est à la corbeille/);
    await page.getByRole('button', { name: 'Corbeille · 1' }).click();
    // À la corbeille, la photo ne se gère plus : ni « Gérer la fiche », ni « Publier ».
    await expect(ligne(page).getByRole('button', { name: 'Gérer la fiche' })).toHaveCount(0);
    await ligne(page).getByRole('button', { name: 'Restaurer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est restaurée/);
    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(ligne(page).getByText('Prête', { exact: true })).toBeVisible();
  };

  // 1. Repli automatique : la restauration ne republie ni la fiche ni sa photo.
  await mettreALaCorbeilleEtRestaurer();
  await ouvrirGestion(ligne(page), 'Photo publique');
  const d = dialogue(page);
  await expect(d).toContainText('La fiche n’est pas publiée : aucune photo n’est publique');
  await expect(d.getByText('Retenue automatiquement')).toHaveCount(0);
  await expect(d.getByText('Contrôlée, candidate automatique.')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);

  // 2. L'administration republie : la photo automatique reparaît, elle n'a pas été perdue.
  await ligne(page).getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();
  await ouvrirGestion(ligne(page), 'Photo publique');
  await expect(d.getByRole('figure').first()).toContainText('Retenue automatiquement');

  // 3. Un retrait traverse la corbeille : republiée, la fiche reste sans photo.
  await d.getByRole('button', { name: 'Retirer la photo publique' }).click();
  await expect(d).toContainText('Retrait demandé');
  await page.keyboard.press('Escape');
  await expect(d).toHaveCount(0);
  await mettreALaCorbeilleEtRestaurer();
  await ligne(page).getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();
  await ouvrirGestion(ligne(page), 'Photo publique');
  await expect(d).toContainText('Retrait demandé');
  await expect(d.getByText('Retenue automatiquement')).toHaveCount(0);
});

test('fiche publique : image locale légère, provenance et partage sans URL privée', async ({
  page,
  request,
}) => {
  await page.goto('/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/');
  const image = page.getByRole('img', {
    name: 'Vue de [Complexe scolaire Exemple]',
    exact: true,
  });
  await expect(image).toBeVisible();
  const src = await image.getAttribute('src');
  expect(src).toMatch(/^\/photos\/[a-f0-9-]+\.webp$/);
  const r = await request.get(src!);
  expect(r.ok()).toBe(true);
  expect((await r.body()).length).toBeLessThanOrEqual(32768);
  await expect(page.getByText(/Photo relevée sur place/)).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain('/storage/v1/');
  const og = await request.get(
    new URL((await page.locator('meta[property="og:image"]').getAttribute('content'))!).pathname,
  );
  expect(og.ok()).toBe(true);
  expect(og.headers()['content-type']).toContain('image/png');
});
