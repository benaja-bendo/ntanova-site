import { ouvrirContacts } from './aides';
import { ouvrirGestion } from './aides';
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
    await ouvrirContacts(page);

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
    await ouvrirContacts(page);

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
    await ouvrirContacts(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('link', { name: 'Écoles' }).click();
    await publierLaZoneTieTie(page);
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);

    const ligne = () => page.getByRole('row', { name: /\[École 1\]/ });
    // La liste se rafraîchit après « Publier » et remet la ligne à zéro : on attend qu'elle soit à
    // jour, sinon le formulaire ouvert par le clic suivant se referme sous les doigts.
    await expect(ligne().getByText('Publiée', { exact: true })).toBeVisible();
    await ouvrirGestion(ligne(), 'retirer');
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
    await ouvrirContacts(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[École 1\]/ }).click();
    await expect(page.getByText('Acceptée', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toHaveCount(0);
    await expect(page.getByText(/un refus est définitif/)).toBeVisible();

    await ouvrirContacts(page);
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
    await ouvrirContacts(page);
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
    await ouvrirContacts(page);
    // La partie privée est un panneau sombre : ses liens et ses boutons doivent s'y lire. Le pont avec la direction
    // (le message, la fonction, l'accord) est dans une carte claire à côté.
    expect(await textesPeuLisibles(page, 'body'), 'À valider, une fiche').toEqual([]);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    await page.getByRole('button', { name: 'Décidées' }).click();
    await page.getByRole('link', { name: /\[École 1\]/ }).click();
    await ouvrirContacts(page);
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
    await ouvrirGestion(ligne, 'retirer');
    await expect(ligne.getByLabel('Motif')).toBeVisible();
    expect(await textesPeuLisibles(page, 'body'), 'Écoles, retirer du site').toEqual([]);
  });

  // Le secteur d'un relais est un conseil, la zone ouverte la limite de NTanova, et ni l'un ni l'autre ne refuse une
  // fiche (ticket n° 67). Le faux serveur suit les vrais contours de Pointe-Noire : Lumumba est une division connue mais
  // fermée ; Brazzaville n'a aucun contour.
  test('une fiche relevée dans une division fermée s’affiche en information, jamais en alerte, et s’accepte comme les autres', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context, { position: { latitude: -4.812, longitude: 11.873 } });
    await page.goto('/admin/#valider');
    const ligne = page.getByRole('link', { name: /\[École 1\]/ });
    await expect(ligne).toBeVisible();
    // Plus aucune trace de « hors du lot » : le lot n'est qu'un conseil.
    await expect(page.getByText(/Hors du lot/)).toHaveCount(0);
    await expect(ligne.getByText('Hors zone ouverte')).toBeVisible();
    // Une information (orange), pas un refus (rouge).
    await expect(ligne.getByText('Hors zone ouverte')).toHaveClass(/etat-attente/);

    await ligne.click();
    await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();
    const detail = page.getByRole('region', { name: 'Envoi sélectionné' });
    await expect(detail.getByText('Hors zone ouverte', { exact: true })).toBeVisible();
    await expect(page.getByText(/Hors du lot/)).toHaveCount(0);
    // La division est connue (celle de la position) : rien à choisir.
    await expect(page.getByLabel('Division de l’école')).toHaveCount(0);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
  });

  test('une fiche sans contour connu : l’administration choisit la division, sans quoi elle ne s’accepte pas', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context, { position: { latitude: -4.26, longitude: 15.24 } });
    await page.goto('/admin/#valider');
    const ligne = page.getByRole('link', { name: /\[École 1\]/ });
    // La liste ne dit rien quand la zone est inconnue : ce n'est pas un défaut de la fiche.
    await expect(ligne.getByText(/Hors zone ouverte|Zone inconnue/)).toHaveCount(0);

    await ligne.click();
    const detail = page.getByRole('region', { name: 'Envoi sélectionné' });
    await expect(detail.getByText('Zone inconnue', { exact: true })).toBeVisible();
    // Avant : la fiche retombait sur la division du lot du relais, même à des milliers de kilomètres.
    const choix = page.getByLabel('Division de l’école');
    await expect(choix).toBeVisible();
    await expect(detail.getByText(/Choisissez la division/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toBeDisabled();

    await choix.selectOption({ label: 'Congo › Brazzaville › Moungali' });
    await expect(page.getByRole('button', { name: 'Accepter la fiche' })).toBeEnabled();
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

    // L'école est rattachée à la division choisie, pas à celle du lot du relais (Tié-Tié).
    await page.getByRole('link', { name: 'Écoles' }).click();
    const ecole = page.getByRole('row', { name: /\[École 1\]/ });
    await expect(ecole).toContainText('Moungali');
    await expect(ecole).not.toContainText('Tié-Tié');
  });

  test('une fiche relevée dans la zone ouverte le dit, sans alerte', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
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
    await ouvrirContacts(page);
    await page.getByRole('button', { name: 'Demander une correction' }).click();
    const motifs = await page.getByLabel('Motif').locator('option').allTextContents();
    expect(motifs).toContain("La position n'est pas celle de l'entrée.");
    expect(motifs.join(' ')).not.toMatch(/lot/i);
  });

  test('un relais en attente est proposé sans lot, jamais sur le lot d’essai', async ({ page }) => {
    await seConnecter(page, '/admin/#valider');
    await page.getByRole('link', { name: 'Relais' }).click();
    const ligne = page.getByRole('row', { name: /\[Relais en attente\]/ });
    await expect(ligne.getByText('À activer')).toBeVisible();
    // Sans toucher au menu : « Activer » ne doit pas ranger le relais en essai (ses fiches ne se publieraient jamais).
    await expect(ligne.getByLabel(/Lot de/)).toHaveValue('');
    await ligne.getByRole('button', { name: 'Activer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est actif/);
    await expect(page.getByRole('row', { name: /\[Relais en attente\]/ })).toContainText(
      'Aucun lot',
    );
    // Le lot d'essai reste proposé dans le menu, pour qui voudrait un jour former un relais.
    await expect(
      page
        .getByRole('row', { name: /\[Relais en attente\]/ })
        .getByLabel(/Lot de/)
        .locator('option'),
    ).toContainText(['Sans lot', 'Essai']);
  });

  test('un relais en attente est activé sans lot : il relève où il se trouve', async ({ page }) => {
    await seConnecter(page, '/admin/#valider');
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
    await seConnecter(page, '/admin/#valider');
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

  test('un lot se marque rendu, et se remet en cours', async ({ page }) => {
    await seConnecter(page, '/admin/#valider');
    await page.getByRole('link', { name: 'Zones' }).click();
    // Le tableau des lots, pas celui des zones (qui a aussi une ligne « Tié-Tié »).
    const lots = page
      .locator('.admin-tableau')
      .filter({ has: page.getByRole('columnheader', { name: 'Rendu' }) });
    const lot = lots.getByRole('row', { name: /^Tié-Tié/ });
    await expect(lot).toBeVisible();
    await expect(lot.getByRole('button', { name: 'Marquer rendu' })).toBeVisible();
    await lot.getByRole('button', { name: 'Marquer rendu' }).click();
    await expect(page.getByRole('status')).toHaveText(/« Tié-Tié » est marqué rendu/);
    await expect(lot.getByText(/Rendu le /)).toBeVisible();
    await lot.getByRole('button', { name: 'Remettre en cours' }).click();
    await expect(page.getByRole('status')).toHaveText(/« Tié-Tié » est remis en cours/);
    await expect(lot.getByRole('button', { name: 'Marquer rendu' })).toBeVisible();
    // Le lot d'entraînement ne se rend pas : il n'est pas mesuré.
    await expect(
      lots.getByRole('row', { name: /Essai/ }).getByRole('button', { name: 'Marquer rendu' }),
    ).toHaveCount(0);
  });

  test('un compte qui n’est pas administrateur ne voit rien', async ({ page }) => {
    await page.goto('/admin/#valider');
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
    await ouvrirContacts(page);
    for (const ecran of ['#valider', '#relais']) {
      await page.goto(`/admin/${ecran}`);
      await page.waitForTimeout(300);
      const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(largeur, ecran).toBeLessThanOrEqual(360);
    }
  });
});
