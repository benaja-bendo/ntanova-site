import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { ouvrirGestion, ouvrirLaFiche, publierLaZoneTieTie, uneFicheEnvoyee } from './aides';

// Audit de l'administration du 06/11/2026 : garder ses repères pendant le défilement, contrôler une photo sans quitter
// la page, ne pas ouvrir un menu vide. Construit avec le faux serveur.

test.use({ permissions: ['geolocation'] });

test.describe('tableau de bord : À valider', () => {
  test('sur un grand écran, le côté et les boutons de décision restent à l’écran pendant le défilement', async ({
    page,
    context,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1280,
      'Mise en page à deux colonnes : grand écran',
    );
    await uneFicheEnvoyee(page, context);
    // Une fenêtre basse : sans barre collante, « Accepter » est sous la ligne de flottaison.
    await page.setViewportSize({ width: 1280, height: 520 });
    await ouvrirLaFiche(page);

    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeInViewport();

    await page.mouse.wheel(0, 300);
    await expect(accepter).toBeInViewport();
    // Le côté (la navigation) ne défile pas avec la page.
    const haut = await page.locator('.admin-cote').evaluate((e) => e.getBoundingClientRect().top);
    expect(haut).toBe(0);
  });

  test('une photo s’agrandit dans la page, et Échap la referme', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: /^Agrandir : / }).click();
    const fenetre = page.getByRole('dialog');
    await expect(fenetre.locator('img.admin-photo-grande')).toBeVisible();
    // Un seul onglet : l'agrandissement ne sort plus de la page.
    expect(page.context().pages()).toHaveLength(1);
    await expect(fenetre.getByRole('link', { name: /Ouvrir l’original/ })).toHaveAttribute(
      'target',
      '_blank',
    );

    await page.keyboard.press('Escape');
    await expect(fenetre).toHaveCount(0);
  });

  test('avec une seule photo, pas de bouton « Contrôler les photos » : le geste unitaire suffit', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(page.getByRole('button', { name: 'Contrôler pour publication' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Contrôler les \d+ photos$/ })).toHaveCount(0);
  });
});

test.describe('tableau de bord : compteurs', () => {
  test('les nombres des onglets se lisent dès l’arrivée, sans ouvrir « À valider »', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    // On arrive directement sur un autre onglet : le nombre d'envois à valider est déjà là.
    await page.goto('/admin/#zones');
    await page.reload();
    const onglets = page.getByRole('navigation', { name: 'Administration' });
    await expect(onglets.getByRole('link', { name: /À valider/ })).toContainText(
      '1 envoi à valider',
    );
    await expect(onglets.getByRole('link', { name: /Écoles/ })).not.toContainText('prête');

    // Acceptée, l'école est prête : l'onglet « Écoles » le dit, et « À valider » se vide.
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.goto('/admin/#zones');
    await page.reload();
    await expect(onglets.getByRole('link', { name: /Écoles/ })).toContainText(
      '1 école prête à publier',
    );
    await expect(onglets.getByRole('link', { name: /À valider/ })).not.toContainText('envoi');
  });
});

test.describe('tableau de bord : Écoles', () => {
  const MENU = 'summary[aria-label^="Autres actions pour"]';

  async function uneEcolePubliee(page: Page, context: BrowserContext) {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('link', { name: 'Écoles' }).click();
    await publierLaZoneTieTie(page);
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);
    await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();
  }
  const ligne = (page: Page) => page.getByRole('row', { name: /\[École 1\]/ });

  test('le menu « ⋯ » d’une école retirée ne s’ouvre plus vide : il propose la corbeille', async ({
    page,
    context,
  }) => {
    await uneEcolePubliee(page, context);
    // Publiée : retirer, fusionner, corbeille, mission.
    await expect(ligne(page).locator(MENU)).toHaveCount(1);

    await ouvrirGestion(ligne(page), 'retirer');
    await ligne(page).getByLabel('Motif').selectOption('demande_ecole');
    await ligne(page)
      .getByRole('button', { name: /Retirer \[École 1\] du site/ })
      .click();
    await expect(ligne(page).getByText('Retirée', { exact: true })).toBeVisible();

    // Retirée : plus de « Retirer » ni de « Fusionner », mais la corbeille (avant : un menu vide).
    await ligne(page).locator(MENU).click();
    await expect(ligne(page).getByRole('button', { name: 'Retirer du site' })).toHaveCount(0);
    await expect(ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' })).toBeVisible();
    await expect(ligne(page).getByRole('button', { name: 'Republier' })).toBeVisible();
  });

  test('la corbeille : l’école quitte les listes, se restaure, puis se supprime pour de bon', async ({
    page,
    context,
  }) => {
    await uneEcolePubliee(page, context);

    // Mettre à la corbeille : elle disparaît de « Toutes » et paraît dans « Corbeille ».
    await ligne(page).locator(MENU).click();
    await ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' }).click();
    await ligne(page).getByLabel('Motif').selectOption('erreur');
    await ligne(page)
      .getByRole('button', { name: /Mettre \[École 1\] à la corbeille/ })
      .click();
    await expect(page.getByRole('status')).toHaveText(/est à la corbeille.*restaurer/);
    await expect(ligne(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Corbeille · 1' })).toBeVisible();

    await page.getByRole('button', { name: 'Corbeille · 1' }).click();
    await expect(ligne(page).getByText('À la corbeille', { exact: true })).toBeVisible();
    await expect(ligne(page).getByText(/À la corbeille depuis le/)).toBeVisible();
    // À la corbeille : ni « Publier », ni « Gérer la fiche ».
    await expect(ligne(page).getByRole('button', { name: 'Publier', exact: true })).toHaveCount(0);
    await expect(ligne(page).getByRole('button', { name: 'Gérer la fiche' })).toHaveCount(0);

    // Restaurer : une école publiée revient « prête », jamais « publiée » toute seule.
    await ligne(page).getByRole('button', { name: 'Restaurer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est restaurée/);
    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(ligne(page).getByText('Prête', { exact: true })).toBeVisible();

    // La suppression définitive demande d'abord la corbeille, puis le nom de l'école.
    await ligne(page).locator(MENU).click();
    await ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' }).click();
    await ligne(page)
      .getByRole('button', { name: /Mettre \[École 1\] à la corbeille/ })
      .click();
    await page.getByRole('button', { name: 'Corbeille · 1' }).click();
    await ligne(page).getByRole('button', { name: 'Supprimer définitivement…' }).click();

    await expect(ligne(page).getByText(/La suppression emporte/)).toBeVisible();
    const supprimer = ligne(page).getByRole('button', {
      name: /^Supprimer définitivement \[École 1\]/,
    });
    await expect(supprimer).toBeDisabled();
    await ligne(page)
      .getByLabel(/écris le nom de l’école/)
      .fill('[Autre école]');
    await expect(supprimer).toBeDisabled();
    // Sans accent ni majuscule ni espace en trop : le nom se reconnaît.
    await ligne(page)
      .getByLabel(/écris le nom de l’école/)
      .fill('  [école 1] ');
    await expect(supprimer).toBeEnabled();
    await supprimer.click();

    await expect(page.getByRole('status')).toHaveText(/supprimée définitivement/);
    await expect(ligne(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Corbeille · 0' })).toBeVisible();
  });
});
