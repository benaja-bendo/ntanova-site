// Les missions v2 (ticket 165, lot C, 13/11/2026) : ce qu'il faut faire, pourquoi, la date, la paie ; « Je n'ai pas pu », qui
// marche hors ligne et part au retour du réseau.
import { expect, test, type Page } from '@playwright/test';
import { ouvrirGestion, seConnecter } from './aides';

test.use({ permissions: ['geolocation'] });

async function confierUneMission(page: Page) {
  await seConnecter(page, '/admin/#valider');
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ouvrirGestion(ligne, 'Mission');
  await ligne.getByRole('button', { name: 'Confier', exact: true }).click();
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
  const mission = page.getByRole('region', { name: 'À compléter' });
  await expect(mission).toContainText('[Photographier le prospectus des frais, en entier.]', {
    timeout: 15_000,
  });
  await expect(mission).toContainText('Pourquoi : [La ligne de la 3e était illisible.]');
  await expect(mission).toContainText('En retard · avant le 1 janvier');
  await expect(mission).toContainText(/1.000.FCFA/);
});

test('« Je n’ai pas pu », hors ligne : la mission quitte la liste, puis part avec son motif quand le réseau revient', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await context.setGeolocation({ latitude: -4.8, longitude: 11.9, accuracy: 8 });
  await confierUneMission(page);
  await page.goto('/relais/');
  const mission = page.getByRole('region', { name: 'À compléter' });
  await expect(mission).toBeVisible({ timeout: 15_000 });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Hors ligne', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Je n’ai pas pu' }).click();
  const pasPu = page.getByRole('region', { name: 'Je n’ai pas pu' });
  await pasPu.getByRole('button', { name: 'Fermer la mission' }).click();
  await expect(pasPu.getByRole('alert')).toHaveText('Dites ce qui vous a empêché.');
  await pasPu.getByRole('button', { name: 'Autre', exact: true }).click();
  await pasPu.getByRole('button', { name: 'Fermer la mission' }).click();
  await expect(pasPu.getByRole('alert')).toHaveText('Précisez « autre » en quelques mots.');
  await pasPu.getByLabel('En quelques mots').fill('[Travaux devant le portail]');
  await pasPu.getByRole('button', { name: 'Fermer la mission' }).click();
  await expect(page.getByRole('region', { name: 'À compléter' })).toHaveCount(0);

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
  await expect(page.getByRole('region', { name: 'À compléter' })).toHaveCount(0);
});
