import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, prendrePhotoEtPosition, seConnecter, uneFicheEnvoyee } from './aides';

// « Avant d'accepter » (ticket #95), construit avec le faux serveur. Le fondateur ne savait pas « pourquoi il ne pouvait
// pas publier » la correction d'ESTAM : le bouton était actif, rien ne bloquait, et l'écran ne le disait pas.

test.use({ permissions: ['geolocation'] });

const avant = (page: Page) => page.getByRole('region', { name: 'Avant d’accepter' });

/** La fiche envoyée devient celle d'ESTAM : du supérieur, un numéro à 10 chiffres après +242, et pas de contact. */
function faireDeLaFicheCelleDEstam(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves: Record<string, Record<string, unknown>>;
      contacts: Record<string, unknown>;
    };
    for (const r of Object.values(etat.releves)) {
      r['niveaux'] = ['superieur'];
      r['numeroEnseigne'] = '2420064970301';
    }
    etat.contacts = {};
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  });
}

/** Une correction de la fiche envoyée : la fiche d'origine est dans le lot « Essai », la correction dans aucun lot. */
function uneCorrectionSansLot(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves: Record<string, Record<string, unknown> & { id: string }>;
    };
    const [origine] = Object.values(etat.releves);
    if (!origine) throw new Error('aucune fiche dans le faux serveur');
    origine['lotId'] = '00000000-0000-4000-8000-0000000000e3';
    const id = crypto.randomUUID();
    etat.releves[id] = {
      ...origine,
      id,
      type: 'correction',
      corrigeReleveId: origine.id,
      position: null,
      precisionM: null,
      lotId: null,
      prisLe: new Date().toISOString(),
    };
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  });
}

test.describe('avant d’accepter, l’écran dit ce qui se passe et ce qui manque', () => {
  test('une fiche ordinaire : rien ne bloque, la photo à vérifier est dite, et ce que fait « Accepter »', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);

    await expect(avant(page)).toContainText('Rien ne bloque');
    await expect(avant(page)).toContainText('Reçu.');
    await expect(avant(page)).toContainText('Tié-Tié');
    // L'enseigne reçue n'est pas encore contrôlée : sans cela, elle ne paraîtra pas.
    await expect(avant(page)).toContainText('pas encore contrôlée');
    await expect(avant(page)).toContainText('Contrôler pour publication');
    // Ce que fait « Accepter », et où se publie l'école.
    await expect(avant(page)).toContainText('devient « prête »');
    await expect(avant(page)).toContainText('Écoles › Publier');

    // Contrôlée : la ligne le dit, sans promettre autre chose que l'apparition après la mise à jour du site.
    await page.getByRole('button', { name: 'Contrôler pour publication' }).click();
    await expect(avant(page)).toContainText('contrôlée pour publication : elle pourra paraître');
    await expect(avant(page)).toContainText('après la prochaine mise à jour du site');
    await expect(avant(page)).not.toContainText('pas encore contrôlée');
  });

  test('contact et formations sont dits facultatifs ; un numéro à 10 chiffres est signalé, et se confirme sur la photo', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await faireDeLaFicheCelleDEstam(page);
    await ouvrirLaFiche(page);

    // Contact et formations ne grisent jamais le bouton ; le numéro, lui, attend qu'on dise s'il est sur la photo.
    await expect(avant(page)).toContainText('Pas reçu');
    await expect(avant(page)).toContainText('n’empêche ni d’accepter ni de publier');
    await expect(avant(page)).toContainText('Facultatif pour accepter');
    await expect(avant(page)).toContainText('10 chiffres après +242');
    await expect(avant(page)).toContainText('Il reste un choix à faire');
    const accepter = page.getByRole('button', { name: 'Accepter la fiche' });
    await expect(accepter).toBeDisabled();

    // Le numéro relu sur la photo : plus rien ne bloque, et l'avertissement sur les 10 chiffres reste lisible.
    await page
      .getByRole('group', { name: /Numéro écrit sur l’enseigne/ })
      .getByRole('button', { name: 'Sur la photo', exact: true })
      .click();
    await expect(avant(page)).toContainText('Rien ne bloque');
    await expect(avant(page)).toContainText('10 chiffres après +242');
    await expect(accepter).toBeEnabled();
  });

  test('la correction d’une fiche reçue dans un lot ne montre plus ce lot comme le sien', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await uneCorrectionSansLot(page);
    await page.goto('/admin/#valider');
    // Une navigation par le dièse ne recharge rien : la liste lue avant la correction serait périmée.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: /Correction/ }).click();
    await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeVisible();

    // L'en-tête ne dit plus « Lot Essai » : c'est le lot de la fiche d'origine, pas celui de la correction.
    const entete = page
      .getByRole('region', { name: 'Envoi sélectionné' })
      .locator('.avalider-fiche-tete');
    await expect(entete).toContainText('Relevée par');
    await expect(entete).not.toContainText('Lot Essai');
    await expect(avant(page)).toContainText('lot « Essai »');
    await expect(avant(page)).toContainText('Cette correction n’est dans aucun lot');
    await expect(avant(page)).toContainText('Rien ne bloque');
    await expect(page.getByRole('button', { name: 'Accepter la fiche corrigée' })).toBeEnabled();
  });
});

test.describe('un numéro congolais qui se lit mal, côté relais', () => {
  test('est signalé à la saisie, sans bloquer', async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await expect(
      page.getByRole('region', { name: 'Mon secteur' }).getByText(/Tié-Tié/),
    ).toBeVisible();
    await prendrePhotoEtPosition(page);
    await page.getByRole('button', { name: 'Suivant' }).click();

    await page.getByLabel("Nom de l'établissement").fill('[École 1]');
    await page.getByRole('button', { name: 'Primaire' }).click();
    const numero = page.getByLabel(/Numéro écrit sur l.enseigne/);

    // Un numéro à 9 chiffres : rien à dire.
    await numero.fill('06 497 03 01');
    await expect(page.getByText(/chiffres après \+242/)).toHaveCount(0);

    // Un zéro de trop (ESTAM) : le relais est prévenu, il relit l'enseigne.
    await numero.fill('+242 0064970301');
    await expect(page.getByText(/10 chiffres après \+242/)).toBeVisible();
    await expect(page.getByText(/un numéro congolais en a 9/)).toBeVisible();

    // L'avertissement ne bloque pas : le relais a peut-être raison.
    await page.getByRole('button', { name: 'Suivant' }).click();
    await expect(
      page.getByRole('group', { name: 'Avez-vous parlé à quelqu’un de l’école ?' }),
    ).toBeVisible();
  });
});
