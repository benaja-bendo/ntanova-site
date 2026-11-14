import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee, ouvrirLesEcoles } from './aides';

// La position saisie sur la fiche « À valider » (ticket 144). Le téléphone d'un relais avait refusé la localisation 27 fois
// en une semaine : il envoyait des captures de Google Maps, et l'administration devait accepter la fiche, puis ouvrir
// « Écoles › Situer ». Construit avec le faux serveur, qui connaît les mêmes contours que le navigateur (Tié-Tié, Ngoyo).

test.use({ permissions: ['geolocation'] });

const fiche = (page: Page) => page.getByRole('region', { name: 'Envoi sélectionné' });
const champPosition = (page: Page) => fiche(page).getByRole('textbox', { name: /^Position/ });

/** La fiche envoyée arrive comme celle d'un téléphone dont la localisation était refusée : sans position (et, au choix, sans secteur). */
function sansPosition(page: Page, options: { sansSecteur: boolean }) {
  return page.evaluate((sansSecteur) => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves: Record<string, Record<string, unknown>>;
    };
    for (const r of Object.values(etat.releves)) {
      r['position'] = null;
      r['precisionM'] = null;
      if (sansSecteur) r['lotId'] = null;
    }
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  }, options.sansSecteur);
}

test.describe('saisir la position sur la fiche, avant d’accepter', () => {
  test('une fiche sans position ni secteur : la position saisie se lit, la zone s’en déduit, et l’école naît située et prête', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await sansPosition(page, { sansSecteur: true });
    await ouvrirLaFiche(page);

    const accepter = page.getByRole('button', { name: 'Accepter', exact: true });
    await expect(fiche(page).getByText('Sans position', { exact: true })).toBeVisible();
    await expect(accepter).toBeDisabled();

    // Ce que donne un clic droit sur Google Maps, à l'entrée de l'école.
    await champPosition(page).fill('-4.84841, 11.90712');
    await expect(
      fiche(page).getByText('Lu : -4.84841, 11.90712. Dans le dessin de Ngoyo.'),
    ).toBeVisible();
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toBeVisible();

    await ouvrirLesEcoles(page);
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByRole('button', { name: 'Publier', exact: true })).toBeVisible();
    await expect(ligne).toContainText('Ngoyo');
  });

  test('hors de tout contour connu : la division se choisit, et la position saisie reste celle qu’on a donnée', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await sansPosition(page, { sansSecteur: true });
    await ouvrirLaFiche(page);

    await champPosition(page).fill('-4.85, 14.00');
    await expect(fiche(page).getByText(/Aucun contour connu ici/)).toBeVisible();
    await expect(fiche(page).getByText(/Choisis la division de l’école/)).toBeVisible();
    const accepter = page.getByRole('button', { name: 'Accepter', exact: true });
    await expect(accepter).toBeDisabled();

    const division = fiche(page).getByLabel('Division de l’école');
    const ngoyo = await division
      .locator('option', { hasText: 'Ngoyo' })
      .first()
      .getAttribute('value');
    await division.selectOption(ngoyo ?? '');
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toBeVisible();

    await ouvrirLesEcoles(page);
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne).toContainText('Ngoyo');
  });

  test('une position illisible bloque et le dit ; le champ vidé, la fiche s’accepte sans position, l’école reste à situer', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    // Le relais a un secteur (Tié-Tié) : sans position saisie, la zone vient de ce secteur, comme avant.
    await sansPosition(page, { sansSecteur: false });
    await ouvrirLaFiche(page);

    const accepter = page.getByRole('button', { name: 'Accepter', exact: true });
    await expect(accepter).toBeEnabled();
    await champPosition(page).fill('face au marché');
    await expect(
      fiche(page)
        .getByText(/Position illisible/)
        .first(),
    ).toBeVisible();
    await expect(accepter).toBeDisabled();

    await champPosition(page).fill('');
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toBeVisible();

    // Aucune position inventée : l'école n'a que celle qu'on lui a donnée, c'est-à-dire aucune.
    await ouvrirLesEcoles(page);
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne).toBeVisible();
    await expect(ligne).toContainText(/Pas sur la carte|Sans position/);
  });

  test('la position mesurée par le relais fait foi : pas de champ pour la remplacer', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await expect(fiche(page)).toContainText('précision 8 m');
    await expect(champPosition(page)).toHaveCount(0);
  });
});
