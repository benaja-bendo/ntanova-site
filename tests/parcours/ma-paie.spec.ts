import { ouvrirContacts, ouvrirEcranAdmin, fermerContacts } from './aides';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';

// « Ma paie » (ticket #55 ; solde et versements, 19/11) : le relais lit, en lecture seule, ce que NTanova lui doit (tout ce
// qu'il a gagné, moins ce qu'il a reçu) et les versements reçus. Quand l'administration note un versement, tout ou partie,
// il lit le nouveau montant. Construit avec le faux serveur, où l'utilisateur est administrateur et relais à la fois.

test.use({ permissions: ['geolocation'] });

const doit = (page: Page) => page.getByRole('region', { name: 'Ce que NTanova vous doit' });
const recu = (page: Page) => page.getByRole('region', { name: 'Reçu' });

test('le relais lit ce que NTanova lui doit, puis le nouveau montant après un versement partiel', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await uneFicheEnvoyee(page, context);

  // Rien tant que NTanova n'a rien décidé, et le relais le lit en clair.
  const navigation = page.getByRole('navigation', { name: 'Espace relais' });
  await navigation.getByRole('link', { name: 'Ma paie' }).click();
  await expect(page.getByRole('heading', { name: 'Ma paie' })).toBeVisible();
  await expect(doit(page)).toContainText('0 FCFA');
  await expect(doit(page)).toContainText('Rien pour le moment');
  await expect(doit(page)).not.toContainText(/vendredi/i);
  await expect(page.getByRole('link', { name: /Pas comptées/ })).toContainText('1 en attente');
  await expect(page.getByText('Votre numéro Mobile Money manque.')).toBeVisible();
  await expect(recu(page)).toContainText('Rien de reçu pour le moment');

  // L'administration confirme la fonction de la direction et accepte la fiche.
  await ouvrirLaFiche(page);
  await ouvrirContacts(page);
  await ouvrirContacts(page);
  await page.getByRole('button', { name: 'Confirmer sa fonction' }).click();
  await expect(page.getByText('Fonction confirmée', { exact: true })).toBeVisible();
  await fermerContacts(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

  // Le relais lit ce qui lui est dû : une fiche acceptée et un contact confirmé, en facture.
  await page.goto('/relais/#paie');
  await expect(doit(page)).toContainText('800 FCFA', { timeout: 15_000 });
  await expect(doit(page)).toContainText('Fiches acceptées');
  await expect(doit(page)).toContainText('1 × 500');
  await expect(doit(page)).toContainText('Contact de direction');
  await expect(page.getByRole('link', { name: /Pas comptées/ })).toHaveCount(0);

  // L'administration note le numéro, puis un versement partiel de 500 FCFA avec sa référence.
  await page.goto('/admin/');
  await ouvrirEcranAdmin(page, 'Paie');
  const ligne = page.getByRole('row', { name: '[Prénom]', exact: true });
  await ligne.getByRole('button', { name: 'Ajouter son numéro' }).click();
  const feuille = page.getByRole('dialog', { name: 'Numéro Mobile Money' });
  await feuille.getByRole('textbox', { name: 'Numéro Mobile Money' }).fill('242 06 123 45 99');
  await feuille.getByRole('button', { name: 'Noter le numéro' }).click();
  await ligne.getByRole('button', { name: 'Noter un versement' }).click();
  const versement = page.getByRole('dialog', { name: 'Noter un versement' });
  await versement.getByRole('textbox', { name: 'Montant versé' }).fill('500');
  await versement.getByRole('textbox', { name: /Référence Mobile Money/ }).fill('MM-0001');
  await versement.getByRole('button', { name: /Noter 500\sFCFA versés/ }).click();
  await expect(page.getByRole('status')).toHaveText(/Il lit maintenant 300\sFCFA dus/);

  // Le relais lit le nouveau montant, le versement reçu, et sa fiche payée.
  await page.goto('/relais/#paie');
  await expect(doit(page)).toContainText('300 FCFA', { timeout: 15_000 });
  await expect(doit(page)).toContainText(/Déjà reçu\s*−500/);
  await expect(recu(page)).toContainText('réf. MM-0001');
  await expect(recu(page)).toContainText('500');
  await expect(page.getByText('Votre numéro Mobile Money manque.')).toHaveCount(0);
  await page.goto('/relais/#fiches');
  await expect(page.getByText('Acceptée · payée')).toBeVisible({ timeout: 15_000 });

  // Le reste versé : tout est réglé.
  await page.goto('/admin/');
  await ouvrirEcranAdmin(page, 'Paie');
  await page
    .getByRole('row', { name: '[Prénom]', exact: true })
    .getByRole('button', { name: 'Noter un versement' })
    .click();
  await page
    .getByRole('dialog', { name: 'Noter un versement' })
    .getByRole('button', { name: /Noter 300\sFCFA versés/ })
    .click();
  await expect(page.getByText('Rien à verser.')).toBeVisible();
  await page.goto('/relais/#paie');
  await expect(doit(page)).toContainText('0 FCFA', { timeout: 15_000 });
  await expect(doit(page)).toContainText('Tout est réglé');
});

test('l’onglet « Ma paie » tient dans 360 px sans défilement horizontal', async ({ page }) => {
  await page.goto('/relais/');
  await page.getByRole('button', { name: 'Continuer avec mon compte Google' }).click();
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  await page.goto('/relais/#paie');
  await expect(page.getByRole('heading', { name: 'Ma paie' })).toBeVisible();
  await page.waitForTimeout(300);
  const largeur = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largeur).toBeLessThanOrEqual(360);
});
