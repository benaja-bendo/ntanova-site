// L'administration v2 (lots 2 à 5 du cahier, 13/11/2026) : le cadre (barre du bas et « Plus » sur téléphone, barre de côté
// sur ordinateur), « Aujourd'hui », « Est-ce une école connue ? » dans « À valider », la fiche d'une école en plein écran.
import { expect, test, type Page } from '@playwright/test';
import {
  ouvrirLaFiche,
  retourAuxEcoles,
  seConnecter,
  uneFicheEnvoyee,
  toutesLesEcoles,
} from './aides';

test.use({ permissions: ['geolocation'] });

const large = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test('le cadre : cinq cases et « Plus » sur téléphone, la barre de côté et « Plus rarement » sur ordinateur', async ({
  page,
}) => {
  await seConnecter(page, '/admin/');
  await expect(page.getByRole('region', { name: 'Ce qui t’attend' })).toBeVisible();
  if (large(page)) {
    const cote = page.getByRole('navigation', { name: 'Plus rarement' });
    await expect(cote.getByRole('link', { name: 'Paie', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Navigation' })).toBeHidden();
    await cote.getByRole('link', { name: 'Santé des envois' }).click();
  } else {
    const bas = page.getByRole('navigation', { name: 'Navigation' });
    await expect(bas.getByRole('link')).toHaveText([
      'Aujourd’hui',
      'À valider',
      'Écoles',
      /Relais/,
    ]);
    await bas.getByRole('button', { name: 'Plus' }).click();
    const plus = page.getByRole('dialog', { name: 'Plus' });
    await expect(plus.getByRole('link')).toHaveText([/^Zones/, /^Paie/, /^Santé des envois/]);
    await plus.getByRole('button', { name: 'Règles de cet écran' }).click();
    await expect(page.getByRole('dialog', { name: 'Règles : Aujourd’hui' })).toContainText(
      'jamais un objectif',
    );
    await page.keyboard.press('Escape');
    await bas.getByRole('button', { name: 'Plus' }).click();
    await page
      .getByRole('dialog', { name: 'Plus' })
      .getByRole('link', { name: 'Santé des envois' })
      .click();
    // « Plus » est l'onglet courant quand l'écran est dedans ; la feuille s'est refermée.
    await expect(bas.getByRole('button', { name: 'Plus' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Le compte : l'initiale ouvre « Se déconnecter ».
    await page.getByRole('button', { name: 'Mon compte' }).click();
    await expect(page.getByRole('menuitem', { name: 'Se déconnecter' })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Santé des envois', level: 1 })).toBeAttached();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('« Est-ce une école connue ? » : même nom au même endroit, l’administration choisit « Compléter sa fiche »', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await uneFicheEnvoyee(page, context);
  // Une école publiée du même nom, à quelques mètres de la fiche reçue.
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      campus: Record<string, Record<string, unknown>>;
    };
    const modele = Object.values(e.campus)[0]!;
    const id = '00000000-0000-4000-8000-0000000000c3';
    e.campus[id] = {
      ...modele,
      id,
      institutionId: id,
      nom: '[École 1]',
      publication: 'publiee',
      position: { latitude: -4.80005, longitude: 11.90003 },
    };
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await ouvrirLaFiche(page);
  const connue = page.getByRole('region', { name: 'Est-ce une école connue ?' });
  await expect(connue).toContainText('Déjà dans la base ?');
  await expect(connue).toContainText('« [École 1] » existe déjà');
  await expect(connue.getByRole('button', { name: 'Non, une autre école' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await connue.getByRole('button', { name: 'Compléter sa fiche' }).click();
  await expect(connue.getByRole('button', { name: 'Compléter sa fiche' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('« Est-ce une école connue ? » : rien de proche, c’est une nouvelle école', async ({
  page,
  context,
}) => {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await expect(page.getByRole('region', { name: 'Est-ce une école connue ?' })).toContainText(
    'Aucune école de ce nom, et rien à moins de 500 m.',
  );
});

test('la fiche d’une école s’ouvre en plein écran, ses rubriques dedans, et revient à la liste', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#ecoles');
  await toutesLesEcoles(page);
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ligne.getByRole('link').first().click();
  await expect(page).toHaveURL(/#ecoles\/fiche\//);
  // Planche « Fiche d'école » : la carte « À compléter » (jauge), puis les rubriques en cartes ; une carte ouvre son tiroir.
  const fiche = page.getByRole('article', { name: 'Fiche de [École à situer]' });
  await expect(fiche.getByLabel('À compléter').filter({ visible: true }).first()).toBeVisible();
  await fiche.getByRole('button', { name: 'Sur place : ouvrir' }).click();
  const tiroir = page.getByRole('dialog', { name: 'Sur place · [École à situer]' });
  await expect(tiroir).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(tiroir).toHaveCount(0);
  await retourAuxEcoles(page);
  await expect(page.getByRole('row', { name: /\[École à situer\]/ })).toBeVisible();
});
