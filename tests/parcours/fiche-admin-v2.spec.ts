// La fiche admin v2 (ticket 165, lot D, 13/11/2026) : « À compléter » (manques, demander à l'école, confier à un relais),
// les images de l'école, une mission avec sa tâche, sa date et sa paie.
import { expect, test, type Page } from '@playwright/test';
import { ouvrirGestion, seConnecter } from './aides';

const photo = new URL('./fichiers/enseigne.jpg', import.meta.url).pathname;

async function gerer(page: Page, section: string) {
  await seConnecter(page, '/admin/#valider');
  await page.getByRole('link', { name: 'Écoles' }).click();
  const ligne = page.getByRole('row', { name: /\[École à situer\]/ });
  await ouvrirGestion(ligne, section);
  // Admin v2 : la fiche de l'école est une page entière ; ses formulaires y sont.
  return page.locator('article.fiche-admin');
}

test('« À compléter » : les manques et qui peut les donner ; WhatsApp les note « demandé à l’école », annulable', async ({
  page,
}) => {
  await gerer(page, 'À compléter');
  const bloc = page.getByRole('region', { name: 'À compléter' });
  await expect(bloc.getByRole('heading')).toHaveText(/choses? à compléter/);
  await expect(bloc).toContainText('Logo');
  await expect(bloc).toContainText('peut le donner : l’école');
  await expect(bloc).toContainText('à faire');
  const whatsapp = bloc.getByRole('link', { name: 'Ouvrir dans WhatsApp' });
  expect(decodeURIComponent((await whatsapp.getAttribute('href'))!)).toContain(
    'Pour compléter la fiche de [École à situer]',
  );
  // Le lien ouvre WhatsApp dans un autre onglet ; la page note la demande.
  const [onglet] = await Promise.all([page.context().waitForEvent('page'), whatsapp.click()]);
  await onglet.close();
  await expect(bloc).toContainText(/demandé à l’école le/);
  await bloc.getByRole('button', { name: 'Annuler la demande' }).first().click();
  await expect(bloc.getByRole('button', { name: 'Annuler la demande' })).toHaveCount(
    await bloc.getByText(/demandé à l’école le/).count(),
  );
});

test('« Confier à un relais » ouvre la mission, la tâche préremplie ; la date et la paie partent avec elle', async ({
  page,
}) => {
  const ligne = await gerer(page, 'À compléter');
  const bloc = page.getByRole('region', { name: 'À compléter' });
  await bloc.getByRole('button', { name: 'Confier à un relais' }).first().click();
  await expect(ligne.getByLabel('Ce qu’il devra faire')).not.toHaveValue('');
  await ligne.getByLabel('Pourquoi').fill('[La ligne de la 3e était illisible.]');
  await ligne.getByLabel('Avant le').fill('2030-01-15');
  await ligne.getByLabel('Paie de la mission (FCFA)').fill('-5');
  await ligne.getByRole('button', { name: 'Confier', exact: true }).click();
  await expect(page.getByRole('alert').or(page.locator('.message-erreur'))).toContainText(
    'La paie est un nombre entier de FCFA',
  );
  await ligne.getByLabel('Paie de la mission (FCFA)').fill('1000');
  await ligne.getByRole('button', { name: 'Confier', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText(/est confiée à/);
  const mission = await page.evaluate(() => {
    const e = JSON.parse(localStorage.getItem('ntanova-faux-serveur') ?? '{}') as {
      campus: Record<string, { nom: string; detailsMission?: Record<string, unknown> }>;
    };
    return Object.values(e.campus).find((c) => c.nom === '[École à situer]')?.detailsMission;
  });
  expect(mission).toMatchObject({
    raison: '[La ligne de la 3e était illisible.]',
    avantLe: '2030-01-15',
    paieXaf: 1000,
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
