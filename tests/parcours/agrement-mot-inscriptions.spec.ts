// Ticket 148 : l'agrément, le mot de la direction et la date limite des inscriptions, sur la fiche et dans l'administration.
import { expect, test } from '@playwright/test';
import { ouvrirGestion, ouvrirLaFiche, uneFicheEnvoyee, ficheAdmin } from './aides';

const hier = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

test('fiche confirmée : la référence sans lien, le mot daté, la prochaine date limite', async ({
  page,
}) => {
  await page.goto('/ecoles/groupe-scolaire-exemple-158427/');
  await expect(page.locator('.ligne-agrement')).toHaveText(
    /Autorisation d’ouverture\s*: arrêté n° \[référence\] du 12 mars 2024 · source : copie remise par l’établissement/,
  );
  await expect(page.getByRole('link', { name: /Voir la source/ })).toHaveCount(0);
  await expect(page.locator('.mot-direction blockquote')).toContainText(
    '[Nous accueillons les élèves de la sixième à la terminale.]',
  );
  await expect(page.locator('.mot-direction figcaption')).toHaveText(
    'Le mot de la direction, 4 novembre 2026',
  );
  const inscriptions = page.getByRole('region', { name: 'Inscriptions' });
  await expect(inscriptions.getByRole('heading')).toHaveText('Inscriptions 2030-2031');
  await expect(inscriptions).toContainText('Date limite annoncée : 15 décembre 2030');
  await expect(inscriptions).toContainText('Annoncée par l’école le 4 novembre 2026');
  await expect(page.locator('main')).not.toContainText('Ouvertes jusqu');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
});

