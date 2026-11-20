import { expect, test } from '@playwright/test';
import { ficheOuverte, ouvrirFiche, ouvrirLesEcoles, seConnecter } from './aides';

// 17/11 : une école ajoutée par l'administration avec la position d'un autre de ses sites (trois sites au même point) ne
// pouvait plus être corrigée : « Situer » n'était offert qu'à une école sans position. La fiche offre « Corriger la
// position » ; une école publiée garde son adresse publique (la base refuse une position dans une autre division).
// Construit avec le faux serveur : « [École à situer] » (sans position), les contours de Tié-Tié et de Ngoyo.

test('corriger la position d’une école déjà située et publiée, depuis sa fiche', async ({
  page,
}) => {
  await seConnecter(page, '/admin/');
  await ouvrirLesEcoles(page);

  // On la situe à Tié-Tié, puis on la publie.
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ligne.getByRole('button', { name: 'Situer', exact: true }).click();
  let formulaire = page.getByRole('form', { name: 'Situer [École à situer]' });
  await formulaire.getByLabel('Position', { exact: true }).fill('-4.79105, 11.92500');
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(page.getByRole('status')).toHaveText(/est située à Tié-Tié/);
  await page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('button', { name: 'Publier', exact: true })
    .click();
  await expect(
    page
      .getByRole('row', { name: /\[École à situer\]/ })
      .getByText('Publiée', { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();

  // La fiche dit la position et offre de la corriger.
  await ouvrirFiche(page.getByRole('row', { name: /\[École à situer\]/ }));
  const fiche = ficheOuverte(page);
  await expect(fiche.getByText('Position : -4.79105, 11.92500')).toBeVisible();
  await fiche.getByRole('button', { name: 'Corriger la position' }).click();

  formulaire = page.getByRole('form', { name: 'Situer [École à situer]' });
  const position = formulaire.getByLabel('Position', { exact: true });
  await expect(position).toHaveValue('-4.79105, 11.92500');
  // Publiée : près du bouton, ce que la correction change et ce qu'elle ne change pas.
  await expect(
    formulaire.getByText(
      'Elle est publiée : son adresse publique ne change pas, la position doit rester à Tié-Tié. La nouvelle position paraît sur ntanova.com après la prochaine mise à jour du site.',
    ),
  ).toBeVisible();

  // Ailleurs que dans sa division : la base refuse, rien ne change.
  await position.fill('-4.86, 11.92');
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(formulaire.getByRole('alert')).toHaveText(/autre arrondissement que Tié-Tié/);

  // Quelques centaines de mètres plus loin, toujours à Tié-Tié : enregistrée.
  await position.fill('-4.79300, 11.92200');
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(page.getByRole('status').filter({ visible: true }).first()).toHaveText(
    '[École à situer] est située à Tié-Tié. La nouvelle position paraît sur ntanova.com après la prochaine mise à jour du site.',
  );
  await expect(fiche.getByText('Position : -4.79300, 11.92200')).toBeVisible();
});

// 17/11, cas réel : une école publiée près d'une limite d'arrondissement. Sa vraie position tombe, d'après nos contours
// (approximatifs), dans l'arrondissement voisin : la base refusait, et « Retire la fiche du site d'abord » n'aidait pas.
// Le tiroir dit pourquoi et offre de garder la division de la fiche (son adresse publique ne change pas).
test('une école publiée dont la position tombe dans le contour voisin garde sa division', async ({
  page,
}) => {
  await seConnecter(page, '/admin/');
  await ouvrirLesEcoles(page);
  await page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('button', { name: 'Situer', exact: true })
    .click();
  let formulaire = page.getByRole('form', { name: 'Situer [École à situer]' });
  await formulaire.getByLabel('Position', { exact: true }).fill('-4.79105, 11.92500');
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(page.getByRole('status')).toHaveText(/est située à Tié-Tié/);
  await page
    .getByRole('row', { name: /\[École à situer\]/ })
    .getByRole('button', { name: 'Publier', exact: true })
    .click();
  await expect(
    page
      .getByRole('row', { name: /\[École à situer\]/ })
      .getByText('Publiée', { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();

  await ouvrirFiche(page.getByRole('row', { name: /\[École à situer\]/ }));
  const fiche = ficheOuverte(page);
  await fiche.getByRole('button', { name: 'Corriger la position' }).click();
  formulaire = page.getByRole('form', { name: 'Situer [École à situer]' });
  // Avant d'envoyer, rien n'est offert : la plupart des corrections restent dans la division.
  await expect(formulaire.getByRole('button', { name: 'Garder Tié-Tié' })).toHaveCount(0);

  await formulaire.getByLabel('Position', { exact: true }).fill('-4.86, 11.92');
  await formulaire.getByRole('button', { name: 'Enregistrer la position' }).click();
  await expect(formulaire.getByRole('alert')).toHaveText(
    'D’après nos contours, ce point est dans un autre arrondissement que Tié-Tié. Les contours sont approximatifs : si l’école est bien à Tié-Tié, garde Tié-Tié. Sinon, retire d’abord la fiche du site.',
  );
  await formulaire.getByRole('button', { name: 'Garder Tié-Tié' }).click();
  await expect(page.getByRole('status').filter({ visible: true }).first()).toHaveText(
    '[École à situer] est située à Tié-Tié. La nouvelle position paraît sur ntanova.com après la prochaine mise à jour du site.',
  );
  await expect(fiche.getByText('Position : -4.86000, 11.92000')).toBeVisible();
});
