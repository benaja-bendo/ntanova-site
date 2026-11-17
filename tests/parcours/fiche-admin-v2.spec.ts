// La fiche admin v2 (ticket 165, lot D, 13/11/2026) : « À compléter » (manques, demander à l'école, confier à un relais),
// les images de l'école, une mission avec sa tâche, sa date et sa paie.
import { expect, test, type Page } from '@playwright/test';
import { ouvrirGestion, seConnecter, ouvrirLesEcoles, ficheOuverte } from './aides';

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

async function gerer(page: Page, section: string) {
  await seConnecter(page, '/admin/#valider');
  await ouvrirLesEcoles(page);
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ouvrirGestion(ligne, section);
  // Admin v2 : la fiche de l'école est une page entière ; ses formulaires y sont.
  return ficheOuverte(page);
}

test('« À compléter » : les manques et qui peut les donner ; WhatsApp les note « demandé à l’école », annulable', async ({
  page,
}) => {
  await gerer(page, 'À compléter');
  const bloc = page.getByRole('region', { name: 'À compléter' });
  // Planche « Compléter la fiche » : chaque manque dit à qui on le demande (l'école par défaut, quand elle peut).
  await expect(bloc).toContainText(/choses? à compléter/);
  await expect(bloc).toContainText('Logo');
  await expect(
    bloc
      .getByRole('group', { name: /^Logo : à qui le demander \?$/ })
      .getByRole('button', { name: 'L’école' }),
  ).toHaveAttribute('aria-pressed', 'true');
  const whatsapp = bloc.getByRole('link', { name: 'Ouvrir dans WhatsApp' });
  expect(decodeURIComponent((await whatsapp.getAttribute('href'))!)).toContain(
    'Pour compléter la fiche de [École à situer]',
  );
  // Le lien ouvre WhatsApp dans un autre onglet ; la page note la demande.
  const [onglet] = await Promise.all([page.context().waitForEvent('page'), whatsapp.click()]);
  await onglet.close();
  await expect(bloc).toContainText(/demandé à l’école le/);
  // Une demande notée = une mention datée et son « Annuler » ; en annuler une les retire toutes deux. Les nombres sont
  // attendus, pas lus pendant que l'écran se redessine (17/11 : « 4 au lieu de 3 », environ 1 fois sur 25).
  const annuler = bloc.getByRole('button', { name: 'Annuler la demande' });
  const demandes = bloc.getByText(/demandé à l’école le/);
  const avant = await demandes.count();
  await expect(annuler).toHaveCount(avant);
  await annuler.first().click();
  await expect(demandes).toHaveCount(avant - 1);
  await expect(annuler).toHaveCount(avant - 1);
});

test('« Confier à un relais » ouvre la mission, la tâche préremplie ; la date et la paie partent avec elle', async ({
  page,
}) => {
  await gerer(page, 'À compléter');
  const bloc = page.getByRole('region', { name: 'À compléter' });
  // « Un relais » sur un manque ouvre la carte « À un relais · 1 mission », la tâche préremplie.
  await bloc.locator('button:not([disabled])', { hasText: 'Un relais' }).first().click();
  const carte = bloc.getByRole('form', { name: 'À un relais' });
  await expect(carte.getByLabel('Ce qu’il devra faire')).not.toHaveValue('');
  // Le « Pourquoi » de la mission vient du manque, réécrivable ; il part toujours au relais (planche « Une mission »).
  await expect(carte.getByLabel('Pourquoi')).not.toHaveValue('');
  await carte.getByLabel('Avant le').fill('2030-01-15');
  await carte.getByLabel(/Paie de la mission \(FCFA\)/).fill('-5');
  await carte.getByRole('button', { name: 'Confier la mission' }).click();
  await expect(page.getByRole('alert').first()).toContainText(
    'La paie est un nombre entier de FCFA',
  );
  await carte.getByLabel(/Paie de la mission \(FCFA\)/).fill('1000');
  await carte.getByRole('button', { name: 'Confier la mission' }).click();
  await expect(page.getByRole('status').first()).toHaveText(/est confiée à/);
  const mission = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus: Record<string, { nom: string; detailsMission?: Record<string, unknown> }>;
    };
    return Object.values(e.campus).find((c) => c.nom === '[École à situer]')?.detailsMission;
  });
  expect(mission).toMatchObject({
    avantLe: '2030-01-15',
    paieXaf: 1000,
    raison: expect.stringMatching(/manque sur la fiche|\S/),
  });
});

test('les images : chaque vide se dit ; un fichier se prépare, se publie s’il est contrôlé, et se retire', async ({
  page,
}) => {
  await gerer(page, 'Images');
  const images = page.getByRole('region', { name: 'Images de l’école' });
  await expect(images).toContainText('Pas de logo : la page montre le sigle');
  await expect(images).toContainText('Pas de couverture : la page montre la bannière dessinée');
  const form = images.getByRole('form', { name: 'Ajouter une image' });
  await form.getByLabel('C’est').selectOption('gallery');
  await form.getByLabel('Elle montre').selectOption('cour');
  await form.getByLabel('Le fichier').setInputFiles(photo);
  await form.getByLabel('Légende').fill('[La cour]');
  await form.getByRole('button', { name: 'Ajouter l’image' }).click();
  await expect(images.getByRole('listitem').filter({ hasText: '[La cour]' })).toContainText(
    'À contrôler',
  );
  await images.getByRole('button', { name: 'Sans enfant : publier' }).click();
  await expect(images.getByRole('listitem').filter({ hasText: '[La cour]' })).toContainText(
    'Publique',
  );
  await expect(images).toContainText('1 sur 12');
  await images.getByRole('button', { name: 'Retirer' }).click();
  await expect(images).toContainText('Pas d’image dans la galerie');
});
