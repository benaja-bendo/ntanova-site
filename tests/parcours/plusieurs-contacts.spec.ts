import { ouvrirContacts } from './aides';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';

// Plusieurs personnes à contacter par fiche (ticket #96), côté administration, construit avec le faux serveur.
// Le fondateur reçoit des numéros par WhatsApp que l'application n'a pas pu prendre (fiche d'ESTAM, 03/11) : il les
// ajoute, les corrige, les efface une par une. Trois personnes au plus par fiche.

test.use({ permissions: ['geolocation'] });

const privee = (page: Page) => page.getByRole('region', { name: 'Partie privée' });

/** Le faux serveur n'a pas (ou plus) le contact de la fiche : ce qui s'est passé pour ESTAM. */
function perdreLeContact(page: Page) {
  return page.evaluate(() => {
    const etat = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as Record<
      string,
      unknown
    >;
    etat['contacts'] = {};
    localStorage.setItem('ntanova-faux-serveur', JSON.stringify(etat));
  });
}

/** Remplit le formulaire d'une personne (ouvert) ; les champs non donnés restent comme ils sont. */
async function remplir(
  formulaire: ReturnType<Page['getByRole']>,
  champs: {
    fonction?: string;
    precision?: string;
    nom?: string;
    whatsapp?: string;
    accord?: boolean;
  },
) {
  if (champs.fonction) {
    await formulaire
      .getByLabel('Fonction', { exact: true })
      .selectOption({ label: champs.fonction });
  }
  if (champs.precision !== undefined) {
    await formulaire.getByLabel('Précision de la fonction').fill(champs.precision);
  }
  if (champs.nom !== undefined) await formulaire.getByLabel(/^Nom\b/).fill(champs.nom);
  if (champs.whatsapp !== undefined)
    await formulaire.getByRole('textbox', { name: /^WhatsApp/ }).fill(champs.whatsapp);
  if (champs.accord !== undefined) {
    await formulaire
      .getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp')
      .setChecked(champs.accord);
  }
}

