// L'écran des images d'une école (fondateur, 17/11/2026) : cinq défauts vus en ajoutant les 9 photos de La Colombe de Mavie.
// 1. « Changer la couverture » ouvrait le formulaire sur « Galerie » (« Ajouter le logo » aussi).
// 2. Après un envoi, le formulaire ne se vidait qu'à moitié : le fichier restait joint, la liste restait sur une option grisée.
// 3. Le message de réussite se disait deux fois, et suivait sur la fiche d'un autre site.
// 4. La rubrique « Photos » de la fiche ne montrait pas les images ajoutées par l'administration.
// 5. Une seule image par envoi.
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { ficheOuverte, ouvrirFiche, ouvrirLesEcoles, seConnecter } from './aides';

const octets = readFileSync(new URL('./fichiers/enseigne.jpg', import.meta.url));
const fichier = (name: string) => ({ name, mimeType: 'image/jpeg', buffer: octets });

async function laFiche(page: Page, nom = '[École à situer]') {
  await ouvrirFiche(page.getByRole('row', { name: new RegExp(nom.replace(/[[\]]/g, '\\$&')) }));
  return ficheOuverte(page);
}

test.beforeEach(async ({ page }) => {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
});

test('1 et 2. « Changer la couverture » ouvre sur Couverture ; après l’envoi le formulaire est vide et sur une place libre', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await laFiche(page);
  await page
    .getByRole('button', { name: 'Changer la couverture' })
    .filter({ visible: true })
    .click();
  const form = page.getByRole('form', { name: 'Ajouter une image' });
  await expect(form.getByLabel('C’est')).toHaveValue('cover');

  await form.getByLabel('Elle montre').selectOption('batiment');
  await form.getByLabel('Le fichier').setInputFiles(fichier('batiment.jpg'));
  await form.getByLabel('Légende').fill('[Le bâtiment]');
  await form.getByLabel(/Sans enfant/).check();
  await form.getByRole('button', { name: 'Ajouter l’image' }).click();
  const images = page.getByRole('region', { name: 'Images de l’école' });
  await expect(images.getByRole('listitem').filter({ hasText: '[Le bâtiment]' })).toContainText(
    'Publique',
  );
  // Tout est vide, et la liste n'est plus sur la couverture, désormais prise.
  await expect(form.getByLabel('C’est')).toHaveValue('gallery');
  await expect(form.getByLabel('Le fichier')).toHaveValue('');
  await expect(form.getByLabel('Légende')).toHaveValue('');
  await expect(form.getByLabel(/Sans enfant/)).not.toBeChecked();
  await expect(form.getByRole('button', { name: 'Ajouter l’image' })).toBeEnabled();

  // « Ajouter le logo » ouvre sur Logo.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajouter le logo' }).filter({ visible: true }).click();
  await expect(
    page.getByRole('form', { name: 'Ajouter une image' }).getByLabel('C’est'),
  ).toHaveValue('logo');
});

test('3. le message de réussite se dit une fois, et ne suit pas sur une autre fiche', async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Une seconde école, pour passer d'une fiche à l'autre.
  await page
    .getByRole('button', { name: 'Ajouter une école', exact: true })
    .filter({ visible: true })
    .click();
  const creation = page.getByRole('form', { name: 'Ajouter une école' });
  await creation.getByLabel('Nom de l’école').fill('[Autre école]');
  await creation.getByLabel(/^Position/).fill('-4.70000, 11.80000');
  await creation.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(page.getByRole('status').first()).toContainText('[Autre école] est ajoutée');

  await laFiche(page);
  await page
    .getByRole('button', { name: 'Changer la couverture' })
    .filter({ visible: true })
    .click();
  const form = page.getByRole('form', { name: 'Ajouter une image' });
  await form.getByLabel('Le fichier').setInputFiles(fichier('cour.jpg'));
  await form.getByRole('button', { name: 'Ajouter l’image' }).click();
  const message = page.getByRole('status').filter({ hasText: 'Image ajoutée' });
  await expect(message.filter({ visible: true })).toHaveCount(1);
  await expect(message).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(message).toHaveCount(1);

  // La fiche d'un autre site : plus de message.
  await page.evaluate(() => (location.hash = '#ecoles'));
  await ouvrirFiche(page.getByRole('row', { name: /\[Autre école\]/ }));
  await expect(page.locator('article[aria-label^="Fiche de "]')).not.toHaveAttribute(
    'aria-label',
    'Fiche de [École à situer]',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Image ajoutée' })).toHaveCount(0);
});

test('4 et 5. plusieurs images d’un coup, chacune sa légende ; la rubrique « Photos » de la fiche les montre', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await laFiche(page);
  await page
    .getByRole('button', { name: 'Changer la couverture' })
    .filter({ visible: true })
    .click();
  const form = page.getByRole('form', { name: 'Ajouter une image' });
  await form.getByLabel('C’est').selectOption('gallery');
  await form.getByLabel('Elle montre').selectOption('enseigne');
  await form.getByLabel('Le fichier').setInputFiles([fichier('a.jpg'), fichier('b.jpg')]);
  await form.getByLabel('Légende de a.jpg').fill('[Image A]');
  await form.getByLabel('Légende de b.jpg').fill('[Image B]');
  await form.getByLabel(/Sans enfant/).check();
  await form.getByRole('button', { name: 'Ajouter les 2 images' }).click();
  const images = page.getByRole('region', { name: 'Images de l’école' });
  await expect(images).toContainText('2 sur 12');
  await expect(images.getByRole('listitem').filter({ hasText: '[Image A]' })).toContainText(
    'Publique',
  );
  await expect(images.getByRole('listitem').filter({ hasText: '[Image B]' })).toContainText(
    'Publique',
  );
  await expect(
    page.getByRole('status').filter({ hasText: '2 images ajoutées et publiées' }),
  ).toHaveCount(1);

  await page.keyboard.press('Escape');
  const photos = page.getByRole('region', { name: 'Photos' });
  await expect(photos.getByRole('button', { name: 'Image de la fiche : [Image A]' })).toBeVisible();
  await expect(photos.getByRole('button', { name: 'Image de la fiche : [Image B]' })).toBeVisible();
});
