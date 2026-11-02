import { expect, test } from '@playwright/test';
import {
  ouvrirLaFiche,
  publierLaZoneTieTie,
  seConnecter,
  textesPeuLisibles,
  uneFicheEnvoyee,
} from './aides';

// L'administration, construite avec le faux serveur : l'utilisateur du faux
// serveur est à la fois relais (lot Tié-Tié) et administrateur.

test.use({ permissions: ['geolocation'] });

test.describe('administration', () => {
  test('une fiche acceptée devient prête, se publie, et le relais la voit « Acceptée »', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    // Le contact de la direction n'est lisible que par l'administration.
    await expect(page.getByText('+242 06 123 45 61')).toBeVisible();
    // Le pont : un message déjà écrit, honnête (ni prix, ni gratuité, ni audience), pour la personne qui a donné son accord.
    const ecrire = page.getByRole('link', { name: /Écrire à la direction sur WhatsApp/ });
    await expect(ecrire).toHaveAttribute('href', /^https:\/\/wa\.me\/242061234561\?text=/);
    const message =
      decodeURIComponent((await ecrire.getAttribute('href')) ?? '').split('?text=')[1] ?? '';
    expect(message).toContain('[École 1]');
    expect(message).not.toMatch(/gratuit|FCFA|prix|tarif|visiteurs|audience/i);
    await page.getByRole('button', { name: 'Confirmer sa fonction' }).click();
    await expect(page.getByText('Fonction confirmée', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await expect(page.getByText('Rien à valider pour le moment.')).toBeVisible();

    // Accepter ne publie pas : l'école attend le geste « Publier ».
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByText('Prête', { exact: true })).toBeVisible();
    await ligne.getByRole('button', { name: 'Publier', exact: true }).click();
    // Elle paraît à la prochaine mise à jour du site : la nuit ne met à jour qu'essai, aucune heure n'est promise.
    await expect(page.getByRole('status')).toHaveText(/est publiée.*prochaine mise à jour du site/);
    await expect(page.getByRole('status')).not.toHaveText(/cette nuit|2 h/);
    await expect(
      page.getByRole('row', { name: /\[École 1\]/ }).getByText('Publiée', { exact: true }),
    ).toBeVisible();

    await page.goto('/relais/#fiches');
    await expect(page.getByText('Acceptée')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Confirmé · promoteur')).toBeVisible();
  });

  test('une demande de correction arrive au relais avec son message', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: 'Demander une correction' }).click();
    await page.getByLabel('Motif').selectOption('photo_floue');
    await page.getByLabel(/Message au relais/).fill('La photo est floue, reprenez-la de face.');
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toHaveText(/correction part au relais/);

    await page.goto('/relais/#fiches');
    await expect(page.getByText('La photo est floue, reprenez-la de face.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('button', { name: 'Corriger la fiche' })).toBeVisible();

    // L'écran dit ce que le relais fait : il corrige une fiche, il n'ajoute pas une école.
    await page.getByRole('button', { name: 'Corriger la fiche' }).click();
    await expect(page.locator('.entete-etape-titre')).toHaveText('Corriger une fiche');
  });

  test('une école publiée se retire avec un motif, puis se republie', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('link', { name: 'Écoles' }).click();
    await publierLaZoneTieTie(page);
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);

    const ligne = () => page.getByRole('row', { name: /\[École 1\]/ });
    // La liste se rafraîchit après « Publier » et remet la ligne à zéro : on attend qu'elle soit à
    // jour, sinon le formulaire ouvert par le clic suivant se referme sous les doigts.
    await expect(ligne().getByText('Publiée', { exact: true })).toBeVisible();
    await ligne().getByRole('button', { name: 'Retirer du site' }).click();
    await ligne().getByLabel('Motif').selectOption('demande_ecole');
    await ligne()
      .getByRole('button', { name: /Retirer \[École 1\] du site/ })
      .click();
    await expect(page.getByRole('status')).toHaveText(/retirée du site.*sans son nom/);
    await expect(ligne().getByText('Retirée', { exact: true })).toBeVisible();
    await expect(ligne().getByText(/À la demande de l'école/)).toBeVisible();

    await ligne().getByRole('button', { name: 'Republier' }).click();
    await expect(ligne().getByText('Publiée', { exact: true })).toBeVisible();
  });

  test('« Décidées » relit une décision sans la changer, et efface un contact', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[École 1\]/ }).click();
    await expect(page.getByText('Acceptée', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toHaveCount(0);
    await expect(page.getByText(/un refus est définitif/)).toBeVisible();

    await page.getByRole('button', { name: /Effacer le contact/ }).click();
    await page.getByRole('button', { name: /Confirmer : effacer le contact/ }).click();
    await expect(page.getByText('Le contact de la direction est effacé.')).toBeVisible();
    await expect(page.getByText('+242 06 123 45 61')).toHaveCount(0);
  });

  test('une décision qui arrive tard ne ramène pas sur « À valider »', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    // Une 3G qui traîne : la base répond après que l'on a changé d'onglet.
    await page.evaluate(() => localStorage.setItem('ntanova-faux-latence', '600'));
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await page.getByRole('link', { name: 'Écoles' }).click();
    await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeVisible();
    // Le temps que la réponse arrive : on reste sur « Écoles ».
    await page.waitForTimeout(1200);
    await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'À valider' })).toHaveCount(0);
  });

  test('aucun texte de l’administration ne se lit mal (contraste d’au moins 4,5:1)', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    // La partie privée est un panneau sombre : ses liens et ses boutons doivent s'y lire. Le pont avec la direction
    // (le message, la fonction, l'accord) est dans une carte claire à côté.
    expect(await textesPeuLisibles(page, 'body'), 'À valider, une fiche').toEqual([]);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[École 1\]/ }).click();
    await page.getByRole('button', { name: /Effacer le contact/ }).click();
    await expect(
      page.getByRole('button', { name: /Confirmer : effacer le contact/ }),
    ).toBeVisible();
    expect(await textesPeuLisibles(page, 'body'), 'Décidées, effacer le contact').toEqual([]);

    await page.getByRole('link', { name: 'Écoles' }).click();
    await publierLaZoneTieTie(page);
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);
    const ligne = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ligne.getByText('Publiée', { exact: true })).toBeVisible();
    await ligne.getByRole('button', { name: 'Retirer du site' }).click();
    await expect(ligne.getByLabel('Motif')).toBeVisible();
    expect(await textesPeuLisibles(page, 'body'), 'Écoles, retirer du site').toEqual([]);
  });

  // Le secteur d'un relais est un conseil, la zone ouverte la limite de NTanova, et ni l'un ni l'autre ne refuse une
  // fiche (ticket n° 67). Le faux serveur compte la zone ouverte comme le carré de Tié-Tié : 11,98° est à Pointe-Noire,
  // hors de ce carré ; Brazzaville (15,24°) est hors de tout contour connu.
  for (const [lieu, position, etiquette] of [
    ['hors de la zone ouverte', { latitude: -4.79, longitude: 11.98 }, 'Hors zone ouverte'],
    ['hors de tout contour connu', { latitude: -4.26, longitude: 15.24 }, 'Zone inconnue'],
  ] as const) {
    test(`une fiche relevée ${lieu} s’affiche en information, jamais en alerte, et s’accepte comme les autres`, async ({
      page,
      context,
    }) => {
      await uneFicheEnvoyee(page, context, { position });
      await page.goto('/admin/');
      const ligne = page.getByRole('link', { name: /\[École 1\]/ });
      await expect(ligne).toBeVisible();
      // Plus aucune trace de « hors du lot » : le lot n'est qu'un conseil.
      await expect(page.getByText(/Hors du lot/)).toHaveCount(0);
      if (etiquette === 'Hors zone ouverte') {
        await expect(ligne.getByText('Hors zone ouverte')).toBeVisible();
        // Une information (orange), pas un refus (rouge).
        await expect(ligne.getByText('Hors zone ouverte')).toHaveClass(/etat-attente/);
      } else {
        // La liste ne dit rien quand la zone est inconnue : ce n'est pas un défaut de la fiche.
        await expect(ligne.getByText(/Hors zone ouverte|Zone inconnue/)).toHaveCount(0);
      }

      await ligne.click();
      await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
      const detail = page.getByRole('region', { name: 'Envoi sélectionné' });
      await expect(detail.getByText(etiquette, { exact: true })).toBeVisible();
      await expect(page.getByText(/Hors du lot/)).toHaveCount(0);
      await page.getByRole('button', { name: 'Accepter la fiche' }).click();
      await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    });
  }

  test('une fiche relevée dans la zone ouverte le dit, sans alerte', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(
      page
        .getByRole('region', { name: 'Envoi sélectionné' })
        .getByText('En zone ouverte', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Hors zone ouverte|Zone inconnue|Hors du lot/)).toHaveCount(0);
  });

  test('« hors du lot » n’est plus un motif de correction ; la position à reprendre l’est', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    const motifs = await page.getByLabel('Motif').locator('option').allTextContents();
    expect(motifs).toContain("La position n'est pas celle de l'entrée.");
    expect(motifs.join(' ')).not.toMatch(/lot/i);
  });

  test('un relais en attente est activé sans lot : il relève où il se trouve', async ({ page }) => {
    await seConnecter(page, '/admin/');
    await page.getByRole('link', { name: 'Relais' }).click();
    const ligne = page.getByRole('row', { name: /\[Relais en attente\]/ });
    await expect(ligne.getByText('À activer')).toBeVisible();
    await ligne.getByLabel(/Lot de/).selectOption({ label: 'Sans lot' });
    await ligne.getByRole('button', { name: 'Activer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est actif/);
    await expect(
      page.getByRole('row', { name: /\[Relais en attente\]/ }).getByText('Actif', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('row', { name: /\[Relais en attente\]/ })).toContainText(
      'Aucun lot',
    );
  });

  test('un relais en attente est activé sur un lot', async ({ page }) => {
    await seConnecter(page, '/admin/');
    await page.getByRole('link', { name: 'Relais' }).click();
    const ligne = page.getByRole('row', { name: /\[Relais en attente\]/ });
    await expect(ligne.getByText('À activer')).toBeVisible();
    await ligne.getByLabel(/Lot de/).selectOption({ label: 'Ngoyo' });
    await ligne.getByRole('button', { name: 'Activer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est actif/);
    await expect(
      page.getByRole('row', { name: /\[Relais en attente\]/ }).getByText('Actif', { exact: true }),
    ).toBeVisible();
  });

  test('un compte qui n’est pas administrateur ne voit rien', async ({ page }) => {
    await page.goto('/admin/');
    await page.evaluate(() =>
      localStorage.setItem('ntanova-faux-serveur', JSON.stringify({ admin: false })),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'À valider' })).toHaveCount(0);
  });

  test('tient dans 360 px sans défilement horizontal de la page', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    for (const ecran of ['#valider', '#relais']) {
      await page.goto(`/admin/${ecran}`);
      await page.waitForTimeout(300);
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largeur, ecran).toBeLessThanOrEqual(360);
    }
  });
});
