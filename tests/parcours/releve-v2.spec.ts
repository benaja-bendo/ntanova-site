// Le relevé v2 (ticket 165, lot B, 13/11/2026) : « Déjà sur NTanova ? » hors ligne, le sigle, le bonus et la confirmation
// « Envoyer sans le bonus ? » ; l'administration relit le bonus et le garde à l'acceptation.
import { expect, test, type Page } from '@playwright/test';
import {
  attendreLaLecture,
  envoyerSansBonus,
  ouvrirLaFiche,
  prendrePhotoEtPosition,
  seConnecter,
} from './aides';

test.use({ permissions: ['geolocation'] });

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

async function etape2(page: Page, context: import('@playwright/test').BrowserContext) {
  // À une vingtaine de mètres de l'école publiée du faux serveur.
  await context.setGeolocation({ latitude: -4.79123, longitude: 11.925, accuracy: 8 });
  await seConnecter(page, '/relais/');
  await expect(page.getByRole('heading', { name: /Bonjour/ })).toBeVisible();
  // Une vingtaine de mètres de l'école publiée : une fois la lecture gardée, « Doublon possible » s'affiche toujours.
  await attendreLaLecture(page);
  await prendrePhotoEtPosition(page);
  const doublon = page.getByRole('region', { name: 'Doublon possible' });
  await doublon.getByRole('button', { name: 'Non, une autre' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { name: "L'établissement" })).toBeVisible();
}

test('« Déjà sur NTanova ? » : près d’ici par la distance, même nom ailleurs par le nom, hors ligne', async ({
  page,
  context,
}) => {
  await etape2(page, context);
  await context.setOffline(true);
  const deja = page.getByRole('region', { name: /Déjà sur NTanova/ });
  await page.getByLabel("Nom de l'établissement").fill('[École exemple]');
  await expect(deja.getByRole('heading', { name: 'Près d’ici' })).toBeVisible();
  await deja
    .getByRole('button', { name: /\[École exemple publiée\]/ })
    .first()
    .click();
  const reconnue = page.getByRole('region', { name: 'Vous la reconnaissez ?' });
  await expect(reconnue.getByRole('button').first()).toHaveText('Oui, c’est le même endroit');
  await reconnue.getByRole('button', { name: 'Oui, et c’est un autre site' }).click();
  await expect(deja.getByRole('status')).toHaveText('Un autre site de [École exemple publiée].');

  await page.getByLabel("Nom de l'établissement").fill('[Complexe Les Palmiers]');
  await expect(deja.getByRole('heading', { name: 'Même nom, ailleurs' })).toBeVisible();
  await expect(deja).toContainText('[Groupe scolaire Les Palmiers]');
  await expect(deja).toContainText('Brazzaville · 2 sites');

  // Chercher partout, puis « en faire son 3e site ».
  await deja.getByRole('button', { name: 'Un autre site d’une école connue' }).click();
  await page.getByPlaceholder('Son nom ou son sigle').fill('gslp');
  await page.getByRole('button', { name: /En faire son 3e site/ }).click();
  await expect(deja.getByRole('status')).toHaveText(
    'Un autre site de [Groupe scolaire Les Palmiers].',
  );
  await deja.getByRole('button', { name: 'Aucune : c’est une nouvelle école' }).click();
  await expect(deja.getByRole('status')).toHaveText('Une autre école.');
});

test('le bonus : ce qui a été vu, la clôture, des photos en plus ; tout part avec la fiche', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await etape2(page, context);
  await page.getByLabel("Nom de l'établissement").fill('[École 1]');
  await page.getByLabel('Sigle').fill('E1');
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await expect(page.getByRole('heading', { name: 'La rencontre' })).toBeVisible();
  await page.getByRole('button', { name: 'Personne', exact: true }).click();
  await page.getByLabel('Remarque').fill('Inscriptions ouvertes');

  // « Envoyer maintenant » demande confirmation, « Ajouter le bonus » en premier.
  await page.getByRole('button', { name: 'Envoyer maintenant' }).click();
  const fenetre = page.getByRole('alertdialog', { name: 'Envoyer sans le bonus ?' });
  await fenetre.getByRole('button', { name: 'Ajouter le bonus' }).click();
  await expect(page.getByRole('heading', { name: 'Le bonus' })).toBeVisible();

  await page.getByRole('button', { name: 'Cantine' }).click();
  await page.getByRole('button', { name: 'Toilettes' }).click();
  await page.getByRole('group', { name: 'Clôture' }).getByRole('button', { name: 'Non' }).click();
  await page.getByLabel('Photo : Cour (vide)').setInputFiles(photo);
  await expect(page.getByRole('heading', { name: /Photos en plus/ })).toContainText('1 sur 5');
  await page.getByRole('button', { name: 'Envoyer la fiche' }).click();
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
  const recu = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      releves: Record<string, Record<string, unknown>>;
      photos: Record<string, { role: string }>;
    };
    const r = Object.values(e.releves)[0]!;
    return {
      sigle: r.sigle,
      remarque: r.remarque,
      vus: r.vusSurPlace,
      cloture: r.cloture,
      roles: Object.values(e.photos)
        .map((p) => p.role)
        .sort(),
    };
  });
  expect(recu).toEqual({
    sigle: 'E1',
    remarque: 'Inscriptions ouvertes',
    vus: ['cantine', 'toilettes'],
    cloture: 'non',
    roles: ['courtyard', 'signboard'],
  });

  // L'administration relit le bonus : chaque équipement vu, coché « gardé » par défaut ; le sigle est dans la partie publique.
  await ouvrirLaFiche(page);
  const bonus = page.getByRole('region', { name: 'Le bonus du relais' });
  await expect(bonus).toContainText('Inscriptions ouvertes');
  await expect(bonus.getByRole('checkbox', { name: 'Cantine' })).toBeChecked();
  await expect(bonus.getByRole('checkbox', { name: /Clôture : non/ })).toBeChecked();
  await expect(page.getByRole('region', { name: 'Partie publique' })).toContainText('E1');
});

test('une fiche sans bonus part comme avant, par « Envoyer sans bonus »', async ({
  page,
  context,
}) => {
  await etape2(page, context);
  await page.getByLabel("Nom de l'établissement").fill('[École 2]');
  await page.getByRole('button', { name: 'Primaire' }).click();
  await page.getByRole('button', { name: 'Suivant' }).click();
  await page.getByRole('button', { name: 'Personne', exact: true }).click();
  await envoyerSansBonus(page);
  await expect(page.getByRole('heading', { name: 'Mes fiches' })).toBeVisible();
  await expect(page.getByText('Tout est envoyé.')).toBeVisible({ timeout: 15_000 });
});
