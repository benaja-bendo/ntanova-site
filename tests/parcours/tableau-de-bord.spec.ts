import { expect, test } from '@playwright/test';
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

  test('avec une seule photo, pas de bouton « Marquer les photos publiables » : le geste unitaire suffit', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(page.getByRole('button', { name: 'Marquer publiable' })).toHaveCount(1);
    await expect(
      page.getByRole('button', { name: /^Marquer les \d+ photos publiables$/ }),
    ).toHaveCount(0);
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
  test('une école retirée n’a plus de menu « ⋯ » vide', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('link', { name: 'Écoles' }).click();
    await publierLaZoneTieTie(page);
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);

    const ligne = () => page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne().getByText('Publiée', { exact: true })).toBeVisible();
    // Publiée : le menu existe (retirer, fusionner, mission).
    await expect(ligne().locator('summary[aria-label^="Autres actions pour"]')).toHaveCount(1);

    await ouvrirGestion(ligne(), 'retirer');
    await ligne().getByLabel('Motif').selectOption('demande_ecole');
    await ligne()
      .getByRole('button', { name: /Retirer \[École 1\] du site/ })
      .click();
    await expect(ligne().getByText('Retirée', { exact: true })).toBeVisible();

    // Retirée : plus aucune autre action que « Republier » et « Gérer la fiche ».
    await expect(ligne().locator('summary[aria-label^="Autres actions pour"]')).toHaveCount(0);
    await expect(ligne().getByRole('button', { name: 'Republier' })).toBeVisible();
  });
});
