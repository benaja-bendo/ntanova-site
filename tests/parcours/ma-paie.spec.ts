import { ouvrirContacts, ouvrirEcranAdmin, fermerContacts } from './aides';
import { expect, test, type Page } from '@playwright/test';
import { ouvrirLaFiche, uneFicheEnvoyee } from './aides';

// « Ma paie » (ticket #55, PR 5 ; ticket #24) : le relais lit sa propre paie, en lecture seule. Ce qui lui est acquis
// pour le vendredi, la semaine close à payer, puis payée avec la référence de l'opération. Construit avec le faux
// serveur, où l'utilisateur est administrateur et relais à la fois.

test.use({ permissions: ['geolocation'] });

const acquis = (page: Page) => page.getByRole('region', { name: 'Acquis' });
const semaines = (page: Page) => page.getByRole('region', { name: 'Semaines closes' });

test('le relais lit ce qui lui est acquis, la semaine close, puis le paiement avec sa référence', async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await uneFicheEnvoyee(page, context);

  // Un onglet « Ma paie » : rien d'acquis tant que NTanova n'a rien décidé, et le relais le lit en clair.
  const navigation = page.getByRole('navigation', { name: 'Espace relais' });
  await navigation.getByRole('link', { name: 'Ma paie' }).click();
  await expect(page.getByRole('heading', { name: 'Ma paie' })).toBeVisible();
  await expect(acquis(page)).toContainText('0 FCFA');
  await expect(acquis(page)).toContainText('Rien d’acquis pour le moment');
  // v2 (planche « Ma paie ») : ce qui n'est pas encore compté se dit en une bande.
  await expect(page.getByRole('link', { name: /Pas comptées/ })).toContainText('1 en attente');
  // NTanova n'a pas encore son numéro Mobile Money : il le sait.
  await expect(page.getByText('Votre numéro Mobile Money manque.')).toBeVisible();

  // L'administration confirme la fonction de la direction et accepte la fiche.
  await ouvrirLaFiche(page);
  await ouvrirContacts(page);
  await page.getByRole('button', { name: 'Confirmer sa fonction' }).click();
  await expect(page.getByText('Fonction confirmée', { exact: true })).toBeVisible();
  await fermerContacts(page);
  await page.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/l’école est prête/);

  // Le relais lit ce qui lui est acquis : une fiche acceptée et un contact confirmé. Les montants viennent de la base.
  await page.goto('/relais/#paie');
  await expect(acquis(page)).toContainText('800 FCFA', { timeout: 15_000 });
  // v2 : la facture de la planche, une ligne par genre (« Fiches acceptées · 1 × 500 · 500 »).
  await expect(acquis(page)).toContainText('Fiches acceptées');
  await expect(acquis(page)).toContainText('1 × 500');
  await expect(acquis(page)).toContainText('Contact de direction');
  await expect(acquis(page)).toContainText(/À payer vendredi \d+ \p{L}+/u);
  await expect(page.getByRole('link', { name: /Pas comptées/ })).toHaveCount(0);
  await expect(semaines(page)).toContainText('Aucune semaine close pour le moment');

  // L'administration note le numéro Mobile Money, puis clôt la semaine.
  await page.goto('/admin/');
  await ouvrirEcranAdmin(page, 'Paie');
  const du = page.getByRole('region', { name: 'Ce qui est dû' });
  await du.getByRole('textbox', { name: 'Numéro Mobile Money' }).fill('242 06 123 45 99');
  await du.getByRole('button', { name: 'Noter le numéro' }).click();
  await expect(du.getByText('noté', { exact: true })).toBeVisible();
  await du.getByRole('button', { name: 'Clôturer la semaine' }).click();
  await du.getByRole('button', { name: 'Confirmer : clôturer la semaine' }).click();
  await expect(page.getByRole('status')).toHaveText(/est clôturée : 800\sFCFA à payer/);

  // La semaine close est « à payer » ; ce qui est clos n'est plus « acquis » ; le numéro n'est plus réclamé.
  await page.goto('/relais/#paie');
  // v2 : les semaines se lisent en chiffres, comme la planche (« 800 »).
  await expect(semaines(page)).toContainText('800', { timeout: 15_000 });
  await expect(semaines(page)).toContainText('À payer');
  await expect(acquis(page)).toContainText('0 FCFA');
  await expect(page.getByText('Votre numéro Mobile Money manque.')).toHaveCount(0);

  // L'administration note le paiement avec sa référence : le relais la lit.
  await page.goto('/admin/');
  await ouvrirEcranAdmin(page, 'Paie');
  await page.getByRole('button', { name: 'Voir les paiements' }).click();
  const paiements = page.getByLabel(/Paiements du \d{4}-\d{2}-\d{2}/);
  await paiements.getByLabel('Référence du paiement de [Prénom]').fill('MM-0001');
  await paiements.getByRole('button', { name: 'Noter payé' }).click();
  await expect(page.getByRole('status')).toHaveText(/noté payé \(référence MM-0001\)/);

  await page.goto('/relais/#paie');
  await expect(semaines(page)).toContainText('réf. MM-0001', { timeout: 15_000 });
  await expect(semaines(page)).not.toContainText('À payer');
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