test('fiche non confirmée : l’agrément et sa source paraissent, le mot et une date passée non', async ({
  page,
}) => {
  await page.goto('/ecoles/institut-superieur-exemple-527064/');
  const source = page.getByRole('link', { name: 'Voir la source : [Journal officiel]' });
  await expect(source).toHaveAttribute('href', 'https://exemple.cg/arrete');
  await expect(source).toHaveAttribute('rel', /nofollow/);
  await expect(page.getByText('Agrément de la filière')).toBeVisible();
  await expect(page.locator('.filiere-nom .ligne-agrement')).toContainText(
    'arrêté n° [filière] du 15 janvier 2024 · source : [Journal officiel]',
  );
  await expect(page.locator('.mot-direction')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Ce mot ne paraît pas');
  await expect(page.getByRole('region', { name: 'Inscriptions' })).toHaveCount(0);
});

test('sans donnée : la fiche n’écrit ni agrément, ni mot, ni inscriptions', async ({ page }) => {
  await page.goto('/ecoles/ecole-sans-detail-exemple-270846/');
  await expect(page.locator('.ligne-agrement')).toHaveCount(0);
  await expect(page.locator('.mot-direction')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Inscriptions' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Agrément');
});

test.describe('dans l’administration', () => {
  test.use({ permissions: ['geolocation'] });

  test('agrément, mot et inscriptions : saisir, relire, retirer, sans badge', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await page.getByRole('link', { name: 'Écoles', exact: true }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await ouvrirGestion(ligne, 'Agrément');
    const dialog = ficheAdmin(page, '[École 1]');

    // L'agrément
    const agrement = dialog.getByRole('form', { name: 'Agrément de [École 1]' });
    // Sans filière, rien à choisir.
    await expect(agrement.getByLabel('Concerne')).toHaveCount(0);
    await agrement.getByRole('button', { name: 'Enregistrer l’agrément' }).click();
    await expect(dialog).toContainText('Choisis l’intitulé du document');
    await agrement.getByLabel('Intitulé du document').selectOption('autorisation_ouverture');
    await agrement.getByLabel(/^Référence, telle/).fill('arrêté n° [référence]');
    await agrement.getByLabel('Date du document').fill('2024-03-12');
    await agrement.getByLabel(/^Source, en mots/).fill('copie remise par l’établissement');
    await agrement.getByLabel(/^Lien vers le document/).fill('http://exemple.cg');
    await agrement.getByLabel(/^Jour où tu as vu/).fill(hier());
    await agrement.getByLabel('J’ai vu ce document.').check();
    await agrement.getByRole('button', { name: 'Enregistrer l’agrément' }).click();
    await expect(dialog).toContainText('Un lien commence par https://');
    await agrement.getByLabel(/^Lien vers le document/).fill('');
    await agrement.getByRole('button', { name: 'Enregistrer l’agrément' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Visible après la prochaine mise à jour du site',
    );
    await expect(dialog.getByRole('list')).toContainText(
      'L’établissement · Autorisation d’ouverture',
    );
    // Le retour se lit dans le panneau, en vue : le bandeau de la page reste derrière.
    await expect(dialog.getByText('Agrément de [École 1] enregistré.')).toBeInViewport();
    // Modifier fige la cible ; annuler vide le formulaire.
    await dialog.getByRole('button', { name: 'Modifier : L’établissement' }).click();
    await expect(agrement.getByLabel(/^Référence, telle/)).toHaveValue('arrêté n° [référence]');
    await agrement.getByRole('button', { name: 'Annuler la modification' }).click();
    await expect(agrement.getByLabel(/^Référence, telle/)).toHaveValue('');
    await expect(page.locator('article.fiche-admin')).not.toContainText(
      'vérifiée par la direction',
    );
    await dialog.getByRole('button', { name: 'Retirer : L’établissement' }).click();
    await expect(dialog.getByRole('button', { name: 'Retirer : L’établissement' })).toHaveCount(0);

    // Le mot : la fiche n'est pas confirmée, l'écran le dit.
    await dialog.getByRole('button', { name: 'Mot de la direction', exact: true }).click();
    const mot = dialog.getByRole('form', { name: 'Mot de la direction de [École 1]' });
    await expect(mot).toContainText('ne paraîtra qu’une fois la fiche confirmée');
    await mot.getByLabel(/^Le mot/).fill('[Un mot de la direction.]');
    await mot.getByLabel('Date du mot').fill(hier());
    await mot.getByLabel(/^Fonction de la personne/).selectOption('directeur');
    await mot.getByLabel('Canal de l’accord').selectOption('whatsapp');
    await mot.getByRole('button', { name: 'Enregistrer le mot' }).click();
    await expect(dialog).toContainText('Confirme que la direction accepte');
    await mot.getByLabel('La direction accepte la publication de ce mot.').check();
    await mot.getByRole('button', { name: 'Enregistrer le mot' }).click();
    await expect(mot).toContainText('Enregistré : mot du');
    await mot.getByRole('button', { name: 'Retirer le mot' }).click();
    await expect(mot.getByRole('button', { name: 'Retirer le mot' })).toHaveCount(0);

    // Les inscriptions
    await dialog.getByRole('button', { name: 'Inscriptions', exact: true }).click();
    const inscriptions = dialog.getByRole('form', { name: 'Inscriptions de [École 1]' });
    await inscriptions.getByLabel(/^Année scolaire/).fill('2026-2027');
    await inscriptions.getByLabel('Date limite annoncée').fill('2030-12-15');
    await inscriptions.getByLabel(/^Date de la déclaration/).fill(hier());
    await inscriptions.getByRole('button', { name: 'Ajouter la date' }).click();
    await expect(dialog.getByRole('list')).toContainText('2026-2027 · limite du 15 décembre 2030');
    await expect(dialog.getByRole('list')).not.toContainText('date passée');
    await inscriptions.getByLabel(/^Année scolaire/).fill('2026-2027');
    await inscriptions.getByLabel('Date limite annoncée').fill('2030-12-16');
    await inscriptions.getByLabel(/^Date de la déclaration/).fill(hier());
    await inscriptions.getByRole('button', { name: 'Ajouter la date' }).click();
    await expect(dialog).toContainText('Une date existe déjà pour cette année scolaire');
    await dialog.getByRole('button', { name: 'Retirer 2026-2027' }).click();
    await expect(dialog.getByRole('button', { name: 'Retirer 2026-2027' })).toHaveCount(0);
    // Une date passée se dit : la fiche ne l'affiche plus.
    await inscriptions.getByLabel(/^Année scolaire/).fill('2024-2025');
    await inscriptions.getByLabel('Date limite annoncée').fill('2024-12-15');
    await inscriptions.getByLabel(/^Date de la déclaration/).fill('2024-11-05');
    await inscriptions.getByRole('button', { name: 'Ajouter la date' }).click();
    await expect(dialog.getByRole('list')).toContainText(
      'date passée : la fiche ne l’affiche plus',
    );
    const b = await dialog.boundingBox();
    expect(b!.x + b!.width).toBeLessThanOrEqual(360);
  });
});
