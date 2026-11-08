import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  choisirLaZone,
  ouvrirGestion,
  ouvrirLaFiche,
  publierLaZoneTieTie,
  seConnecter,
  uneFicheEnvoyee,
} from './aides';

// Audit de l'administration du 06/11/2026 : garder ses repères pendant le défilement, contrôler une photo sans quitter
// la page, ne pas ouvrir un menu vide. Construit avec le faux serveur.

test.use({ permissions: ['geolocation'] });

test.describe('tableau de bord : À valider', () => {
  test('sur un grand écran, le côté et les boutons de décision restent à l’écran pendant le défilement', async ({
    page,
    context,
  }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1280,
      'Mise en page à deux colonnes : grand écran',
    );
    await uneFicheEnvoyee(page, context);
    // Une fenêtre basse : sans barre collante, « Accepter » est sous la ligne de flottaison.
    await page.setViewportSize({ width: 1280, height: 520 });
    await ouvrirLaFiche(page);

    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeInViewport();

    await page.mouse.wheel(0, 300);
    await expect(accepter).toBeInViewport();
    // Le côté (la navigation) ne défile pas avec la page.
    const haut = await page.locator('.admin-cote').evaluate((e) => e.getBoundingClientRect().top);
    expect(haut).toBe(0);
  });

  test('une photo s’agrandit dans la page, et Échap la referme', async ({ page, context }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await page.getByRole('button', { name: /^Agrandir : / }).click();
    const fenetre = page.getByRole('dialog');
    await expect(fenetre.locator('img.admin-photo-grande')).toBeVisible();
    // Un seul onglet : l'agrandissement ne sort plus de la page.
    expect(page.context().pages()).toHaveLength(1);
    await expect(fenetre.getByRole('link', { name: /Ouvrir l’original/ })).toHaveAttribute(
      'target',
      '_blank',
    );

    await page.keyboard.press('Escape');
    await expect(fenetre).toHaveCount(0);
  });

  test('avec une seule photo, pas de bouton « Contrôler les photos » : le geste unitaire suffit', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(page.getByRole('button', { name: 'Contrôler pour publication' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^Contrôler les \d+ photos$/ })).toHaveCount(0);
  });
});

test.describe('tableau de bord : compteurs', () => {
  test('les nombres des onglets se lisent dès l’arrivée, sans ouvrir « À valider »', async ({
    page,
    context,
  }) => {
    await uneFicheEnvoyee(page, context);
    // On arrive directement sur un autre onglet : le nombre d'envois à valider est déjà là.
    await page.goto('/admin/#zones');
    await page.reload();
    const onglets = page.getByRole('navigation', { name: 'Administration' });
    await expect(onglets.getByRole('link', { name: /À valider/ })).toContainText(
      '1 envoi à valider',
    );
    await expect(onglets.getByRole('link', { name: /Écoles/ })).not.toContainText('prête');

    // Acceptée, l'école est prête : l'onglet « Écoles » le dit, et « À valider » se vide.
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.goto('/admin/#zones');
    await page.reload();
    await expect(onglets.getByRole('link', { name: /Écoles/ })).toContainText(
      '1 école prête à publier',
    );
    await expect(onglets.getByRole('link', { name: /À valider/ })).not.toContainText('envoi');
  });
});

