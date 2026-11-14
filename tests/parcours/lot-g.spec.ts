// Lot G (13/11/2026) : la fiche admin (couverture, « X rubriques remplies sur Y »), le signal des relais et les relais
// repliés, « Comme sur l'enseigne / Différent » et « Sur la photo » dans « À valider », les raccourcis J/K/Échap,
// et « Même lieu » (une nouvelle école distincte, qui le dit).
import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, seConnecter, uneFicheEnvoyee, toutesLesEcoles } from './aides';

test.use({ permissions: ['geolocation'] });

const large = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test('la fiche d’une école : la couverture, la jauge « N/M » et « Compléter la fiche »', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#ecoles');
  await toutesLesEcoles(page);
  await page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('link')
    .first()
    .click();
  // Planche « Fiche d'école » : la couverture (vide, elle le dit), la jauge « N/M » et « Compléter la fiche ».
  const fiche = page.getByRole('article', { name: 'Fiche de [École à situer]' });
  await expect(fiche).toContainText('Photo de couverture');
  const completer = fiche.getByLabel('À compléter').filter({ visible: true }).first();
  await expect(completer).toContainText(/\d+\/\d+/);
  await expect(completer).toContainText(/choses? à compléter/);
  await completer.getByRole('button', { name: 'Compléter la fiche' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Compléter la fiche · [École à situer]' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await fiche.getByRole('button', { name: 'Changer la couverture' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Couverture, logo et images · [École à situer]' }),
  ).toBeVisible();
});

test('Relais : la colonne « Signal », et les relais sans envoi de la semaine repliés en bas', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#relais');
  // Sur ordinateur, le tableau ; sur téléphone, des cartes : le signal est dans chaque carte.
  if (large(page))
    await expect(page.getByRole('columnheader', { name: 'Signal' }).first()).toBeAttached();
  // Le compte à activer reste en tête ; le relais sans envoi cette semaine est replié.
  await expect(
    page.getByRole('region', { name: 'Compte à activer : [Relais en attente]' }),
  ).toBeVisible();
  const autres = page.getByText('1 autre relais, sans envoi cette semaine', { exact: true });
  await expect(autres).toBeVisible();
  await expect(page.getByRole('row', { name: /\[Prénom\]/ })).toBeHidden();
  await autres.click();
  const moi = page.getByRole('row', { name: /\[Prénom\]/ });
  await expect(moi).toBeVisible();
  await expect(moi).toContainText('Aucun');
});

test('À valider : « Comme sur l’enseigne / Différent » et « Sur la photo » à côté du numéro', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await uneFicheEnvoyee(page, context, { numeroEnseigne: '06 612 34 56' });
  await ouvrirLaFiche(page);
  const publique = page.getByRole('region', { name: 'Partie publique' });
  const nom = publique.getByRole('group', { name: 'Le nom, comparé à l’enseigne' });
  await nom.getByRole('button', { name: 'Comme sur l’enseigne' }).click();
  await expect(nom.getByRole('button', { name: 'Comme sur l’enseigne' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // « Différent » ouvre la correction avant d'accepter.
  await nom.getByRole('button', { name: 'Différent' }).click();
  await expect(page.getByRole('form', { name: 'Corriger avant d’accepter' })).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(publique.getByText('Sur la photo ?')).toBeVisible();
  await page
    .getByRole('group', { name: 'Le numéro, sur la photo ?' })
    .getByRole('button', { name: 'Sur la photo', exact: true })
    .click();
  await expect(publique.getByText('Sur la photo', { exact: true })).toBeVisible();
});

test('À valider sur ordinateur : J ouvre la fiche suivante, Échap revient à la liste', async ({
  page,
  context,
}) => {
  test.skip(!large(page), 'Les raccourcis sont pour l’ordinateur.');
  test.setTimeout(120_000);
  await uneFicheEnvoyee(page, context);
  await page.goto('/admin/#valider');
  await expect(page.getByRole('link', { name: /\[École 1\]/ })).toBeVisible();
  await page.keyboard.press('j');
  await expect(page).toHaveURL(/#valider\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#valider$/);
});

test('« Même lieu » : une nouvelle école distincte, qui dit son voisin dans la liste des écoles', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await uneFicheEnvoyee(page, context);
  // Une école publiée d'un autre nom, à une vingtaine de mètres de la fiche reçue.
  await page.evaluate(() => {
    const cle = 'ntanova-faux-serveur';
    const e = JSON.parse(localStorage.getItem(cle) ?? '{}') as {
      campus: Record<string, Record<string, unknown>>;
    };
    const modele = Object.values(e.campus)[0]!;
    const id = '00000000-0000-4000-8000-0000000000c4';
    e.campus[id] = {
      ...modele,
      id,
      institutionId: id,
      nom: '[Collège du portail]',
      etiquette: null,
      publication: 'publiee',
      position: { latitude: -4.80015, longitude: 11.9 },
    };
    localStorage.setItem(cle, JSON.stringify(e));
  });
  await ouvrirLaFiche(page);
  const connue = page.getByRole('region', { name: 'Est-ce une école connue ?' });
  await expect(connue).toContainText('Une école voisine');
  await connue.getByRole('button', { name: 'Même lieu' }).click();
  await expect(connue.getByRole('button', { name: 'Même lieu' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('status').first()).toBeVisible();

  await page.goto('/admin/#ecoles');

  await toutesLesEcoles(page);
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await expect(ligne).toContainText('Même lieu que [Collège du portail]');
  // Deux écoles distinctes : la voisine a toujours sa propre ligne.
  await expect(page.getByRole('row', { name: /^\[Collège du portail\]/ })).toBeVisible();
});
