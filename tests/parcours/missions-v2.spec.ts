// Les missions v2 (ticket 165, lot C, 13/11/2026) : ce qu'il faut faire, pourquoi, la date, la paie ; « Je n'ai pas pu », qui
// marche hors ligne et part au retour du réseau.
import { expect, test, type Page } from '@playwright/test';
import { carteDeMission, ouvrirGestion, seConnecter } from './aides';

test.use({ permissions: ['geolocation'] });

async function confierUneMission(page: Page) {
  await seConnecter(page, '/admin/#valider');
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ouvrirGestion(ligne, 'Mission');
  await page
    .locator('article.fiche-admin')
    .getByRole('button', { name: 'Confier', exact: true })
    .click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);
  // Ce que la base dit d'une mission écrite par « Compléter » (le faux serveur le lit ici).
  await page.evaluate(() =>
    localStorage.setItem(
      'ntanova-faux-mission',
      JSON.stringify({
        tache: '[Photographier le prospectus des frais, en entier.]',
        raison: '[La ligne de la 3e était illisible.]',
        avantLe: '2020-01-01',
        paieXaf: 1000,
      }),
    ),
  );
}

test('une mission dit quoi faire, pourquoi, avant quand et pour combien ; une date passée se dit « en retard »', async ({
  page,
  context,
}) => {
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await confierUneMission(page);
  await page.goto('/relais/');
  // Lot H : sur l'accueil, la carte dit la tâche et la date ; la mission ouverte dit le reste.
  const carte = carteDeMission(page);
  await expect(carte).toContainText('[Photographier le prospectus des frais, en entier.]', {
    timeout: 15_000,
  });
  await expect(carte).toContainText('En retard · avant le 1 janvier');
  await carte.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const faire = page.getByRole('region', { name: 'Ce qu’il faut faire' });
  await expect(faire).toContainText('Pourquoi : [La ligne de la 3e était illisible.]');
  await expect(faire).toContainText('1 janvier · en retard');
  await expect(faire).toContainText(/1.000.FCFA/);
  await expect(page.getByRole('region', { name: 'À dire en entrant' })).toContainText('NTanova');
  await expect(page.getByRole('button', { name: 'Prendre la photo' })).toBeVisible();
});

test('« Je n’ai pas pu », hors ligne : la mission quitte la liste, puis part avec son motif quand le réseau revient', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await confierUneMission(page);
  await page.goto('/relais/');
  await expect(carteDeMission(page)).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
  // Lot H : la mission s'ouvre hors ligne ; « Je n'ai pas pu » y est.
  await carteDeMission(page).click();
  await page.getByRole('button', { name: 'Je n’ai pas pu' }).click();
  const pasPu = page.getByRole('region', { name: 'Je n’ai pas pu' });
  await pasPu.getByRole('button', { name: 'Fermer la mission' }).click();
  await expect(pasPu.getByRole('alert')).toHaveText('Dites ce qui vous a empêché.');
  await pasPu.getByRole('button', { name: 'Autre', exact: true }).click();
  await pasPu.getByRole('button', { name: 'Fermer la mission' }).click();
  await expect(pasPu.getByRole('alert')).toHaveText('Précisez « autre » en quelques mots.');
  await pasPu.getByLabel('En quelques mots').fill('[Travaux devant le portail]');
  await pasPu.getByRole('button', { name: 'Fermer la mission' }).click();
  // Retour à l'accueil : la mission n'y est plus.
  await expect(page.getByRole('region', { name: 'Vos missions' })).toBeVisible();
  await expect(carteDeMission(page)).toHaveCount(0);

  // Le réseau revient : le geste part, une fois.
  await context.setOffline(false);
  await page.reload();
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
                missionsPasPu?: { motif: string; note: string }[];
              }
            ).missionsPasPu ?? [],
        ),
      { timeout: 20_000 },
    )
    .toEqual([expect.objectContaining({ motif: 'autre', note: '[Travaux devant le portail]' })]);
  await expect(carteDeMission(page)).toHaveCount(0);
});
