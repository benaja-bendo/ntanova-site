// La fiche d'une école, v2 (ticket 165, lot A, 13/11/2026) : canevas « Fiche d'école » et ses états vides.
import { expect, test } from '@playwright/test';

const COMPLETE = '/ecoles/groupe-scolaire-exemple-158427/';
const NUE = '/ecoles/ecole-ajoutee-exemple-639158/';
const SUPERIEUR = '/ecoles/institut-superieur-exemple-527064/';

// Planche « Fiche mince » (lot 4, fondateur 16/11) : sans photo, aucun bandeau (règle du 09/11) ; la fiche commence par son rond
// et son nom ; l'appel aux directions est « Vous dirigez cette école ? ». Avant : bannière dessinée et « Vous êtes de l'école ? ».
test('une fiche nue reste digne : son rond, son nom, et une seule carte « Vous dirigez cette école ? »', async ({
  page,
}) => {
  await page.goto(NUE);
  await expect(page.locator('.fiche-couverture')).toHaveCount(0);
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
  const carte = page.locator('.ecoles-appel');
  await expect(carte).toHaveCount(1);
  await expect(carte.getByRole('heading')).toHaveText('Vous dirigez cette école ?');
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
  // La ligne d'identité, puis le lieu (planche « Fiche mince »).
  await expect(page.locator('.ligne-identite')).toHaveText(
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
    // Lot A (26/11/2026) : la rubrique atteinte s'arrête sous la barre collante, jamais dessous (Formations, Photos, Frais
    // et Nouvelles y passaient). Le toucher part de la page, pour mesurer à la fin du défilement, glissé ou non.
    const ecart = await a.evaluate(async (lien) => {
      const fin = new Promise((fini) => addEventListener('scrollend', fini, { once: true }));
      (lien as HTMLAnchorElement).click();
      await fin;
      const haut = document.getElementById(lien.getAttribute('href')!.slice(1))!;
      return haut.getBoundingClientRect().top - lien.closest('nav')!.getBoundingClientRect().bottom;
    });
    expect(ecart, cible).toBeGreaterThanOrEqual(0);
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
  // Trois vignettes sur téléphone, cinq sur ordinateur (planche « Fiche d'école », version 44) : on compte celles qu'on voit.
  const galerie = page.getByRole('region', { name: 'Photos' });
  await expect(galerie.locator('img').filter({ visible: true })).toHaveCount(3);
  await galerie.getByRole('link', { name: 'Voir les 5', exact: true }).click();
  await expect(page).toHaveURL(/\/ecoles\/groupe-scolaire-exemple-158427\/photos\/$/);
  await expect(page.getByRole('button', { name: /^Agrandir la photo/ })).toHaveCount(5);
  await expect(page.getByRole('link', { name: /Groupe scolaire Exemple/ })).toHaveAttribute(
    'href',
    COMPLETE,
  );
});

// La visionneuse (fondateur, 19/11/2026) : toucher une vignette ouvre la photo en grand ; les grandes images n'existent pas
// dans la page avant l'ouverture (budget), puis seulement la photo montrée et ses voisines.
test('toucher une photo l’ouvre en grand ; on passe à la suivante ; on referme', async ({
  page,
}) => {
  await page.goto(COMPLETE);
  const visionneuse = page.getByRole('dialog', { name: /^Photos de/ });
  await expect(visionneuse.locator('img[src]')).toHaveCount(0);
  await page
    .getByRole('button', { name: /^Agrandir la photo/ })
    .nth(1)
    .click();
  await expect(visionneuse).toBeVisible();
  await expect(visionneuse).toContainText('2 / 5');
  await expect(visionneuse.locator('img[src*="-grande.webp"]')).toHaveCount(3);
  await page.keyboard.press('ArrowRight');
  await expect(visionneuse).toContainText('3 / 5');
  await page.keyboard.press('Escape');
  await expect(visionneuse).toBeHidden();
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
  // Planche « supérieur » (version 44) : la durée dans la ligne du diplôme, les frais sur leur ligne.
  await expect(formations).toContainText('BTS · 2 ans');
  await expect(formations).toContainText('450 000 FCFA / an');
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
