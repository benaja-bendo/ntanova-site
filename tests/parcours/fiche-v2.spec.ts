// La fiche d'une école, v2 (ticket 165, lot A, 13/11/2026) : canevas « Fiche d'école » et ses états vides.
import { expect, test } from '@playwright/test';

const COMPLETE = '/ecoles/groupe-scolaire-exemple-158427/';
const NUE = '/ecoles/ecole-ajoutee-exemple-639158/';
const SUPERIEUR = '/ecoles/institut-superieur-exemple-527064/';

test('une fiche nue reste digne : la bannière, son rond, et une seule carte « Vous êtes de l’école ? »', async ({
  page,
}) => {
  await page.goto(NUE);
  await expect(page.locator('.couverture')).toBeVisible();
  await expect(page.locator('.disque-fiche')).toHaveText('P');
  // Aucune rubrique vide : ni barre, ni bloc.
  await expect(page.getByRole('navigation', { name: 'Aller à une rubrique' })).toHaveCount(0);
  for (const nom of [
    'Photos',
    'Nouvelles',
    'Frais déclarés par l’école',
    'Équipements et infrastructures',
  ])
    await expect(page.getByRole('region', { name: nom, exact: true })).toHaveCount(0);
  const carte = page.locator('.ecoles-appel-court');
  await expect(carte.getByRole('heading')).toHaveText('Vous êtes de l’école ?');
  const lien = carte.getByRole('link', { name: 'Compléter cette fiche' });
  expect(decodeURIComponent((await lien.getAttribute('href'))!)).toContain(
    '[École ajoutée Exemple]',
  );
  await expect(page.getByRole('link', { name: 'Confirmer cette fiche' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
});

test('une fiche complète : logo, couverture, ligne d’identité, rubriques en ancres, frais par classe, nouvelles', async ({
  page,
}) => {
  await page.goto(COMPLETE);
  await expect(page.locator('.couverture-photo')).toHaveAttribute(
    'src',
    /^\/medias\/.+-couverture\.webp$/,
  );
  await expect(page.locator('.rond-logo img')).toHaveAttribute(
    'alt',
    'Logo de [Groupe scolaire Exemple]',
  );
  await expect(page.locator('.fiche-ligne')).toHaveText(
    'Campus du quartier · Maternelle à lycée · GSE · depuis 2009',
  );
  await expect(page.locator('.puces')).toContainText('Le matin');
  const rubriques = page
    .getByRole('navigation', { name: 'Aller à une rubrique' })
    .getByRole('link');
  await expect(rubriques).toHaveText(['Formations', 'L’école', 'Photos', 'Frais', 'Nouvelles']);
  for (const a of await rubriques.all()) {
    const cible = (await a.getAttribute('href'))!.slice(1);
    await expect(page.locator(`#${cible}`)).toHaveCount(1);
  }
  const frais = page.getByRole('region', { name: 'Frais déclarés par l’école' });
  await expect(frais.getByRole('listitem').first()).toContainText('Maternelle');
  await expect(frais).toContainText('CP1 à CM2');
  await expect(frais).toContainText('selon le cycle');
  // Trois nouvelles dans la base, dont une fête vieille de 90 jours : deux paraissent, la plus récente d'abord.
  const nouvelles = page.getByRole('region', { name: 'Nouvelles' }).getByRole('article');
  await expect(nouvelles).toHaveCount(2);
  await expect(nouvelles.first()).toContainText('Nouvelle de l’école');
  await expect(nouvelles.nth(1)).not.toContainText('Nouvelle de l’école');
  await expect(page.locator('main')).not.toContainText('Une fête passée');
  await expect(page.locator('.proprietes')).toContainText('exemple.cg');
});

test('cinq photos : trois vignettes sur la fiche, toutes sur la page des photos', async ({
  page,
}) => {
  await page.goto(COMPLETE);
  const galerie = page.getByRole('region', { name: 'Photos' });
  await expect(galerie.locator('img')).toHaveCount(3);
  await galerie.getByRole('link', { name: 'Voir les 5', exact: true }).click();
  await expect(page).toHaveURL(/\/ecoles\/groupe-scolaire-exemple-158427\/photos\/$/);
  await expect(page.locator('figure img')).toHaveCount(5);
  await expect(page.getByRole('link', { name: /Groupe scolaire Exemple/ })).toHaveAttribute(
    'href',
    COMPLETE,
  );
});

test('le supérieur : formations détaillées, admission en cours, « Dossiers ouverts », sans JavaScript', async ({
  browser,
  baseURL,
}) => {
  const contexte = await browser.newContext({
    javaScriptEnabled: false,
    baseURL: baseURL ?? '',
    viewport: { width: 360, height: 800 },
  });
  const page = await contexte.newPage();
  await page.goto(SUPERIEUR);
  await expect(page.locator('.rond-sigle')).toHaveText('ISE');
  const formations = page.getByRole('region', { name: 'Formations' });
  await expect(formations).toContainText('2 ans · 450 000 FCFA / an');
  await expect(formations).toContainText('Autorisation : pas encore vue par NTanova');
  const admission = page.getByRole('region', { name: 'Admission' });
  await expect(admission.getByRole('heading', { level: 2 })).toHaveText('Admission · 2026-2027');
  await expect(admission.locator('[aria-current="step"]')).toContainText('Dossiers');
  await expect(admission).toContainText('Dossiers reçus sur place uniquement');
  const ouverts = page.getByRole('region', { name: 'Dossiers ouverts' });
  await expect(ouverts).toContainText('Plus que 12 jours.');
  // Le seul « Y aller » est celui de la barre d'actions.
  await expect(page.getByRole('link', { name: 'Y aller' })).toHaveCount(1);
  await contexte.close();
});
