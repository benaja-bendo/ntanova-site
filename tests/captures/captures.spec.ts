import { ouvrirContacts } from '../parcours/aides';
import { ouvrirGestion } from '../parcours/aides';
import { mkdirSync } from 'node:fs';
import { test } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from '../parcours/aides';

// Une capture de chaque écran, à la largeur du projet (voir playwright.captures.config.ts).
// Les images s'appellent <écran>-<largeur>.png et vont dans captures/ (ignoré par git).

test.use({ permissions: ['geolocation'] });

const dossier = new URL('../../captures/', import.meta.url).pathname;

test('une capture de chaque écran', async ({ page, context }) => {
  test.setTimeout(120_000);
  mkdirSync(dossier, { recursive: true });
  const largeur = page.viewportSize()?.width ?? 0;
  const prendre = (ecran: string) =>
    page.screenshot({
      path: `${dossier}${ecran}-${largeur}.png`,
      fullPage: ![
        'admin-modifier-la-fiche',
        'admin-retirer-du-site',
        'relais-confirmer-abandon',
      ].includes(ecran),
    });

  for (const [ecran, adresse] of [
    ['public-accueil', '/'],
    ['public-ecoles', '/ecoles/'],
    ['public-pays', '/ecoles/congo/'],
    ['public-ville', '/ecoles/congo/pointe-noire/'],
    ['public-liste', '/ecoles/congo/pointe-noire/tie-tie/'],
    ['public-carte-arrondissement', '/cartes/congo/pointe-noire/tie-tie/'],
    ['public-carte-coin', '/cartes/congo/pointe-noire/tie-tie/coin_1/'],
    ['public-carte-ngoyo', '/cartes/congo/pointe-noire/ngoyo/'],
    ['public-fiche', '/ecoles/congo/pointe-noire/tie-tie/complexe-scolaire-exemple/'],
    ['public-fiche-autre', '/ecoles/congo/pointe-noire/tie-tie/centre-de-formation-exemple/'],
    ['public-fiche-sans-detail', '/ecoles/congo/pointe-noire/tie-tie/ecole-sans-detail-exemple/'],
    [
      'public-fiche-multi-campus',
      '/ecoles/congo/pointe-noire/loandjili/quartier-exemple/groupe-scolaire-exemple/',
    ],
    ['public-formations', '/formations/'],
    ['public-formation-serie-c', '/formations/serie/c/'],
    ['public-recherche', '/recherche/?serie=c'],
    ['public-autour-de-moi', '/autour-de-moi/'],
    ['public-pour-les-ecoles', '/pour-les-ecoles/'],
    ['public-a-propos', '/a-propos/'],
    ['public-introuvable', '/cette-page-n-existe-pas/'],
  ] as const) {
    await page.goto(adresse);
    await prendre(ecran);
  }

  await uneFicheEnvoyee(page, context, { programme: 'Programme français-congolais, bilingue' });
  await prendre('relais-mon-lot');

  // L'étape 2/3 d'« Ajouter une école » : telle qu'on l'ouvre, puis remplie.
  await page.goto('/relais/#ajouter/2');
  await page.getByRole('heading', { name: 'Ce qui se voit de la rue' }).waitFor();
  await prendre('relais-ajouter-2');
  await page.getByLabel("Nom sur l'enseigne").fill('[École exemple]');
  await page.getByRole('button', { name: 'Maternelle', exact: true }).click();
  await page.getByRole('button', { name: 'Primaire', exact: true }).click();
  await page.getByRole('button', { name: 'Communautaire', exact: true }).click();
  await page
    .getByLabel(/Programme, langues ou autre mention écrite/)
    .fill('Programme français-congolais, bilingue');
  await prendre('relais-ajouter-2-rempli');
  await page.getByRole('button', { name: 'Abandonner cette fiche', exact: true }).click();
  await prendre('relais-confirmer-abandon');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler', exact: true }).click();

  await ouvrirLaFiche(page);
  await prendre('admin-a-valider');
  await page.getByRole('button', { name: 'Corriger avant d’accepter', exact: true }).click();
  const revision = page.getByRole('form', { name: 'Corriger avant d’accepter' });
  await revision.getByLabel('Repère', { exact: false }).fill('En face du marché');
  await prendre('admin-corriger-avant-acceptation');
  await revision.getByRole('button', { name: 'Utiliser ces valeurs' }).click();
  await prendre('admin-valeurs-retenues');
  await page.getByRole('button', { name: 'Reprendre les valeurs du relais' }).click();
  await ouvrirContacts(page);
  await prendre('admin-direction');

  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await page.getByRole('status').waitFor();
  await page.getByRole('button', { name: 'Décidées' }).click();
  await page.getByRole('link', { name: /\[École 1\]/ }).click();
  await ouvrirContacts(page);
  await page.getByRole('button', { name: /Effacer le contact/ }).click();
  await prendre('admin-effacer-le-contact');

  await page.getByRole('link', { name: 'Écoles' }).click();
  await page
    .getByRole('row', { name: /\[École 1\]/ })
    .getByText('Prête', { exact: true })
    .waitFor();
  await prendre('admin-ecoles-pretes');
  await page.getByLabel('Zone à publier').selectOption('d-pn-tie-tie');
  await page.getByRole('button', { name: 'Publier cette zone' }).click();
  await page.getByRole('status').waitFor();
  await page
    .getByRole('row', { name: /\[École 1\]/ })
    .getByText('Publiée', { exact: true })
    .waitFor();
  await prendre('admin-ecoles');
  await ouvrirGestion(page.getByRole('row', { name: /\[École 1\]/ }), 'Informations');
  await page.getByRole('form', { name: 'Modifier [École 1]' }).waitFor();
  await prendre('admin-modifier-la-fiche');
  await page
    .getByRole('form', { name: 'Modifier [École 1]' })
    .getByRole('button', { name: 'Annuler' })
    .click();
  await ouvrirGestion(page.getByRole('row', { name: /\[École 1\]/ }), 'retirer');
  await prendre('admin-retirer-du-site');
  await page.getByRole('alertdialog').getByRole('button', { name: 'Fermer', exact: true }).click();

  await page.getByRole('link', { name: 'Relais' }).click();
  await page.getByRole('heading', { name: 'Relais', level: 1 }).waitFor();
  await prendre('admin-relais');
});