test.describe('l’administration note les personnes à contacter', () => {
  test('ajoute, corrige et efface une personne, trois au plus', async ({ page, context }) => {
    test.setTimeout(120_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);

    // Le relais en a donné une.
    await expect(privee(page).getByText('+242 06 123 45 61')).toBeVisible();
    await expect(privee(page).getByText('Le relais', { exact: true })).toBeVisible();

    // Une deuxième : le propriétaire, joint par WhatsApp.
    await privee(page).getByRole('button', { name: 'Ajouter une personne' }).click();
    const nouvelle = page.getByRole('form', { name: 'Nouvelle personne' });
    await remplir(nouvelle, {
      fonction: 'Autre',
      precision: 'propriétaire',
      nom: 'M. Okemba',
      whatsapp: '06 999 88 77',
      accord: true,
    });
    await nouvelle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'La personne est ajoutée.' }),
    ).toBeVisible();
    await expect(privee(page).getByText('+242 06 999 88 77')).toBeVisible();
    await expect(
      privee(page).getByRole('heading', { name: 'Autre : propriétaire · M. Okemba' }),
    ).toBeVisible();
    await expect(privee(page).getByText('L’administration', { exact: true })).toBeVisible();

    // Une troisième, sans numéro : le secrétariat. Ensuite, plus d'ajout possible.
    await privee(page).getByRole('button', { name: 'Ajouter une personne' }).click();
    await remplir(page.getByRole('form', { name: 'Nouvelle personne' }), {
      fonction: 'Secrétariat',
    });
    await page
      .getByRole('form', { name: 'Nouvelle personne' })
      .getByRole('button', { name: 'Enregistrer' })
      .click();
    await expect(privee(page).getByRole('listitem')).toHaveCount(3);
    await expect(privee(page).getByRole('button', { name: 'Ajouter une personne' })).toHaveCount(0);
    await expect(privee(page).getByText('Trois personnes au plus par fiche.')).toBeVisible();

    // Elle corrige le numéro du propriétaire.
    const proprietaire = privee(page).getByRole('listitem').filter({ hasText: 'M. Okemba' });
    await proprietaire.getByRole('button', { name: /Corriger/ }).click();
    const correction = page.getByRole('form', { name: 'Corriger la personne' });
    await expect(correction.getByRole('textbox', { name: /^WhatsApp/ })).toHaveValue(
      '+242 06 999 88 77',
    );
    await remplir(correction, { whatsapp: '06 111 22 33' });
    await correction.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'La personne est corrigée.' }),
    ).toBeVisible();
    await expect(privee(page).getByText('+242 06 111 22 33')).toBeVisible();
    await expect(privee(page).getByText('+242 06 999 88 77')).toHaveCount(0);

    // Elle efface le secrétariat : les autres restent, et on peut de nouveau en ajouter.
    await privee(page)
      .getByRole('listitem')
      .filter({ hasText: 'Secrétariat' })
      .getByRole('button', { name: /Effacer le contact/ })
      .click();
    await page.getByRole('button', { name: /Confirmer : effacer le contact/ }).click();
    await expect(page.getByText('Le contact de la direction est effacé.')).toBeVisible();
    await expect(privee(page).getByRole('listitem')).toHaveCount(2);
    await expect(privee(page).getByText('+242 06 123 45 61')).toBeVisible();
    await expect(privee(page).getByRole('button', { name: 'Ajouter une personne' })).toBeVisible();
  });

  test('une fiche arrivée sans contact : l’administration le saisit, et peut écrire à la personne', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await perdreLeContact(page);
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
    await expect(privee(page).getByText('Contact pas encore reçu.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Écrire à la direction' })).toHaveCount(0);

    await privee(page).getByRole('button', { name: 'Ajouter une personne' }).click();
    const nouvelle = page.getByRole('form', { name: 'Nouvelle personne' });
    await remplir(nouvelle, {
      fonction: 'Directeur ou directrice',
      whatsapp: '06 765 43 21',
      accord: true,
    });
    await nouvelle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(privee(page).getByText('+242 06 765 43 21')).toBeVisible();
    await expect(privee(page).getByText('Contact pas encore reçu.')).toHaveCount(0);

    const pont = page.getByRole('region', { name: 'Écrire à la direction' });
    await expect(
      pont.getByRole('link', { name: 'Écrire à la direction sur WhatsApp' }),
    ).toHaveAttribute('href', /wa\.me\/242067654321/);
  });

  test('plusieurs personnes joignables : on choisit celle à qui écrire', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
    await privee(page).getByRole('button', { name: 'Ajouter une personne' }).click();
    const nouvelle = page.getByRole('form', { name: 'Nouvelle personne' });
    await remplir(nouvelle, {
      fonction: 'Gestionnaire ou comptable',
      nom: 'Mme Ibara',
      whatsapp: '06 555 44 33',
      accord: true,
    });
    await nouvelle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(privee(page).getByText('+242 06 555 44 33')).toBeVisible();

    const pont = page.getByRole('region', { name: 'Écrire à la direction' });
    const lien = pont.getByRole('link', { name: 'Écrire à la direction sur WhatsApp' });
    await expect(lien).toHaveAttribute('href', /wa\.me\/242061234561/);
    await pont
      .getByLabel('Écrire à')
      .selectOption({ label: 'Gestionnaire ou comptable · Mme Ibara' });
    await expect(lien).toHaveAttribute('href', /wa\.me\/242065554433/);
  });

  test('refuse un numéro sans l’accord de la personne, et une fonction non choisie', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    await uneFicheEnvoyee(page, context);
    await ouvrirLaFiche(page);
    await ouvrirContacts(page);
    await privee(page).getByRole('button', { name: 'Ajouter une personne' }).click();
    const nouvelle = page.getByRole('form', { name: 'Nouvelle personne' });

    await nouvelle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(nouvelle.getByText('Choisissez sa fonction.')).toBeVisible();

    await remplir(nouvelle, { fonction: 'Secrétariat', whatsapp: '06 555 44 33', accord: false });
    await nouvelle.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(nouvelle.getByText('Sans son accord, ne notez pas son numéro.')).toBeVisible();
    await expect(privee(page).getByRole('listitem')).toHaveCount(1);

    await nouvelle.getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('form', { name: 'Nouvelle personne' })).toHaveCount(0);
  });
});
