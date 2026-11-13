import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, seConnecter, uneFicheEnvoyee } from './aides';

// La vue d'ensemble de l'administration et l'âge des fiches à valider (ticket #76), construits avec le faux serveur :
// « est-ce que ça avance ? » et « qui attend depuis combien de temps ? » en dix secondes. Des nombres, jamais un objectif.

test.use({ permissions: ['geolocation'] });

/** Fait attendre la fiche « [École 1] » depuis `heures` heures, et en ajoute une seconde, reçue à l'instant. */
async function faireVieillir(page: Page, heures: number) {
  await page.evaluate((heures) => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves: Record<string, { id: string; nomEnseigne: string; prisLe: string }>;
    };
    const [premier] = Object.values(etat.releves);
    if (!premier) throw new Error('aucune fiche dans le faux serveur');
    premier.prisLe = new Date(Date.now() - heures * 3_600_000).toISOString();
    const id = crypto.randomUUID();
    etat.releves[id] = {
      ...premier,
      id,
      nomEnseigne: '[École 2]',
      prisLe: new Date().toISOString(),
    };
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  }, heures);
}

const attente = (page: Page) => page.getByRole('region', { name: 'Ce qui t’attend' });
const semaine = (page: Page) => page.getByRole('region', { name: 'Cette semaine' });

test.describe('« Aujourd’hui » (admin v2)', () => {
  test('c’est la page d’arrivée de l’administration : ce qui attend, puis la semaine, sans objectif', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/');
    await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeAttached();
    await expect(
      page.getByRole('link', { name: 'Aujourd’hui' }).locator('visible=true'),
    ).toHaveAttribute('aria-current', 'page');
    // Rien n'est encore arrivé : des zéros, pas une page vide ni une erreur.
    await expect(attente(page)).toContainText('rien n’attend');
    await expect(semaine(page)).toContainText('relevés reçus');
    // Aucun seuil du registre : jamais « sur 30 », jamais un objectif.
    await expect(page.getByText(/objectif|sur 30\b|cible/i).locator('visible=true')).toHaveCount(0);
  });

  test('une fiche reçue se lit dans ce qui attend et dans la semaine', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await page.goto('/admin/');

    const fiches = attente(page).getByRole('link', { name: /fiche à valider/ });
    await expect(fiches).toContainText('1');
    await expect(fiches).toContainText(
      /la plus ancienne attend depuis (moins d’une minute|\d+ min)/,
    );
    await expect(semaine(page)).toContainText(/1\s*relevés reçus/);
    await expect(semaine(page)).toContainText(/1\s*relais actifs sur 1/);
    // Le menu dit aussi combien attendent, d'où qu'on arrive.
    await expect(
      page.getByRole('link', { name: /À valider/ }).locator('visible=true'),
    ).toContainText('1');
    // Le détail d'avant reste, replié : les relevés reçus par jour.
    await page.getByText('Le détail').click();
    const tableau = page.getByRole('region', { name: 'Relevés reçus par jour' });
    await expect(tableau.getByRole('row').nth(1)).toContainText('1');
    // La carte mène à la file.
    await fiches.click();
    await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeAttached();
  });

  test('les zones ouvertes aux relais, avec ce qu’un relais a relevé à part (dans le détail)', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/');
    await page.getByText('Le détail').click();
    const zones = page.getByRole('region', { name: 'Écoles par zone ouverte' });
    await expect(zones.getByRole('row', { name: /Tié-Tié/ })).toBeVisible();
  });
});

test.describe('l’âge des fiches à valider', () => {
  test('la plus ancienne passe en premier, et celle de plus de 24 heures se voit', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await faireVieillir(page, 30);

    // « Aujourd'hui » le dit : une fiche attend depuis plus de 24 heures.
    await page.goto('/admin/');
    const file = page
      .getByRole('region', { name: 'Ce qui t’attend' })
      .getByRole('link', { name: /fiches à valider/ });
    await expect(file).toContainText('2');
    await expect(file).toContainText('1 depuis plus de 24 h');
    await expect(file).toContainText('la plus ancienne attend depuis 1 jour');

    // La liste : la plus ancienne d'abord, chaque fiche dit depuis quand elle attend.
    await page.goto('/admin/#valider');
    const liste = page.getByRole('list', { name: 'Envois à valider' });
    const lignes = liste.getByRole('listitem');
    await expect(lignes).toHaveCount(2);
    await expect(lignes.nth(0)).toContainText('[École 1]');
    await expect(lignes.nth(0)).toContainText('depuis 1 jour');
    await expect(lignes.nth(1)).toContainText('[École 2]');
    await expect(lignes.nth(1)).toContainText(/depuis (moins d’une minute|\d+ min)/);
  });

  test('ouvrir une fiche fonctionne toujours depuis la liste', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
  });
});