test.describe('tableau de bord : Écoles', () => {
  const MENU = 'summary[aria-label^="Autres actions pour"]';

  async function uneEcolePubliee(page: Page, context: BrowserContext) {
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await page.getByRole('button', { name: 'Accepter la fiche' }).click();
    await expect(page.getByRole('status')).toHaveText(/l’école est prête/);
    await page.getByRole('link', { name: 'Écoles' }).click();
    await publierLaZoneTieTie(page);
    await expect(page.getByRole('status')).toHaveText(/1 école de Tié-Tié publiée/);
    await expect(ligne(page).getByText('Publiée', { exact: true })).toBeVisible();
  }
  const ligne = (page: Page) => page.getByRole('row', { name: /\[École 1\]/ });

  test('le menu « ⋯ » d’une école retirée ne s’ouvre plus vide : il propose la corbeille', async ({
    page,
    context,
  }) => {
    await uneEcolePubliee(page, context);
    // Publiée : retirer, fusionner, corbeille, mission.
    await expect(ligne(page).locator(MENU)).toHaveCount(1);

    await ouvrirGestion(ligne(page), 'retirer');
    await ligne(page).getByLabel('Motif').selectOption('demande_ecole');
    await ligne(page)
      .getByRole('button', { name: /Retirer \[École 1\] du site/ })
      .click();
    await expect(ligne(page).getByText('Retirée', { exact: true })).toBeVisible();

    // Retirée : plus de « Retirer » ni de « Fusionner », mais la corbeille (avant : un menu vide).
    await ligne(page).locator(MENU).click();
    await expect(ligne(page).getByRole('button', { name: 'Retirer du site' })).toHaveCount(0);
    await expect(ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' })).toBeVisible();
    await expect(ligne(page).getByRole('button', { name: 'Republier' })).toBeVisible();
  });

  test('depuis une zone, « Voir les écoles » ouvre Écoles déjà filtré sur elle', async ({
    page,
    context,
  }) => {
    await uneEcolePubliee(page, context);
    await page.getByRole('link', { name: 'Zones' }).click();
    await choisirLaZone(page, /^Tié-Tié/);
    await expect(page.getByText('1 école · 1 publiée')).toBeVisible();
    await page.getByRole('link', { name: 'Voir les écoles' }).click();
    await expect(page.getByRole('heading', { name: 'Écoles', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Zone', { exact: true })).toHaveValue('d-pn-tie-tie');
    await expect(ligne(page)).toBeVisible();
  });

  test('la corbeille : l’école quitte les listes, se restaure, puis se supprime pour de bon', async ({
    page,
    context,
  }) => {
    await uneEcolePubliee(page, context);

    // Mettre à la corbeille : elle disparaît de « Toutes » et paraît dans « Corbeille ».
    await ligne(page).locator(MENU).click();
    await ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' }).click();
    await ligne(page).getByLabel('Motif').selectOption('erreur');
    await ligne(page)
      .getByRole('button', { name: /Mettre \[École 1\] à la corbeille/ })
      .click();
    await expect(page.getByRole('status')).toHaveText(/est à la corbeille.*restaurer/);
    await expect(ligne(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Corbeille · 1' })).toBeVisible();

    await page.getByRole('button', { name: 'Corbeille · 1' }).click();
    await expect(ligne(page).getByText('À la corbeille', { exact: true })).toBeVisible();
    await expect(ligne(page).getByText(/À la corbeille depuis le/)).toBeVisible();
    // À la corbeille : ni « Publier », ni « Gérer la fiche ».
    await expect(ligne(page).getByRole('button', { name: 'Publier', exact: true })).toHaveCount(0);
    await expect(ligne(page).getByRole('button', { name: 'Gérer la fiche' })).toHaveCount(0);

    // Restaurer : une école publiée revient « prête », jamais « publiée » toute seule.
    await ligne(page).getByRole('button', { name: 'Restaurer' }).click();
    await expect(page.getByRole('status')).toHaveText(/est restaurée/);
    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(ligne(page).getByText('Prête', { exact: true })).toBeVisible();

    // La suppression définitive demande d'abord la corbeille, puis le nom de l'école.
    await ligne(page).locator(MENU).click();
    await ligne(page).getByRole('button', { name: 'Mettre à la corbeille…' }).click();
    await ligne(page)
      .getByRole('button', { name: /Mettre \[École 1\] à la corbeille/ })
      .click();
    await page.getByRole('button', { name: 'Corbeille · 1' }).click();
    await ligne(page).getByRole('button', { name: 'Supprimer définitivement…' }).click();

    await expect(ligne(page).getByText(/La suppression emporte/)).toBeVisible();
    const supprimer = ligne(page).getByRole('button', {
      name: /^Supprimer définitivement \[École 1\]/,
    });
    await expect(supprimer).toBeDisabled();
    await ligne(page)
      .getByLabel(/écris le nom de l’école/)
      .fill('[Autre école]');
    await expect(supprimer).toBeDisabled();
    // Sans accent ni majuscule ni espace en trop : le nom se reconnaît.
    await ligne(page)
      .getByLabel(/écris le nom de l’école/)
      .fill('  [école 1] ');
    await expect(supprimer).toBeEnabled();
    await supprimer.click();

    await expect(page.getByRole('status')).toHaveText(/supprimée définitivement/);
    await expect(ligne(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Corbeille · 0' })).toBeVisible();
  });
});

test.describe('tableau de bord : Zones', () => {
  const arbreDe = (page: Page) => page.getByRole('region', { name: 'Liste des zones' });
  const messageDeLaPage = (page: Page) => page.getByRole('status');

  test('l’arbre garde les zones qui comptent, replie les autres en une ligne et se cherche par le nom', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    const arbre = arbreDe(page);
    await expect(arbre.getByRole('button', { name: /^Loandjili/ })).toBeVisible();
    await expect(
      arbre.getByText(/zones · \d+ avec des écoles · \d+ suivies sur la carte/),
    ).toBeVisible();

    // Moungali n'a ni école, ni état, ni relais : elle se replie sous Brazzaville. Niari et Dolisie sous le Congo.
    await expect(arbre.getByRole('button', { name: /^Moungali/ })).toHaveCount(0);
    await expect(arbre.getByRole('button', { name: /1 autre zone/ })).toBeVisible();
    await arbre.getByRole('button', { name: /2 autres zones/ }).click();
    await expect(arbre.getByRole('button', { name: /^Dolisie/ })).toBeVisible();
    await arbre.getByRole('button', { name: /2 autres zones/ }).click();
    await expect(arbre.getByRole('button', { name: /^Dolisie/ })).toHaveCount(0);

    // Une recherche remet à plat, sans accent ni majuscule.
    await arbre.getByLabel('Chercher une zone').fill('TIE');
    await expect(arbre.getByRole('list').getByRole('button')).toHaveCount(1);
    await expect(arbre.getByRole('button', { name: /^Tié-Tié/ })).toBeVisible();
    await arbre.getByLabel('Chercher une zone').fill('zzz');
    await expect(arbre.getByText('Aucune zone ne s’appelle ainsi.')).toBeVisible();
  });

  test('une zone se choisit par son adresse : le volet dit ses écoles, son état et ses relais', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones/d-pn-ngoyo');
    await expect(page.getByRole('heading', { name: 'Ngoyo', level: 2 })).toBeVisible();
    // Ngoyo est « relevé en cours » et ouverte aux relais.
    await expect(
      page.getByRole('group', { name: 'État de Ngoyo sur la carte' }).getByRole('radio', {
        name: 'Relevé en cours',
      }),
    ).toBeChecked();
    await expect(page.getByRole('switch', { name: 'Ouverte aux relais : Ngoyo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Trois nombres sans étiquette sont devenus une barre et sa légende.
    await expect(page.getByText(/relevées? par un relais/)).toBeVisible();
    await expect(page.getByText(/ajoutées? par toi/)).toBeVisible();
    // Le message d'un geste paraît dans le volet, pas tout en haut de la page.
    await page
      .getByRole('group', { name: 'État de Ngoyo sur la carte' })
      .getByRole('radio', { name: 'Déploiement programmé' })
      .click();
    await expect(messageDeLaPage(page)).toBeInViewport();
  });

  test('une ville « pas encore couverte » dit que ses arrondissements restent sur la carte', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    await choisirLaZone(page, /^Pointe-Noire\s*Ville/);
    await expect(
      page.getByText(
        /Ce que Pointe-Noire contient est quand même sur la carte \(« Relevé en cours\s?»\)/,
      ),
    ).toBeVisible();
  });

  test('ouvrir une zone qui en contient beaucoup montre d’abord ce que ça change', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    await choisirLaZone(page, /^Pointe-Noire\s*Ville/);
    await expect(
      page.getByText(/Ouvrir Pointe-Noire ouvre aussi les 6 zones qu’elle contient/),
    ).toBeVisible();
    const ouverture = page.getByRole('switch', { name: 'Ouverte aux relais : Pointe-Noire' });
    await ouverture.click();

    const dialogue = page.getByRole('alertdialog', { name: 'Ouvrir Pointe-Noire aux relais ?' });
    await expect(dialogue.getByText(/Cela ouvre 6 zones/)).toBeVisible();
    // « Annuler » : rien n'a bougé.
    await dialogue.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialogue).toHaveCount(0);
    await expect(ouverture).toHaveAttribute('aria-checked', 'false');

    await ouverture.click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Ouvrir 6 zones' }).click();
    await expect(messageDeLaPage(page)).toHaveText(
      'Pointe-Noire est ouverte aux relais, avec tout ce qu’elle contient.',
    );
    await expect(ouverture).toHaveAttribute('aria-checked', 'true');

    // Refermer ne demande rien, et « Annuler » rouvre.
    await ouverture.click();
    await expect(messageDeLaPage(page)).toHaveText('Pointe-Noire n’est plus ouverte aux relais.');
    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(messageDeLaPage(page)).toHaveText(
      'Pointe-Noire est ouverte aux relais, avec tout ce qu’elle contient.',
    );
  });

  test('la vue par étape range les zones par état, et une zone s’y active d’un bouton', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    await page.getByRole('link', { name: 'Par étape' }).click();
    const programme = page.getByRole('region', { name: 'Déploiement programmé' });
    const enCours = page.getByRole('region', { name: 'Relevé en cours' });
    const pasEncore = page.getByRole('region', { name: 'Pas encore couverte' });
    await expect(programme.getByText('Loandjili', { exact: true })).toBeVisible();
    await expect(enCours.getByText('Ngoyo', { exact: true })).toBeVisible();
    // Une zone sans école ni relais ne prend pas la place des autres : elle se déplie à la demande.
    await expect(pasEncore.getByText('Moungali', { exact: true })).toHaveCount(0);
    await pasEncore.getByRole('button', { name: /autres? zones? sans école/ }).click();
    await expect(pasEncore.getByText('Moungali', { exact: true })).toBeVisible();

    await programme.getByRole('button', { name: 'Activer Loandjili' }).click();
    await expect(messageDeLaPage(page)).toHaveText(
      'Loandjili est sur la carte, réglée « Relevé en cours ». Les relais ne sont pas concernés.',
    );
    await expect(enCours.getByText('Loandjili', { exact: true })).toBeVisible();
    await expect(programme.getByText('Loandjili', { exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Annuler' }).click();
    await expect(programme.getByText('Loandjili', { exact: true })).toBeVisible();

    // Le nom d'une zone ouvre son volet dans l'arbre.
    await programme.getByRole('button', { name: 'Régler Loandjili' }).click();
    await expect(page).toHaveURL(/#zones\/d-pn-loandjili$/);
    await expect(page.getByRole('heading', { name: 'Loandjili', level: 2 })).toBeVisible();
  });

  test('chaque zone qui en contient d’autres se déplie et se replie, et tout se déplie ou se replie d’un geste', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    const arbre = arbreDe(page);
    const ligne = (...mots: string[]) =>
      mots.reduce((l, m) => l.filter({ hasText: m }), arbre.getByRole('listitem'));
    const ville = ligne('Pointe-Noire', 'Ville');
    const loandjili = arbre.getByRole('button', { name: /^Loandjili/ });

    // Pointe-Noire montre ses arrondissements : on la replie, elle dit combien de zones elle cache.
    await expect(loandjili).toBeVisible();
    const bascule = ville.getByRole('button', { name: 'Replier', exact: true });
    await expect(bascule).toHaveAttribute('aria-expanded', 'true');
    await bascule.click();
    await expect(loandjili).toHaveCount(0);
    await expect(ville).toContainText('6 zones cachées');
    await expect(ville.getByRole('button', { name: 'Déplier', exact: true })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    // Une zone sans rien dessous n'a rien à déplier.
    await ville.getByRole('button', { name: 'Déplier', exact: true }).click();
    await expect(loandjili).toBeVisible();
    await expect(ligne('Loandjili').getByRole('button', { name: /(Dé|Re)plier/ })).toHaveCount(0);

    // « Tout replier » : le pays et ses départements ; « Tout déplier » : les 12 zones, groupes ouverts compris.
    await arbre.getByRole('button', { name: 'Tout replier' }).click();
    await expect(loandjili).toHaveCount(0);
    await expect(arbre.getByRole('button', { name: /^Brazzaville/ }).first()).toBeVisible();
    await arbre.getByRole('button', { name: 'Tout déplier' }).click();
    await expect(arbre.getByRole('button', { name: /^Moungali/ })).toBeVisible();
    await expect(arbre.getByRole('button', { name: /^Dolisie/ })).toBeVisible();
    await expect(loandjili).toBeVisible();

    // Une zone choisie par son adresse rouvre ce qui la contient, même repliée.
    await arbre.getByRole('button', { name: 'Tout replier' }).click();
    await expect(loandjili).toHaveCount(0);
    await page.evaluate(() => {
      location.hash = '#zones/d-pn-ngoyo';
    });
    await expect(page.getByRole('heading', { name: 'Ngoyo', level: 2 })).toBeVisible();
    // Sur un petit écran, la zone choisie remplace la liste : on y revient pour la retrouver dans l'arbre.
    const retour = page.getByRole('link', { name: '← Toutes les zones' });
    if (await retour.isVisible()) await retour.click();
    await expect(arbre.getByRole('button', { name: /^Ngoyo/ })).toBeVisible();

    // Une recherche remet à plat : plus rien à déplier ni à replier.
    await page.evaluate(() => {
      location.hash = '#zones';
    });
    await arbre.getByLabel('Chercher une zone').fill('moun');
    await expect(arbre.getByRole('button', { name: 'Tout déplier' })).toHaveCount(0);
    await expect(arbre.getByRole('button', { name: /^Moungali/ })).toBeVisible();
  });

  test('« Ajouter une zone » s’ouvre à côté de la recherche, demande sous quelle zone, et ouvre la zone créée', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    const arbre = arbreDe(page);
    await arbre.getByRole('button', { name: 'Ajouter une zone' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Ajouter une zone' });
    await expect(fenetre).toBeVisible();

    // Rien n'est choisi d'avance quand aucune zone ne l'est : le bouton attend la zone et le nom.
    const ajouter = fenetre.getByRole('button', { name: 'Ajouter la zone' });
    await expect(ajouter).toBeDisabled();
    await fenetre.getByLabel('Sous quelle zone ?').selectOption('d-pn-tie-tie');
    await fenetre.getByLabel('Nom', { exact: true }).fill('Mpaka');
    await expect(fenetre.getByLabel('Genre')).toHaveValue('quarter');
    await ajouter.click();

    // La fenêtre se ferme, la zone créée s'ouvre dans le volet, et le message dit où elle est.
    await expect(fenetre).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Mpaka', level: 2 })).toBeVisible();
    await expect(page.getByRole('status').first()).toContainText('Mpaka est ajouté sous Tié-Tié');
    await expect(page).toHaveURL(/#zones\/[0-9a-f-]{36}$/);
  });

  test('sur un grand écran, « Ajouter une zone » part de la zone choisie', async ({ page }) => {
    test.skip(
      (page.viewportSize()?.width ?? 0) < 1280,
      'Deux colonnes : la liste reste à côté de la zone',
    );
    await seConnecter(page, '/admin/#zones/d-pn-ngoyo');
    await arbreDe(page).getByRole('button', { name: 'Ajouter une zone' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Ajouter une zone' });
    await expect(fenetre.getByLabel('Sous quelle zone ?')).toHaveValue('d-pn-ngoyo');
    await fenetre.getByRole('button', { name: 'Fermer' }).click();
    await expect(fenetre).toBeHidden();
  });

  test('sur un grand écran, l’arbre garde sa place pendant que le volet défile', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) < 1280, 'Deux colonnes : grand écran');
    // Une fenêtre basse : l'arbre est plus haut qu'elle, et la zone choisie doit y rester visible.
    await page.setViewportSize({ width: 1280, height: 520 });
    await seConnecter(page, '/admin/#zones/d-pn-loandjili');
    const arbre = arbreDe(page);
    await expect(arbre).toBeVisible();
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const haut = await arbre.evaluate((e) => e.getBoundingClientRect().top);
    expect(haut).toBeGreaterThanOrEqual(0);
    expect(haut).toBeLessThan(48);
    await expect(arbre.getByRole('button', { name: /^Loandjili/ })).toBeInViewport();
  });

  test('sur un petit écran, une zone choisie remplace la liste, et « Toutes les zones » la rend', async ({
    page,
  }) => {
    test.skip((page.viewportSize()?.width ?? 0) >= 1152, 'Deux colonnes : la liste reste');
    await seConnecter(page, '/admin/#zones/d-pn-loandjili');
    await expect(page.getByRole('heading', { name: 'Loandjili', level: 2 })).toBeVisible();
    await expect(arbreDe(page)).toBeHidden();
    await page.getByRole('link', { name: '← Toutes les zones' }).click();
    await expect(arbreDe(page)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Loandjili', level: 2 })).toHaveCount(0);
  });

  test('une zone se renomme, dit ses autres écritures, et la recherche de l’arbre les trouve', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones/d-bz-moungali');
    await expect(page.getByRole('heading', { name: 'Moungali', level: 2 })).toBeVisible();
    await page.getByText('Renommer · autres écritures', { exact: true }).click();
    const formulaire = page.getByRole('form', { name: 'Renommer Moungali' });
    const enregistrer = formulaire.getByRole('button', { name: 'Enregistrer' });
    // Rien n'a changé : rien à enregistrer.
    await expect(enregistrer).toBeDisabled();
    await expect(formulaire.getByText('L’adresse (moungali) ne change pas')).toBeVisible();

    // Une autre écriture par ligne, avec des blancs et un doublon : la liste est nettoyée.
    await formulaire
      .getByLabel('Autres écritures, pour la recherche')
      .fill('  Mongali \n\nMONGALI\nMoungali');
    await enregistrer.click();
    await expect(messageDeLaPage(page)).toContainText(
      'Les autres écritures de Moungali sont enregistrées.',
    );
    await expect(page.getByLabel('Autres écritures, pour la recherche')).toHaveValue('Mongali');

    // Le nom change, l'adresse reste : le lien du volet est le même.
    await formulaire.getByLabel('Nom', { exact: true }).fill('Moungali centre');
    await formulaire.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('heading', { name: 'Moungali centre', level: 2 })).toBeVisible();
    await expect(messageDeLaPage(page).first()).toContainText(
      'Moungali s’appelle maintenant Moungali centre. Son adresse ne change pas.',
    );
    await expect(page).toHaveURL(/#zones\/d-bz-moungali$/);

    // La recherche de l'arbre trouve la zone par son ancienne écriture, sans accent ni majuscule.
    const retour = page.getByRole('link', { name: '← Toutes les zones' });
    if (await retour.isVisible()) await retour.click();
    const arbre = arbreDe(page);
    await arbre.getByLabel('Chercher une zone').fill('MONGALI');
    await expect(arbre.getByRole('list').getByRole('button')).toHaveCount(1);
    await expect(arbre.getByRole('button', { name: /^Moungali centre/ })).toBeVisible();
  });

  test('un nom déjà pris sous le même parent est refusé avant d’enregistrer', async ({ page }) => {
    await seConnecter(page, '/admin/#zones/d-pn-lumumba');
    await page.getByText('Renommer · autres écritures', { exact: true }).click();
    const formulaire = page.getByRole('form', { name: 'Renommer Lumumba' });
    await formulaire.getByLabel('Nom', { exact: true }).fill('  mvou-MVOU ');
    await expect(formulaire.getByText('Mvou-Mvou existe déjà sous le même parent.')).toBeVisible();
    await expect(formulaire.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await formulaire.getByLabel('Nom', { exact: true }).fill('   ');
    await expect(formulaire.getByText('Le nom ne peut pas rester vide.')).toBeVisible();
    await expect(formulaire.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  test('une zone ajoutée par erreur se supprime après confirmation, et on revient à sa zone parente', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones');
    await arbreDe(page).getByRole('button', { name: 'Ajouter une zone' }).click();
    const fenetre = page.getByRole('dialog', { name: 'Ajouter une zone' });
    await fenetre.getByLabel('Sous quelle zone ?').selectOption('d-pn-tie-tie');
    await fenetre.getByLabel('Nom', { exact: true }).fill('Mpaka par erreur');
    await fenetre.getByRole('button', { name: 'Ajouter la zone' }).click();
    await expect(page.getByRole('heading', { name: 'Mpaka par erreur', level: 2 })).toBeVisible();

    await page.getByText('Supprimer cette zone', { exact: true }).click();
    await expect(page.getByText('La zone est vide')).toBeVisible();
    await page.getByRole('button', { name: 'Supprimer Mpaka par erreur…' }).click();

    // La confirmation dit ce qui disparaît ; Annuler ne supprime rien.
    const confirmation = page.getByRole('alertdialog', { name: 'Supprimer Mpaka par erreur ?' });
    await expect(confirmation).toContainText('Tié-Tié');
    await confirmation.getByRole('button', { name: 'Annuler' }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Mpaka par erreur', level: 2 })).toBeVisible();

    await page.getByRole('button', { name: 'Supprimer Mpaka par erreur…' }).click();
    await confirmation.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(confirmation).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Tié-Tié', level: 2 })).toBeVisible();
    await expect(messageDeLaPage(page).first()).toContainText('Mpaka par erreur est supprimée.');
    await expect(page).toHaveURL(/#zones\/d-pn-tie-tie$/);
  });

  test('une zone qui contient quelque chose ne propose pas la suppression, et dit pourquoi', async ({
    page,
  }) => {
    await seConnecter(page, '/admin/#zones/d-pn-ngoyo');
    await page.getByText('Supprimer cette zone', { exact: true }).click();
    const raison = page.getByText(/Cette zone ne se supprime pas :/);
    await expect(raison).toContainText('elle a 1 lot');
    await expect(raison).toContainText('elle est sur la carte du site');
    await expect(raison).toContainText('elle est ouverte aux relais');
    await expect(page.getByRole('button', { name: /^Supprimer Ngoyo/ })).toHaveCount(0);
  });

  for (const adresse of ['#zones', '#zones/d-pn-ngoyo', '#zones/d-cg', '#zones/etapes']) {
    test(`« ${adresse} » : la page ne défile pas de côté`, async ({ page }) => {
      await seConnecter(page, `/admin/${adresse}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Zones', level: 1 })).toBeVisible();
      const [contenu, fenetre] = await page.evaluate(
        () => [document.documentElement.scrollWidth, window.innerWidth] as const,
      );
      expect(contenu).toBeLessThanOrEqual(fenetre);
    });
  }
});
