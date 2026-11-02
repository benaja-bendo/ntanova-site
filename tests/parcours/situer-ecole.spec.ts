import { expect, test } from '@playwright/test';
import { seConnecter } from './aides';

// L'administration situe elle-même une école qu'elle connaît, ou en ajoute une (ticket 15) :
// la position collée depuis Google Maps. Construit avec le faux serveur, qui connaît
// « [École à situer] » (brouillon, sans position) et les zones ouvertes, Tié-Tié et Ngoyo.

test('situer une école connue : la position se lit avant d’être enregistrée, puis l’école est prête', async ({
  page,
}) => {
  await seConnecter(page, '/admin/');
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await expect(ligne.getByText('À situer', { exact: true })).toBeVisible();
  await ligne.getByRole('button', { name: 'Situer', exact: true }).click();

  const formulaire = page.getByRole('form', { name: 'Situer [École à situer]' });
  const position = formulaire.getByLabel('Position');

  // Inversée (la longitude d'abord) : aucun contour connu, et la base demande de choisir la division.
  await position.fill('11.925, -4.79105');
  await expect(formulaire.getByText(/Aucun contour connu ici/)).toBeVisible();
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(formulaire.getByRole('alert')).toHaveText(/aucune division connue/);

  // Illisible : le formulaire le dit sans rien envoyer.
  await position.fill('face au marché');
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(formulaire.getByText(/Position illisible/)).toBeVisible();

  // Ce que donne l'appui long sur Google Maps.
  await position.fill('-4.79105, 11.92500');
  await expect(
    formulaire.getByText('Lu : -4.79105, 11.92500. Dans le dessin de Tié-Tié.'),
  ).toBeVisible();
  await expect(formulaire.getByRole('link', { name: 'Vérifier sur Google Maps' })).toHaveAttribute(
    'href',
    'https://www.google.com/maps/search/?api=1&query=-4.791050,11.925000',
  );
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(page.getByRole('status')).toHaveText(
    '[École à situer] est située à Tié-Tié. Elle est prête : publie-la quand tu veux.',
  );

  const situee = page.getByRole('row', { name: /\[École à situer\]/ });
  await expect(situee.getByText('Prête', { exact: true })).toBeVisible();
  await expect(situee.getByRole('link', { name: '-4.79105, 11.92500' })).toBeVisible();
  await situee.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(
    page.getByRole('row', { name: /\[École à situer\]/ }).getByText('Publiée', { exact: true }),
  ).toBeVisible();
});

test('ajouter une école : avec sa position elle est prête, sans elle attend d’être située', async ({
  page,
}) => {
  await seConnecter(page, '/admin/');
  await page.getByRole('link', { name: 'Écoles' }).click();

  await page.getByRole('button', { name: 'Ajouter ou importer des écoles' }).click();
  let formulaire = page.getByRole('form', { name: 'Ajouter une école' });
  // Sans nom, rien ne part ; rien n'est coché d'avance.
  await formulaire.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(formulaire.getByText('Écris le nom de l’école.')).toBeVisible();
  await expect(formulaire.getByLabel("Type d'école")).toHaveValue('non_indique');

  // Un lien de partage Google Maps se lit aussi.
  await formulaire.getByLabel('Position').fill('https://www.google.com/maps/@-4.86,11.92,17z');
  await expect(
    formulaire.getByText('Lu : -4.86000, 11.92000. Dans le dessin de Ngoyo.'),
  ).toBeVisible();
  await formulaire.getByLabel('Nom de l’école').fill('[École ajoutée]');
  await formulaire.getByRole('button', { name: 'Primaire', exact: true }).click();
  await formulaire.getByLabel(/Quartier/).fill('[Quartier]');
  await formulaire.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(page.getByRole('status')).toHaveText(
    '[École ajoutée] est ajoutée, prête : publie-la quand tu veux.',
  );
  const ajoutee = page.getByRole('row', { name: /\[École ajoutée\]/ });
  await expect(ajoutee.getByText('Prête', { exact: true })).toBeVisible();
  await expect(ajoutee.getByText('[Quartier] · Ngoyo')).toBeVisible();

  // Sans position : à situer, comme une école importée.
  await page.getByRole('button', { name: 'Ajouter ou importer des écoles' }).click();
  formulaire = page.getByRole('form', { name: 'Ajouter une école' });
  await formulaire.getByLabel('Nom de l’école').fill('[École sans position]');
  await formulaire.getByRole('button', { name: 'Ajouter l’école' }).click();
  await expect(page.getByRole('status')).toHaveText(/est ajoutée, à situer/);
  await expect(
    page
      .getByRole('row', { name: /\[École sans position\]/ })
      .getByText('À situer', { exact: true }),
  ).toBeVisible();
});
