import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';

// La position saisie sur la fiche « À valider » (ticket 144). Le téléphone d'un relais avait refusé la localisation 27 fois
// en une semaine : il envoyait des captures de Google Maps, et l'administration devait accepter la fiche, puis ouvrir
// « Écoles › Situer ». Construit avec le faux serveur, qui connaît les mêmes contours que le navigateur (Tié-Tié, Ngoyo).

test.use({ permissions: ['geolocation'] });

const avant = (page: Page) => page.getByRole('region', { name: 'Avant d’accepter' });
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

    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(avant(page)).toContainText('Sans position : l’école ne sera pas sur la carte');
    await expect(accepter).toBeDisabled();

    // Ce que donne un clic droit sur Google Maps, à l'entrée de l'école.
    await champPosition(page).fill('-4.84841, 11.90712');
    await expect(
      fiche(page).getByText('Lu : -4.84841, 11.90712. Dans le dessin de Ngoyo.'),
    ).toBeVisible();
    await expect(avant(page)).toContainText('Saisie par toi : -4.84841, 11.90712');
    await expect(avant(page)).toContainText('Ngoyo');
    await expect(avant(page)).toContainText('Rien ne bloque');
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toBeVisible();

    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByText('Prête', { exact: true })).toBeVisible();
    await expect(ligne.getByRole('link', { name: '-4.84841, 11.90712' })).toBeVisible();
    await expect(ligne.getByText('Ngoyo')).toBeVisible();
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
    await expect(avant(page)).toContainText('aucun contour connu ne contient cette position');
    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeDisabled();

    const division = fiche(page).getByLabel('Division de l’école');
    const ngoyo = await division
      .locator('option', { hasText: 'Ngoyo' })
      .first()
      .getAttribute('value');
    await division.selectOption(ngoyo ?? '');
    await expect(avant(page)).toContainText('Rien ne bloque');
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toBeVisible();

    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByRole('link', { name: '-4.85000, 14.00000' })).toBeVisible();
    await expect(ligne.getByText('Ngoyo')).toBeVisible();
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

    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeEnabled();
    await champPosition(page).fill('face au marché');
    await expect(
      fiche(page).locator('.message-erreur', { hasText: 'Position illisible' }),
    ).toBeVisible();
    await expect(avant(page)).toContainText('illisible');
    await expect(accepter).toBeDisabled();

    await champPosition(page).fill('');
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toBeVisible();

    // Aucune position inventée : l'école n'a que celle qu'on lui a donnée, c'est-à-dire aucune.
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne).toBeVisible();
    await expect(ligne.getByRole('link', { name: /^-?\d+\.\d+, -?\d+\.\d+$/ })).toHaveCount(0);
  });

  test('la position mesurée par le relais fait foi : pas de champ pour la remplacer', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await expect(avant(page)).toContainText('Prise, précision 8 m');
    await expect(champPosition(page)).toHaveCount(0);
  });
});
