import { expect, test, type Page } from '@playwright/test';
import {
  ouvrirGestion,
  ouvrirLaFiche,
  seConnecter,
  uneFicheEnvoyee,
  envoyerSansBonus,
} from './aides';

// Le numéro écrit sur l'enseigne est publié tel quel, avec un bouton « Appeler », dès que l'école l'est. Le 06/11/2026,
// trois numéros non vérifiés ont paru (deux photos sans aucun numéro, une qui en montrait d'autres). Avant d'accepter,
// l'administration compare donc le numéro du relais à la photo, et dit s'il y est. Construit avec le faux serveur.

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

const NUMERO_DU_RELAIS = '06 123 45 67';
const NUMERO_AFFICHE = '+242 06 123 45 67';

/** Le numéro que l'école porte, tel qu'« Écoles › Gérer la fiche › Informations » le dit. */
async function numeroDeLEcole(page: Page, nom: RegExp): Promise<string> {
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: nom });
  await ouvrirGestion(ligne, 'Informations');
  const champ = page.getByLabel(/Numéro sur l.enseigne/);
  const valeur = await champ.inputValue();
  await page.getByRole('button', { name: 'Annuler' }).first().click();
  return valeur;
}

test.describe('numéro de l’enseigne : à vérifier sur la photo avant d’accepter', () => {
  test('un numéro saisi se lit à côté de la photo, et « Accepter » attend qu’on dise s’il y est', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context, { numeroEnseigne: NUMERO_DU_RELAIS });
    await ouvrirLaFiche(page);

    // À côté de l'enseigne, pour le comparer.
    await expect(
      page
        .getByRole('list', { name: "Photos de l'envoi" })
        .getByText(`Numéro saisi par le relais : ${NUMERO_AFFICHE}`),
    ).toBeVisible();

    // Sans réponse, le bouton est grisé, et l'écran dit pourquoi.
    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeDisabled();
    await expect(
      page.getByText(/Dis si le numéro de l’enseigne est sur la photo/).first(),
    ).toBeVisible();
    const bilan = page.getByRole('region', { name: 'Avant d’accepter' });
    await expect(bilan.getByText(/Numéro de l’enseigne/)).toBeVisible();
    await expect(bilan.getByText(/Il reste un choix à faire/)).toBeVisible();

    // « Vérifié sur la photo » : l'école est acceptée avec son numéro.
    const choix = page.getByRole('group', { name: /Numéro écrit sur l’enseigne/ });
    await choix.getByLabel('Je l’ai vérifié sur la photo de l’enseigne').check();
    await expect(accepter).toBeEnabled();
    await expect(bilan.getByText(/Vérifié sur la photo : il sera publié/)).toBeVisible();
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    expect(await numeroDeLEcole(page, /\[École 1\]/)).toBe(NUMERO_AFFICHE);
  });

  test('« il n’est pas sur la photo » : l’école est acceptée sans numéro, et le relais n’y perd rien', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context, { numeroEnseigne: NUMERO_DU_RELAIS });
    await ouvrirLaFiche(page);

    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeDisabled();
    await page
      .getByRole('group', { name: /Numéro écrit sur l’enseigne/ })
      .getByLabel('Il n’est pas sur la photo : ne pas le publier')
      .check();
    await expect(
      page.getByRole('region', { name: 'Avant d’accepter' }).getByText(/ne sera pas publié/),
    ).toBeVisible();
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    expect(await numeroDeLEcole(page, /\[École 1\]/)).toBe('');
    // Le relevé du relais, lui, est conservé tel qu'il l'a envoyé.
    await page.goto('/admin/#valider');
    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[École 1\]/ }).click();
    await expect(page.getByText(NUMERO_AFFICHE).first()).toBeVisible();
  });

  test('sans numéro saisi, rien à confirmer : « Accepter » est prêt tout de suite', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(page.getByRole('group', { name: /Numéro écrit sur l’enseigne/ })).toHaveCount(0);
    await expect(page.getByText('Aucun numéro saisi par le relais')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toBeEnabled();
  });

  test('un numéro corrigé par l’administration est un numéro qu’elle a lu : plus rien à confirmer', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context, { numeroEnseigne: NUMERO_DU_RELAIS });
    await ouvrirLaFiche(page);
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toBeDisabled();

    await page.getByRole('button', { name: 'Corriger avant d’accepter', exact: true }).click();
    const revision = page.getByRole('form', { name: 'Corriger avant d’accepter' });
    await revision.getByLabel(/Numéro sur l.enseigne/).fill('05 987 65 43');
    await revision.getByRole('button', { name: 'Utiliser ces valeurs' }).click();

    await expect(page.getByRole('group', { name: /Numéro écrit sur l’enseigne/ })).toHaveCount(0);
    const accepter = page.getByRole('button', { name: /Accepter la fiche/ });
    await expect(accepter).toBeEnabled();
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    expect(await numeroDeLEcole(page, /\[École 1\]/)).toBe('+242 05 987 65 43');
  });

  test('une école connue mise à jour : « pas sur la photo » lui garde le numéro qu’elle avait', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });

    // L'école à situer a déjà un numéro, saisi par l'administration.
    await seConnecter(page, '/admin/#valider');
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
    await ouvrirGestion(ligne, 'Informations');
    await page.getByLabel(/Numéro sur l.enseigne/).fill('06 000 00 09');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toContainText('modifiée');

    // Un relais la complète et y écrit un autre numéro.
    await ouvrirGestion(ligne, 'Mission');
    await ligne.getByLabel('À vérifier').fill('Le nom exact');
    await ligne.getByRole('button', { name: 'Confier', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText(/est confiée à/);
    await page.goto('/relais/');
    await expect(page.getByText('À compléter · 1')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Compléter' }).click();
    await page.locator('input[type=file]').first().setInputFiles(photo);
    await expect(page.getByText('Position prise')).toBeVisible();
    await page.getByLabel('Comment la trouver ?').fill('Face au marché');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByLabel("Nom de l'établissement").fill('[École à situer, nom exact]');
    await page.getByLabel(/Numéro écrit sur l.enseigne/).fill('05 111 22 33');
    await page.getByRole('button', { name: 'Suivant' }).click();
    await page.getByRole('button', { name: 'Personne', exact: true }).click();
    await envoyerSansBonus(page);
    await page.getByRole('link', { name: 'Mon secteur' }).click();
    await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });

    // L'administration compare : le numéro n'est pas sur la photo.
    await page.goto('/admin/#valider');
    await page.getByRole('link', { name: /\[École à situer, nom exact\]/ }).click();
    await expect(page.getByText(/Numéro saisi par le relais : \+242 05 111 22 33/)).toBeVisible();
    const accepter = page.getByRole('button', { name: 'Accepter et situer l’école' });
    await expect(accepter).toBeDisabled();
    await page
      .getByRole('group', { name: /Numéro écrit sur l’enseigne/ })
      .getByLabel('Il n’est pas sur la photo : ne pas le publier')
      .check();
    await accepter.click();
    await expect(page.getByRole('status')).toHaveText(/est mise à jour/);

    expect(await numeroDeLEcole(page, /\[École à situer, nom exact\]/)).toBe('+242 06 000 00 09');
  });
});
