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

test.describe('la vue d’ensemble', () => {
  test('c’est la page d’arrivée de l’administration, et elle le dit sans objectif', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/');
    await expect(page.getByRole('heading', { name: 'Vue d’ensemble', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Accueil' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    // Rien n'est encore arrivé : des zéros, pas une page vide ni une erreur.
    await expect(page.getByRole('region', { name: 'À valider' })).toContainText('Rien n’attend.');
    await expect(page.getByRole('region', { name: 'Relevés cette semaine' })).toContainText('0');
    // Aucun seuil du registre : jamais « sur 30 », jamais un objectif.
    await expect(page.getByText(/objectif|sur 30\b|cible/i)).toHaveCount(1); // la phrase « Aucun objectif n’est affiché »
  });

  test('une fiche reçue se lit dans les chiffres', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await page.goto('/admin/');

    const file = page.getByRole('region', { name: 'À valider' });
    await expect(file).toContainText('1');
    await expect(file).toContainText(/La plus ancienne attend depuis (moins d’une minute|\d+ min)/);
    await expect(page.getByRole('region', { name: 'Relevés cette semaine' })).toContainText('1');
    await expect(page.getByRole('region', { name: 'Relais qui ont envoyé' })).toContainText(
      '1 sur 1',
    );
    await expect(page.getByRole('region', { name: 'Photo de l’enseigne' })).toContainText(
      '1 sur 1',
    );
    // Le menu dit aussi combien attendent, d'où qu'on arrive.
    await expect(page.getByRole('link', { name: /À valider/ })).toContainText('1');
    // Le jour d'aujourd'hui, dans le tableau, avec sa fiche.
    const tableau = page.getByRole('region', { name: 'Relevés reçus par jour' });
    await expect(tableau.getByRole('row').nth(1)).toContainText('1');
    // « Voir la file » mène à la liste.
    await file.getByRole('link', { name: 'Voir la file' }).click();
    await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  });

  test('les zones ouvertes aux relais, avec ce qu’un relais a relevé à part', async ({ page }) => {
    await seConnecter(page, '/admin/');
    const zones = page.getByRole('region', { name: 'Écoles par zone ouverte' });
    await expect(zones.getByRole('row', { name: /Tié-Tié/ })).toBeVisible();
    await expect(zones).toContainText('ne comptent jamais comme « relevées par un relais »');
  });
});

test.describe('l’âge des fiches à valider', () => {
  test('la plus ancienne passe en premier, et celle de plus de 24 heures se voit', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await faireVieillir(page, 30);

    // La vue d'ensemble le dit : une fiche attend depuis plus de 24 heures.
    await page.goto('/admin/');
    const file = page.getByRole('region', { name: 'À valider' });
    await expect(file).toContainText('2');
    await expect(file).toContainText('1 depuis plus de 24 h');
    await expect(file).toContainText('La plus ancienne attend depuis 1 jour');

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
