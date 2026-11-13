// Lot G (13/11/2026) : la fiche admin (couverture, « X rubriques remplies sur Y »), le signal des relais et les relais
// repliés, « Comme sur l'enseigne / Différent » et « Sur la photo » dans « À valider », les raccourcis J/K/Échap,
// et « Même lieu » (une nouvelle école distincte, qui le dit).
import { expect, test, type Page } from '@playwright/test';
import { ficheAdmin, ouvrirLaFiche, seConnecter, uneFicheEnvoyee } from './aides';

test.use({ permissions: ['geolocation'] });

const large = (page: Page) => (page.viewportSize()?.width ?? 0) >= 1024;

test('la fiche d’une école : l’aperçu de la couverture et « X rubriques remplies sur Y »', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#ecoles');
  await page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('link', { name: 'Ouvrir la fiche', exact: true })
    .click();
  const fiche = ficheAdmin(page, '[École à situer]');
  const apercu = fiche.getByRole('region', { name: 'Aperçu' });
  await expect(apercu).toContainText('Pas encore de photo de couverture');
  const compteur = apercu.getByRole('button', { name: /rubriques? remplies? sur \d+/ });
  await expect(compteur).toBeVisible();
  // Le compteur ouvre « À compléter » ; « Ajouter une couverture » ouvre « Images ».
  await fiche
    .getByRole('navigation', { name: 'Sections de la fiche' })
    .getByRole('button', { name: 'Informations' })
    .click();
  await compteur.click();
  await expect(
    fiche
      .getByRole('navigation', { name: 'Sections de la fiche' })
      .getByRole('button', { name: 'À compléter' }),
  ).toHaveAttribute('aria-pressed', 'true');
  await apercu.getByRole('button', { name: 'Ajouter une couverture' }).click();
  await expect(
    fiche
      .getByRole('navigation', { name: 'Sections de la fiche' })
      .getByRole('button', { name: 'Images' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('Relais : la colonne « Signal », et les relais sans envoi de la semaine repliés en bas', async ({
  page,
}) => {
  await seConnecter(page, '/admin/#relais');
  await expect(page.getByRole('columnheader', { name: 'Signal' }).first()).toBeAttached();
  // Le compte à activer reste en tête ; le relais sans envoi cette semaine est replié.
  await expect(page.getByRole('row', { name: /\[Relais en attente\]/ })).toBeVisible();
  const autres = page.locator('details.relais-autres');
  await expect(autres.locator('summary')).toHaveText('1 autre relais, sans envoi cette semaine');
  await expect(page.getByRole('row', { name: /\[Prénom\]/ })).toBeHidden();
  await autres.locator('summary').click();
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
  await page.getByRole('button', { name: 'Accepter la fiche' }).click();
  await expect(page.getByRole('status').first()).toBeVisible();

  await page.goto('/admin/#ecoles');
  const ligne = page.getByRole('row', { name: /\[École 1\]/ });
  await expect(ligne).toContainText('Même lieu que [Collège du portail]');
  // Deux écoles distinctes : la voisine a toujours sa propre ligne.
  await expect(page.getByRole('row', { name: /^\[Collège du portail\]/ })).toBeVisible();
});
