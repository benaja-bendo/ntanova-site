import { ouvrirGestion, retourAuxEcoles } from './aides';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, publierLaZoneTieTie, uneFicheEnvoyee } from './aides';

// L'administration corrige une fiche dans l'onglet « Écoles », sans repasser par le relais
// (ticket 12). Construit avec le faux serveur : l'utilisateur est relais et administrateur.

test.use({ permissions: ['geolocation'] });

/** Une fiche envoyée par le relais (« [École 1] », primaire, type « Pas indiqué »), acceptée : l'école est prête. */
async function uneEcolePrete(page: Page, context: Parameters<typeof uneFicheEnvoyee>[1]) {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  await page.getByRole('link', { name: 'Écoles' }).click();
  await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeVisible();
}

const ligne = (page: Page) => page.getByRole('row', { name: /\[École 1\]/ });

test('l’administration corrige le nom, le type, les niveaux et le programme, sans repasser par le relais', async ({
  page,
  context,
}) => {
  await uneEcolePrete(page, context);

  // Ce que la fiche dit aujourd'hui se lit sous son nom : de quoi repérer celles qui attendent un type.
  await expect(ligne(page).getByText('Pas indiqué · Primaire')).toBeVisible();

  await ouvrirGestion(ligne(page), 'Informations');
  const formulaire = page.getByRole('form', { name: 'Modifier [École 1]' });
  await expect(formulaire.getByLabel('Nom', { exact: true })).toHaveValue('[École 1]');
  await expect(formulaire.getByLabel("Type d'école")).toHaveValue('non_indique');
  await expect(formulaire.getByRole('button', { name: 'Primaire', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await formulaire.getByLabel('Nom', { exact: true }).fill('[École 1 corrigée]');
  await formulaire.getByLabel("Type d'école").selectOption('publique');
  await formulaire.getByRole('button', { name: 'Collège', exact: true }).click();
  await formulaire.getByLabel('Programme et langues').fill('Programme congolais');
  await formulaire.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('status')).toHaveText(/\[École 1 corrigée\] est modifiée/);
  await retourAuxEcoles(page);
  const corrigee = page.getByRole('row', { name: /\[École 1 corrigée\]/ });
  await expect(corrigee.getByText('Publique · Primaire, Collège')).toBeVisible();

  // Rouverte, la fiche montre ce qui a été enregistré.
  await ouvrirGestion(corrigee, 'Informations');
  await expect(page.getByLabel('Programme et langues')).toHaveValue('Programme congolais');
  await expect(page.getByLabel("Type d'école")).toHaveValue('publique');
});

test('une fiche publiée se corrige aussi, et la correction dit quand elle paraît', async ({
  page,
  context,
}) => {
  await uneEcolePrete(page, context);
  await publierLaZoneTieTie(page);
  await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();

  await ouvrirGestion(ligne(page), 'Informations');
  await page
    .getByRole('form', { name: 'Modifier [École 1]' })
    .getByLabel("Type d'école")
    .selectOption('confessionnelle');
  await page
    .getByRole('form', { name: 'Modifier [École 1]' })
    .getByRole('button', { name: 'Enregistrer' })
    .click();
  await expect(page.getByRole('status')).toHaveText(
    /\[École 1\] est modifiée.*paraît sur ntanova\.com après la prochaine mise à jour du site\./,
  );
  // Aucune heure promise : la nuit ne met à jour qu'essai tant que la production n'est pas lancée.
  await expect(page.getByRole('status')).not.toHaveText(/cette nuit|2 h/);
});

test('rien n’a changé : rien ne part ; un nom vide se dit en français', async ({
  page,
  context,
}) => {
  await uneEcolePrete(page, context);
  await ouvrirGestion(ligne(page), 'Informations');
  const formulaire = page.getByRole('form', { name: 'Modifier [École 1]' });

  await formulaire.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(formulaire.getByText('Rien n’a changé.')).toBeVisible();

  await formulaire.getByLabel('Nom', { exact: true }).fill('   ');
  await formulaire.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(formulaire.getByText('Écris le nom de l’école.')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('une école retirée du site ne se modifie plus', async ({ page, context }) => {
  await uneEcolePrete(page, context);
  await publierLaZoneTieTie(page);
  await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();
  await expect(ligne(page).getByRole('link', { name: 'Ouvrir la fiche' })).toBeVisible();

  await ouvrirGestion(ligne(page), 'retirer');
  await ligne(page).getByLabel('Motif').selectOption('erreur');
  await ligne(page)
    .getByRole('button', { name: /Retirer \[École 1\] du site/ })
    .click();
  await expect(ligne(page).getByText('Retirée', { exact: true })).toBeVisible();
  await ouvrirGestion(ligne(page), 'Contact public');
  await expect(
    page
      .getByRole('navigation', { name: 'Sections de la fiche' })
      .getByRole('button', { name: 'Informations', exact: true }),
  ).toHaveCount(0);
});
