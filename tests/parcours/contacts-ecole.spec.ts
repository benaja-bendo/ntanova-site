// Les contacts de l'école sur sa fiche d'administration (fondateur, 16/11/2026) : la personne qu'un relais a rencontrée se
// relit après l'acceptation, depuis la fiche de l'école, avec son numéro, « WhatsApp » et « Appeler » ; l'administration
// en note, en corrige et en efface. Planches « Contacts de l'école, privé » (page Fiche d'école du canevas).
import { expect, test, type Page } from '@playwright/test';
import {
  fermerLeTiroir,
  ouvrirFiche,
  ouvrirLaFiche,
  ouvrirLesEcoles,
  uneFicheEnvoyee,
} from './aides';

test.use({ permissions: ['geolocation'] });

/** [École 1] relevée par un relais (un promoteur, d'accord pour WhatsApp), acceptée, sa fiche ouverte. */
async function laFicheDeLEcole(page: Page, context: Parameters<typeof uneFicheEnvoyee>[1]) {
  await uneFicheEnvoyee(page, context);
  await ouvrirLaFiche(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await ouvrirLesEcoles(page);
  await ouvrirFiche(page.getByRole('row', { name: /\[École 1\]/ }));
  return page.getByRole('region', { name: 'Contacts de l’école, privé' });
}

test('la personne rencontrée par le relais se relit sur la fiche de l’école, avec son numéro', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const carte = await laFicheDeLEcole(page, context);
  await expect(carte).toBeVisible();
  await expect(carte).toContainText('jamais publié');
  const personne = carte.getByRole('listitem').filter({ hasText: 'Promoteur' });
  await expect(personne).toContainText('+242 06 123 45 61');
  await expect(personne).toContainText(/Relevé par .+ le \d+ \S+ \d{4} · accord WhatsApp le/);
  await expect(personne.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
    'href',
    'https://wa.me/242061234561',
  );
  await expect(personne.getByRole('link', { name: 'Appeler' })).toHaveAttribute(
    'href',
    'tel:+242061234561',
  );
});

test('l’administration note un contact, le corrige et l’efface depuis la fiche de l’école', async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  const carte = await laFicheDeLEcole(page, context);
  await carte.getByRole('button', { name: 'Gérer les contacts de l’école' }).click();

  const nouveau = page.getByRole('form', { name: 'Nouveau contact' });
  await page.getByRole('button', { name: 'Ajouter un contact' }).last().click();
  await nouveau.getByLabel('Fonction').selectOption('autre');
  await nouveau.getByLabel(/Précision de la fonction/).fill('propriétaire');
  await nouveau.getByLabel(/^WhatsApp/).fill('05 555 44 33');
  // Sans l'accord, le numéro ne s'enregistre pas.
  await nouveau.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(nouveau).toBeVisible();
  await nouveau.getByLabel('La personne accepte que NTanova lui écrive sur WhatsApp').check();
  await nouveau.getByLabel(/Note/).fill('Numéro reçu sur WhatsApp');
  await nouveau.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(nouveau).toBeHidden();

  const liste = page.getByRole('list', { name: 'Personnes à contacter' }).last();
  const proprietaire = liste.getByRole('listitem').filter({ hasText: 'propriétaire' });
  await expect(proprietaire).toContainText('+242 05 555 44 33');
  await expect(proprietaire).toContainText('Noté par l’administration');
  await expect(proprietaire).toContainText('Administration');

  // Corriger.
  await proprietaire.getByRole('button', { name: 'Corriger' }).click();
  const correction = page.getByRole('form', { name: 'Corriger le contact' });
  await correction.getByLabel(/^Nom/).fill('[Propriétaire]');
  await correction.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(correction).toBeHidden();
  await expect(liste.getByRole('listitem').filter({ hasText: '[Propriétaire]' })).toBeVisible();

  // La carte de la fiche le montre, numéro et « WhatsApp » compris.
  await fermerLeTiroir(page);
  await expect(carte.getByRole('listitem').filter({ hasText: '[Propriétaire]' })).toContainText(
    '+242 05 555 44 33',
  );

  // Effacer (droit d'effacement) : il disparaît, le contact du relais reste.
  await carte.getByRole('button', { name: 'Gérer les contacts de l’école' }).click();
  const aEffacer = page
    .getByRole('list', { name: 'Personnes à contacter' })
    .last()
    .getByRole('listitem')
    .filter({ hasText: '[Propriétaire]' });
  await aEffacer.getByRole('button', { name: 'Effacer (droit d’effacement)' }).click();
  await aEffacer
    .getByRole('button', { name: 'Confirmer : effacer ce contact (droit d’effacement)' })
    .click();
  await expect(aEffacer).toHaveCount(0);
  await fermerLeTiroir(page);
  await expect(carte).not.toContainText('[Propriétaire]');
  await expect(carte).toContainText('+242 06 123 45 61');
});
