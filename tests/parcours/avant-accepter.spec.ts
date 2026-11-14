import { expect, test, type Page } from '@playwright/test';
import {
  attendreLaLecture,
  ouvrirLaFiche,
  prendrePhotoEtPosition,
  seConnecter,
  uneFicheEnvoyee,
} from './aides';

// « Avant d'accepter » (ticket #95), construit avec le faux serveur. Le fondateur ne savait pas « pourquoi il ne pouvait
// pas publier » la correction d'ESTAM : le bouton était actif, rien ne bloquait, et l'écran ne le disait pas.

test.use({ permissions: ['geolocation'] });

/** La barre du bas de la fiche : la décision et sa légende. */
const barre = (page: Page) => page.getByRole('group', { name: 'Accepter, corriger ou refuser' });

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

// Admin v2 (planche « À valider · une fiche ») : plus de bloc « Avant d'accepter » ; la barre du bas dit ce que fait
// « Accepter », ou ce qui manque, et le bouton se grise tant qu'un choix reste à faire.
test.describe('avant d’accepter, la barre dit ce qui se passe et ce qui manque', () => {
  test('une fiche ordinaire : rien ne bloque, et la barre dit ce que fait « Accepter »', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await expect(barre(page)).toContainText('Accepter crée l’école sans la publier.');
    await expect(page.getByRole('button', { name: 'Accepter', exact: true })).toBeEnabled();
  });

  test('sans contact ni formations rien ne bloque ; un numéro à 10 chiffres est signalé, et se confirme sur la photo', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await faireDeLaFicheCelleDEstam(page);
    await ouvrirLaFiche(page);

    // Le numéro attend qu'on dise s'il est sur la photo ; la barre le dit, le bouton attend.
    const fiche = page.getByRole('region', { name: 'Envoi sélectionné' });
    await expect(fiche).toContainText('10 chiffres après +242');
    await expect(barre(page)).toContainText('Dis si le numéro de l’enseigne est sur la photo');
    const accepter = page.getByRole('button', { name: 'Accepter', exact: true });
    await expect(accepter).toBeDisabled();

    // Le numéro relu sur la photo : plus rien ne bloque, et l'avertissement sur les 10 chiffres reste lisible.
    await page
      .getByRole('group', { name: 'Le numéro, sur la photo ?' })
      .getByRole('button', { name: 'Sur la photo', exact: true })
      .click();
    await expect(barre(page)).toContainText('Accepter crée l’école sans la publier.');
    await expect(fiche).toContainText('10 chiffres après +242');
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
    await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeAttached();
    await page.getByRole('link', { name: /Correction/ }).click();
    await expect(page.getByRole('heading', { name: '[École 1]', level: 2 })).toBeAttached();

    // L'en-tête ne dit plus « Lot Essai » : c'est le lot de la fiche d'origine, pas celui de la correction.
    const fiche = page.getByRole('region', { name: 'Envoi sélectionné' });
    await expect(fiche).not.toContainText('Lot Essai');
    await expect(page.getByRole('button', { name: 'Accepter la correction' })).toBeEnabled();
  });
});

test.describe('un numéro congolais qui se lit mal, côté relais', () => {
  test('est signalé à la saisie, sans bloquer', async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
    await seConnecter(page, '/relais/');
    await attendreLaLecture(page);
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
